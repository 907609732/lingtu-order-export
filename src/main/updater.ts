import { UPDATE_REPO } from '../shared/config'

// 比较两个语义化版本号（忽略前缀 v），返回 a>b 为 1、a<b 为 -1、相等为 0。
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => Number.parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

// 检查 GitHub 最新 Release；失败或无法解析时返回 null，调用方静默忽略。
export async function checkLatest(repo: string = UPDATE_REPO): Promise<{ latest: string; name: string; url: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'wucheng-order-export' }
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const latest = String(data?.tag_name || '').replace(/^v/, '')
    if (!latest || !/^\d+\.\d+/.test(latest)) return null
    return { latest, name: String(data.name || ''), url: String(data.html_url || '') }
  } catch { return null }
}
