# 电商平台采购订单导出

[简体中文](README.md) · **English**

**E-commerce Purchase Order Export** is a Windows desktop application for collecting your buyer-side order history, organizing item details, and exporting Excel or CSV files for purchasing records, reconciliation, and archiving.

[Website](https://buyer.lttlt.top/) · [Download for Windows](https://github.com/907609732/lingtu-order-export/releases/latest) · [Illustrated guide (Chinese)](https://buyer.lttlt.top/guide.html) · [Report an issue](https://github.com/907609732/lingtu-order-export/issues) · [Gitee mirror](https://gitee.com/chen-yuecai/lingtu-order-export)

## Download and install

Current public release: **v0.1.21**. The application is now named “电商平台采购订单导出”. The desktop interface and illustrated guide are currently in Chinese; this page provides English documentation.

Open [GitHub Releases](https://github.com/907609732/lingtu-order-export/releases/latest) and download the Windows x64 installer named `LingtuOrderExport-<version>-Setup.exe`. The Source code ZIP is not an installer.

Existing order and login data directories remain compatible. Back up important exports before upgrading. The installer is not code-signed; check its source and SHA-256 on the release page.

## Features

- **Order history collection:** select a range by order date, create monthly or daily extraction plans, and pause or resume collection.
- **Item and order details:** inspect products, variants, quantities, amounts, shipping addresses, and logistics information; search, filter, and extract details as needed.
- **Excel and CSV exports:** Excel can embed product images. Failed image downloads retain links and are recorded as missing data. CSV is text-only and does not embed images.
- **Local task management:** store tasks and orders on your computer, reopen them, review the results, and export again.
- **Execution logs:** follow collection, detail extraction, and export progress to investigate problems.

## Platforms and collection methods

| Platforms | Collection method |
| --- | --- |
| Taobao / Tmall, 1688, Pinduoduo, JD.com, Xianyu | Open the official platform page inside the application and sign in yourself |
| Dewu, Kuaishou, Ele.me, Meituan | Assisted collection through WeChat Mini Programs; follow the in-app certificate and proxy setup guide |

These are the platform entries offered by the application. They do not mean that every platform, account, or historical date range has passed live-order validation. Page changes, login sessions, verification challenges, and platform query limits can affect collection. Compare exported counts, amounts, and missing fields with the official order pages.

## Quick start

1. Install the application, open it, and select a platform.
2. Click “登录 / 查看平台页” (Sign in / View platform page) and sign in on the official page. For Mini Program platforms, follow the built-in guide.
3. Choose a range by order date. Start with a day containing only a few orders.
4. Start collection, extract details as needed, and review the execution logs and missing fields.
5. Choose an output folder and Excel or CSV format in the save/export settings, then click “导出文件” (Export file).

After assisted Mini Program collection, restore your original proxy settings as described in the guide.

## Screenshots

These screenshots contain synthetic demonstration data and were taken in an earlier version. Some interface labels may differ from the current release.

### Order collection and export

![Order collection and export](docs/screenshots/01-export.png)

### Order details and filtering

![Order details and filtering](docs/screenshots/05-order-table.png)

## Data and network connections

Orders and login sessions are stored locally and are not uploaded to the project's servers. Collection still connects to the relevant e-commerce platforms, and product images may be downloaded from platform URLs.

The application checks GitHub for updates and sends an installation identifier, application version, and launch timestamp to the project's analytics service. Launch analytics do not include account information, orders, or shipping details. Failed network requests do not prevent local data storage.

## Run from source

Stack: Electron, Vue 3, TypeScript, Electron Vite, and ExcelJS. Run the following commands in Windows PowerShell. Node.js 24 and npm are recommended; install Git first.

```powershell
git clone https://github.com/907609732/lingtu-order-export.git
cd lingtu-order-export
npm.cmd ci
node node_modules/electron/install.js
New-Item -ItemType Directory -Force .test-output | Out-Null
npm.cmd run dev
```

Validate and package:

```powershell
npm.cmd run check  # Unit tests, type checking, and production build
npm.cmd run dist   # Windows x64 NSIS installer in release/; no automatic publication
```

Running the source does not validate live platform behavior. When reporting an issue, include the version, platform, reproduction steps, and redacted logs. Do not upload account data, cookies, orders, shipping details, or local application data directories.

## Repositories and releases

GitHub is the primary repository; Gitee is a source mirror. Changes are synchronized from GitHub to Gitee. Use GitHub Releases for installers and release notes.

BY 五成
