# Windows 软件内更新

本次使用 `electron-updater@6.8.11`（MIT）配合现有 `electron-builder@26.15.3` 的 NSIS 安装包。旧版 0.1.21 只有跳转下载功能，首次迁移需要手动安装带更新器的新版本。后续通过“保存与设置 → 软件更新”检查、下载、安装并重启。

下载过程中可继续工作。安装前需要结束采集、详情读取和导出，并关闭辅助采集。普通退出不会自动安装。更新数据仍沿用现有用户数据目录，安装器不删除订单、登录和设置。

## 免费下载方案与国内访问

用户于 2026-11-14 明确选择免费直连，不开通付费服务。本次只连接项目官方 GitHub Releases，不添加来源不明的代理、OSS、CDN 或服务器大文件镜像。

用户随后明确不使用差分下载。本次在构建端设置 `nsis.differentialPackage=false`，更新器设置 `disableDifferentialDownload=true`，每次直接下载完整安装包并验证 SHA-512，不生成或发布 `.blockmap`。库缓存已完整下载的更新，重复操作可复用校验通过的文件。取消后可能需要重新下载未完成的部分，不承诺任意中断位置续传。

GitHub 直连不等于国内 CDN。大陆用户可能访问慢或连接失败；重试会保留正常业务和已有本地数据。需要稳定国内速度时，应另外配置经授权的对象存储/CDN 并实际测速，不能以免费公共代理冒充稳定服务。

## 构建与发布

1. 推送代码触发 Build Windows。测试、构建后产出 `LingtuOrderExport-VERSION-Setup.exe` 和 `latest.yml`。
2. `node scripts/verify-update-assets.mjs release VERSION` 核对清单版本、唯一固定文件名、大小和 SHA-512。整个产物包作为 GitHub Actions artifact 保存。
3. 本地下载构建产物，核对 SHA-256，完成隔离验收后准备草稿 Release；标签和 `targetCommitish` 必须指向构建的确切提交。
4. 经用户授权发布后，运行 Publish verified release 并传入成功 Build Windows 的 run ID、已有草稿 tag、已验收安装器的 SHA-256。流程验证来源，先上传 exe，再上传清单；重新下载附件并核验后才将草稿公开为 latest。
5. 不覆写已公开同版本的安装包和清单。修复应提升版本号、重新构建发布。缺失清单或网络失败应显示检查失败，不应显示已是最新版。

GitHub → Gitee 的 Sync to Gitee 只同步分支、提交、标签。Gitee 代码同步成功并不意味着 Release 附件存在，也不提供本次安装包镜像。

## 验证边界

单元测试验证状态、重复操作、取消、失败和安装保护；真实 Electron 窗口在独立用户数据目录验收 IPC 和 UI。完整安装重启需使用独立 appId、NSIS GUID、安装路径和用户数据的测试软件，不能覆盖用户真实安装及卸载注册信息。无新版已公开时不能声称生产线上升级链路已验收。

更新包通过 HTTPS 和清单 SHA-512 校验。当前构建沿用已有未配置商业代码签名的发布方式；未启用发布者证书校验，不能将哈希校验称为发布者签名认证。

来源：[electron-builder](https://github.com/electron-userland/electron-builder)、[26.x 更新文档](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/features/auto-update.md)。
