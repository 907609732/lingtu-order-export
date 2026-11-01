# GitHub 与 Gitee 同步

- 主仓库：https://github.com/907609732/lingtu-order-export
- Gitee 同步仓库：https://gitee.com/chen-yuecai/lingtu-order-export

日常修改提交到 GitHub。GitHub Actions 的 Sync to Gitee 在分支或标签推送后自动运行，也可手动触发；它同步分支、提交记录和标签，并核对两端引用。

同步使用专用 SSH 身份，私钥仅作为本项目的 GitHub Actions Secret GITEE_SYNC_SSH_KEY 保存。Gitee 个人公钥属于账号级写入权限，请妥善管理；流程目标固定为本仓库。主机公钥固定于 GitHub 变量 GITEE_SSH_KNOWN_HOSTS。

Gitee 侧请作为同步副本使用，修改统一回到 GitHub。流程不强制覆盖分歧提交、不删除远端独有分支；如果两端分歧，任务会失败，需要人工合并。GitHub Release 安装包、Issue 和 Pull Request 不属于 Git 代码同步范围，下载继续使用 GitHub Releases。

完成修改后必须查看 Actions 成功结果或核对两端提交哈希，再报告双端已同步。
