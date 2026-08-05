/**
 * 主题模块：跟随系统 / 亮色 / 暗色 三态循环。
 * 选择持久化到 localStorage；system 模式下跟随 prefers-color-scheme 并监听变化。
 * 模块导入时立即应用，避免首帧闪烁。
 */

const THEME_STORAGE_KEY = "bookmarksPortalTheme";
const MODES = ["system", "light", "dark"];

const darkMedia =
  typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;

const SVG_NS = "http://www.w3.org/2000/svg";

/** 从持久化存储读取初始模式（非法值回退 system） */
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (MODES.includes(stored)) return stored;
  } catch {
    // localStorage 不可用时回退为跟随系统
  }
  return "system";
}

/**
 * 当前模式（内存事实源）。
 * 持久化失败时仍以内存值为准，保证按钮标签与实际主题一致。
 */
let currentMode = readStoredTheme();

function getTheme() {
  return currentMode;
}

function applyTheme(mode) {
  const dark = mode === "dark" || (mode === "system" && !!darkMedia?.matches);
  document.documentElement.classList.toggle("dark", dark);
}

function cycleTheme() {
  currentMode = MODES[(MODES.indexOf(currentMode) + 1) % MODES.length];
  try {
    localStorage.setItem(THEME_STORAGE_KEY, currentMode);
  } catch {
    // 持久化失败不影响本次切换
  }
  applyTheme(currentMode);
  return currentMode;
}

darkMedia?.addEventListener?.("change", () => {
  if (getTheme() === "system") applyTheme("system");
});

/**
 * 构建主题模式对应的图标（DOM API，避免 innerHTML）。
 * @param {"system"|"light"|"dark"} mode
 * @returns {SVGSVGElement}
 */
function createThemeIcon(mode) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  const addPath = (d) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  };

  if (mode === "light") {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "4");
    svg.appendChild(circle);
    for (const d of [
      "M12 2v2",
      "M12 20v2",
      "m4.93 4.93 1.41 1.41",
      "m17.66 17.66 1.41 1.41",
      "M2 12h2",
      "M20 12h2",
      "m6.34 17.66-1.41 1.41",
      "m19.07 4.93-1.41 1.41",
    ]) {
      addPath(d);
    }
  } else if (mode === "dark") {
    addPath("M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z");
  } else {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", "2");
    rect.setAttribute("y", "3");
    rect.setAttribute("width", "20");
    rect.setAttribute("height", "14");
    rect.setAttribute("rx", "2");
    svg.appendChild(rect);
    addPath("M8 21h8");
    addPath("M12 17v4");
  }

  return svg;
}

// 导入即应用，防止首帧主题闪烁
applyTheme(getTheme());

export { applyTheme, createThemeIcon, cycleTheme, getTheme };
