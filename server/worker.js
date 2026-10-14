// 灵兔 AI 电商平台买家订单导出工具 · 日活/使用次数统计后端
// 部署：Cloudflare Worker + KV。软件每次启动会 POST /report 上报一次启动。
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // 上报一次启动：installId 去重日活，累加使用次数
    if (request.method === 'POST' && url.pathname === '/report') {
      let body
      try { body = await request.json() } catch { return json({ ok: false, error: 'invalid json' }, 400) }
      const { installId, version, ts } = body || {}
      if (!installId || typeof installId !== 'string' || installId.length < 8 || installId.length > 64) {
        return json({ ok: false, error: 'installId required' }, 400)
      }
      const date = (ts ? new Date(ts) : new Date()).toISOString().slice(0, 10)
      // 每台设备每天一条，保留 60 天用于统计
      await env.TELEMETRY.put(`dau:${date}:${installId}`, version || '', { expirationTtl: 60 * 86400 })
      // 使用次数累加（KV 最终一致，对统计足够）
      const countKey = `launch:${installId}`
      const prev = parseInt(await env.TELEMETRY.get(countKey) || '0', 10)
      await env.TELEMETRY.put(countKey, String(prev + 1))
      return json({ ok: true })
    }

    // 查询统计（可设 ADMIN_TOKEN 保护）
    if (url.pathname === '/stats') {
      if (env.ADMIN_TOKEN && url.searchParams.get('token') !== env.ADMIN_TOKEN) return json({ ok: false, error: 'forbidden' }, 403)
      const days = Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 90)
      const dau = []
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
        const list = await env.TELEMETRY.list({ prefix: `dau:${d}:` })
        dau.push({ date: d, dau: list.keys.length })
      }
      let totalLaunches = 0
      const launches = await env.TELEMETRY.list({ prefix: 'launch:' })
      for (const k of launches.keys) totalLaunches += parseInt(await env.TELEMETRY.get(k.name) || '0', 10)
      return json({ days, dau, totalLaunches })
    }

    return json({ ok: false, error: 'not found' }, 404)
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
  })
}
