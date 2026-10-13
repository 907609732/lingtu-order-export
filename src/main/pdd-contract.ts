import { CollectionError } from './collection-errors'
import { parsePayload } from '../core/normalize'

// Contract observed in the installed PDD 0.0.76 artifact. These are protocol
// fields, not copied application implementation. No account values belong here.
export const PDD_PAGE_SIZE = 30
export function pddListBody(offset = '0') {
  if (!offset || offset.length > 4096 || /[\r\n\0]/.test(offset)) throw new CollectionError('response_structure')
  return { offset, origin_host_name: 'mobile.yangkeduo.com', page: 1, size: PDD_PAGE_SIZE, type: 'all' }
}

export function parsePddList(payload: any, previousOffset = '0'): { orders:any[]; nextOffset:string|null; ended:boolean } {
  const code = String(payload?.error_code ?? '')
  if (code === '40001') throw new CollectionError('login_or_verification')
  if (payload?.success === false || (code && code !== '0')) throw new CollectionError('request_rejected')
  if (!Array.isArray(payload?.orders)) throw new CollectionError('response_structure')
  const orders = payload.orders
  if (orders.some((row:any) => !row || typeof row !== 'object' || Array.isArray(row) || !row.order_sn)) throw new CollectionError('response_structure')
  const ended = orders.length < PDD_PAGE_SIZE
  const raw = orders.at(-1)?.offset
  const nextOffset = typeof raw === 'string' ? raw : typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : null
  if (!ended && (!nextOffset || nextOffset === previousOffset || nextOffset.length > 4096 || /[\r\n\0]/.test(nextOffset))) throw new CollectionError('response_structure')
  return { orders, nextOffset, ended }
}

// Read only the JSON assignment. Never evaluate the HTML or its scripts.
export function parsePddDetailHtml(html:string, expectedOrderId:string):any {
  if (html.length > 12 * 1024 * 1024) throw new CollectionError('response_structure')
  const assignment = /window\.rawData\s*=\s*(\{)/g.exec(html)
  if (!assignment) throw new CollectionError('response_structure')
  const start = assignment.index + assignment[0].lastIndexOf('{')
  let depth = 0, quoted = false, escaped = false, end = -1
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue }
    if (c === '"') quoted = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) { end = i + 1; break }
  }
  if (end < 0) throw new CollectionError('response_structure')
  let raw:any
  try { raw = parsePayload(html.slice(start,end)) } catch { throw new CollectionError('response_structure') }
  if (raw?.data?.errorPopup?.errorMsg) throw new CollectionError('request_rejected')
  const detail = raw?.data
  if (!detail || String(detail.orderSn ?? '') !== expectedOrderId || !Array.isArray(detail.orderGoods)) throw new CollectionError('response_structure')
  return detail
}
