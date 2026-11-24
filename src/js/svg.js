/**
 * 统一 SVG 图标构建工具（DOM API，避免 innerHTML）。
 * 支持 path / circle / rect 基础图元，供 tree.js 与 theme.js 共享。
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * 构建 24x24 线性 SVG 图标。
 * @param {Array<string | {tag: string, attrs: Record<string, string|number>}>} shapes
 *   字符串简写视为 path 的 d 属性，对象形式支持任意 SVG 图元。
 * @param {number} [size=16]
 * @param {number} [strokeWidth=2]
 * @returns {SVGSVGElement}
 */
function createSvgIcon(shapes, size = 16, strokeWidth = 2) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(strokeWidth));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  for (const shape of shapes) {
    if (typeof shape === "string") {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", shape);
      svg.appendChild(path);
    } else {
      const el = document.createElementNS(SVG_NS, shape.tag);
      for (const [attr, val] of Object.entries(shape.attrs)) {
        el.setAttribute(attr, String(val));
      }
      svg.appendChild(el);
    }
  }

  return svg;
}

export { SVG_NS, createSvgIcon };
