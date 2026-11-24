/**
 * i18n 双向一致性与单复数测试：
 * - zh/en 键集合相等
 * - popup.html 的 data-i18n* 键、JS 中引用的键均存在于翻译表
 * - 反向检查：translations 中不存在未被引用的死键
 * - 英文单复数格式正确
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
    const files = ["src/popup.js", "src/js/tree.js", "src/js/i18n.js"];
    const keys = new Set();
    for (const file of files) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const match of source.matchAll(/(?:\bt|showStatus)\("(\w+)"\)/g)) {
        keys.add(match[1]);
      }
    }
    assert.ok(keys.size > 0, "应从 JS 中提取到 t() 键");
    for (const dynamicKey of [
      "themeSystem",
      "themeLight",
      "themeDark",
      "selectAllMatched",
      "deselectAllMatched",
      "expandFolder",
      "collapseFolder",
    ]) {
      keys.add(dynamicKey);
    }
    for (const key of keys) {
      for (const lang of ["zh", "en"]) {
        assert.ok(key in translations[lang], `缺少翻译键 [${lang}].${key}`);
      }
    }
  });

  it("translations 中不存在未被引用的死键", () => {
    const files = ["src/popup.html", "src/popup.js", "src/js/tree.js", "src/js/i18n.js"];
    const combined = files.map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
    const unused = Object.keys(translations.zh).filter((key) => !combined.includes(key));
    assert.deepEqual(unused, [], `发现未使用的翻译键: ${unused.join(", ")}`);
  });

  it("英文 selectedCount 正确处理单复数", () => {
    assert.equal(translations.en.selectedCount(0, 0), "0 folders, 0 links selected");
    assert.equal(translations.en.selectedCount(1, 1), "1 folder, 1 link selected");
    assert.equal(translations.en.selectedCount(1, 2), "1 folder, 2 links selected");
    assert.equal(translations.en.selectedCount(3, 1), "3 folders, 1 link selected");
  });
});
