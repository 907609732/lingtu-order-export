# 日活统计后端部署（Cloudflare Worker + KV）

软件每次启动会向 `TELEMETRY_ENDPOINT` 上报一次启动（含 installId、版本、时间）。
本目录是接收上报的 Worker，统计日活（每天去重的设备数）和使用次数。

## 部署步骤

需要 Node.js 18+ 和一个 Cloudflare 账号。

```powershell
# 1. 登录 Cloudflare（首次会打开浏览器授权）
npx wrangler login

# 2. 创建 KV 命名空间，记下返回的 id
npx wrangler kv namespace create TELEMETRY

# 3. 把 id 填到 wrangler.toml 的 `id = "..."` 处

# 4. （可选）设置统计页访问密钥，防止他人查看统计
npx wrangler secret put ADMIN_TOKEN

# 5. 部署
npx wrangler deploy
```

部署成功后终端会显示 Worker 地址，形如 `https://wucheng-telemetry.<你的子域>.workers.dev`。

## 接入软件

把 Worker 地址（加 `/report` 后缀）填入 `src/shared/config.ts`：

```ts
export const TELEMETRY_ENDPOINT = 'https://wucheng-telemetry.xxx.workers.dev/report'
```

留空则不联网上报，仅在本机记录启动历史。填好后重新打包分发。

## 查看统计

```
https://<你的worker>/stats?days=30&token=<ADMIN_TOKEN>
```

返回最近 N 天每天的日活（`dau` 数组）和累计使用次数（`totalLaunches`）。
