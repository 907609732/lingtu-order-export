export function moneyFen(value: unknown, unit: 'yuan' | 'fen' = 'yuan'): number | null {
  if (value === undefined || value === null || value === '') return null
  if(typeof value!=='string'&&typeof value!=='number')return null
  const s = String(value).replace(/[,¥￥\s]/g, '').replace(/元$/, '')
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  if (unit === 'fen') { const n = Number(s); return Number.isSafeInteger(n) ? n : null }
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s)!
  const frac = (m[3] || '').padEnd(3,'0'); const n = Number(m[2])*100 + Number(frac.slice(0,2)) + (Number(frac[2]) >= 5 ? 1 : 0)
  return Number.isSafeInteger(n) ? (m[1] ? -n : n) : null
}
export function dateText(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if(typeof value!=='string'&&typeof value!=='number')return ''
  let date: Date
  const s = String(value).trim()
  if (/^\d{10,13}$/.test(s)) date = new Date(Number(s) * (s.length === 10 ? 1000 : 1))
  else { const normalized = s.replace(/[年/]/g,'-').replace(/月/g,'-').replace(/日/g,'').replace(' ', 'T'); date = new Date(/(Z|[+-]\d\d:\d\d)$/.test(normalized) ? normalized : /^\d{4}-\d{1,2}-\d{1,2}/.test(normalized) ? normalized + (normalized.includes('T') ? '+08:00' : 'T00:00:00+08:00') : 'invalid') }
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime()+8*3600000).toISOString().slice(0,19).replace('T',' ')
}
export function checkRange(from: string, to: string): void {
  for (const d of [from,to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || dateText(d).slice(0,10)!==d) throw new Error('请选择有效的起止日期')
  if (from>to) throw new Error('开始日期不能晚于结束日期')
}
export function inRange(date: string, from: string, to: string): boolean { return !!date && date.slice(0,10)>=from && date.slice(0,10)<=to }
export function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : '' }
export function pick(o: any, ...paths: string[]): any { for (const path of paths) { let v=o; for (const k of path.split('.')) v=v?.[k]; if (v!==undefined && v!==null && v!=='') return v } return undefined }
export function safeFileName(s: string): string { return s.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,160) }
export function csvCell(value: unknown): string { let s=text(value); if (/^[=+\-@\t\r]/.test(s)) s="'"+s; if (/^\d{12,}$/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"' }
