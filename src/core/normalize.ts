import JSONbig from 'json-bigint'
import type { Item, Order, PlatformId } from '../shared/types'
import { dateText, moneyFen, pick, text } from './values'
import { normalizePddList } from './pdd-normalize'
const JSONSafe = JSONbig({ storeAsString: true, protoAction: 'ignore', constructorAction: 'ignore' })
export function parsePayload(body: string): any {
  if (body.length>12*1024*1024) throw new Error('订单响应过大')
  const trimmed=body.trim(); const json=trimmed.startsWith('{') || trimmed.startsWith('[') ? trimmed : trimmed.replace(/^[\w.$]+\s*\(/,'').replace(/\);?\s*$/,'')
  return JSONSafe.parse(json)
}
const s=(o:any,...p:string[])=>text(pick(o,...p))
function itemsOf(raw:any):any[] {
  for(const key of ['orderGoods','order_goods','goods_list','goodsList','subOrders','sub_orders','orderEntries','productList','products','orderItemList','items','foodlist','food_list','detailList']) { const v=raw[key]; if(Array.isArray(v)&&v.length)return v }
  return [raw]
}
function item(raw:any,index:number,unit:'yuan'|'fen'):Item {
  return {
    id:s(raw,'subOrderId','sub_order_id','itemId','item_id','goodsId','goods_id','skuId','productId','id')||String(index),
    title:s(raw,'goodsName','goods_name','productName','title','name','itemInfo.title','itemInfo.itemName','offerName','subject','auctionTitle','goods.name'),
    spec:s(raw,'spec','goodsSpec','goods_spec','skuName','skuInfo','sku_info','skuInfos','specification','itemInfo.skuText','skuAttr'),
    quantity:(v=>(typeof v==='string'||typeof v==='number')&&Number.isFinite(Number(v))?Number(v):null)(pick(raw,'goodsNumber','goods_number','quantity','num','count','amount','buyAmount')),
    unitPriceFen:moneyFen(pick(raw,'goodsPrice','goods_price','price','unitPrice','unit_price','itemInfo.price','originalPrice'),unit),
    imageUrl:s(raw,'thumbUrl','thumb_url','imageUrl','goodsImage','goods_img','goodsThumb','img','pic','picUrl','image','itemInfo.pic','offerPicUrl','auctionPic').replace(/^\/\//,'https://'),
    productUrl:s(raw,'goodsUrl','goods_url','productUrl','itemInfo.itemUrl','offerUrl','url')
  }
}
function base(platform:PlatformId,raw:any):Order {
  const isFen=['pdd','dewu','kuaishou'].includes(platform); const unit=isFen?'fen':'yuan'
  const o:Order={platform,account:'当前账号',id:s(raw,'orderIdStr','order_sn','orderSn','order_id','orderId','orderNo','order_no','orderNumber','wm_order_id','tid','id','commonData.orderIdStr'),
    createdAt:dateText(pick(raw,'orderTime','order_time','createTime','create_time','createdAt','created_at','gmtCreate','addTime','ctime','orderInfo.createTime','head.data.createTime','orderSubmitTime')),
    paidAt:dateText(pick(raw,'payTime','pay_time','paidAt','paid_time','gmtPayment')),shippedAt:dateText(pick(raw,'shipTime','shippedAt','consignTime')),completedAt:dateText(pick(raw,'finishTime','completedAt','endTime')),
    status:s(raw,'orderStatusPrompt','order_status_prompt','statusText','statusDesc','orderStatusDesc','order_status_desc','orderStatusName','status_desc','status.name','orderStatus','status'),
    shop:s(raw,'mall.mallName','mall.mall_name','mallName','mall_name','shopName','shopInfo.shopName','shop_name','seller.companyName','sellerNick','seller.nick','wm_poi_name','restaurant.name'),sellerId:s(raw,'sellerId','seller.userId','mall.mallId'),
    paidFen:moneyFen(pick(raw,'orderAmount','order_amount','actualPayAmount','payAmount','pay_amount','actual_amount','totalPrice','total_price','total','price','payment','paidFee','totalPayment'),unit),
    freightFen:moneyFen(pick(raw,'freight','shippingFee','postFee','post_fee','delivery_fee'),unit),refundFen:moneyFen(pick(raw,'refundAmount','refund_amount','refundFee'),unit),refundStatus:s(raw,'refundStatus','refund_status','afterSaleStatus'),
    receiver:s(raw,'receiveName','receiverName','receiver_name','address.receiveName','address.receiver','consignee','recipientName'),phone:s(raw,'receivePhone','receiverPhone','receiver_phone','address.mobile','mobile','phone'),address:s(raw,'receiveAddress','receiverAddress','receiver_address','address.fullAddress','address.detail','consignee_address','shipping_address','address'),
    logistics:s(raw,'shippingName','shipping_name','logisticsName','logistics_name','expressCompany','logistics.companyName'),tracking:s(raw,'trackingNumber','tracking_number','trackingNo','waybillNo','waybill_no','logistics.mailNo','logisticsNo'),remark:s(raw,'remark','buyerMemo','buyerMessage','note','buyer_note'),detailUrl:s(raw,'detailUrl','orderDetailUrl','detail_url'),
    items:itemsOf(raw).map((v,i)=>item(v,i,unit)),extra:{},missing:[],source:'response',capturedAt:new Date().toISOString()}
  return o
}
function xianyu(raw:any):Order {
  const o=base('xianyu',raw); o.id=s(raw,'commonData.orderIdStr','commonData.orderId'); o.createdAt=dateText(pick(raw,'head.data.createTime')); o.status=s(raw,'head.data.statusViewMsg'); o.shop=s(raw,'head.data.userInfo.userNick');o.sellerId=s(raw,'head.data.userInfo.userId');o.paidFen=moneyFen(pick(raw,'content.data.priceInfo.price'))
  o.items=[{id:s(raw,'commonData.itemId'),title:s(raw,'content.data.detailInfo.auctionTitle'),spec:'',quantity:Number(pick(raw,'content.data.priceInfo.buyAmount'))||null,unitPriceFen:null,imageUrl:s(raw,'content.data.detailInfo.auctionPic').replace(/^\/\//,'https://'),productUrl:''}]
  return o
}
function meituan(raw:any):Order {
  const o=base('meituan',raw);o.createdAt=dateText(pick(raw,'order_time','orderTime','ctime','create_time'));o.status=s(raw,'status_description','status_desc','statusText');o.shop=s(raw,'wm_poi_name','poi_name','shopName');o.paidFen=moneyFen(pick(raw,'total','total_price','actual_pay_amount'));return o
}
function alibaba(raw:any):Order {
  const o=base('alibaba',raw)
  o.id=s(raw,'idStr','id');o.account=s(raw,'buyerInfo.loginId')||o.account;o.shop=s(raw,'sellerInfo.companyName');o.sellerId=s(raw,'sellerInfo.loginId');o.status=s(raw,'statusLabel','status')
  o.paidFen=moneyFen(raw.sumPayment,'fen');o.freightFen=moneyFen(raw.carriage,'fen');o.remark=s(raw,'buyerFeedBack')
  const steps=raw.orderExtension?.stepOrderList||raw.newStepOrders||[]
  o.paidAt=dateText(steps.find((v:any)=>v.gmtPay)?.gmtPay);o.shippedAt=dateText(steps.find((v:any)=>v.gmtShip)?.gmtShip)
  o.items=(raw.orderEntries||[]).map((v:any)=>({id:s(v,'sourceId'),title:s(v,'productName'),spec:(v.specInfo?.specItems||[]).map((p:any)=>[p.specName,p.specValue].filter(Boolean).join(':')).join('; '),quantity:Number(pick(v,'quantity.realAmountStr','quantity.realAmount','quantity.calAmount'))||null,unitPriceFen:moneyFen(pick(v,'actualUnitPrice','price'),'fen'),imageUrl:s(v,'mainSummImageUrl'),productUrl:v.sourceId?`https://detail.1688.com/offer/${encodeURIComponent(v.sourceId)}.html`:'',extra:{'SKU ID':s(v,'skuId'),'货号':s(v,'productNumber'),'单位':s(v,'unit'),'单品货号':s(v,'entryExtension.cargoNumber')}}))
  const yuan=(value:unknown)=>{const n=moneyFen(value,'fen');return n===null?'':String(n/100)}
  o.extra={'买家公司名':s(raw,'buyerInfo.companyName'),'货品总价(元)':yuan(raw.sumProductPayment),'涨价或折扣(元)':yuan(raw.adjustFee),'订单备注':s(raw,'memo.remark'),'下单批次号':s(raw,'orderExtension.batchNumber'),'下游渠道':s(raw,'orderExtension.downStreamChannel'),'发货方':s(raw,'orderExtension.consignorCompanyName')}
  return o
}
function taobaoComponents(payload:any):Order[]|null {
  const nodes=payload?.data?.data
  if(!nodes||typeof nodes!=='object'||!Object.values(nodes).some((v:any)=>v?.tag==='shopInfo'))return null
  const all=Object.values(nodes) as any[]
  const structure=payload?.data?.hierarchy?.structure
  const descendants=(key:string)=>{
    const result:any[]=[],visited=new Set<string>(),pending=[key]
    while(pending.length&&visited.size<80000){const next=pending.shift()!;if(visited.has(next))continue;visited.add(next);if(nodes[next])result.push(nodes[next]);for(const child of structure?.[next]||[])if(typeof child==='string')pending.push(child)}
    return result
  }
  // Hierarchy links define which payment and item nodes belong to a displayed
  // order. A response may also contain unrelated or stale component nodes.
  const scopedHierarchy=Array.isArray(structure?.orderContainer)
  const groups:Array<{node:any;members:any[]}>=scopedHierarchy
    ?structure.orderContainer.filter((key:unknown)=>typeof key==='string'&&key.startsWith('shopOrderContainer_')).map((key:string)=>{const members=descendants(key);return{node:members.find(v=>v?.tag==='shopInfo'),members}}).filter((g:any)=>g.node)
    :all.filter(v=>v?.tag==='shopInfo').map(node=>({node,members:all}))
  const absolute=(value:string)=>value.replace(/^\/\//,'https://')
  return groups.map(({node,members})=>{
    const raw=node.fields||{},id=s(raw,'orderId')||s(node,'id'),o=base('taobao',{...raw,orderId:id})
    const payment=members.find(v=>v.tag==='orderPayment'&&(scopedHierarchy||s(v,'id')===id))?.fields||{}
    o.createdAt=dateText(pick(raw,'createTime','createDay'));o.status=s(raw,'tradeTitle');o.shop=s(raw,'shopName','sellerName');o.sellerId=s(raw,'sellerId');o.detailUrl=absolute(s(raw,'orderDetailUrl'));o.paidFen=moneyFen(pick(payment,'actualFee.value'));o.freightFen=moneyFen(pick(payment,'pcPostFee.value'))
    if(!o.sellerId)try{o.sellerId=new URL(absolute(s(raw,'outUrl'))).searchParams.get('user_number_id')||''}catch{}
    o.items=members.filter(v=>v.tag==='orderItemInfo'&&s(v,'fields.orderId')===id).map((v,index)=>{
      const raw=v.fields.item||{},nodeId=s(v,'id'),prefix=id+'_',subOrderId=nodeId.startsWith(prefix)?nodeId.slice(prefix.length):'',productId=s(raw,'itemId')
      const amount=typeof raw.quantity==='string'||typeof raw.quantity==='number'?Number(raw.quantity):NaN
      const quantity=Number.isFinite(amount)&&amount>0?amount:null,total=moneyFen(pick(raw,'priceInfo.actualTotalFee'))
      const sku=Array.isArray(raw.skuInfo)?raw.skuInfo.map((p:any)=>[s(p,'skuKey'),s(p,'skuValue','skuText')].filter(Boolean).join(':')).filter(Boolean).join('; '):''
      // actualTotalFee is the sub-order total, not a unit price. Preserve its
      // exact cents separately; do not invent a rounded price for multiple units.
      return {...item(raw,index,'yuan'),id:subOrderId||nodeId||productId||String(index),quantity,spec:sku||s(raw,'skuText'),imageUrl:absolute(s(raw,'pic')),productUrl:absolute(s(raw,'itemUrl','outerUrl')),unitPriceFen:quantity===1?total:null,extra:{'子订单号':subOrderId,'商品ID':productId,'SKU ID':s(raw,'skuId'),'商品实付合计(元)':total===null?'':(total/100).toFixed(2),'商品退款状态':s(raw,'refundStatus')}}
    })
    o.detailState='pending';o.missing=['订单详情'];if(!o.createdAt)o.missing.push('订单日期');if(o.paidFen===null)o.missing.push('实付款');if(!o.items.some(i=>i.title))o.missing.push('商品信息');return o
  })
}
function qualifies(platform:PlatformId, o:any):boolean {
  if(!o || typeof o!=='object'||Array.isArray(o))return false
  if(platform==='xianyu')return !!pick(o,'commonData.orderIdStr','commonData.orderId')&&!!o.head&&!!o.content
  if(platform==='dewu')return !!o.orderNo && !!o.skuInfo
  if(platform==='kuaishou')return !!(o.oid||o.tid) && Array.isArray(o.orderProductViewList)
  if(platform==='eleme')return !!(o.orderId||o.eleMeOrderId||o.tradeNo) && Array.isArray(o.orderItemList)
  if(platform==='meituan')return !!(o.order_id||o.wm_order_id) && Array.isArray(o.product_list)
  if(platform==='alibaba')return !!(o.idStr||o.id) && Array.isArray(o.orderEntries)
  const id=pick(o,'order_sn','orderSn','order_id','orderId','orderIdStr','orderNo','order_no','wm_order_id','tid')
  if(!id)return false
  return itemsOf(o)!==undefined && (!!pick(o,'orderGoods','order_goods','goods_list','goodsList','subOrders','orderEntries','productList','products','orderItemList','foodlist','food_list','items','goodsName','title','goods_name','detailList') || !!pick(o,'createTime','create_time','orderTime','order_time','gmtCreate','addTime','ctime'))
}
export function normalizePayload(platform:PlatformId,payload:any):Order[] {
  if(platform==='pdd'&&Array.isArray(payload?.orders))return payload.orders.map((v:any)=>normalizePddList(v)).filter((v:Order|null):v is Order=>v!==null)
  if(platform==='taobao'){const components=taobaoComponents(payload);if(components)return components}
  const found:Order[]=[]; let visited=0
  function walk(v:any,depth:number):void {
    if(!v||typeof v!=='object'||depth>14||++visited>80000)return
    if(qualifies(platform,v)){ let o=platform==='xianyu'?xianyu(v):platform==='alibaba'?alibaba(v):platform==='meituan'?meituan(v):base(platform,v)
      if(platform==='dewu'){
        const sku=v.skuInfo;o.status=s(v,'statusInfo.statusDesc');o.items=[{id:s(sku,'skuId'),title:s(sku,'skuTitle'),spec:s(sku,'skuProp'),quantity:Number(sku.skuQuantity)||null,unitPriceFen:moneyFen(sku.skuPrice,'fen'),imageUrl:s(sku,'skuPic'),productUrl:''}];o.extra={'支付单号':s(v,'paymentNo'),'附加订单类型':s(v,'additionOrderType')}
      }
      if(platform==='kuaishou'){
        const a=v.deliveryAddressInfo||{};o.id=s(v,'oid','tid');o.status=s(v,'orderViewStatusDesc');o.paidFen=moneyFen(pick(v,'paymentFee','totalFee'),'fen');o.shop=s(v,'sellerNick','shopInfo.shopName');o.receiver=s(a,'consignee');o.phone=s(a,'mobile');o.address=['province','city','district','town','address'].map(k=>s(a,k)).filter(Boolean).join(' ');o.items=v.orderProductViewList.map((p:any,i:number)=>({...item(p,i,'fen'),title:s(p,'itemTitle'),spec:s(p,'skuDesc'),imageUrl:s(p,'itemPicUrl','itemCdnPicUrl')}));o.extra={'交易号':s(v,'tid'),'订单总额（分）':s(v,'totalFee')}
      }
      if(platform==='eleme'){
        o.id=s(v,'orderId','eleMeOrderId','tradeNo');o.createdAt=dateText(pick(v,'orderCreateTime','createTime','submitTime'));o.shop=s(v,'storeName');o.status=s(v,'orderStatusBar.title','orderStatus','businessStatus.commonTextList.0.title');o.items=v.orderItemList.map((p:any,i:number)=>({...item(p,i,'yuan'),imageUrl:s(p,'cover'),title:s(p,'name')}))
      }
      if(platform==='meituan')o.items=v.product_list.map((p:any,i:number)=>({...item(p,i,'yuan'),title:s(p,'product_name'),quantity:Number(p.product_count)||null,imageUrl:s(p,'product_pic')}))
      if(!o.id)return
      if(!o.createdAt)o.missing.push('订单日期');if(o.paidFen===null)o.missing.push('实付款');if(!o.items.some(i=>i.title))o.missing.push('商品信息')
      o.detailState=['taobao','alibaba','pdd','jd','xianyu'].includes(platform)?'pending':'complete'
      if(o.detailState==='pending')o.missing.push('订单详情')
      if(o.id && (typeof pick(v,'orderId','order_id')!=='number'||Number.isSafeInteger(pick(v,'orderId','order_id'))))found.push(o)
      return
    }
    for(const child of Object.values(v)) { if(typeof child==='string' && /^[\[{]/.test(child.trim())&&child.length<8*1024*1024) { try{walk(parsePayload(child),depth+1)}catch{} } else walk(child,depth+1) }
  }
  walk(payload,0);return [...new Map(found.map(o=>[o.id,o])).values()]
}
export function mergeXianyuDetail(order:Order,response:any):Order {
  const info=response?.data?.components?.find((c:any)=>c.render==='orderInfoVO')?.data
  if(!info) return {...order,missing:[...order.missing,'订单详情']}
  const kv=(a:any[])=>Object.fromEntries((a||[]).map(v=>[v.title,text(v.value)]))
  const details=kv(info.orderInfoList); const bill=kv(info.priceInfo?.billList)
  return {...order,detailState:'complete',address:details['收货地址']||order.address,paidAt:dateText(details['付款时间'])||order.paidAt,shippedAt:dateText(details['发货时间'])||order.shippedAt,completedAt:dateText(details['成交时间'])||order.completedAt,freightFen:moneyFen(bill['运费'])??order.freightFen,extra:{...order.extra,'闲鱼币抵扣':bill['闲鱼币抵扣']||'','支付宝交易号':details['支付宝交易号']||''},missing:order.missing.filter(x=>x!=='订单详情')}
}
