/**
 * 界面多语言模块。
 * 默认跟随浏览器语言，用户可手动切换，选择持久化到 localStorage。
 */

const LANG_STORAGE_KEY = "bookmarksPortalLang";

const translations = {
  zh: {
    title: "选择要导出的书签",
    selectAll: "全选",
    deselectAll: "全不选",
    exportButton: "导出书签",
    exporting: "导出中…",
    searchPlaceholder: "搜索书签…",
    searchLabel: "搜索书签",
    loadOptions: "加载上次选择",
    switchLanguage: "切换语言 / Switch language",
    noSelection: "请至少选择一个项目！",
    exportError: "导出过程中发生错误，请查看控制台了解详情。",
    exportSuccess: "导出成功！已生成 2 个文件。",
    noSavedOptions: "没有找到已保存的选择！",
    loadError: "加载选择时发生错误，请查看控制台了解详情。",
    loaded: "已加载上次选择。",
    noBookmarks: "未找到任何书签。",
    noMatch: "没有匹配的书签。",
    loadFailed: "书签加载失败，请查看控制台了解详情。",
    expand: "展开",
    collapse: "收起",
    selectedCount: (folders, links) => `已选 ${folders} 个文件夹、${links} 个链接`,
  },
  en: {
    title: "Select Bookmarks to Export",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    exportButton: "Transmit !!",
    exporting: "Exporting…",
    searchPlaceholder: "Search bookmarks…",
    searchLabel: "Search bookmarks",
    loadOptions: "Load last selection",
    switchLanguage: "Switch language / 切换语言",
    noSelection: "Please select at least one item!",
    exportError: "An error occurred during export. Check the console for details.",
    exportSuccess: "Export successful! 2 files generated.",
    noSavedOptions: "No saved selection found!",
    loadError: "An error occurred while loading the selection. Check the console for details.",
    loaded: "Last selection loaded.",
    noBookmarks: "No bookmarks found.",
    noMatch: "No matching bookmarks.",
    loadFailed: "Failed to load bookmarks. Check the console for details.",
    expand: "Expand",
    collapse: "Collapse",
    selectedCount: (folders, links) => `${folders} folders, ${links} links selected`,
  },
};

const SUPPORTED_LANGS = Object.keys(translations);

/**
 * 检测初始语言：本地存储 > 浏览器语言。
 * @returns {"zh"|"en"}
 */
function detectLanguage() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (SUPPORTED_LANGS.includes(saved)) return saved;
  } catch {
    // localStorage 不可用（含 Node 测试环境）时静默回退
  }
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
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch {
    // 持久化失败不影响本次切换
  }
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
  doc.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  doc.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  doc.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
  doc.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
}

export { applyStaticTexts, t, toggleLanguage, translations };
