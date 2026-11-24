/**
 * 书签导出纯逻辑模块。
 *
 * 本模块不依赖 DOM 与浏览器 API，可在 Node.js 中直接测试。
 *
 * 输出格式契约（配套项目 ChuwuBookmarks 依赖，禁止破坏）：
 * - 书签文件：文件夹 { type:'folder', addDate:<ms int>, title, children:[...] }
 *            链接   { type:'link',   addDate:<ms int>, title, url,
 *                     icon:[google s2, favicon.im, duckduckgo, 站点 /favicon.ico]（有序候选） }
 * - structure.json：{ version:1, generated:<ISO>, folders:[{ id:'0_1_2'式路径, title, addDate,
 *            linkCount, folderCount, hasChildren, children?（仅子文件夹） }] }
 *   路径 id 的索引基于「全部兄弟节点（含链接）」中的位置，与历史版本保持一致。
 */

/**
 * 图标候选源（有序）。
 * 解析型服务在前（服务端会解析站点真实图标路径，命中率最高），
 * 站点约定路径 /favicon.ico 垫底（仅覆盖遵循约定的站点，404 即快速回退）。
 * 消费端 ChuwuBookmarks 会把 favicon.im 自动提到最前（其网络可达性最好）。
 */
const FAVICON_PROVIDERS = [
  (hostname) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}`,
  (hostname) => `https://favicon.im/${encodeURIComponent(hostname)}`,
  (hostname) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`,
  (hostname) => `https://${hostname}/favicon.ico`,
];

const PRIVATE_IPV4_RE =
  /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+(?:\.\d+)*$/;

/**
 * 判断主机名是否属于本地或私网地址（不应泄露给公网第三方 Favicon 服务）。
 * @param {string} hostname
 * @returns {boolean}
 */
function isLocalOrPrivateHost(hostname) {
  if (!hostname) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return true;
  }
  // IPv6 字面量（如 [::1]、[fe80::1]）或无点号的内网单标签主机名（如 intranet）
  if (hostname.startsWith("[") || !hostname.includes(".")) {
    return true;
  }
  return PRIVATE_IPV4_RE.test(hostname);
}

/**
 * 从 URL 中提取适合查询公网 Favicon 的合法 HTTP(S) hostname，非法或本地/内网地址返回空字符串。
 * @param {string} url
 * @returns {string}
 */
function extractHostname(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    const hostname = parsed.hostname.toLowerCase();
    return isLocalOrPrivateHost(hostname) ? "" : hostname;
  } catch {
    return "";
  }
}

/**
 * 生成链接的图标候选数组。
 * @param {string} url
 * @returns {string[]}
 */
function buildIconList(url) {
  const hostname = extractHostname(url);
  return hostname ? FAVICON_PROVIDERS.map((build) => build(hostname)) : [];
}

/**
 * 规范化 addDate：必须是有限毫秒整数。
 * 浏览器偶尔会缺失 dateAdded（如部分导入的书签），此时回退为当前时间；
 * null/空串 同样视为缺失，避免 Number() 将其折叠为 0（1970）。
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeAddDate(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/**
 * 单趟后序递归转换单个节点为导出格式，未入选返回 null。
 * 每个节点严格仅访问一次，避免先探测后转换导致的重复递归。
 * @param {Object} node
 * @param {Set<string>} selectedIds
 * @param {Set<string>} indeterminateIds
 * @param {number} now
 * @param {boolean} [forceFolder=false]
 * @returns {Object|null}
 */
function processNode(node, selectedIds, indeterminateIds, now, forceFolder = false) {
  if (!forceFolder && node.url) {
    if (!selectedIds.has(node.id)) return null;
    return {
      type: "link",
      addDate: normalizeAddDate(node.dateAdded, now),
      title: node.title ?? "",
      url: node.url,
      icon: buildIconList(node.url),
    };
  }

  if (forceFolder || Array.isArray(node.children)) {
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const processedChildren = [];
    for (const child of rawChildren) {
      const converted = processNode(child, selectedIds, indeterminateIds, now);
      if (converted) processedChildren.push(converted);
    }

    if (processedChildren.length > 0 || selectedIds.has(node.id) || indeterminateIds.has(node.id)) {
      return {
        type: "folder",
        addDate: normalizeAddDate(node.dateAdded, now),
        title: node.title ?? "",
        children: processedChildren,
      };
    }
  }

  return null;
}

/**
 * 按勾选状态过滤并转换书签树，生成导出数据。
 *
 * 节点入选条件（与历史版本语义一致，顶级与嵌套文件夹规则相同）：
 * - 链接：复选框被完整勾选
 * - 文件夹：被勾选 / 半选 / 含有入选后代；其 children 递归应用同一规则
 *   （被勾选的文件夹即使没有入选子项，也以 children:[] 保留）
 *
 * @param {Array} rootChildren 浏览器书签树的根级文件夹数组
 * @param {Set<string>} selectedIds 完整勾选的节点 id
 * @param {Set<string>} indeterminateIds 半选的节点 id
 * @param {number} [now=Date.now()] 当前时间（便于测试）
 * @returns {Array} 导出数据（根级文件夹数组）
 */
function filterTreeBySelection(rootChildren, selectedIds, indeterminateIds, now = Date.now()) {
  const exportData = [];

  for (const rootFolder of rootChildren) {
    const converted = processNode(rootFolder, selectedIds, indeterminateIds, now, true);
    if (converted) exportData.push(converted);
  }

  return exportData;
}

/**
 * 生成目录结构（仅文件夹信息，供配套项目快速渲染侧边栏）。
 *
 * 路径 id 规则：节点在「全部兄弟节点（含链接）」中的索引，以下划线连接，
 * 与历史导出保持一致，例如 "0_1_2"。
 *
 * @param {Array} nodes 导出数据（filterTreeBySelection 的输出）
 * @param {string} [parentPath=""]
 * @returns {Array}
 */
function generateStructure(nodes, parentPath = "") {
  const structure = [];

  nodes.forEach((node, index) => {
    if (node.type !== "folder") return;

    const pathId = parentPath ? `${parentPath}_${index}` : `${index}`;
    const children = Array.isArray(node.children) ? node.children : [];

    let linkCount = 0;
    let folderCount = 0;
    for (const c of children) {
      if (c.type === "link") linkCount++;
      else if (c.type === "folder") folderCount++;
    }

    const folderInfo = {
      id: pathId,
      title: node.title,
      addDate: node.addDate,
      linkCount,
      folderCount,
      hasChildren: children.length > 0,
    };

    if (folderCount > 0) {
      folderInfo.children = generateStructure(children, pathId);
    }

    structure.push(folderInfo);
  });

  return structure;
}

/**
 * 生成 structure.json 文件内容。
 * @param {Array} exportData
 * @param {Date} [date=new Date()]
 * @returns {{version:number, generated:string, folders:Array}}
 */
function buildStructureFile(exportData, date = new Date()) {
  return {
    version: 1,
    generated: date.toISOString(),
    folders: generateStructure(exportData),
  };
}

/**
 * 生成书签文件名：bookmarks⏰YYYY-MM-DD.json（本地时区）。
 * 与历史版本 toLocaleDateString('zh-CN') 的输出等价，但无环境依赖。
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function makeBookmarkFilename(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `bookmarks⏰${y}-${m}-${d}.json`;
}

const STRUCTURE_FILENAME = "structure.json";

export {
  STRUCTURE_FILENAME,
  buildIconList,
  buildStructureFile,
  extractHostname,
  filterTreeBySelection,
  generateStructure,
  makeBookmarkFilename,
  normalizeAddDate,
};
