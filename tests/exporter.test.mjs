/**
 * 导出格式契约测试。
 *
 * 验证 exporter 的输出严格符合配套项目 ChuwuBookmarks 的消费格式：
 * - 链接:   { type:'link', addDate:<ms int>, title, url, icon:[google, favicon.im] }
 * - 文件夹: { type:'folder', addDate:<ms int>, title, children }
 * - structure.json: { version:1, generated:ISO, folders:[{ id, title, addDate,
 *   linkCount, folderCount, hasChildren, children? }] }
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildStructureFile,
  filterTreeBySelection,
  generateStructure,
  makeBookmarkFilename,
  normalizeAddDate,
} from "../src/js/exporter.js";

const NOW = 1770786654240;

/** 构造一棵模拟 chrome.bookmarks.getTree 输出的书签树 */
function makeTree() {
  return [
    {
      id: "1",
      title: "书签栏",
      dateAdded: 1700000000000,
      children: [
        {
          id: "10",
          title: "ACG",
          dateAdded: 1700000000001,
          children: [
            { id: "100", title: "Bangumi", url: "https://bangumi.tv/", dateAdded: 1700000000010 },
            {
              id: "101",
              title: "示例",
              url: "https://example.com/a?b=c",
              dateAdded: 1700000000011,
            },
          ],
        },
        { id: "11", title: "博客", url: "https://blog.example.com/", dateAdded: 1700000000002 },
        {
          id: "12",
          title: "空文件夹",
          dateAdded: 1700000000003,
          children: [],
        },
      ],
    },
    {
      id: "2",
      title: "其他书签",
      dateAdded: 1700000001000,
      children: [
        { id: "20", title: "测试", url: "https://test.example.com/", dateAdded: 1700000001001 },
      ],
    },
  ];
}

describe("filterTreeBySelection", () => {
  it("全选时输出完整结构与契约形状", () => {
    const tree = makeTree();
    const selected = new Set(["1", "10", "100", "101", "11", "12", "2", "20"]);
    const data = filterTreeBySelection(tree, selected, new Set(), NOW);

    assert.equal(data.length, 2);
    assert.deepEqual(Object.keys(data[0]).sort(), ["addDate", "children", "title", "type"]);
    assert.equal(data[0].type, "folder");
    assert.equal(data[0].title, "书签栏");
    assert.equal(data[0].addDate, 1700000000000); // 使用真实 dateAdded 而非 Date.now()

    const link = data[0].children[0].children[0];
    assert.deepEqual(Object.keys(link).sort(), ["addDate", "icon", "title", "type", "url"]);
    assert.equal(link.type, "link");
    assert.deepEqual(link.icon, [
      "https://www.google.com/s2/favicons?domain=bangumi.tv",
      "https://favicon.im/bangumi.tv",
      "https://icons.duckduckgo.com/ip3/bangumi.tv.ico",
      "https://bangumi.tv/favicon.ico",
    ]);
    assert.ok(Number.isInteger(link.addDate));
  });

  it("部分选择：仅保留入选分支，半选文件夹保留但剔除未选子项", () => {
    const tree = makeTree();
    const selected = new Set(["100"]); // 仅选中 Bangumi
    const indeterminate = new Set(["1", "10"]);
    const data = filterTreeBySelection(tree, selected, indeterminate, NOW);

    assert.equal(data.length, 1);
    assert.equal(data[0].title, "书签栏");
    assert.equal(data[0].children.length, 1);
    assert.equal(data[0].children[0].title, "ACG");
    assert.equal(data[0].children[0].children.length, 1);
    assert.equal(data[0].children[0].children[0].url, "https://bangumi.tv/");
  });

  it("未选中的根文件夹整体剔除", () => {
    const tree = makeTree();
    const selected = new Set(["20"]);
    const data = filterTreeBySelection(tree, selected, new Set(["2"]), NOW);
    assert.equal(data.length, 1);
    assert.equal(data[0].title, "其他书签");
  });

  it("无入选内容时返回空数组", () => {
    const data = filterTreeBySelection(makeTree(), new Set(), new Set(), NOW);
    assert.deepEqual(data, []);
  });

  it("缺失 dateAdded 时回退为当前时间，绝不产生 NaN", () => {
    const tree = [
      {
        id: "1",
        title: "书签栏",
        children: [{ id: "10", title: "x", url: "https://a.com/" }],
      },
    ];
    const data = filterTreeBySelection(tree, new Set(["1", "10"]), new Set(), NOW);
    assert.equal(data[0].addDate, NOW);
    assert.equal(data[0].children[0].addDate, NOW);
    assert.ok(JSON.stringify(data).indexOf("null") === -1);
  });

  it("非法 URL 的 icon 为空数组", () => {
    const tree = [
      {
        id: "1",
        title: "书签栏",
        dateAdded: 1,
        children: [{ id: "10", title: "x", url: "javascript:alert(1)", dateAdded: 1 }],
      },
    ];
    const data = filterTreeBySelection(tree, new Set(["1", "10"]), new Set(), NOW);
    assert.deepEqual(data[0].children[0].icon, []);
  });

  it("选中的空文件夹以 children:[] 保留", () => {
    const tree = makeTree();
    // 仅选中空文件夹「12」
    const data = filterTreeBySelection(tree, new Set(["1", "12"]), new Set(), NOW);
    assert.equal(data.length, 1);
    const empty = data[0].children.find((c) => c.title === "空文件夹");
    assert.ok(empty, "空文件夹应被保留");
    assert.deepEqual(empty.children, []);
    // 其 structure 条目 hasChildren 必须为 false
    const structure = generateStructure(data);
    const emptyInfo = structure[0].children.find((c) => c.title === "空文件夹");
    assert.equal(emptyInfo.hasChildren, false);
    assert.ok(!("children" in emptyInfo));
  });
});

describe("generateStructure", () => {
  it("路径 id 基于全部兄弟节点（含链接）的索引，与历史版本一致", () => {
    const exportData = [
      {
        type: "folder",
        title: "书签栏",
        addDate: 1,
        children: [
          { type: "link", title: "L0", url: "https://a.com/", addDate: 1, icon: [] },
          { type: "folder", title: "F1", addDate: 1, children: [] },
          {
            type: "folder",
            title: "F2",
            addDate: 1,
            children: [{ type: "folder", title: "F2-0", addDate: 1, children: [] }],
          },
        ],
      },
    ];
    const structure = generateStructure(exportData);
    assert.equal(structure.length, 1);
    assert.equal(structure[0].id, "0");
    // F1 在兄弟节点（含链接 L0）中的索引为 1，F2 为 2
    assert.equal(structure[0].children[0].id, "0_1");
    assert.equal(structure[0].children[1].id, "0_2");
    assert.equal(structure[0].children[1].children[0].id, "0_2_0");
  });

  it("仅含链接的文件夹：hasChildren 为 true 且无 children 键", () => {
    const exportData = [
      {
        type: "folder",
        title: "A",
        addDate: 1,
        children: [{ type: "link", title: "L", url: "https://a.com/", addDate: 1, icon: [] }],
      },
    ];
    const [folder] = generateStructure(exportData);
    assert.equal(folder.hasChildren, true);
    assert.equal(folder.linkCount, 1);
    assert.equal(folder.folderCount, 0);
    assert.ok(!("children" in folder));
  });

  it("空文件夹：hasChildren 为 false", () => {
    const exportData = [{ type: "folder", title: "A", addDate: 1, children: [] }];
    const [folder] = generateStructure(exportData);
    assert.equal(folder.hasChildren, false);
  });

  it("structure 条目字段集合契约（键名无关顺序）", () => {
    const exportData = [
      {
        type: "folder",
        title: "A",
        addDate: 1,
        children: [{ type: "folder", title: "B", addDate: 2, children: [] }],
      },
    ];
    const [folder] = generateStructure(exportData);
    assert.deepEqual(Object.keys(folder).sort(), [
      "addDate",
      "children",
      "folderCount",
      "hasChildren",
      "id",
      "linkCount",
      "title",
    ]);
  });
});

describe("buildStructureFile", () => {
  it("包含 version 与 ISO generated 字段", () => {
    const file = buildStructureFile([], new Date("2026-08-05T12:00:00.000Z"));
    assert.equal(file.version, 1);
    assert.equal(file.generated, "2026-08-05T12:00:00.000Z");
    assert.deepEqual(file.folders, []);
  });
});

describe("makeBookmarkFilename", () => {
  it("生成 bookmarks⏰YYYY-MM-DD.json（本地时区）", () => {
    const date = new Date(2026, 7, 5, 12, 0, 0); // 2026-08-05 本地时间
    assert.equal(makeBookmarkFilename(date), "bookmarks⏰2026-08-05.json");
  });
});

describe("normalizeAddDate", () => {
  it("有限数值截断为整数", () => {
    assert.equal(normalizeAddDate(1700000000000.9, NOW), 1700000000000);
  });
  it("非法值回退", () => {
    assert.equal(normalizeAddDate(undefined, NOW), NOW);
    assert.equal(normalizeAddDate(NaN, NOW), NOW);
  });
});

/**
 * 黄金快照回测（CI 必跑）：vendor 进仓库的合成夹具，
 * 锁定「含链接的全部兄弟节点索引」的 id 路径算法与 structure 形状。
 * 夹具为全合成数据（example.com），但保留关键鉴别结构：
 * 文件夹前面存在链接兄弟，使「全兄弟索引」与「仅文件夹索引」产生不同输出。
 */
describe("黄金快照回测", () => {
  const fixture = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/golden.json"), "utf8")
  );

  it("嵌套混合结构重算的 structure 与快照完全一致", () => {
    const result = generateStructure(fixture.bookmarks);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "0");
    assert.deepEqual(result[0].children, fixture.structureChildren);

    // 根条目计数与快照数据自洽
    const children = fixture.bookmarks[0].children;
    assert.equal(result[0].linkCount, children.filter((c) => c.type === "link").length);
    assert.equal(result[0].folderCount, children.filter((c) => c.type === "folder").length);
    assert.equal(result[0].hasChildren, children.length > 0);
  });

  it("链接兄弟使文件夹索引偏移（鉴别两种索引算法）", () => {
    // 夹具：「偏移演示父夹」的 6 个子项中，文件夹「被偏移的文件夹」
    // 前面有 3 个链接，其全兄弟索引 id 为 0_3；末尾夹为 0_5。
    // 若算法退化为仅文件夹索引，二者将变为 0_0 / 0_1——此用例专杀该回归。
    const result = generateStructure(fixture.shiftedCase.bookmarks);
    assert.deepEqual(result, fixture.shiftedCase.structure);

    const shifted = result[0].children.find((c) => c.title === "被偏移的文件夹");
    assert.equal(shifted.id, "0_3");
  });
});

/**
 * 与配套项目真实数据的交叉契约校验（仓库存在时执行）。
 * 验证真实 bookmarks.json / structure.json 的形状与我们的导出契约一致。
 */
describe("配套项目真实数据契约（可选）", () => {
  const siblingRoot = join(fileURLToPath(import.meta.url), "..", "..", "..", "ChuwuBookmarks");
  const bookmarksPath = join(siblingRoot, "bookmarks.json");
  const structurePath = join(siblingRoot, "structure.json");
  const available = existsSync(bookmarksPath) && existsSync(structurePath);

  it("真实 bookmarks.json 符合导出契约", { skip: !available }, () => {
    const data = JSON.parse(readFileSync(bookmarksPath, "utf8"));
    assert.ok(Array.isArray(data));

    const walk = (nodes) => {
      for (const node of nodes) {
        if (node.type === "link") {
          assert.deepEqual(
            Object.keys(node).sort(),
            ["addDate", "icon", "title", "type", "url"],
            `链接字段不匹配: ${node.title}`
          );
          assert.ok(Array.isArray(node.icon), "icon 必须是数组");
          assert.ok(Number.isInteger(node.addDate), "addDate 必须是整数");
        } else {
          assert.deepEqual(
            Object.keys(node).sort(),
            ["addDate", "children", "title", "type"],
            `文件夹字段不匹配: ${node.title}`
          );
          walk(node.children);
        }
      }
    };
    walk(data);
  });

  it("真实 structure.json 符合导出契约", { skip: !available }, () => {
    const data = JSON.parse(readFileSync(structurePath, "utf8"));
    assert.equal(data.version, 1);
    assert.ok(typeof data.generated === "string");
    assert.ok(Array.isArray(data.folders));

    const walk = (folders) => {
      for (const folder of folders) {
        const keys = Object.keys(folder);
        for (const required of [
          "id",
          "title",
          "addDate",
          "linkCount",
          "folderCount",
          "hasChildren",
        ]) {
          assert.ok(keys.includes(required), `缺少字段 ${required}: ${folder.title}`);
        }
        assert.ok(typeof folder.id === "string");
        assert.ok(Number.isInteger(folder.addDate));
        if (folder.children) walk(folder.children);
      }
    };
    walk(data.folders);
  });

  it(
    "黄金回测：真实 bookmarks.json 重算的 structure 与真实 structure.json 完全一致",
    { skip: !available },
    () => {
      const bookmarks = JSON.parse(readFileSync(bookmarksPath, "utf8"));
      const structure = JSON.parse(readFileSync(structurePath, "utf8"));
      assert.deepEqual(generateStructure(bookmarks), structure.folders);
    }
  );
});
