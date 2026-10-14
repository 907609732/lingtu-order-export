import type { Order } from '../shared/types'
import { dateText, moneyFen } from '../core/values'
import { CollectionError } from './collection-errors'

export interface TaobaoDetailSnapshot { url:string; text:string; blocked:boolean }

// Only follow the detail link supplied by the order list. Never synthesize a
// platform request, accept a write endpoint, or infer an order from another tab.
export function taobaoDetailUrl(raw:string,orderId:string):string {
  if(!/^\d{8,40}$/.test(orderId))throw new CollectionError('response_structure')
  let url:URL
  try{url=new URL(raw)}catch{throw new CollectionError('response_structure')}
  const hosts=['buyertrade.taobao.com','trade.taobao.com','trade.tmall.com','market.m.taobao.com']
  if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname)||!/detail/i.test(url.pathname)||/create|submit|cancel|delete|confirm|refund|payorder/i.test(url.pathname))throw new CollectionError('response_structure')
  const ids=['biz_order_id','bizOrderId','orderId','order_id'].flatMap(key=>url.searchParams.getAll(key))
  if(!ids.length||ids.some(id=>id!==orderId))throw new CollectionError('response_structure')
  return url.href
}

// Executed in the official page. Read rendered text only; scripts, hidden data,
// and page controls are not clicked. Credentials and the raw body never enter logs.
export function readTaobaoDetailPage():TaobaoDetailSnapshot {
  const text=(document.body?.innerText||'').slice(0,200000)
  const visible=(element:Element)=>!!(element as HTMLElement).getClientRects().length
  const blocked=[...document.querySelectorAll('#nocaptcha,#nc_1_wrapper,.nc-container,iframe[src*="captcha"],input[type="password"]')].some(visible)
    ||/验证|安全检查|登录/.test(document.title)&&/验证|安全检查|密码登录|扫码登录/.test(text.slice(0,3000))
  return {url:location.href,text,blocked}
}

const labels=['订单编号','订单号','交易编号','交易号','付款时间','支付时间','发货时间','成交时间','交易成功时间','完成时间','收货人','收件人','收货电话','联系电话','手机号码','收货地址','收件地址','物流公司','快递公司','运单号码','运单号','快递单号','物流单号','买家留言','买家备注','订单备注','售后状态','退款状态','退款金额','物流状态','物流达签','签收时间','配送方式','运送方式'] as const
const known=new Set<string>(labels)
function labelledValues(text:string):Map<string,string[]> {
  const lines=text.replace(/\r/g,'').split('\n').map(line=>line.replace(/[\t\u00a0 ]+/g,' ').trim()).filter(Boolean)
  const result=new Map<string,string[]>()
  const add=(label:string,value:string)=>{if(value&&!known.has(value)&&value.length<=3000)result.set(label,[...(result.get(label)||[]),value])}
  for(let index=0;index<lines.length;index++){
    const line=lines[index],match=line.match(/^([^:：]{1,12})[:：]\s*(.*)$/)
    if(match&&known.has(match[1].trim())){const value=match[2].trim();add(match[1].trim(),value||lines[index+1]||'')}
    else if(known.has(line))add(line,lines[index+1]||'')
  }
  return result
}

export function mergeTaobaoVisibleDetail(order:Order,snapshot:TaobaoDetailSnapshot):Order {
  if(snapshot.blocked)throw new CollectionError('login_or_verification')
  taobaoDetailUrl(snapshot.url,order.id)
  const values=labelledValues(snapshot.text)
  const ids=['订单编号','订单号','交易编号','交易号'].flatMap(key=>values.get(key)||[]).map(value=>value.match(/^\d{8,40}(?=\s|$)/)?.[0]).filter(Boolean)
  // A URL alone cannot prove that the loaded document belongs to this order.
  if(!ids.length||ids.some(id=>id!==order.id))throw new CollectionError('response_structure')
  const pick=(...keys:string[])=>{for(const key of keys){const matches=[...new Set(values.get(key)||[])];if(matches.length===1)return matches[0]}return ''}
  const next={...order,extra:{...order.extra},capturedAt:new Date().toISOString()}
  const dates:Partial<Record<keyof Order,string>>={paidAt:pick('付款时间','支付时间'),shippedAt:pick('发货时间'),completedAt:pick('成交时间','交易成功时间','完成时间')}
  for(const [key,value] of Object.entries(dates)){const stamp=value.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/)?.[0];if(stamp){const date=dateText(stamp);if(date)(next as any)[key]=date}}
  const strings:Partial<Record<keyof Order,string>>={receiver:pick('收货人','收件人'),phone:pick('收货电话','联系电话','手机号码'),address:pick('收货地址','收件地址'),logistics:pick('物流公司','快递公司'),tracking:pick('运单号码','运单号','快递单号','物流单号'),remark:pick('买家留言','买家备注','订单备注'),refundStatus:pick('售后状态','退款状态')}
  for(const [key,value] of Object.entries(strings))if(value&&!/点击|查看|获取|提取|登录|验证/.test(value))(next as any)[key]=value
  const refund=pick('退款金额');if(refund&&/^[￥¥]?\s*\d+(?:\.\d{1,2})?\s*元?$/.test(refund))next.refundFen=moneyFen(refund)
  for(const label of ['物流状态','物流达签','签收时间','配送方式','运送方式']){const value=pick(label);if(value)next.extra[label]=value}
  const changed=['paidAt','shippedAt','completedAt','receiver','phone','address','logistics','tracking','remark','refundStatus','refundFen'].some(key=>(next as any)[key]!== (order as any)[key])
    ||Object.keys(next.extra).some(key=>next.extra[key]!==order.extra[key])
  const recognized=Object.values(dates).some(Boolean)||Object.values(strings).some(Boolean)||!!refund
  if(!changed&&!recognized)throw new CollectionError('response_structure')
  // DOM labels only establish the fields visibly returned; absence is unknown.
  // In particular, an empty refund/remark field does not mean “none”.
  next.extra['详情读取状态']='已读取官方页面可见字段，缺项仍待核对'
  next.detailState=order.detailState==='complete'?'complete':'pending'
  next.missing=[...new Set([...order.missing,...(next.detailState==='complete'?[]:['订单详情'])])]
  return next
}
