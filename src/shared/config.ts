// 共享配置。正式官网确定后替换 WEBSITE_URL；部署 Cloudflare Worker 后
// 把其上报地址填入 TELEMETRY_ENDPOINT（为空则不发起联网上报，仅本地记录）。
export const WEBSITE_URL = 'https://github.com/907609732/wucheng-order-export'
export const TELEMETRY_ENDPOINT = 'https://wucheng-telemetry.chenyuecai520.workers.dev/report'
export const UPDATE_REPO = '907609732/wucheng-order-export'
