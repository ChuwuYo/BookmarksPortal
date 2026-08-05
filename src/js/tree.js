/**
 * 书签树视图组件。
 *
 * 设计要点：
 * - 每个节点对应一个视图模型，复选框状态是唯一事实来源；
 *   三态联动通过父子引用沿树传播（下钻级联 + 向上重算），
 *   不做全文档 querySelectorAll 扫描。
 * - 展开状态记录在模型上，搜索过滤结束后可精确还原。
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * 以 DOM API 构建 24x24 线性 SVG 图标（避免 innerHTML）。
 * @param {string[]} paths path 的 d 属性数组
 * @param {number} size
 * @param {number} strokeWidth
 */
function createSvgIcon(paths, size, strokeWidth) {
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
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

const ICONS = {
  chevron: () => createSvgIcon(["m9 18 6-6-6-6"], 14, 2.5),
  folder: () =>
    createSvgIcon(
      [
        "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
      ],
      15,
      2
    ),
  link: () =>
    createSvgIcon(
      [
        "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
        "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
      ],
      15,
      2
    ),
};

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
 * @property {HTMLButtonElement|null} toggleBtn
 * @property {HTMLDivElement|null} childrenEl
 */

/**
 * 创建书签树组件。
 * @param {Array} nodes 浏览器书签节点数组（根级文件夹）
 * @param {Object} options
 * @param {(key:string)=>string} options.t 翻译函数
 * @param {()=>void} options.onSelectionChange 勾选状态变化回调
 * @returns 组件句柄
 */
function createBookmarkTree(nodes, { t, onSelectionChange }) {
  const rootEl = document.createElement("div");
  rootEl.className = "tree-root";
  rootEl.setAttribute("role", "presentation");

  const allNodes = [];
  let idSeq = 0;
  /** 搜索过滤是否激活（激活期间展开操作只改视觉，不污染记忆的展开状态） */
  let filterActive = false;

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
      toggleBtn: null,
      childrenEl: null,
    };
    allNodes.push(model);

    model.itemEl.className = "bookmark-node";
    model.itemEl.setAttribute("role", "presentation");

    // ---- 节点头部 ----
    const header = model.headerEl;
    header.className = "node-header";
    header.setAttribute("role", "treeitem");
    if (depth > 0) header.style.paddingInlineStart = `${depth * 16 + 8}px`;

    if (isFolder) {
      const groupId = `group-${idSeq++}`;
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "toggle-btn";
      toggleBtn.setAttribute("aria-label", t("expand"));
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.setAttribute("aria-controls", groupId);
      toggleBtn.appendChild(ICONS.chevron());
      toggleBtn.addEventListener("click", () => {
        if (filterActive) {
          // 搜索期间仅切换视觉显示，保留 model.expanded 供过滤结束后精确还原
          setVisualExpanded(model, model.childrenEl.hidden);
        } else {
          setExpanded(model, !model.expanded);
        }
      });
      header.appendChild(toggleBtn);
      model.toggleBtn = toggleBtn;
      header.setAttribute("aria-expanded", "false");
      // group 不是 treeitem 的 DOM 后代，用 aria-owns 显式建立所有权
      header.setAttribute("aria-owns", groupId);

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
    icon.appendChild(isFolder ? ICONS.folder() : ICONS.link());

    const titleEl = document.createElement("span");
    titleEl.className = "node-title";
    titleEl.textContent = model.title;
    if (model.url) titleEl.title = model.url;

    label.append(model.checkbox, icon, titleEl);
    header.appendChild(label);
    model.itemEl.appendChild(header);

    if (isFolder) {
      model.itemEl.appendChild(model.childrenEl);
    }

    // 勾选变化：向下级联，向上重算
    model.checkbox.addEventListener("change", () => {
      setSubtreeChecked(model, model.checkbox.checked);
      refreshAncestors(model.parent);
      onSelectionChange();
    });

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
    model.toggleBtn.setAttribute("aria-label", expanded ? t("collapse") : t("expand"));
    model.toggleBtn.classList.toggle("expanded", expanded);
    model.headerEl.setAttribute("aria-expanded", String(expanded));
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
     */
    setAllChecked(checked) {
      for (const model of rootModels) {
        setSubtreeChecked(model, checked);
      }
      onSelectionChange();
    },

    /**
     * 恢复上次选择：先全选，再取消记录的未勾选项，最后自底向上重算三态。
     * @param {string[]} uncheckedIds
     */
    applyUncheckedIds(uncheckedIds) {
      const uncheckedSet = new Set(uncheckedIds.map(String));
      for (const model of rootModels) {
        setSubtreeChecked(model, true);
      }
      for (const model of allNodes) {
        if (uncheckedSet.has(model.id)) {
          model.checkbox.checked = false;
        }
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
     * 语言切换后刷新动态生成的 aria 文案。
     */
    refreshLanguage() {
      for (const model of allNodes) {
        if (!model.toggleBtn) continue;
        const expanded = model.toggleBtn.getAttribute("aria-expanded") === "true";
        model.toggleBtn.setAttribute("aria-label", expanded ? t("collapse") : t("expand"));
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
