/**
 * 字体子集字符集收集测试（纯 Node，不依赖 subset-font 原生模块）。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { translations } from "../src/js/i18n.js";
import { collectUiCharset } from "../scripts/subset-font.mjs";

describe("subset-font collectUiCharset", () => {
  it("完整覆盖 i18n.js 中所有中英文文案与函数模板的字符", () => {
    const charset = collectUiCharset();
    for (const dict of Object.values(translations)) {
      for (const value of Object.values(dict)) {
        const rendered = typeof value === "function" ? String(value(0, 0)) : String(value);
        for (const ch of rendered) {
          assert.ok(charset.includes(ch), `字体子集缺少字符: "${ch}"`);
        }
      }
    }
  });

  it("输出已去重并包含常用中文标点兜底", () => {
    const charset = collectUiCharset();
    assert.equal(new Set(charset).size, charset.length);
    for (const ch of "，。！？；：（）【】「」、—…") {
      assert.ok(charset.includes(ch), `缺少标点兜底字符: "${ch}"`);
    }
  });
});
