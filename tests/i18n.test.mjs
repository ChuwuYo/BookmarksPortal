/**
 * i18n 双向一致性、静态文本应用与单复数测试：
 * - zh/en 键集合相等
 * - popup.html 的 data-i18n* 键、JS 中引用的键均存在于翻译表
 * - 反向检查：translations 中不存在未被引用的死键（仅扫描真实消费方，不扫描定义本身）
 * - applyStaticTexts 同步 title、lang 与各属性，且跳过函数条目
 * - 英文单复数格式正确
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { applyStaticTexts, translations } from "../src/js/i18n.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectReferencedKeys() {
  const keys = new Set();

  const html = readFileSync(join(ROOT, "src/popup.html"), "utf8");
  for (const match of html.matchAll(/data-i18n(?:-aria|-title|-placeholder)?="(\w+)"/g)) {
    keys.add(match[1]);
  }

  for (const file of ["src/popup.js", "src/js/tree.js", "src/js/i18n.js"]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const match of source.matchAll(/(?:\bt|showStatus)\("(\w+)"\s*[,)]/g)) {
      keys.add(match[1]);
    }
  }

  // 动态/条件拼接键
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

  return keys;
}

describe("i18n 一致性", () => {
  it("zh 与 en 键集合相等", () => {
    assert.deepEqual(Object.keys(translations.zh).sort(), Object.keys(translations.en).sort());
  });

  it("HTML 与 JS 中引用的全部键存在于翻译表", () => {
    const keys = collectReferencedKeys();
    assert.ok(keys.size > 0, "应提取到引用键");
    for (const key of keys) {
      for (const lang of ["zh", "en"]) {
        assert.ok(key in translations[lang], `缺少翻译键 [${lang}].${key}`);
      }
    }
  });

  it("translations 中不存在未被引用的死键", () => {
    const referenced = collectReferencedKeys();
    const unused = Object.keys(translations.zh).filter((key) => !referenced.has(key));
    assert.deepEqual(unused, [], `发现未使用的翻译键: ${unused.join(", ")}`);
  });

  it("applyStaticTexts 正确同步 title、lang 与各类 data-i18n 属性并跳过函数条目", () => {
    const makeEl = (dataset) => {
      const attrs = new Map();
      return {
        dataset,
        textContent: "initial",
        setAttribute: (k, v) => attrs.set(k, v),
        getAttribute: (k) => attrs.get(k),
      };
    };

    const elText = makeEl({ i18n: "selectAll" });
    const elFn = makeEl({ i18n: "selectedCount" });
    const elAria = makeEl({ i18nAria: "bookmarkTree" });
    const elTitle = makeEl({ i18nTitle: "loadOptions" });
    const elPlaceholder = makeEl({ i18nPlaceholder: "searchPlaceholder" });

    const fakeDoc = {
      title: "",
      documentElement: { lang: "" },
      querySelectorAll: (selector) => {
        if (selector === "[data-i18n]") return [elText, elFn];
        if (selector === "[data-i18n-aria]") return [elAria];
        if (selector === "[data-i18n-title]") return [elTitle];
        if (selector === "[data-i18n-placeholder]") return [elPlaceholder];
        return [];
      },
    };

    applyStaticTexts(fakeDoc);
    assert.ok(fakeDoc.documentElement.lang === "zh-CN" || fakeDoc.documentElement.lang === "en");
    assert.ok(fakeDoc.title.length > 0);
    assert.notEqual(elText.textContent, "initial");
    assert.equal(elFn.textContent, "initial");
    assert.ok(elAria.getAttribute("aria-label"));
    assert.ok(elTitle.getAttribute("title"));
    assert.ok(elPlaceholder.getAttribute("placeholder"));
  });

  it("英文 selectedCount 正确处理单复数", () => {
    assert.equal(translations.en.selectedCount(0, 0), "0 folders, 0 links selected");
    assert.equal(translations.en.selectedCount(1, 1), "1 folder, 1 link selected");
    assert.equal(translations.en.selectedCount(1, 2), "1 folder, 2 links selected");
    assert.equal(translations.en.selectedCount(3, 1), "3 folders, 1 link selected");
  });
});
