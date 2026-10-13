import type { Item, Order } from '../shared/types'
import { dateText, moneyFen, text } from './values'
const fee=(raw:unknown)=>{const value=moneyFen(raw,'fen');return value===null?'':(value/100).toFixed(2)}

function pddItem(raw:any, index:number, detail:boolean):Item {
  const id=text(detail?raw.goodsId:raw.goods_id)
  const quantity=detail?raw.goodsNumber:raw.goods_number
  return {id:`${id}:${text(raw.spec)}:${index}`,title:text(detail?raw.goodsName:raw.goods_name),spec:text(raw.spec),extra:{'商品ID':id},
    quantity:(typeof quantity==='number'||typeof quantity==='string')&&Number.isFinite(Number(quantity))?Number(quantity):null,
    unitPriceFen:moneyFen(detail?raw.goodsPrice:raw.goods_price,'fen'),
    imageUrl:text(detail?raw.thumbUrl:raw.thumb_url).replace(/^\/\//,'https://'),
    productUrl:id?`https://mobile.yangkeduo.com/goods.html?goods_id=${encodeURIComponent(id)}`:''}
}
function missingFields(order:Order):string[] {
  return [...(!order.createdAt?['订单日期']:[]),...(order.paidFen===null?['实付款']:[]),...(!order.items.length||order.items.some(item=>!item.title)?['商品信息']:[])]
}
export function normalizePddList(raw:any, account='当前账号'):Order|null {
  if (!raw || typeof raw!=='object' || !raw.order_sn) return null
  if(typeof raw.order_sn==='number'&&!Number.isSafeInteger(raw.order_sn))return null
  const grouped=Number(raw.type)===2
  const goods=grouped?(Array.isArray(raw.orders)?raw.orders.flatMap((child:any)=>Array.isArray(child?.order_goods)?child.order_goods:[]):[]):raw.order_goods
  if(!Array.isArray(goods))return null
  const order:Order={platform:'pdd',account,id:text(raw.order_sn),createdAt:dateText(grouped?raw.group_order?.create_at:raw.order_time),
    paidAt:'',shippedAt:grouped?'':dateText(raw.shipping_time),completedAt:dateText(raw.receive_time),
    status:text(raw.order_status_prompt),shop:text(raw.mall?.mall_name),sellerId:text(raw.mall?.id),
    paidFen:moneyFen(grouped?raw.display_amount:raw.order_amount,'fen'),freightFen:null,refundFen:null,refundStatus:'',
    receiver:'',phone:'',address:'',logistics:'',tracking:text(raw.tracking_number),remark:'',
    detailUrl:`https://mobile.yangkeduo.com/order.html?order_sn=${encodeURIComponent(text(raw.order_sn))}`,
    items:goods.map((item:any,index:number)=>pddItem(item,index,false)),
    extra:{'服务费（元）':fee(raw.service_amount),'订单类型':text(raw.type)},
    missing:[],source:'response',capturedAt:new Date().toISOString(),detailState:'pending'}
  if(grouped)order.extra['拼单成功时间']=dateText(raw.group_order?.success_time)
  order.missing=[...missingFields(order),'订单详情']
  return order
}
export function normalizePddDetail(order:Order, raw:any):Order {
  if(!raw||String(raw.orderSn??'')!==order.id||!Array.isArray(raw.orderGoods))return order
  if(typeof raw.orderSn==='number'&&!Number.isSafeInteger(raw.orderSn))return order
  const merged:Order={...order,
    createdAt:dateText(raw.orderTime)||order.createdAt,status:text(raw.chatStatusPrompt)||order.status,
    receiver:text(raw.receiveName),phone:text(raw.mobile),
    address:[raw.provinceName,raw.cityName,raw.districtName,raw.shippingAddress].map(text).filter(Boolean).join(' '),
    logistics:text(raw.expressInfo?.shippingName),tracking:text(raw.expressInfo?.trackingNumber)||order.tracking,
    paidFen:moneyFen(raw.orderAmount,'fen')??order.paidFen,freightFen:moneyFen(raw.shippingAmount,'fen')??order.freightFen,
    shop:text(raw.mall?.mallName)||order.shop,sellerId:text(raw.mall?.id)||order.sellerId,
    items:raw.orderGoods.map((item:any,index:number)=>pddItem(item,index,true)),
    extra:{...order.extra,'父订单号':text(raw.parentOrderSn),'服务费（元）':fee(raw.serviceAmount)||order.extra['服务费（元）']||''},
    detailState:order.extra['订单类型']==='2'?'pending':'complete',missing:[],capturedAt:new Date().toISOString()}
  merged.missing=[...missingFields(merged),...(!merged.receiver?['收货人']:[]),...(!merged.phone?['收货电话']:[]),...(!merged.address?['收货地址']:[])]
  if(merged.detailState==='pending')merged.missing.push('订单详情')
  return merged
}
