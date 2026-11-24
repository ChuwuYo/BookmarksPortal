/**
 * 主题模块：跟随系统 / 亮色 / 暗色 三态循环。
 * 选择持久化到 localStorage；system 模式下跟随 prefers-color-scheme 并监听变化。
 * 模块保持纯 Node 环境可安全导入（无未守卫的 DOM 访问）。
 */

import { STORAGE_KEYS, readStorage, writeStorage } from "./storage.js";
import { createSvgIcon } from "./svg.js";

const MODES = ["system", "light", "dark"];
const THEME_COLORS = { light: "#58505b", dark: "#191b1d" };

const darkMedia =
  typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;

const THEME_ICON_SHAPES = {
  light: [
    { tag: "circle", attrs: { cx: 12, cy: 12, r: 4 } },
    "M12 2v2",
    "M12 20v2",
    "m4.93 4.93 1.41 1.41",
    "m17.66 17.66 1.41 1.41",
    "M2 12h2",
    "M20 12h2",
    "m6.34 17.66-1.41 1.41",
    "m19.07 4.93-1.41 1.41",
  ],
  dark: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  system: [
    { tag: "rect", attrs: { x: 2, y: 3, width: 20, height: 14, rx: 2 } },
    "M8 21h8",
    "M12 17v4",
  ],
};

/** 从持久化存储读取初始模式（非法值回退 system） */
function readStoredTheme() {
  const stored = readStorage(STORAGE_KEYS.THEME);
  return MODES.includes(stored) ? stored : "system";
}

/**
 * 当前模式（内存事实源）。
 * 持久化失败时仍以内存值为准，保证按钮标签与实际主题一致。
 */
let currentMode = readStoredTheme();

function getTheme() {
  return currentMode;
}

/**
 * 计算给定模式在当前系统偏好下是否应启用暗色。
 * @param {"system"|"light"|"dark"} mode
 * @param {boolean} [prefersDark]
 * @returns {boolean}
 */
function isDarkMode(mode, prefersDark = !!darkMedia?.matches) {
  return mode === "dark" || (mode === "system" && prefersDark);
}

function applyTheme(mode) {
  const dark = isDarkMode(mode);
  if (typeof document === "undefined") return dark;
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  return dark;
}

function cycleTheme() {
  currentMode = MODES[(MODES.indexOf(currentMode) + 1) % MODES.length];
  writeStorage(STORAGE_KEYS.THEME, currentMode);
  applyTheme(currentMode);
  return currentMode;
}

darkMedia?.addEventListener?.("change", () => {
  if (getTheme() === "system") applyTheme("system");
});

/**
 * 构建主题模式对应的图标（复用 svg.js）。
 * @param {"system"|"light"|"dark"} mode
 * @returns {SVGSVGElement}
 */
function createThemeIcon(mode) {
  return createSvgIcon(THEME_ICON_SHAPES[mode] ?? THEME_ICON_SHAPES.system, 16, 2);
}

// 浏览器环境导入时同步主题（首帧由 head 内 theme-init.js 抢先应用）
applyTheme(getTheme());

export { MODES, applyTheme, createThemeIcon, cycleTheme, getTheme, isDarkMode };
