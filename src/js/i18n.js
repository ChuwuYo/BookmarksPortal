/**
 * 界面多语言模块。
 * 默认跟随浏览器语言，用户可手动切换，选择持久化到 localStorage。
 */

import { STORAGE_KEYS, readStorage, writeStorage } from "./storage.js";

const translations = {
  zh: {
    pageTitle: "书签传送门-BookmarksPortal",
    title: "选择要导出的书签",
    selectAll: "全选",
    deselectAll: "全不选",
    selectAllMatched: "全选匹配",
    deselectAllMatched: "取消匹配",
    exportButton: "导出书签",
    exporting: "导出中…",
    searchPlaceholder: "搜索书签…",
    searchLabel: "搜索书签",
    bookmarkTree: "书签树",
    loadOptions: "加载上次选择",
    switchLanguage: "切换语言 / Switch language",
    noSelection: "请至少选择一个项目！",
    exportError: "导出过程中发生错误，请查看控制台了解详情。",
    exportSuccess: "导出成功！已生成 2 个文件。",
    structureError: "书签文件已下载，但目录结构文件生成失败，请查看控制台了解详情。",
    noSavedOptions: "没有找到已保存的选择！",
    loadError: "加载选择时发生错误，请查看控制台了解详情。",
    loaded: "已加载上次选择。",
    noBookmarks: "未找到任何书签。",
    noMatch: "没有匹配的书签。",
    loadFailed: "书签加载失败，请查看控制台了解详情。",
    expand: "展开",
    collapse: "收起",
    expandFolder: (name) => `展开 ${name}`,
    collapseFolder: (name) => `收起 ${name}`,
    untitled: "(无标题)",
    themeSystem: "主题：跟随系统",
    themeLight: "主题：亮色",
    themeDark: "主题：暗色",
    selectedCount: (folders, links) => `已选 ${folders} 个文件夹、${links} 个链接`,
  },
  en: {
    pageTitle: "BookmarksPortal",
    title: "Select Bookmarks",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    selectAllMatched: "Select Matches",
    deselectAllMatched: "Deselect Matches",
    exportButton: "Transmit !!",
    exporting: "Exporting…",
    searchPlaceholder: "Search bookmarks…",
    searchLabel: "Search bookmarks",
    bookmarkTree: "Bookmark tree",
    loadOptions: "Load last selection",
    switchLanguage: "Switch language / 切换语言",
    noSelection: "Please select at least one item!",
    exportError: "An error occurred during export. Check the console for details.",
    exportSuccess: "Export successful! 2 files generated.",
    structureError:
      "The bookmarks file was downloaded, but the structure file failed. Check the console for details.",
    noSavedOptions: "No saved selection found!",
    loadError: "An error occurred while loading the selection. Check the console for details.",
    loaded: "Last selection loaded.",
    noBookmarks: "No bookmarks found.",
    noMatch: "No matching bookmarks.",
    loadFailed: "Failed to load bookmarks. Check the console for details.",
    expand: "Expand",
    collapse: "Collapse",
    expandFolder: (name) => `Expand ${name}`,
    collapseFolder: (name) => `Collapse ${name}`,
    untitled: "(Untitled)",
    themeSystem: "Theme: System",
    themeLight: "Theme: Light",
    themeDark: "Theme: Dark",
    selectedCount: (folders, links) =>
      `${folders} ${folders === 1 ? "folder" : "folders"}, ${links} ${links === 1 ? "link" : "links"} selected`,
  },
};

const SUPPORTED_LANGS = Object.keys(translations);

/**
 * 检测初始语言：本地存储 > 浏览器语言。
 * @returns {"zh"|"en"}
 */
function detectLanguage() {
  const saved = readStorage(STORAGE_KEYS.LANG);
  if (SUPPORTED_LANGS.includes(saved)) return saved;
  if (typeof navigator !== "undefined" && navigator.language?.startsWith("zh")) return "zh";
  return "en";
}

let currentLang = detectLanguage();

/**
 * 获取翻译文本。
 * @param {string} key
 * @returns {*}
 */
function t(key) {
  return translations[currentLang][key] ?? key;
}

/**
 * 切换语言并持久化。
 * @returns {"zh"|"en"} 切换后的语言
 */
function toggleLanguage() {
  currentLang = currentLang === "zh" ? "en" : "zh";
  writeStorage(STORAGE_KEYS.LANG, currentLang);
  return currentLang;
}

/**
 * 将翻译应用到所有带 data-i18n 属性的静态元素。
 * - data-i18n: 文本内容
 * - data-i18n-aria: aria-label
 * - data-i18n-title: title（悬浮提示）
 * - data-i18n-placeholder: placeholder
 * @param {Document} doc
 */
function applyStaticTexts(doc) {
  doc.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
  doc.title = String(t("pageTitle"));
  doc.querySelectorAll("[data-i18n]").forEach((el) => {
    const val = t(el.dataset.i18n);
    if (typeof val === "string") el.textContent = val;
  });
  doc.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const val = t(el.dataset.i18nAria);
    if (typeof val === "string") el.setAttribute("aria-label", val);
  });
  doc.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const val = t(el.dataset.i18nTitle);
    if (typeof val === "string") el.setAttribute("title", val);
  });
  doc.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const val = t(el.dataset.i18nPlaceholder);
    if (typeof val === "string") el.setAttribute("placeholder", val);
  });
}

export { applyStaticTexts, t, toggleLanguage, translations };
