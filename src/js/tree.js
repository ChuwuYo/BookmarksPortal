/**
 * 书签树视图组件。
 *
 * 设计要点：
 * - 每个节点对应一个视图模型，复选框状态是唯一事实来源；
 *   三态联动通过父子引用沿树传播（下钻级联 + 向上重算），
 *   不做全文档 querySelectorAll 扫描。
 * - 事件统一委托到 rootEl（click / change / keydown），避免大书签库下创建数千监听器。
 * - 展开状态记录在模型上，搜索过滤结束后可精确还原；搜索激活时全选/全不选仅作用于匹配项。
 */

import { createSvgIcon } from "./svg.js";

const MAX_INDENT_DEPTH = 8;

const ICON_TEMPLATES = {
  chevron: null,
  folder: null,
  link: null,
};

function getIcon(type) {
  if (!ICON_TEMPLATES.chevron) {
    ICON_TEMPLATES.chevron = createSvgIcon(["m9 18 6-6-6-6"], 14, 2.5);
    ICON_TEMPLATES.folder = createSvgIcon(
      [
        "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      ],
      15,
      2
    );
    ICON_TEMPLATES.link = createSvgIcon(
      [
        "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
        "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
      ],
      15,
      2
    );
  }
  return ICON_TEMPLATES[type].cloneNode(true);
}

/**
 * @typedef {Object} TreeNodeModel
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {boolean} isFolder
 * @property {TreeNodeModel|null} parent
 * @property {TreeNodeModel[]} children
 * @property {boolean} expanded 当前展开状态（搜索前的真实状态）
 * @property {string} searchText 预计算的小写搜索文本
 * @property {HTMLDivElement} itemEl
 * @property {HTMLDivElement} headerEl
 * @property {HTMLInputElement} checkbox
 * @property {HTMLSpanElement} titleEl
 * @property {HTMLButtonElement|null} toggleBtn
 * @property {HTMLDivElement|null} childrenEl
 */

/**
 * 创建书签树组件。
 * @param {Array} nodes 浏览器书签节点数组（根级文件夹）
 * @param {Object} options
 * @param {(key:string)=>any} options.t 翻译函数
 * @param {()=>void} options.onSelectionChange 勾选状态变化回调
 * @returns 组件句柄
 */
function createBookmarkTree(nodes, { t, onSelectionChange }) {
  const rootEl = document.createElement("div");
  rootEl.className = "tree-root";
  rootEl.setAttribute("role", "presentation");

  /** @type {TreeNodeModel[]} */
  const allNodes = [];
  /** @type {Map<string, TreeNodeModel>} */
  const nodeMap = new Map();
  let idSeq = 0;
  /** 搜索过滤是否激活（激活期间展开操作只改视觉，不污染记忆的展开状态） */
  let filterActive = false;
  /** @type {Set<TreeNodeModel>} 最近一次搜索命中的节点集合 */
  let lastMatchSet = new Set();

  /**
   * 格式化节点展示文本（空标题时回退 URL 或本地化占位文本，不影响导出原始 title）。
   */
  function getDisplayTitle(model) {
    if (model.title) return model.title;
    if (model.url) return model.url;
    const untitled = t("untitled");
    return typeof untitled === "string" && untitled !== "untitled" ? untitled : "(Untitled)";
  }

  /**
   * 构建文件夹展开/收起按钮的上下文无障碍标签。
   */
  function getToggleAriaLabel(model, expanded) {
    const fnKey = expanded ? "collapseFolder" : "expandFolder";
    const formatter = t(fnKey);
    if (typeof formatter === "function") {
      return formatter(getDisplayTitle(model));
    }
    return expanded ? t("collapse") : t("expand");
  }

  /**
   * 是否为分隔符节点（Firefox 特有：无 url 且无 children）。
   * 分隔符不可导出，也不应渲染为幻影行。
   */
  function isSeparator(data) {
    return !data.url && !Array.isArray(data.children);
  }

  /**
   * 递归构建节点（视图模型 + DOM）。
   */
  function buildNode(data, parent, depth) {
    const isFolder = Array.isArray(data.children);

    /** @type {TreeNodeModel} */
    const model = {
      id: String(data.id),
      title: data.title ?? "",
      url: data.url ?? "",
      isFolder,
      parent,
      children: [],
      expanded: false,
      searchText: `${data.title ?? ""} ${data.url ?? ""}`.toLowerCase(),
      itemEl: document.createElement("div"),
      headerEl: document.createElement("div"),
      checkbox: document.createElement("input"),
      titleEl: document.createElement("span"),
      toggleBtn: null,
      childrenEl: null,
    };
    allNodes.push(model);
    nodeMap.set(model.id, model);

    model.itemEl.className = "bookmark-node";
    model.itemEl.setAttribute("role", "treeitem");
    model.itemEl.setAttribute("aria-level", String(depth + 1));

    // ---- 节点头部 ----
    const header = model.headerEl;
    header.className = "node-header";
    const indentDepth = Math.min(depth, MAX_INDENT_DEPTH);
    if (indentDepth > 0) header.style.paddingInlineStart = `${indentDepth * 16 + 8}px`;

    if (isFolder) {
      const groupId = `group-${idSeq++}`;
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "toggle-btn";
      toggleBtn.dataset.id = model.id;
      toggleBtn.setAttribute("aria-label", getToggleAriaLabel(model, false));
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.setAttribute("aria-controls", groupId);
      toggleBtn.appendChild(getIcon("chevron"));
      header.appendChild(toggleBtn);
      model.toggleBtn = toggleBtn;
      model.itemEl.setAttribute("aria-expanded", "false");

      const childrenEl = document.createElement("div");
      childrenEl.className = "children-container";
      childrenEl.id = groupId;
      childrenEl.setAttribute("role", "group");
      childrenEl.hidden = true;
      model.childrenEl = childrenEl;
    } else {
      const spacer = document.createElement("span");
      spacer.className = "toggle-spacer";
      spacer.setAttribute("aria-hidden", "true");
      header.appendChild(spacer);
    }

    // 复选框 + 标题包装在 label 中，扩大点击区域并建立无障碍关联
    const label = document.createElement("label");
    label.className = "node-label";

    model.checkbox.type = "checkbox";
    model.checkbox.className = "node-checkbox";
    model.checkbox.dataset.id = model.id;
    model.checkbox.dataset.type = isFolder ? "folder" : "link";

    const icon = document.createElement("span");
    icon.className = isFolder ? "folder-icon" : "link-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.appendChild(getIcon(isFolder ? "folder" : "link"));

    const titleEl = model.titleEl;
    titleEl.className = "node-title";
    titleEl.textContent = getDisplayTitle(model);
    if (model.url) titleEl.title = model.url;

    label.append(model.checkbox, icon, titleEl);
    header.appendChild(label);
    model.itemEl.appendChild(header);

    if (isFolder) {
      model.itemEl.appendChild(model.childrenEl);
    }

    // 递归构建子节点（跳过分隔符）
    if (isFolder) {
      const fragment = document.createDocumentFragment();
      for (const child of data.children) {
        if (isSeparator(child)) continue;
        const childModel = buildNode(child, model, depth + 1);
        model.children.push(childModel);
        fragment.appendChild(childModel.itemEl);
      }
      model.childrenEl.appendChild(fragment);
    }

    return model;
  }

  /** @type {TreeNodeModel[]} */
  const rootModels = [];
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    if (isSeparator(node)) continue;
    const model = buildNode(node, null, 0);
    rootModels.push(model);
    fragment.appendChild(model.itemEl);
  }
  rootEl.appendChild(fragment);

  /**
   * 仅更新展开的视觉效果与 aria 状态，不改写模型记忆。
   */
  function setVisualExpanded(model, expanded) {
    model.childrenEl.hidden = !expanded;
    model.toggleBtn.setAttribute("aria-expanded", String(expanded));
    model.toggleBtn.setAttribute("aria-label", getToggleAriaLabel(model, expanded));
    model.toggleBtn.classList.toggle("expanded", expanded);
    model.itemEl.setAttribute("aria-expanded", String(expanded));
  }

  /**
   * 设置文件夹展开/收起（写入模型记忆）。
   */
  function setExpanded(model, expanded) {
    if (!model.isFolder || !model.childrenEl) return;
    model.expanded = expanded;
    setVisualExpanded(model, expanded);
  }

  /**
   * 切换文件夹展开状态（搜索期间仅切换视觉状态）。
   */
  function toggleFolder(model) {
    if (!model.isFolder || !model.childrenEl) return;
    if (filterActive) {
      setVisualExpanded(model, model.childrenEl.hidden);
    } else {
      setExpanded(model, !model.expanded);
    }
  }

  /**
   * 收集当前视觉上可见的节点（用于键盘方向键导航）。
   */
  function getVisibleNodes() {
    const visible = [];
    const walk = (list) => {
      for (const model of list) {
        if (model.itemEl.hidden) continue;
        visible.push(model);
        if (model.isFolder && model.childrenEl && !model.childrenEl.hidden) {
          walk(model.children);
        }
      }
    };
    walk(rootModels);
    return visible;
  }

  // ---- 统一事件委托 ----
  rootEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof globalThis.Element)) return;
    const btn = target.closest(".toggle-btn");
    if (!btn) return;
    const model = nodeMap.get(btn.dataset.id);
    if (model) toggleFolder(model);
  });

  rootEl.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof globalThis.Element) || !target.classList.contains("node-checkbox")) {
      return;
    }
    const model = nodeMap.get(target.dataset.id);
    if (!model) return;
    setSubtreeChecked(model, model.checkbox.checked);
    refreshAncestors(model.parent);
    onSelectionChange();
  });

  rootEl.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof globalThis.Element)) return;
    const id =
      target.dataset?.id ||
      target.closest(".node-header")?.querySelector(".node-checkbox")?.dataset?.id;
    const current = id ? nodeMap.get(id) : null;
    if (!current) return;

    const visible = getVisibleNodes();
    const index = visible.indexOf(current);
    if (index === -1) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      visible[Math.min(index + 1, visible.length - 1)]?.checkbox.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      visible[Math.max(index - 1, 0)]?.checkbox.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      visible[0]?.checkbox.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      visible[visible.length - 1]?.checkbox.focus();
    } else if (event.key === "ArrowRight" && current.isFolder) {
      event.preventDefault();
      if (current.childrenEl.hidden) {
        toggleFolder(current);
      } else if (current.children.length > 0) {
        const firstVisibleChild = current.children.find((c) => !c.itemEl.hidden);
        firstVisibleChild?.checkbox.focus();
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (current.isFolder && !current.childrenEl.hidden) {
        toggleFolder(current);
      } else if (current.parent) {
        current.parent.checkbox.focus();
      }
    }
  });

  /**
   * 级联设置子树勾选状态。
   */
  function setSubtreeChecked(model, checked) {
    model.checkbox.checked = checked;
    model.checkbox.indeterminate = false;
    for (const child of model.children) {
      setSubtreeChecked(child, checked);
    }
  }

  /**
   * 由直接子节点状态重算单个文件夹的三态。
   */
  function recomputeFromChildren(model) {
    const total = model.children.length;
    if (total === 0) {
      model.checkbox.indeterminate = false;
      return;
    }
    let checkedCount = 0;
    let indeterminateCount = 0;
    for (const child of model.children) {
      if (child.checkbox.checked) checkedCount++;
      else if (child.checkbox.indeterminate) indeterminateCount++;
    }
    if (indeterminateCount > 0 || (checkedCount > 0 && checkedCount < total)) {
      model.checkbox.checked = false;
      model.checkbox.indeterminate = true;
    } else {
      model.checkbox.checked = checkedCount === total;
      model.checkbox.indeterminate = false;
    }
  }

  /**
   * 由直接子节点状态重算父节点三态，并逐层向上传播。
   */
  function refreshAncestors(model) {
    let current = model;
    while (current) {
      recomputeFromChildren(current);
      current = current.parent;
    }
  }

  return {
    element: rootEl,

    /**
     * 当前是否处于搜索过滤态。
     * @returns {boolean}
     */
    isFiltered() {
      return filterActive;
    },

    /**
     * 收集当前勾选状态。
     * @returns {{selectedIds:Set<string>, indeterminateIds:Set<string>}}
     */
    getSelection() {
      const selectedIds = new Set();
      const indeterminateIds = new Set();
      for (const model of allNodes) {
        if (model.checkbox.checked) selectedIds.add(model.id);
        else if (model.checkbox.indeterminate) indeterminateIds.add(model.id);
      }
      return { selectedIds, indeterminateIds };
    },

    /**
     * 统计完整勾选的文件夹与链接数量。
     * @returns {{folders:number, links:number}}
     */
    getCheckedCounts() {
      let folders = 0;
      let links = 0;
      for (const model of allNodes) {
        if (!model.checkbox.checked) continue;
        if (model.isFolder) folders++;
        else links++;
      }
      return { folders, links };
    },

    /**
     * 全选 / 全不选。
     * 搜索过滤激活时，仅作用于当前匹配的节点并重算祖先三态，避免静默修改隐藏书签。
     */
    setAllChecked(checked) {
      if (filterActive) {
        for (const model of lastMatchSet) {
          if (model.isFolder) {
            setSubtreeChecked(model, checked);
          } else {
            model.checkbox.checked = checked;
            model.checkbox.indeterminate = false;
          }
        }
        for (let i = allNodes.length - 1; i >= 0; i--) {
          const model = allNodes[i];
          if (model.isFolder) recomputeFromChildren(model);
        }
      } else {
        for (const model of rootModels) {
          setSubtreeChecked(model, checked);
        }
      }
      onSelectionChange();
    },

    /**
     * 恢复上次选择：先全选，再应用已记录的未勾选项，最后自底向上重算三态。
     * 未勾选的文件夹会级联到整棵子树，使恢复后新增的子节点也保持未勾选。
     * @param {string[]} uncheckedIds
     */
    applyUncheckedIds(uncheckedIds) {
      const uncheckedSet = new Set(uncheckedIds.map(String));
      for (const model of rootModels) {
        setSubtreeChecked(model, true);
      }
      for (const model of allNodes) {
        if (!uncheckedSet.has(model.id)) continue;
        if (model.isFolder) setSubtreeChecked(model, false);
        else model.checkbox.checked = false;
      }
      // allNodes 按先序排列，反向遍历即自底向上
      for (let i = allNodes.length - 1; i >= 0; i--) {
        const model = allNodes[i];
        if (model.isFolder) recomputeFromChildren(model);
      }
      onSelectionChange();
    },

    /**
     * 收集当前「明确未勾选」的节点 id（用于持久化）。
     * @returns {string[]}
     */
    getUncheckedIds() {
      const ids = [];
      for (const model of allNodes) {
        if (!model.checkbox.checked && !model.checkbox.indeterminate) {
          ids.push(model.id);
        }
      }
      return ids;
    },

    /**
     * 语言切换后刷新动态生成的 aria 文案与空标题占位文本。
     */
    refreshLanguage() {
      for (const model of allNodes) {
        if (!model.title && !model.url) {
          model.titleEl.textContent = getDisplayTitle(model);
        }
        if (!model.toggleBtn) continue;
        const expanded = model.toggleBtn.getAttribute("aria-expanded") === "true";
        model.toggleBtn.setAttribute("aria-label", getToggleAriaLabel(model, expanded));
      }
    },

    /**
     * 清空查询时还原过滤前的展开状态。
     * @param {string} query
     * @returns {number} 匹配的节点数量
     */
    filter(query) {
      const q = query.trim().toLowerCase();
      filterActive = q.length > 0;

      // 清空查询：全部显示并还原真实展开状态
      if (!q) {
        lastMatchSet = new Set();
        for (const model of allNodes) {
          model.itemEl.hidden = false;
          if (model.isFolder) setExpanded(model, model.expanded);
        }
        return allNodes.length;
      }

      // 自底向上单次遍历计算可见性：自身匹配或存在可见后代
      // （allNodes 为先序排列，反向遍历即自底向上）
      const matchSet = new Set();
      for (const model of allNodes) {
        if (model.searchText.includes(q)) matchSet.add(model);
      }
      lastMatchSet = matchSet;

      const visibleSet = new Set();
      for (let i = allNodes.length - 1; i >= 0; i--) {
        const model = allNodes[i];
        if (matchSet.has(model) || model.children.some((c) => visibleSet.has(c))) {
          visibleSet.add(model);
        }
      }

      for (const model of allNodes) {
        model.itemEl.hidden = !visibleSet.has(model);
      }

      // 临时展开含有可见子项的文件夹（不改写 model.expanded，以便还原）
      for (const model of allNodes) {
        if (!model.isFolder || !model.childrenEl) continue;
        setVisualExpanded(
          model,
          model.children.some((c) => !c.itemEl.hidden)
        );
      }

      return matchSet.size;
    },
  };
}

export { createBookmarkTree };
