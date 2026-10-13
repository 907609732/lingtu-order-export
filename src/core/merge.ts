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
  const key=(item:Item)=>after.platform==='taobao'?item.extra?.['子订单号']||item.id:item.id
  const incoming = new Map(after.items.map(item => [key(item), item]))
  const previous=after.platform==='taobao'?[...new Map(before.items.map(item=>[key(item),item])).values()]:before.items
  merged.items = previous.map(item => {
    const next = incoming.get(key(item))
    if (!next) return item
    incoming.delete(key(item))
    const value=lowerPriority ? fields<Item>(next, item) : fields<Item>(item, next)
    if(after.platform==='taobao'&&next.extra?.['子订单号']){
      value.id=next.id
      value.extra=fields(item.extra||{},next.extra||{})
      // 0.1.4 stored row totals as unit prices. Null from the corrected list is
      // meaningful here and must clear that old incorrect value.
      if(!lowerPriority&&next.extra['商品实付合计(元)']!==undefined)value.unitPriceFen=next.unitPriceFen
    }
    return value
  }).concat([...incoming.values()])
  if(after.platform==='pdd') {
    if(before.detailState==='complete'&&after.detailState!=='complete')merged.items=before.items
    else if(after.items.length&&after.items.every(i=>i.extra?.['商品ID']))merged.items=after.items
  }
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
