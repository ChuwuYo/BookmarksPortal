/**
 * 书签树组件交互冒烟测试（jsdom）。
 * 覆盖三态级联、勾选收集、选择恢复、搜索过滤、事件委托（含键盘导航）、空标题回退、缩进上限与搜索态全选。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;

const { createBookmarkTree } = await import("../src/js/tree.js");

const zh = {
  expand: "展开",
  collapse: "收起",
  expandFolder: (name) => `展开 ${name}`,
  collapseFolder: (name) => `收起 ${name}`,
  untitled: "(无标题)",
};
const t = (key) => zh[key] ?? key;

function makeData() {
  return [
    {
      id: "1",
      title: "书签栏",
      children: [
        {
          id: "10",
          title: "ACG",
          children: [
            { id: "100", title: "Bangumi", url: "https://bangumi.tv/" },
            { id: "101", title: "示例", url: "https://example.com/" },
          ],
        },
        { id: "11", title: "博客", url: "https://blog.example.com/" },
      ],
    },
    {
      id: "2",
      title: "其他书签",
      children: [{ id: "20", title: "测试", url: "https://test.example.com/" }],
    },
  ];
}

function makeTree() {
  let changeCount = 0;
  const tree = createBookmarkTree(makeData(), {
    t,
    onSelectionChange: () => changeCount++,
  });
  return { tree, getChangeCount: () => changeCount };
}

/** 按 data-id 查找复选框 */
function checkboxOf(tree, id) {
  return tree.element.querySelector(`.node-checkbox[data-id="${id}"]`);
}

function change(checkbox) {
  checkbox.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
}

function pressKey(target, key) {
  target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("createBookmarkTree", () => {
  it("渲染全部节点并正确标记类型与无障碍层级", () => {
    const { tree } = makeTree();
    const boxes = tree.element.querySelectorAll(".node-checkbox");
    assert.equal(boxes.length, 7);
    assert.equal(tree.element.querySelectorAll('[data-type="folder"]').length, 3);
    assert.equal(tree.element.querySelectorAll('[data-type="link"]').length, 4);

    // 文件夹展开按钮包含文件夹名称
    const acgNode = checkboxOf(tree, "10").closest(".bookmark-node");
    const toggle = acgNode.querySelector(".toggle-btn");
    assert.equal(toggle.getAttribute("aria-label"), "展开 ACG");
    assert.equal(acgNode.getAttribute("role"), "treeitem");
  });

  it("勾选父级级联所有后代", () => {
    const { tree } = makeTree();
    const parent = checkboxOf(tree, "10");
    parent.checked = true;
    change(parent);
    assert.equal(checkboxOf(tree, "100").checked, true);
    assert.equal(checkboxOf(tree, "101").checked, true);
    assert.equal(checkboxOf(tree, "11").checked, false);
  });

  it("部分子级勾选使祖先进入半选态", () => {
    const { tree } = makeTree();
    const child = checkboxOf(tree, "100");
    child.checked = true;
    change(child);
    assert.equal(checkboxOf(tree, "10").indeterminate, true);
    assert.equal(checkboxOf(tree, "1").indeterminate, true);
    assert.equal(checkboxOf(tree, "2").indeterminate, false);

    const { selectedIds, indeterminateIds } = tree.getSelection();
    assert.deepEqual([...selectedIds], ["100"]);
    assert.deepEqual([...indeterminateIds].sort(), ["1", "10"]);
  });

  it("子级全部勾选后祖先转为全选态", () => {
    const { tree } = makeTree();
    for (const id of ["100", "101"]) {
      const cb = checkboxOf(tree, id);
      cb.checked = true;
      change(cb);
    }
    assert.equal(checkboxOf(tree, "10").checked, true);
    assert.equal(checkboxOf(tree, "10").indeterminate, false);
    assert.equal(checkboxOf(tree, "1").indeterminate, true);
  });

  it("setAllChecked 非搜索态全选/全不选，搜索态仅作用于匹配项且不级联隐藏后代", () => {
    const { tree } = makeTree();
    tree.setAllChecked(true);
    assert.equal(tree.getCheckedCounts().folders, 3);
    assert.equal(tree.getCheckedCounts().links, 4);
    assert.deepEqual(tree.getUncheckedIds(), []);

    tree.setAllChecked(false);
    assert.equal(tree.getCheckedCounts().folders, 0);
    assert.equal(tree.getUncheckedIds().length, 7);

    // 搜索仅命中文件夹 ACG (10)，全选仅勾选 10 本身而不级联隐藏子项 100/101
    tree.filter("ACG");
    assert.equal(tree.isFiltered(), true);
    tree.setAllChecked(true);
    assert.equal(checkboxOf(tree, "10").checked, true);
    assert.equal(checkboxOf(tree, "100").checked, false);
    assert.equal(checkboxOf(tree, "101").checked, false);
    assert.equal(checkboxOf(tree, "20").checked, false);
    assert.equal(checkboxOf(tree, "1").indeterminate, true);
  });

  it("applyUncheckedIds 恢复三态：全选后取消指定项", () => {
    const { tree } = makeTree();
    tree.applyUncheckedIds(["100", "20"]);
    assert.equal(checkboxOf(tree, "100").checked, false);
    assert.equal(checkboxOf(tree, "101").checked, true);
    assert.equal(checkboxOf(tree, "10").indeterminate, true);
    assert.equal(checkboxOf(tree, "1").indeterminate, true);
    assert.equal(checkboxOf(tree, "2").checked, false);
    assert.equal(checkboxOf(tree, "2").indeterminate, false);
  });

  it("applyUncheckedIds keeps new bookmarks unchecked inside an excluded folder", () => {
    const data = makeData();
    data[1].children.push({ id: "21", title: "新书签", url: "https://new.example.com/" });
    const tree = createBookmarkTree(data, { t, onSelectionChange: () => {} });

    tree.applyUncheckedIds(["2", "20"]);
    assert.equal(checkboxOf(tree, "2").checked, false);
    assert.equal(checkboxOf(tree, "2").indeterminate, false);
    assert.equal(checkboxOf(tree, "20").checked, false);
    assert.equal(checkboxOf(tree, "21").checked, false);
  });

  it("applyUncheckedIds keeps new bookmarks checked outside excluded folders", () => {
    const data = makeData();
    data[0].children[0].children.push({
      id: "102",
      title: "新书签",
      url: "https://new.example.com/",
    });
    const tree = createBookmarkTree(data, { t, onSelectionChange: () => {} });

    tree.applyUncheckedIds(["100", "20"]);
    assert.equal(checkboxOf(tree, "102").checked, true);
    assert.equal(checkboxOf(tree, "10").indeterminate, true);
    assert.equal(checkboxOf(tree, "1").indeterminate, true);
  });

  it("搜索过滤：匹配项及其祖先可见，清空后精确还原展开状态", () => {
    const { tree } = makeTree();
    const acg = tree.element
      .querySelector('.node-checkbox[data-id="10"]')
      .closest(".bookmark-node");
    const acgChildren = acg.querySelector(".children-container");

    assert.equal(acgChildren.hidden, true);

    const matches = tree.filter("bangumi");
    assert.equal(matches, 1);
    assert.equal(acg.hidden, false);
    assert.equal(acgChildren.hidden, false);
    const test20 = checkboxOf(tree, "20").closest(".bookmark-node");
    assert.equal(test20.hidden, true);

    const toggle = acg.querySelector(".toggle-btn");
    toggle.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    assert.equal(acgChildren.hidden, true);

    tree.filter("");
    assert.equal(acgChildren.hidden, true);
    assert.equal(test20.hidden, false);
  });

  it("键盘方向键导航：跳过折叠子节点，支持 ArrowRight 展开与 ArrowLeft 收起/回退", () => {
    const { tree } = makeTree();
    dom.window.document.body.replaceChildren(tree.element);

    const cb1 = checkboxOf(tree, "1");
    const cb2 = checkboxOf(tree, "2");
    const cb10 = checkboxOf(tree, "10");

    // 初始全部折叠：在 1 上按 ArrowDown 应跳过折叠的子节点直接聚焦到 2
    cb1.focus();
    pressKey(cb1, "ArrowDown");
    assert.equal(dom.window.document.activeElement, cb2);

    // 按 ArrowUp 回到 1，再按 ArrowRight 展开 1，再按 ArrowRight 聚焦第一个子节点 10
    pressKey(cb2, "ArrowUp");
    assert.equal(dom.window.document.activeElement, cb1);
    pressKey(cb1, "ArrowRight");
    assert.equal(cb1.closest(".bookmark-node").getAttribute("aria-expanded"), "true");
    pressKey(cb1, "ArrowRight");
    assert.equal(dom.window.document.activeElement, cb10);

    // 在折叠的子文件夹 10 上按 ArrowLeft 应回到父节点 1
    pressKey(cb10, "ArrowLeft");
    assert.equal(dom.window.document.activeElement, cb1);
  });

  it("空标题书签回退显示 URL 或无标题占位，且深层缩进有上限封顶", () => {
    let deep = { id: "leaf", title: "", url: "https://noname.example.com/" };
    for (let d = 12; d >= 1; d--) {
      deep = { id: `f${d}`, title: d === 12 ? "" : `F${d}`, children: [deep] };
    }
    const tree = createBookmarkTree([deep], { t, onSelectionChange: () => {} });

    const leafHeader = checkboxOf(tree, "leaf").closest(".node-header");
    assert.equal(
      leafHeader.querySelector(".node-title").textContent,
      "https://noname.example.com/"
    );
    // MAX_INDENT_DEPTH = 8 => 8 * 16 + 8 = 136px
    assert.equal(leafHeader.style.paddingInlineStart, "136px");

    const emptyFolderHeader = checkboxOf(tree, "f12").closest(".node-header");
    assert.equal(emptyFolderHeader.querySelector(".node-title").textContent, "(无标题)");
  });

  it("Firefox 分隔符节点不渲染、不计数", () => {
    const data = [
      {
        id: "1",
        title: "书签栏",
        children: [
          { id: "10", title: "A", url: "https://a.com/" },
          { id: "sep1", type: "separator" },
          { id: "11", title: "B", url: "https://b.com/" },
        ],
      },
    ];
    const tree = createBookmarkTree(data, { t, onSelectionChange: () => {} });
    assert.equal(tree.element.querySelectorAll(".node-checkbox").length, 3);
    tree.setAllChecked(true);
    assert.equal(tree.getCheckedCounts().links, 2);
  });

  it("勾选变化触发 onSelectionChange 回调", () => {
    const { tree, getChangeCount } = makeTree();
    const before = getChangeCount();
    const cb = checkboxOf(tree, "11");
    cb.checked = true;
    change(cb);
    assert.equal(getChangeCount(), before + 1);
  });
});
