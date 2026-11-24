/**
 * 浏览器 API 适配层单元测试（纯 Node）。
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { getBookmarkTree } from "../src/js/api.js";

afterEach(() => {
  delete globalThis.browser;
  delete globalThis.chrome;
});

describe("api.js getBookmarkTree", () => {
  it("Firefox browser.* Promise 路径正常返回", async () => {
    const mockTree = [{ id: "0", children: [] }];
    globalThis.browser = {
      bookmarks: { getTree: async () => mockTree },
    };
    const result = await getBookmarkTree();
    assert.deepEqual(result, mockTree);
  });

  it("Chrome chrome.* 回调路径正常返回", async () => {
    const mockTree = [{ id: "0", children: [{ id: "1", title: "书签栏", children: [] }] }];
    globalThis.chrome = {
      runtime: {},
      bookmarks: {
        getTree: (cb) => cb(mockTree),
      },
    };
    const result = await getBookmarkTree();
    assert.deepEqual(result, mockTree);
  });

  it("Chrome runtime.lastError 触发 Promise reject", async () => {
    globalThis.chrome = {
      runtime: { lastError: { message: "permission denied" } },
      bookmarks: {
        getTree: (cb) => cb(undefined),
      },
    };
    await assert.rejects(() => getBookmarkTree(), /permission denied/);
  });

  it("非扩展环境（无 browser/chrome bookmarks API）返回明确错误", async () => {
    globalThis.browser = {};
    await assert.rejects(() => getBookmarkTree(), /unavailable/i);
  });
});
