import type {Order,PlatformId} from '../shared/types'
import {CollectionError} from './collection-errors'
import {mergeVisibleOrderDetail,type TaobaoDetailSnapshot} from './taobao-detail'

export function platformDetailUrl(platform:PlatformId,raw:string,id:string):string {
  if(!/^\d{8,40}$/.test(id)||!['alibaba','jd'].includes(platform))throw new CollectionError('response_structure')
  let url:URL;try{url=new URL(raw,platform==='jd'?'https://order.jd.com':'https://trade.1688.com')}catch{throw new CollectionError('response_structure')}
  const domain=platform==='jd'?'jd.com':'1688.com'
  if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname===domain||url.hostname.endsWith('.'+domain))||!(/detail/i.test(url.pathname)||(platform==='jd'&&url.hostname==='details.jd.com'&&url.pathname==='/normal/item.action'))||/create|submit|cancel|delete|confirm|refund|payorder/i.test(url.pathname))throw new CollectionError('response_structure')
  const ids=['orderId','orderid','order_id','bizOrderId','biz_order_id','id'].flatMap(k=>url.searchParams.getAll(k))
  if(!ids.length||ids.some(v=>v!==id))throw new CollectionError('response_structure')
  return url.href
}
export function mergePlatformVisibleDetail(order:Order,snapshot:TaobaoDetailSnapshot):Order {
  return mergeVisibleOrderDetail(order,snapshot,(url,id)=>platformDetailUrl(order.platform,url,id))
}
