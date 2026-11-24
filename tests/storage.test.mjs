/**
 * 本地存储封装单元测试（纯 Node，mock localStorage）。
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  STORAGE_KEYS,
  readJsonStorage,
  readStorage,
  writeJsonStorage,
  writeStorage,
} from "../src/js/storage.js";

afterEach(() => {
  delete globalThis.localStorage;
});

describe("storage.js", () => {
  it("localStorage 不可用时安全回退", () => {
    assert.equal(readStorage(STORAGE_KEYS.THEME), null);
    assert.equal(writeStorage(STORAGE_KEYS.THEME, "dark"), false);
    assert.deepEqual(readJsonStorage(STORAGE_KEYS.OPTIONS), { ok: true, value: null });
    assert.equal(writeJsonStorage(STORAGE_KEYS.OPTIONS, { a: 1 }), false);
  });

  it("正常读写字符串与 JSON 对象", () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };

    assert.equal(writeStorage(STORAGE_KEYS.LANG, "en"), true);
    assert.equal(readStorage(STORAGE_KEYS.LANG), "en");

    assert.equal(writeJsonStorage(STORAGE_KEYS.OPTIONS, { uncheckedIds: ["1", "2"] }), true);
    assert.deepEqual(readJsonStorage(STORAGE_KEYS.OPTIONS), {
      ok: true,
      value: { uncheckedIds: ["1", "2"] },
    });
  });

  it("readJsonStorage 遇到损坏的 JSON 返回 ok: false", () => {
    globalThis.localStorage = {
      getItem: () => "{broken-json",
      setItem: () => {},
    };
    const res = readJsonStorage(STORAGE_KEYS.OPTIONS);
    assert.equal(res.ok, false);
    assert.ok(res.error instanceof SyntaxError);
  });

  it("writeJsonStorage 拒绝 undefined、循环引用及存储异常", () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };

    // undefined 不可序列化为合法 JSON，不应写入 "undefined"
    assert.equal(writeJsonStorage(STORAGE_KEYS.OPTIONS, undefined), false);
    assert.equal(store.has(STORAGE_KEYS.OPTIONS), false);

    // 循环引用抛出异常时返回 false
    const circular = {};
    circular.self = circular;
    assert.equal(writeJsonStorage(STORAGE_KEYS.OPTIONS, circular), false);

    // localStorage.setItem 抛出配额异常时返回 false
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    assert.equal(writeStorage(STORAGE_KEYS.LANG, "zh"), false);
    assert.equal(writeJsonStorage(STORAGE_KEYS.OPTIONS, { ok: true }), false);
  });
});
