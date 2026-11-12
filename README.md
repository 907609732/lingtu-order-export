# 电商平台采购订单导出

**简体中文** · [English](README.en.md)

在 Windows 电脑上采集你在电商平台的买家历史订单，整理商品明细并导出 Excel / CSV，方便采购管理、对账与归档。

[官网](https://buyer.lttlt.top/) · [下载 Windows 安装包](https://github.com/907609732/lingtu-order-export/releases/latest) · [图文教程](https://buyer.lttlt.top/guide.html) · [问题反馈](https://github.com/907609732/lingtu-order-export/issues) · [Gitee 镜像](https://gitee.com/chen-yuecai/lingtu-order-export)

## 下载安装

当前公开版本：**v0.1.21**。软件已统一更名为“电商平台采购订单导出”。

前往 [GitHub Releases](https://github.com/907609732/lingtu-order-export/releases/latest)，下载 Windows x64 的 `LingtuOrderExport-版本号-Setup.exe` 安装包。Source code ZIP 是源码，不是安装包。

旧版订单与登录数据目录保留兼容。升级前建议备份重要导出文件；安装包尚未配置代码签名，可在发布页核对来源和 SHA-256。

## 主要功能

- **历史订单采集**：按订单下单日期选择范围，支持按月或按天制定提取计划、暂停与继续。
- **商品与订单明细**：查看商品、规格、数量、金额、收货和物流信息，支持搜索、筛选及按需提取详情。
- **Excel / CSV 导出**：Excel 可嵌入商品图片；图片获取失败时保留链接并记录缺项。CSV 为文本格式，不嵌入图片。
- **本机任务管理**：任务与订单保存在本机，可重新打开、检查并再次导出。
- **执行日志**：查看采集、详情提取与导出进度，便于定位异常。

## 平台与接入方式

| 平台 | 接入方式 |
| --- | --- |
| 淘宝 / 天猫、1688、拼多多、京东、闲鱼 | 在软件内打开平台官方页面，自行登录后采集 |
| 得物、快手、饿了么、美团 | 微信小程序辅助采集，需按软件内教程配置证书与代理 |

以上为软件提供的平台入口，不代表所有平台、账号和历史日期均已完成真实订单验收。页面变化、登录状态、验证码及平台可查询范围可能影响采集；导出后请与官方订单页面核对数量、金额和缺项。

## 快速使用

1. 安装并打开软件，选择需要导出的平台。
2. 点击“登录 / 查看平台页”，在官方页面完成登录；小程序平台按内置教程操作。
3. 按订单下单时间选择日期范围，建议先用订单较少的一天试采集。
4. 开始采集，按需提取详情，并检查执行日志与缺项。
5. 在保存与导出设置中选择目录和 Excel / CSV 格式，点击“导出文件”。

小程序辅助采集结束后，按教程恢复原代理设置。

## 软件截图

以下截图使用合成演示数据，来自较早版本，界面名称可能与当前版本略有不同。

### 订单采集与导出

![订单采集与导出](docs/screenshots/01-export.png)

### 订单明细与筛选

![订单明细与筛选](docs/screenshots/05-order-table.png)

## 数据与网络连接

订单和登录状态保存在本机，软件不会将这些数据上传到项目服务器。采集时仍需连接对应电商平台，商品图片可能从平台地址下载。

软件会通过 GitHub 检查更新，并向项目统计服务发送安装标识、软件版本与启动时间。启动统计不包含账号、订单或收货信息。网络请求失败不影响本机数据保存。

## 从源码运行

技术栈：Electron、Vue 3、TypeScript、Electron Vite、ExcelJS。以下命令在 Windows PowerShell 中执行，建议使用 Node.js 24 与 npm，并先安装 Git。

```powershell
git clone https://github.com/907609732/lingtu-order-export.git
cd lingtu-order-export
npm.cmd ci
node node_modules/electron/install.js
New-Item -ItemType Directory -Force .test-output | Out-Null
npm.cmd run dev
```

检查与打包：

```powershell
npm.cmd run check  # 单元测试、类型检查与生产构建
npm.cmd run dist   # Windows x64 NSIS 安装包，输出到 release/，不自动发布
```

源码运行不等于真实平台功能验收。提交问题时请附版本、平台、复现步骤及脱敏日志，不要上传账号、Cookie、订单、收货信息或本机数据目录。

## 仓库与发布

GitHub 为主仓库，Gitee 为代码镜像。代码修改从 GitHub 同步到 Gitee；安装包与版本说明以 GitHub Releases 为准。

BY 五成
