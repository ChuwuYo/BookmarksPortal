/**
 * 组合根：装配 API 适配层、i18n、树组件与导出逻辑。
 * 导出 createPopupController 工厂函数以便单元测试，浏览器环境下自动在 DOMContentLoaded 初始化。
 */

import { getBookmarkTree as defaultGetBookmarkTree } from "./js/api.js";
import {
  STRUCTURE_FILENAME,
  buildStructureFile,
  filterTreeBySelection,
  makeBookmarkFilename,
} from "./js/exporter.js";
import {
  applyStaticTexts as defaultApplyStaticTexts,
  t as defaultT,
  toggleLanguage as defaultToggleLanguage,
} from "./js/i18n.js";
import { STORAGE_KEYS, readJsonStorage, writeJsonStorage } from "./js/storage.js";
import {
  createThemeIcon as defaultCreateThemeIcon,
  cycleTheme as defaultCycleTheme,
  getTheme as defaultGetTheme,
} from "./js/theme.js";
import { createBookmarkTree as defaultCreateBookmarkTree } from "./js/tree.js";

const MIN_EXPORTING_MS = 1000;
const STATUS_CLEAR_MS = 4000;
const SEARCH_DEBOUNCE_MS = 150;
const DOWNLOAD_STAGGER_MS = 500;
const BLOB_REVOKE_MS = 30000;

/**
 * 触发单个 JSON 文件下载。
 */
function defaultDownloadJson(data, filename, doc = document) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
}

/**
 * 创建弹窗控制器（依赖可注入，便于隔离单测）。
 * @param {Object} [deps]
 */
function createPopupController(deps = {}) {
  const doc = deps.document ?? document;
  const getBookmarkTree = deps.getBookmarkTree ?? defaultGetBookmarkTree;
  const downloadJson = deps.downloadJson ?? ((data, name) => defaultDownloadJson(data, name, doc));
  const applyStaticTexts = deps.applyStaticTexts ?? defaultApplyStaticTexts;
  const t = deps.t ?? defaultT;
  const toggleLanguage = deps.toggleLanguage ?? defaultToggleLanguage;
  const createThemeIcon = deps.createThemeIcon ?? defaultCreateThemeIcon;
  const cycleTheme = deps.cycleTheme ?? defaultCycleTheme;
  const getTheme = deps.getTheme ?? defaultGetTheme;
  const createBookmarkTree = deps.createBookmarkTree ?? defaultCreateBookmarkTree;
  const readOptions = deps.readOptions ?? (() => readJsonStorage(STORAGE_KEYS.OPTIONS));
  const writeOptions = deps.writeOptions ?? ((v) => writeJsonStorage(STORAGE_KEYS.OPTIONS, v));
  const timings = {
    minExportingMs: deps.minExportingMs ?? MIN_EXPORTING_MS,
    statusClearMs: deps.statusClearMs ?? STATUS_CLEAR_MS,
    searchDebounceMs: deps.searchDebounceMs ?? SEARCH_DEBOUNCE_MS,
    downloadStaggerMs: deps.downloadStaggerMs ?? DOWNLOAD_STAGGER_MS,
  };

  /** @type {ReturnType<typeof defaultCreateBookmarkTree>|null} */
  let tree = null;
  let statusTimer = null;
  /** 当前显示的状态消息键（用于语言切换后重渲染与精准隐藏） */
  let lastStatusKey = null;
  let lastStatusPersist = false;
  /** 显式导出进行中状态（与按钮 disabled 属性解耦） */
  let isExporting = false;

  const dom = {};

  function cacheDom() {
    for (const id of [
      "bookmarkList",
      "searchInput",
      "selectAll",
      "deselectAll",
      "exportButton",
      "languageToggle",
      "themeToggle",
      "loadOptionsButton",
      "statusBar",
      "selectionCount",
    ]) {
      dom[id] = doc.getElementById(id);
    }
  }

  /**
   * 同步全选/全不选按钮文案（搜索过滤态下明确提示仅操作匹配项）。
   */
  function updateSelectButtons() {
    const filtered = !!tree?.isFiltered?.();
    dom.selectAll.textContent = t(filtered ? "selectAllMatched" : "selectAll");
    dom.deselectAll.textContent = t(filtered ? "deselectAllMatched" : "deselectAll");
  }

  function bindEvents() {
    dom.selectAll.addEventListener("click", () => tree?.setAllChecked(true));
    dom.deselectAll.addEventListener("click", () => tree?.setAllChecked(false));
    dom.exportButton.addEventListener("click", exportSelectedBookmarks);
    dom.loadOptionsButton.addEventListener("click", loadCheckedOptions);

    dom.languageToggle.addEventListener("click", () => {
      toggleLanguage();
      applyStaticTexts(doc);
      tree?.refreshLanguage();
      updateSelectButtons();
      updateSelectionCount();
      updateThemeButton();
      // applyStaticTexts 会重置按钮文案，导出期间需要恢复 loading 文案
      if (isExporting) {
        dom.exportButton.textContent = t("exporting");
      }
      // 状态栏消息为动态写入，需按新语言重渲染且保持常驻属性
      if (lastStatusKey && !dom.statusBar.hidden) {
        showStatus(lastStatusKey, { persist: lastStatusPersist });
      }
    });

    dom.themeToggle.addEventListener("click", () => {
      cycleTheme();
      updateThemeButton();
    });

    let debounceTimer = null;
    dom.searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => applyFilter(), timings.searchDebounceMs);
    });
  }

  /**
   * 加载并渲染书签树。
   * 书签 API 为本地读取，首帧即顶级目录，无需加载动画。
   */
  async function loadBookmarks() {
    try {
      const bookmarkTree = await getBookmarkTree();
      const rootChildren = bookmarkTree?.[0]?.children ?? [];

      if (rootChildren.length === 0) {
        showStatus("noBookmarks", { persist: true });
        return;
      }

      tree = createBookmarkTree(rootChildren, {
        t,
        onSelectionChange: updateSelectionCount,
      });
      dom.bookmarkList.replaceChildren(tree.element);
      updateSelectionCount();
      // 仅当树加载完成前已输入搜索词时才补应用过滤，避免首帧冗余全量遍历
      if (dom.searchInput.value.trim()) {
        applyFilter();
      }
    } catch (error) {
      console.error("Failed to load bookmarks:", error);
      showStatus("loadFailed", { persist: true });
    }
  }

  /**
   * 刷新主题按钮的图标与无障碍文案。
   */
  function updateThemeButton() {
    const mode = getTheme();
    const labelKey = { system: "themeSystem", light: "themeLight", dark: "themeDark" }[mode];
    dom.themeToggle.replaceChildren(createThemeIcon(mode));
    dom.themeToggle.setAttribute("aria-label", t(labelKey));
    dom.themeToggle.setAttribute("title", t(labelKey));
  }

  /**
   * 应用搜索过滤并处理空结果提示。
   * 无匹配提示保持常驻，避免 4 秒后消失导致空白树区域无反馈；
   * 有匹配或清空搜索时仅清除 noMatch 提示，避免误抹除其他操作反馈。
   */
  function applyFilter() {
    if (!tree) return;
    const query = dom.searchInput.value;
    const matchCount = tree.filter(query);
    updateSelectButtons();
    if (query.trim() && matchCount === 0) {
      showStatus("noMatch", { persist: true });
    } else if (lastStatusKey === "noMatch") {
      hideStatus();
    }
  }

  /**
   * 更新已选数量显示。
   */
  function updateSelectionCount() {
    if (!tree) {
      dom.selectionCount.textContent = "";
      return;
    }
    const { folders, links } = tree.getCheckedCounts();
    dom.selectionCount.textContent = t("selectedCount")(folders, links);
  }

  /**
   * 显示状态消息。
   * @param {string} key 翻译键
   * @param {{ persist?: boolean }} [options]
   */
  function showStatus(key, { persist = false } = {}) {
    lastStatusKey = key;
    lastStatusPersist = persist;
    clearTimeout(statusTimer);
    dom.statusBar.textContent = t(key);
    dom.statusBar.hidden = false;
    if (!persist) {
      statusTimer = setTimeout(() => {
        dom.statusBar.hidden = true;
        lastStatusKey = null;
        lastStatusPersist = false;
      }, timings.statusClearMs);
    }
  }

  /**
   * 立即隐藏状态消息。
   */
  function hideStatus() {
    lastStatusKey = null;
    lastStatusPersist = false;
    clearTimeout(statusTimer);
    dom.statusBar.hidden = true;
  }

  /**
   * 导出选中的书签：生成书签文件与目录结构文件并依次下载。
   */
  async function exportSelectedBookmarks() {
    if (isExporting) return;

    if (!tree) {
      showStatus("noBookmarks", { persist: true });
      return;
    }

    const { selectedIds, indeterminateIds } = tree.getSelection();
    if (selectedIds.size === 0) {
      showStatus("noSelection");
      return;
    }

    setExporting(true);
    const startTime = Date.now();

    // 恢复按钮：保证最短禁用窗口，且必须发生在第二个下载触发之后（调用点保证）
    const reenable = () => {
      const remaining = timings.minExportingMs - (Date.now() - startTime);
      setTimeout(() => setExporting(false), Math.max(0, remaining));
    };

    try {
      const bookmarkTree = await getBookmarkTree();
      const rootChildren = bookmarkTree?.[0]?.children ?? [];
      const exportData = filterTreeBySelection(rootChildren, selectedIds, indeterminateIds);

      if (exportData.length === 0) {
        showStatus("noSelection");
        reenable();
        return;
      }

      // 确认有有效导出数据后再持久化当前未勾选项，避免失败时覆盖原有效配置
      saveCheckedOptions();
      downloadJson(exportData, makeBookmarkFilename());

      // 错峰触发第二个下载，避免浏览器拦截连续下载
      setTimeout(() => {
        try {
          downloadJson(buildStructureFile(exportData), STRUCTURE_FILENAME);
          showStatus("exportSuccess");
        } catch (error) {
          // 书签文件已下载，仅目录结构文件失败，使用专属提示避免重复导出
          console.error("Error generating structure file:", error);
          showStatus("structureError");
        } finally {
          reenable();
        }
      }, timings.downloadStaggerMs);
    } catch (error) {
      console.error("Error exporting bookmarks:", error);
      showStatus("exportError");
      reenable();
    }
  }

  /**
   * 切换导出按钮的加载状态。
   */
  function setExporting(exporting) {
    isExporting = exporting;
    dom.exportButton.disabled = exporting;
    dom.exportButton.classList.toggle("loading", exporting);
    dom.exportButton.textContent = exporting ? t("exporting") : t("exportButton");
  }

  /**
   * 持久化当前「明确未勾选」的节点 id。
   */
  function saveCheckedOptions() {
    const ok = writeOptions({
      uncheckedIds: tree.getUncheckedIds(),
      timestamp: Date.now(),
    });
    if (!ok) {
      console.warn("Failed to save options.");
    }
  }

  /**
   * 恢复上次保存的勾选状态。
   */
  function loadCheckedOptions() {
    if (!tree) {
      showStatus("noBookmarks");
      return;
    }

    const result = readOptions();
    if (!result.ok) {
      console.error("Error loading options:", result.error);
      showStatus("loadError");
      return;
    }

    const saved = result.value;
    if (!saved || !Array.isArray(saved.uncheckedIds)) {
      showStatus("noSavedOptions");
      return;
    }

    tree.applyUncheckedIds(saved.uncheckedIds);
    showStatus("loaded");
  }

  function init() {
    cacheDom();
    applyStaticTexts(doc);
    updateThemeButton();
    bindEvents();
    return loadBookmarks();
  }

  return {
    init,
    applyFilter,
    exportSelectedBookmarks,
    loadCheckedOptions,
    showStatus,
    hideStatus,
    getState: () => ({ isExporting, lastStatusKey, lastStatusPersist }),
  };
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    createPopupController().init();
  });
}

export { createPopupController };
