/**
 * popup.js 控制器单元测试（纯 Node，依赖注入轻量桩对象）。
 * 覆盖：搜索常驻空态与精准清除、失败不覆盖历史存档、导出状态锁、语言切换联动。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createPopupController } from "../src/popup.js";

function makeElement(id) {
  const listeners = new Map();
  const attrs = new Map();
  const classes = new Set();
  return {
    id,
    value: "",
    textContent: "",
    hidden: id === "statusBar",
    disabled: false,
    classList: {
      toggle: (cls, force) => {
        if (force) classes.add(cls);
        else classes.delete(cls);
      },
      contains: (cls) => classes.has(cls),
    },
    setAttribute: (k, v) => attrs.set(k, v),
    getAttribute: (k) => attrs.get(k),
    replaceChildren: () => {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    trigger: (type) => listeners.get(type)?.(),
  };
}

function makeFakeDocument() {
  const elements = new Map();
  for (const id of [
    "bookmarkList",
    "searchInput",
    "selectAll",
    "deselectAll",
    "exportButton",
    "languageToggle",
    "themeToggle",
    "loadOptionsButton",
    "statusBar",
    "selectionCount",
  ]) {
    elements.set(id, makeElement(id));
  }
  return {
    elements,
    getElementById: (id) => elements.get(id),
  };
}

function makeStubTree({ selected = ["1", "10"], filtered = false, matchCount = 1 } = {}) {
  let isFiltered = filtered;
  let filterCalls = 0;
  let refreshCalls = 0;
  return {
    element: {},
    isFiltered: () => isFiltered,
    filter: (q) => {
      filterCalls++;
      isFiltered = q.trim().length > 0;
      return q.trim() ? matchCount : 2;
    },
    getFilterCalls: () => filterCalls,
    getRefreshCalls: () => refreshCalls,
    getSelection: () => ({ selectedIds: new Set(selected), indeterminateIds: new Set() }),
    getCheckedCounts: () => ({ folders: 1, links: 1 }),
    getUncheckedIds: () => ["99"],
    setAllChecked: () => {},
    applyUncheckedIds: () => {},
    refreshLanguage: () => {
      refreshCalls++;
    },
  };
}

async function waitUntil(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

const t = (key) => (key === "selectedCount" ? (f, l) => `${f}:${l}` : key);

describe("createPopupController", () => {
  it("首帧无搜索词时不执行冗余 tree.filter，且搜索无匹配时状态栏常驻", async () => {
    const doc = makeFakeDocument();
    const stubTree = makeStubTree({ matchCount: 0 });
    const root = [{ id: "0", children: [{ id: "1", title: "Bar", children: [] }] }];
    const controller = createPopupController({
      document: doc,
      t,
      applyStaticTexts: () => {},
      createThemeIcon: () => ({}),
      getTheme: () => "system",
      getBookmarkTree: async () => root,
      createBookmarkTree: () => stubTree,
      statusClearMs: 50,
    });

    await controller.init();
    assert.equal(stubTree.getFilterCalls(), 0);

    // 触发无匹配搜索 -> 状态栏常驻不自动消失
    doc.elements.get("searchInput").value = "nonexistent";
    controller.applyFilter();
    assert.equal(doc.elements.get("statusBar").hidden, false);
    assert.equal(doc.elements.get("statusBar").textContent, "noMatch");
    assert.equal(controller.getState().lastStatusPersist, true);
    assert.equal(doc.elements.get("selectAll").textContent, "selectAllMatched");

    // 清空搜索 -> 精准隐藏 noMatch 并还原按钮文案
    doc.elements.get("searchInput").value = "";
    controller.applyFilter();
    assert.equal(doc.elements.get("statusBar").hidden, true);
    assert.equal(doc.elements.get("selectAll").textContent, "selectAll");
  });

  it("applyFilter 不会误清除非搜索类的状态提示（如 loaded）", async () => {
    const doc = makeFakeDocument();
    const stubTree = makeStubTree({ matchCount: 1 });
    const root = [{ id: "0", children: [{ id: "1", title: "Bar", children: [] }] }];
    const controller = createPopupController({
      document: doc,
      t,
      applyStaticTexts: () => {},
      createThemeIcon: () => ({}),
      getTheme: () => "system",
      getBookmarkTree: async () => root,
      createBookmarkTree: () => stubTree,
      readOptions: () => ({ ok: true, value: { uncheckedIds: [] } }),
      statusClearMs: 5000,
    });

    await controller.init();
    controller.loadCheckedOptions();
    assert.equal(doc.elements.get("statusBar").textContent, "loaded");
    assert.equal(doc.elements.get("statusBar").hidden, false);

    // 输入有匹配的搜索词不应抹除 loaded 提示
    doc.elements.get("searchInput").value = "bar";
    controller.applyFilter();
    assert.equal(doc.elements.get("statusBar").hidden, false);
    assert.equal(doc.elements.get("statusBar").textContent, "loaded");
    controller.hideStatus();
  });

  it("导出失败时不覆盖历史已保存的 uncheckedIds", async () => {
    const doc = makeFakeDocument();
    const stubTree = makeStubTree({ selected: ["1", "10"] });
    let savedCount = 0;
    let calls = 0;
    const controller = createPopupController({
      document: doc,
      t,
      applyStaticTexts: () => {},
      createThemeIcon: () => ({}),
      getTheme: () => "system",
      getBookmarkTree: async () => {
        calls++;
        if (calls === 1) return [{ id: "0", children: [{ id: "1", title: "Bar", children: [] }] }];
        throw new Error("boom");
      },
      createBookmarkTree: () => stubTree,
      writeOptions: () => {
        savedCount++;
        return true;
      },
      minExportingMs: 10,
      statusClearMs: 50,
    });

    await controller.init();
    await controller.exportSelectedBookmarks();
    assert.equal(savedCount, 0);
    assert.equal(doc.elements.get("statusBar").textContent, "exportError");
    await waitUntil(() => !controller.getState().isExporting);
    controller.hideStatus();
  });

  it("导出成功时顺序保存配置并下载书签与 structure.json", async () => {
    const doc = makeFakeDocument();
    const stubTree = makeStubTree({ selected: ["1", "10"] });
    const downloads = [];
    let savedPayload = null;
    const mockTree = [
      {
        id: "0",
        children: [
          {
            id: "1",
            title: "Bar",
            dateAdded: 1,
            children: [{ id: "10", title: "Site", url: "https://example.com/", dateAdded: 2 }],
          },
        ],
      },
    ];
    const controller = createPopupController({
      document: doc,
      t,
      applyStaticTexts: () => {},
      createThemeIcon: () => ({}),
      getTheme: () => "system",
      getBookmarkTree: async () => mockTree,
      createBookmarkTree: () => stubTree,
      downloadJson: (data, filename) => downloads.push({ data, filename }),
      writeOptions: (payload) => {
        savedPayload = payload;
        return true;
      },
      minExportingMs: 20,
      downloadStaggerMs: 10,
      statusClearMs: 50,
    });

    await controller.init();
    await controller.exportSelectedBookmarks();
    // 导出中防重入
    assert.equal(controller.getState().isExporting, true);
    await controller.exportSelectedBookmarks();

    await waitUntil(() => !controller.getState().isExporting);
    assert.equal(downloads.length, 2);
    assert.match(downloads[0].filename, /^bookmarks⏰\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(downloads[1].filename, "structure.json");
    assert.deepEqual(savedPayload.uncheckedIds, ["99"]);
    controller.hideStatus();
  });

  it("语言切换联动刷新静态文本、树文案与常驻状态提示", async () => {
    const doc = makeFakeDocument();
    const stubTree = makeStubTree({ matchCount: 0 });
    let lang = "zh";
    let staticApplies = 0;
    const tr = (key) => {
      if (key === "selectedCount") return (f, l) => `${lang}:${f}:${l}`;
      return `${lang}:${key}`;
    };

    const controller = createPopupController({
      document: doc,
      t: tr,
      toggleLanguage: () => {
        lang = lang === "zh" ? "en" : "zh";
        return lang;
      },
      applyStaticTexts: () => {
        staticApplies++;
      },
      createThemeIcon: () => ({}),
      getTheme: () => "system",
      getBookmarkTree: async () => [
        { id: "0", children: [{ id: "1", title: "Bar", children: [] }] },
      ],
      createBookmarkTree: () => stubTree,
    });

    await controller.init();
    doc.elements.get("searchInput").value = "missing";
    controller.applyFilter();
    assert.equal(doc.elements.get("statusBar").textContent, "zh:noMatch");

    doc.elements.get("languageToggle").trigger("click");
    assert.equal(staticApplies, 2);
    assert.equal(stubTree.getRefreshCalls(), 1);
    assert.equal(doc.elements.get("statusBar").textContent, "en:noMatch");
    assert.equal(doc.elements.get("selectionCount").textContent, "en:1:1");
    assert.equal(controller.getState().lastStatusPersist, true);
  });
});
