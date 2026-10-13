import type { Order, Item } from '../shared/types'

function useful(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0)
}
function fields<T extends object>(before: T, after: Partial<T>): T {
  return { ...before, ...Object.fromEntries(Object.entries(after).filter(([, value]) => useful(value))) }
}
export function mergeOrders(before: Order, after: Order): Order {
  // A later DOM summary must not overwrite richer response/detail data.
  const lowerPriority = (before.detailState === 'complete' && after.detailState !== 'complete') || (before.source === 'response' && after.source === 'page')
  const merged = lowerPriority ? fields(after, before) : fields(before, after)
  merged.capturedAt = after.capturedAt
  merged.extra = lowerPriority ? fields(after.extra, before.extra) : fields(before.extra, after.extra)
  const incoming = new Map(after.items.map(item => [item.id, item]))
  merged.items = before.items.map(item => {
    const next = incoming.get(item.id)
    if (!next) return item
    incoming.delete(item.id)
    return lowerPriority ? fields<Item>(next, item) : fields<Item>(item, next)
  }).concat([...incoming.values()])
  if (before.detailState === 'complete' || after.detailState === 'complete') merged.detailState = 'complete'
  merged.missing = [...new Set([...before.missing, ...after.missing])].filter(field => {
    if (field === '订单日期') return !merged.createdAt
    if (field === '实付款') return merged.paidFen === null
    if (field === '商品信息') return !merged.items.some(item => item.title)
    if (field === '订单详情' || field === '订单详情尚未补全') return merged.detailState !== 'complete'
    return true
  })
  return merged
}
