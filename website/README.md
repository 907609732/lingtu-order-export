# 灵兔官网

生产地址：https://buyer.lttlt.top/ 。现有阿里云主机 `aliyun-erp`，网站发布入口 `/var/www/buyer.lttlt.top/current`（旧站备份仍保留）。纯静态 HTML/CSS/JS，不需要安装额外依赖或后台。

## 预览与维护

在仓库根目录运行 `node node_modules/vite/bin/vite.js website --host 127.0.0.1 --port 5178`。浏览器访问打印的地址。

`index.html` 是产品首页，`guide.html` 是图文教程，共用 `assets/site.css` 和 `assets/site.js`。软件截图是现有隔离测试生成的合成演示数据；不使用包含本机路径的设置截图。新增截图需检查隐私及其对应软件版本。

## 下载配置

`release.json` 是网站下载信息的唯一配置来源。发布后通过 GitHub Releases API 核对并更新 version、releaseUrl、downloadUrl、filename、size、publishedAt、sha256（API 的 sha256: 前缀格式）。previewVersion 单独记录截图版本，不与公开版本混淆。

netdiskUrl 与 netdiskCode 默认为空，不显示备用下载按钮。收到有效分享地址且核对安装包版本后再配置；更新公开版本时需要同时核对或清空旧的网盘地址。

浏览器只读取同域 release.json，不请求 GitHub API；配置不可用或禁用 JS 时下载按钮回退到 GitHub 最新发布页。公开安装包由 GitHub 提供，本次不上传或发布新软件版本。

## 验证与部署

在仓库根目录运行 `node tests/website-check.mjs`，验证两页本地资源、锚点、九个平台图标与下载版本一致性。浏览器检查响应式布局、截图弹窗、导航、无脚本回退和减少动态效果。软件关于入口验证：`node tests/about-links-smoke.mjs`（先 `npm.cmd run build`）。

本地预览经用户确认后，已按用户明确要求发布到现有官网。下方为部署与恢复说明。

部署前在服务器 `/www/backups/lingtu-website/` 创建带时间戳的完整网站归档，归档放在网站目录外。仅同步公开文件 index.html、guide.html、release.json、robots.txt、sitemap.xml，以及站点实际使用的 assets 文件；不上传此 README、Nginx 配置、测试或开发资料。无需修改 Nginx 或重启其他服务。保留既有文件和 `.well-known`。

回退：在受控维护窗口中从对应归档恢复原文件；新增的教程与资源可保留，不影响旧首页。上线检查 HTTPS、两页、下载配置及资源哈希。

## 参考与素材

保留本仓库原官网的布局、蓝白样式与功能文案，仅补充入口、图文教程、软件截图、平台图标和准确的隐私及版本说明。调查过 Astro Landpack 等开源模板，最终未复制其代码或素材。

平台图标来自各平台官网 favicon 或官网直接引用的资源，仅用于标识平台；商标属于各自权利人，不能据此声称授权、合作或平台背书。来源记录见 `ASSET_SOURCES.md`。
