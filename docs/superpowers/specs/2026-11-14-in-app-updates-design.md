# 软件内在线升级设计

目标：Windows 用户在软件内检查和下载新版，看到进度与速度，下载校验成功后选择安装并重启；保留订单、登录和设置。首次从 0.1.21 迁移需要手动安装一次。

## 方案与选型

- 采用 MIT 许可 electron-userland/electron-builder 的 electron-updater 6.8.11，与当前 Electron + NSIS 栈兼容，继续使用 electron-builder 26.15.3；避免跨主版本升级。
- Electron 自带 autoUpdater 的 Windows Squirrel 方案需要更换现有 NSIS 打包体系，不选。
- 不自行实现下载校验及安装器，不使用来源不明的公共 GitHub 代理。
- 用户已选择免费直连、不开通付费服务，并明确不使用差分下载：本次使用 GitHub 官方 Release 源，下载完整安装包，复用完整文件缓存。不接第三方公共代理，不在现有 3 Mbps 网站服务器放安装包。没有国内 CDN，不承诺免费直连在大陆的速度或可达性。未来有经授权的 CDN 再增加 generic 源；本次不提供未经验证的切源功能。

## 行为

启动检查与统计上报独立。状态为 idle/checking/available/downloading/downloaded/installing/upToDate/error/unsupported，错误独立于无新版。用户点击下载，显示百分比、已下载字节、总字节、速度、来源，支持取消与重试。顶部进入设置更新区域。下载不锁业务界面，普通关闭不自动安装。

主进程安装前验证下载状态和业务空闲，包括采集、详情、导出、代理。同步设置安装标志后禁止新任务，调用 NSIS quitAndInstall 安装并重启。复用现有 before-quit 关闭数据库和采集器。没有下载校验成功的文件绝不调用安装。

主进程固定 GitHub 官方源；IPC 不接收任意 URL、可执行文件或路径。错误应说明具体阶段，不暴露内部路径和凭据。未来增加切源时必须保持版本、安装包名、大小及 SHA-512 一致，不得混用不同源的 latest。

## 构建发布

构建产物包含完整 exe 和 latest.yml，不生成 blockmap。发布前验证版本、构建提交、清单文件名/大小/SHA-512；先上传不可变安装包，最后开放 latest 清单。GitHub/Gitee 代码哈希同步不代表安装包已同步。

## 验收

状态机与重复请求、取消、网络失败、跨源冲突和忙碌安装保护的针对性测试；Vue/IPC 隔离数据真实窗口检查；GitHub Windows 构建下载后验收产物；两个版本 NSIS 在隔离安装路径及用户数据下完成下载、安装、自动重启，保留任务与设置。禁止触及真实账号和订单；未实测项目明确记录。

## 执行约束

原工作目录存在大量未提交删除，保留原状。在已有干净 worktree order-export-rename 的新 codex/in-app-updates-20261114 分支开发，基于含现有官网和图片导出修复的提交。按用户默认授权自主选型和开发；本次不开通付费服务，发布前准备可复核产物，不自动发布正式 Release。
