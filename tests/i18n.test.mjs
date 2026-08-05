/**
 * i18n 一致性测试：popup.html 的 data-i18n* 键、JS 中 t() 引用键、
 * translations 表三方必须对齐，且 zh/en 键集合相等。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { translations } from "../src/js/i18n.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("i18n 一致性", () => {
  it("zh 与 en 键集合相等", () => {
    assert.deepEqual(Object.keys(translations.zh).sort(), Object.keys(translations.en).sort());
  });

  it("popup.html 的 data-i18n* 键全部存在于翻译表", () => {
    const html = readFileSync(join(ROOT, "src/popup.html"), "utf8");
    const keys = new Set();
    for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="(\w+)"/g)) {
      keys.add(match[1]);
    }
    assert.ok(keys.size > 0, "应从 HTML 中提取到 i18n 键");
    for (const key of keys) {
      for (const lang of ["zh", "en"]) {
        assert.ok(key in translations[lang], `缺少翻译键 [${lang}].${key}`);
      }
    }
  });

  it("JS 中 t()/showStatus() 引用的键全部存在于翻译表", () => {
    const files = ["src/popup.js", "src/js/tree.js"];
    const keys = new Set();
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const match of source.matchAll(/(?:\bt|showStatus)\("(\w+)"\)/g)) {
        keys.add(match[1]);
      }
    }
    assert.ok(keys.size > 0, "应从 JS 中提取到 t() 键");
    // 动态拼接的键（popup.js 的 updateThemeButton）无法被正则捕获，显式断言
    keys.add("themeSystem");
    keys.add("themeLight");
    keys.add("themeDark");
    for (const key of keys) {
      for (const lang of ["zh", "en"]) {
        assert.ok(key in translations[lang], `缺少翻译键 [${lang}].${key}`);
      }
    }
  });
});
