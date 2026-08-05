/**
 * 书签导出纯逻辑模块。
 *
 * 本模块不依赖 DOM 与浏览器 API，可在 Node.js 中直接测试。
 *
 * 输出格式契约（配套项目 ChuwuBookmarks 依赖，禁止破坏）：
 * - 书签文件：文件夹 { type:'folder', addDate:<ms int>, title, children:[...] }
 *            链接   { type:'link',   addDate:<ms int>, title, url, icon:[<google s2>, <favicon.im>] }
 * - structure.json：{ version:1, generated:<ISO>, folders:[{ id:'0_1_2'式路径, title, addDate,
 *            linkCount, folderCount, hasChildren, children?（仅子文件夹） }] }
 *   路径 id 的索引基于「全部兄弟节点（含链接）」中的位置，与历史版本保持一致。
 */

const FAVICON_PROVIDERS = [
  (hostname) => `https://www.google.com/s2/favicons?domain=${hostname}`,
  (hostname) => `https://favicon.im/${hostname}`,
];

/**
 * 从 URL 中提取合法 hostname，失败返回空字符串。
 * @param {string} url
 * @returns {string}
 */
function extractHostname(url) {
  try {
    return new URL(url).hostname;
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
 * 浏览器偶尔会缺失 dateAdded（如部分导入的书签），此时回退为当前时间，
 * 避免旧实现中 Number(undefined) => NaN 被 JSON 序列化为 null 的问题。
 * @param {*} value
 * @param {number} fallback
 * @returns {number}
 */
function normalizeAddDate(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/**
 * 按勾选状态过滤并转换书签树，生成导出数据。
 *
 * 节点入选条件（与历史版本语义一致）：
 * - 链接：复选框被完整勾选
 * - 文件夹：被勾选 / 半选 / 含有入选后代；其 children 递归应用同一规则
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
    const children = Array.isArray(rootFolder.children) ? rootFolder.children : [];
    const processedChildren = children
      .filter((child) => isIncluded(child, selectedIds, indeterminateIds))
      .map((child) => processNode(child, selectedIds, indeterminateIds, now))
      .filter(Boolean);

    if (processedChildren.length > 0) {
      exportData.push({
        type: "folder",
        addDate: normalizeAddDate(rootFolder.dateAdded, now),
        title: rootFolder.title ?? "",
        children: processedChildren,
      });
    }
  }

  return exportData;
}

/**
 * 节点是否入选（自身勾选/半选，或有入选后代）。
 */
function isIncluded(node, selectedIds, indeterminateIds) {
  return (
    selectedIds.has(node.id) ||
    indeterminateIds.has(node.id) ||
    hasIncludedDescendants(node, selectedIds, indeterminateIds)
  );
}

/**
 * 是否存在入选的后代节点。
 */
function hasIncludedDescendants(node, selectedIds, indeterminateIds) {
  if (!Array.isArray(node.children)) return false;
  return node.children.some((child) => isIncluded(child, selectedIds, indeterminateIds));
}

/**
 * 转换单个节点为导出格式，未入选返回 null。
 */
function processNode(node, selectedIds, indeterminateIds, now) {
  if (node.url) {
    return {
      type: "link",
      addDate: normalizeAddDate(node.dateAdded, now),
      title: node.title ?? "",
      url: node.url,
      icon: buildIconList(node.url),
    };
  }

  if (Array.isArray(node.children)) {
    const processedChildren = node.children
      .filter((child) => isIncluded(child, selectedIds, indeterminateIds))
      .map((child) => processNode(child, selectedIds, indeterminateIds, now))
      .filter(Boolean);

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

    const folderInfo = {
      id: pathId,
      title: node.title,
      addDate: node.addDate,
      linkCount: children.filter((c) => c.type === "link").length,
      folderCount: children.filter((c) => c.type === "folder").length,
      hasChildren: children.length > 0,
    };

    if (children.some((c) => c.type === "folder")) {
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
