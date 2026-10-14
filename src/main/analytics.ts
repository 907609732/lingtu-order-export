import { TELEMETRY_ENDPOINT } from '../shared/config'

// 上报一次启动到自建统计后端。端点未配置或请求失败时静默返回 false，不影响使用。
export async function reportLaunch(installId: string, version: string): Promise<boolean> {
  if (!TELEMETRY_ENDPOINT) return false
  try {
    const res = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, version, ts: new Date().toISOString() }),
      signal: AbortSignal.timeout(8000)
    })
    return res.ok
  } catch { return false }
}
