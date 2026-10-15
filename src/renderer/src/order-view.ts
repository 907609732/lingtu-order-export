import type { Order } from '../../shared/types'

export const orderColumns = [
  {key:'createdAt',label:'创建时间',width:160,sort:true},
  {key:'shop',label:'商家名',width:160,sort:true},
  {key:'items',label:'商品 / 规格 / 数量',width:320},
  {key:'paidFen',label:'实付款',width:116,sort:true},
  {key:'address',label:'收货地址',width:240},
  {key:'logistics',label:'物流',width:190},
  {key:'phone',label:'收货电话',width:145},
  {key:'arrival',label:'物流达签',width:170},
  {key:'paidAt',label:'付款时间',width:160,sort:true},
  {key:'mark',label:'标记 / 备注',width:190},
  {key:'refundStatus',label:'售后',width:160},
  {key:'freightFen',label:'运费',width:95,sort:true},
  {key:'refundFen',label:'退款金额',width:110,sort:true},
  {key:'shippedAt',label:'发货时间',width:160,sort:true},
  {key:'completedAt',label:'完成时间',width:160,sort:true},
  {key:'account',label:'采购账号',width:140},
] as const
export const defaultColumnKeys: string[] = orderColumns.slice(0,11).map(c=>c.key)
export const money = (value:number|null|undefined) => value===null||value===undefined?'未获取':`¥ ${(value/100).toFixed(2)}`
export const absent = (o:Order) => o.detailState==='complete'?'未提供':'待提取详情'
export const extraValue = (o:Order,...keys:string[]) => keys.map(key=>o.extra?.[key]).find(value=>value?.trim())||''
export const arrival = (o:Order) => extraValue(o,'物流达签','物流状态','物流到达','物流达到','签收时间')
export const mark = (o:Order) => [extraValue(o,'标记','买家标记','订单标记'),o.remark,extraValue(o,'订单备注','买家留言')].filter((s,i,a)=>s&&a.indexOf(s)===i).join('；')
export const afterSale = (o:Order) => [o.refundStatus,...o.items.map(i=>i.extra?.['商品售后状态']||i.extra?.['商品退款状态']||'')].filter((s,i,a)=>s&&a.indexOf(s)===i).join('；')
export function searchText(o:Order):string {
  return [o.id,o.account,o.createdAt,o.shop,o.sellerId,o.status,o.receiver,o.phone,o.address,o.logistics,o.tracking,o.remark,o.refundStatus,...Object.values(o.extra||{}),...o.items.flatMap(i=>[i.id,i.title,i.spec,...Object.values(i.extra||{})])].join(' ').toLocaleLowerCase()
}
export interface OrderFilter {query:string;status:string;shop:string;detail:string;sortKey:string;descending:boolean}
export function filterOrders(orders:Order[],filter:OrderFilter):Order[] {
  const terms=filter.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const result=orders.filter(o=>(!filter.status||o.status===filter.status)&&(!filter.shop||o.shop===filter.shop)&&(!filter.detail||(filter.detail==='missing'?o.missing.length>0:filter.detail==='refund'?!!afterSale(o)||(o.refundFen!==null&&o.refundFen>0):o.missing.length===0))&&(!terms.length||terms.every(term=>searchText(o).includes(term))))
  return result.sort((a,b)=>{
    const av=a[filter.sortKey as keyof Order],bv=b[filter.sortKey as keyof Order]
    const am=av===null||av===undefined||av==='',bm=bv===null||bv===undefined||bv===''
    if(am!==bm)return am?1:-1
    const n=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),'zh-CN',{numeric:false})
    return (filter.descending?-1:1)*n
  })
}
export function safeImage(raw:string):string {
  try{const u=new URL(raw.startsWith('//')?'https:'+raw:raw);return u.protocol==='https:'&&!u.username&&!u.password&&['alicdn.com','taobaocdn.com','360buyimg.com','jd.com','pddpic.com','yangkeduo.com','dewu.com','poizon.com','ecukwai.com','kwai.net','meituan.net','dianping.com','ele.me','elemecdn.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:''}catch{return ''}
}
