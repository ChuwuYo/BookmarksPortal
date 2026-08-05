/**
 * 组合根：装配 API 适配层、i18n、树组件与导出逻辑。
 */

import { getBookmarkTree } from "./js/api.js";
import {
  STRUCTURE_FILENAME,
  buildStructureFile,
  filterTreeBySelection,
  makeBookmarkFilename,
} from "./js/exporter.js";
import { applyStaticTexts, t, toggleLanguage } from "./js/i18n.js";
import { createThemeIcon, cycleTheme, getTheme } from "./js/theme.js";
import { createBookmarkTree } from "./js/tree.js";

const OPTIONS_STORAGE_KEY = "bookmarksPortalOptions";
const MIN_EXPORTING_MS = 1000;
const STATUS_CLEAR_MS = 4000;
const SEARCH_DEBOUNCE_MS = 150;
const DOWNLOAD_STAGGER_MS = 500;

/** @type {ReturnType<typeof createBookmarkTree>|null} */
let tree = null;
let statusTimer = null;
/** 当前显示的状态消息键（用于语言切换后重渲染） */
let lastStatusKey = null;

const dom = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheDom();
  applyStaticTexts(document);
  updateThemeButton();
  bindEvents();
  loadBookmarks();
}

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
    dom[id] = document.getElementById(id);
  }
}

function bindEvents() {
  dom.selectAll.addEventListener("click", () => tree?.setAllChecked(true));
  dom.deselectAll.addEventListener("click", () => tree?.setAllChecked(false));
  dom.exportButton.addEventListener("click", exportSelectedBookmarks);
  dom.loadOptionsButton.addEventListener("click", loadCheckedOptions);

  dom.languageToggle.addEventListener("click", () => {
    toggleLanguage();
    applyStaticTexts(document);
    tree?.refreshLanguage();
    updateSelectionCount();
    updateThemeButton();
    // applyStaticTexts 会重置按钮文案，导出期间需要恢复 loading 文案
    if (dom.exportButton.disabled) {
      dom.exportButton.textContent = t("exporting");
    }
    // 状态栏消息为动态写入，需按新语言重渲染
    if (lastStatusKey && !dom.statusBar.hidden) {
      showStatus(lastStatusKey);
    }
  });

  dom.themeToggle.addEventListener("click", () => {
    cycleTheme();
    updateThemeButton();
  });

  let debounceTimer = null;
  dom.searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyFilter(), SEARCH_DEBOUNCE_MS);
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
      showStatus("noBookmarks");
      return;
    }

    tree = createBookmarkTree(rootChildren, {
      t,
      onSelectionChange: updateSelectionCount,
    });
    dom.bookmarkList.replaceChildren(tree.element);
    updateSelectionCount();
    // 树加载完成前输入的搜索词在此补应用
    applyFilter();
  } catch (error) {
    console.error("Failed to load bookmarks:", error);
    showStatus("loadFailed");
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
 */
function applyFilter() {
  if (!tree) return;
  const query = dom.searchInput.value;
  const matchCount = tree.filter(query);
  if (query.trim() && matchCount === 0) {
    showStatus("noMatch");
  } else {
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
 * 显示状态消息（自动清除）。
 * @param {string} key 翻译键
 */
function showStatus(key) {
  lastStatusKey = key;
  clearTimeout(statusTimer);
  dom.statusBar.textContent = t(key);
  dom.statusBar.hidden = false;
  statusTimer = setTimeout(() => {
    dom.statusBar.hidden = true;
    lastStatusKey = null;
  }, STATUS_CLEAR_MS);
}

/**
 * 立即隐藏状态消息。
 */
function hideStatus() {
  lastStatusKey = null;
  clearTimeout(statusTimer);
  dom.statusBar.hidden = true;
}

/**
 * 导出选中的书签：生成书签文件与目录结构文件并依次下载。
 */
async function exportSelectedBookmarks() {
  if (!tree) {
    showStatus("noBookmarks");
    return;
  }

  const { selectedIds, indeterminateIds } = tree.getSelection();
  if (selectedIds.size === 0) {
    showStatus("noSelection");
    return;
  }

  saveCheckedOptions();
  setExporting(true);
  const startTime = Date.now();

  // 恢复按钮：保证最短禁用窗口，且必须发生在第二个下载触发之后（调用点保证）
  const reenable = () => {
    const remaining = MIN_EXPORTING_MS - (Date.now() - startTime);
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
    }, DOWNLOAD_STAGGER_MS);
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
  dom.exportButton.disabled = exporting;
  dom.exportButton.classList.toggle("loading", exporting);
  dom.exportButton.textContent = exporting ? t("exporting") : t("exportButton");
}

/**
 * 触发单个 JSON 文件下载。
 */
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 持久化当前「明确未勾选」的节点 id。
 */
function saveCheckedOptions() {
  try {
    const payload = {
      uncheckedIds: tree.getUncheckedIds(),
      timestamp: Date.now(),
    };
    localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to save options:", error);
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

  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY));
  } catch (error) {
    console.error("Error loading options:", error);
    showStatus("loadError");
    return;
  }

  if (!saved || !Array.isArray(saved.uncheckedIds)) {
    showStatus("noSavedOptions");
    return;
  }

  tree.applyUncheckedIds(saved.uncheckedIds);
  showStatus("loaded");
}
