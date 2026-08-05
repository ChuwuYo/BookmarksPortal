# 书签传送门-BookmarksPortal 改进清单

## 已完成（v5.0.0 重构）

- [x] 双浏览器统一为单一源码（src/）+ 构建脚本，删除三份 divergent 旧代码
- [x] 修复 Firefox 导出格式与 ChuwuBookmarks 不兼容的问题
- [x] 修复根文件夹 addDate 使用 Date.now() 而非真实 dateAdded
- [x] 修复 dateAdded 缺失时序列化为 null 的隐患
- [x] 修复 CSS 中 hex 变量用于 rgba() 导致背景失效等样式缺陷
- [x] 精简权限（移除 storage / unlimitedStorage / host_permissions / web_accessible_resources）
- [x] 语言选择持久化、暗色模式、搜索过滤、已选计数、状态提示替代 alert
- [x] 无障碍：tree/treeitem/group 角色、aria-expanded、原生 label 关联、focus-visible
- [x] Prettier + ESLint + node:test 契约测试 + web-ext lint 零告警

## 功能增强（待办）

### 1. 多格式导出支持

- [ ] 添加HTML格式导出（Netscape Bookmark 格式）
- [ ] 提供格式选择界面

### 2. 添加更新检查机制

- [ ] 使用 Github Release API（需权衡新增 host_permissions 权限）

### 3. 字体优化（已完成）

- [x] 完整字体（1.2MB）改为构建期子集化（~19KB），仅覆盖 UI 固定文案字符，
      应用于标题/按钮/状态；书签树与搜索输入使用系统字体栈（见 scripts/subset-font.mjs）
