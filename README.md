<div align="center">

  <img src="https://github.com/user-attachments/assets/e07e52a0-db55-4838-b917-b69185847d9d" alt="BookmarksPortal Logo" width="20%" />
  
  <p>
    <a href="README.md">简体中文</a> | 
    <a href="README_EN.md">English</a>
  </p>
  
  <h1>BookmarksPortal</h1>
  <h2>将您的书签导出为JSON文件</h2>
  
  <p>BookmarksPortal是 <a href="https://github.com/ChuwuYo/ChuwuBookmarks">ChuwuBookmarks项目</a> 的配套浏览器拓展程序，用于导出浏览器书签为合适的JSON格式文件。</p>
  <p>已支持ExtensionManifestV3规范</p>
  <p>想要下载？点击: <a href="https://github.com/ChuwuYo/BookmarksPortal/releases/latest">下载</a></p>
  
</div>

## 特性

- 将浏览器书签导出为JSON文件（同时生成配套的 structure.json 目录结构文件）
- 中英文界面切换，选择持久化
- 书签树搜索过滤、三态勾选联动、记住上次选择
- 支持Chrome和Firefox浏览器（单一源码构建）
- 暗色模式适配，轻量且快速

## 界面预览

<div style="display: flex; justify-content: space-between; margin-top: 20px;">
    <img src="images/en.png" alt="英文界面" style="width: 48%; height: auto; object-fit: cover;" />
    <img src="images/zh.png" alt="中文界面" style="width: 48%; height: auto; object-fit: cover;" />
</div>

## 开发

单一源码位于 `src/`，通过构建脚本生成双浏览器产物：

```bash
npm install        # 安装开发依赖
npm run build      # 构建 dist/chrome 与 dist/firefox
npm test           # 运行导出格式契约测试
npm run lint       # ESLint 检查
npm run format     # Prettier 格式化
npm run pack       # 打包双浏览器 zip 到 dist/artifacts（含 SHA256）
npm run verify     # 完整验证链（CI 同款）
```

浏览器中加载：Chrome 打开 `chrome://extensions` 启用开发者模式后选择 `dist/chrome`；Firefox 打开 `about:debugging` 选择 `dist/firefox/manifest.json`。

## 发布

CI 推送 main 后自动发布滚动预览版（tag `latest`）；推送 `v*` 标签（需与 manifest 版本一致）自动发布正式版，同时附带 Chrome 与 Firefox 两个安装包及 SHA256 校验文件。

> 发布 Firefox 渠道前请做一次人工冒烟：在 `about:debugging` 加载 `dist/firefox`，执行一次导出并确认 `bookmarks⏰*.json` 与 `structure.json` 两个文件均成功下载（双文件错峰下载依赖弹窗生命周期，静态检查无法覆盖）。
