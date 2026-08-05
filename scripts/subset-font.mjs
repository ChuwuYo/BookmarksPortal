/**
 * 字体子集化：从 font-source/ 的完整字体中提取 UI 文案所需的最小字符集，
 * 输出 woff2 子集。
 *
 * 自动同步机制：字符集在每次构建时从 src/js/i18n.js 与 src/popup.html
 * 现算现取——文案变更后下一次 `npm run build` 自动产出匹配的新子集，
 * 无需手工维护字符清单。
 *
 * 独立用法：node scripts/subset-font.mjs <输出路径>
 * 构建用法：build.mjs 调用 buildSubsetFont() 直接写入 dist。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FONT = join(ROOT, "font-source", "AlibabaHealthFont2.0CN-45R.woff2");
const SUBSET_FONT_NAME = "ui-subset.woff2";

/** 常用中文标点与符号兜底（文案中可能未直接出现） */
const PUNCTUATION_FALLBACK = "，。！？；：（）【】「」、—…·〜￥";

/**
 * 计算 UI 文案字符集。
 * @returns {string} 去重排序后的字符序列
 */
function collectUiCharset() {
  const chars = new Set();

  // ASCII 可打印区（英文文案、数字、基础符号）
  for (let code = 0x20; code < 0x7f; code++) {
    chars.add(String.fromCharCode(code));
  }

  // i18n.js 中的字符串与模板字面量（剔除 ${} 插值）
  const i18nSource = readFileSync(join(ROOT, "src/js/i18n.js"), "utf8");
  for (const match of i18nSource.matchAll(/"([^"\\]*)"/g)) {
    for (const ch of match[1]) chars.add(ch);
  }
  for (const match of i18nSource.matchAll(/`([^`\\]*)`/g)) {
    for (const ch of match[1].replaceAll(/\$\{[^}]*\}/g, "")) chars.add(ch);
  }

  // popup.html 中的可见文本（作为 data-i18n 兜底的静态文案）
  const html = readFileSync(join(ROOT, "src/popup.html"), "utf8");
  for (const ch of html.replaceAll(/<[^>]+>/g, "")) chars.add(ch);

  for (const ch of PUNCTUATION_FALLBACK) chars.add(ch);

  return [...chars].sort().join("");
}

/**
 * 构建 UI 字体子集。
 * @returns {Promise<Buffer>} woff2 子集内容
 */
async function buildSubsetFont() {
  const charset = collectUiCharset();
  const sourceFont = readFileSync(SOURCE_FONT);
  return subsetFont(sourceFont, charset, { targetFormat: "woff2" });
}

// CLI：node scripts/subset-font.mjs <输出路径>
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error("用法: node scripts/subset-font.mjs <输出路径.woff2>");
    process.exit(1);
  }
  const subset = await buildSubsetFont();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, subset);
  console.log(`✔ 字体子集 (${(subset.length / 1024).toFixed(1)}KB) -> ${outputPath}`);
}

export { SUBSET_FONT_NAME, buildSubsetFont, collectUiCharset };
