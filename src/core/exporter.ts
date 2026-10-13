import ExcelJS from 'exceljs'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { Item, Order, PlatformId, Task } from '../shared/types'
import { platformById } from '../shared/platforms'
import { csvCell, safeFileName } from './values'
type Column={header:string;key:string;width?:number}
const common:Column[]=[['订单号','id'],['下单时间','createdAt'],['商品名称','title'],['商品图片','imageUrl'],['规格','spec'],['数量','quantity'],['商品单价','unitPrice'],['订单实付款','paid'],['运费','freight'],['订单状态','status'],['店铺名称','shop'],['退款状态','refundStatus'],['退款金额','refund'],['收货人','receiver'],['手机号码','phone'],['收货地址','address'],['物流公司','logistics'],['运单号','tracking'],['买家备注','remark'],['付款时间','paidAt'],['发货时间','shippedAt'],['完成时间','completedAt'],['商品链接','productUrl'],['订单链接','detailUrl']].map(([header,key])=>({header,key}))
const xy:Column[]=[['订单号','id'],['创建时间','createdAt'],['商品标题','title'],['商品图片','imageUrl'],['实付款','paid'],['数量','quantity'],['订单状态','status'],['卖家昵称','shop'],['卖家ID','sellerId'],['商品ID','itemId'],['收货地址','address'],['运费','freight'],['闲鱼币抵扣','闲鱼币抵扣'],['支付宝交易号','支付宝交易号'],['付款时间','paidAt'],['发货时间','shippedAt'],['成交时间','completedAt']].map(([header,key])=>({header,key}))
const cols=(pairs:string[][]):Column[]=>pairs.map(([header,key])=>({header,key}))
const original:Partial<Record<PlatformId,Column[]>>={
  taobao:[...common,...cols([['商品ID','itemId'],['子订单号','子订单号'],['SKU ID','SKU ID'],['商品实付合计(元)','商品实付合计(元)']])],
  xianyu:xy,
  pdd:cols([['商品图片','embeddedImage'],['下单日期','createdAt'],['商品ID','itemId'],['商品链接','productUrl'],['订单ID','id'],['商品名','title'],['商品图','imageUrl'],['价格','unitPrice'],['实付','paid'],['规格','spec'],['数量','quantity'],['店名','shop'],['店ID','sellerId'],['订单状态','status'],['收货人名','receiver'],['收货地址','address'],['收货电话','phone'],['快递公司','logistics'],['运单号','tracking'],['运费','freight'],['支付方式','支付方式'],['发货时间','shippedAt'],['备注','remark'],['快递状态','快递状态'],['收货时间','completedAt'],['用户名','account']]),
  dewu:cols([['订单号','id'],['支付单号','支付单号'],['订单状态','status'],['支付金额','paidFen'],['商品价格（元）','paid'],['商品标题','title'],['商品规格','spec'],['商品数量','quantity'],['商品单价','unitPriceFen'],['商品图片链接','imageUrl'],['买家名称','account'],['买家编号','buyerId'],['下单时间','createdAt'],['附加订单类型','附加订单类型']]),
  kuaishou:cols([['订单号','id'],['交易号','交易号'],['订单状态','status'],['实付金额','paidFen'],['订单总额','订单总额（分）'],['商品价格（元）','paid'],['商品标题','title'],['商品规格','spec'],['商品数量','quantity'],['商品图片链接','imageUrl'],['买家昵称','account'],['买家编号','buyerId'],['卖家昵称','shop'],['收货地址','address'],['收货人','receiver'],['手机号','phone'],['下单时间','createdAt']]),
  eleme:cols([['订单号','id'],['订单金额','paid'],['商品数量','itemCount'],['商品图片链接','imageUrl'],['商家名称','shop'],['订单状态','status'],['下单时间','createdAt'],['买家编号','buyerId'],['买家名称','account'],['商品规格','allTitles']]),
  meituan:cols([['订单号','id'],['商家名称','shop'],['订单商品规格','allTitles'],['订单总价','paid'],['商品数量','itemCount'],['订单状态','status'],['下单时间','createdAt'],['买家名称','account'],['买家编号','buyerId'],['商品图片链接','imageUrl']]),
  alibaba:cols([['订单编号','id'],['买家公司名','买家公司名'],['买家会员名','account'],['卖家公司名','shop'],['卖家会员名','sellerId'],['货品总价(元)','货品总价(元)'],['运费(元)','freight'],['涨价或折扣(元)','涨价或折扣(元)'],['实付款(元)','paid'],['订单状态','status'],['订单创建时间','createdAt'],['订单付款时间','paidAt'],['发货方','发货方'],['收货人姓名','receiver'],['收货地址','address'],['邮编','邮编'],['联系电话','联系电话'],['联系手机','phone'],['货品标题','title'],['单价(元)','unitPrice'],['数量','quantity'],['单位','单位'],['货号','货号'],['型号','spec'],['Offer ID','itemId'],['SKU ID','SKU ID'],['物料编号','物料编号'],['单品货号','单品货号'],['货品种类','货品种类'],['买家留言','remark'],['物流公司','logistics'],['运单号','tracking'],...['发票：购货单位名称','发票：纳税人识别号','发票：地址、电话','发票：开户行及账号','发票收取地址','关联编号','代理商姓名','代理商联系方式','是否代发订单','代发服务商id','微商订单号','下单批次号','下游渠道','下游订单号','下单公司主体','发起人登录名','是否发起免密支付(1:淘货源诚e赊免密支付2:批量下单免密支付)','订单备注'].map(v=>[v,v])])
}
export function columnsFor(platform:PlatformId):Column[]{return original[platform]||common}
const yuan=(v:number|null)=>v===null?'':v/100
export function exportRows(orders:Order[]):Record<string,any>[] {
  return orders.flatMap(o=> (o.items.length?(['eleme','meituan'].includes(o.platform)?o.items.slice(0,1):o.items):[{id:'',title:'',spec:'',quantity:null,unitPriceFen:null,imageUrl:'',productUrl:''} as Item]).map(i=>({...o,...o.extra,...i.extra,itemId:['taobao','pdd'].includes(o.platform)?i.extra?.['商品ID']||i.id:i.id,title:i.title,spec:i.spec,quantity:i.quantity??'',imageUrl:i.imageUrl,embeddedImage:i.imageUrl,productUrl:i.productUrl,unitPrice:yuan(i.unitPriceFen),unitPriceFen:i.unitPriceFen??'',paid:yuan(o.paidFen),freight:yuan(o.freightFen),refund:yuan(o.refundFen),allTitles:o.items.map(i=>i.title+(i.quantity&&i.quantity>1?` x${i.quantity}`:'')).join('\n'),itemCount:o.items.reduce((n,i)=>n+(i.quantity||0),0)||o.items.length})))
}
export type ImageLoader=(url:string)=>Promise<Buffer>
export type ExportProgress={phase:'rows'|'images'|'write';current?:number;total?:number}
export async function exportOrders(task:Task,orders:Order[],directory:string,format:'xlsx'|'csv',images:boolean,loadImage?:ImageLoader,onProgress?:(progress:ExportProgress)=>void):Promise<{path:string;count:number;missing:number}>{
  if(!orders.length)throw new Error('当前任务没有可导出的订单')
  const folder=join(directory,safeFileName(platformById(task.platform).name));await mkdir(folder,{recursive:true})
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'); const path=join(folder,`${safeFileName(platformById(task.platform).name)}_${task.from}_${task.to}_${stamp}.${format}`)
  const columns=columnsFor(task.platform);const rows=exportRows(orders)
  onProgress?.({phase:'rows',total:rows.length})
  const issues:Record<string,string>[]=[]
  for(const o of orders)for(const field of o.missing)issues.push({订单号:o.id,缺失内容:field,说明:'平台未返回或暂时获取失败'})
  if(task.status!=='completed')issues.push({订单号:'',缺失内容:'采集范围尚未确认完整',说明:task.message||'本文件包含当前已采集的结果'})
  if(format==='csv'){
    onProgress?.({phase:'write'})
    const data='\uFEFF'+[columns.map(c=>csvCell(c.header)).join(','),...rows.map(r=>columns.map(c=>csvCell(r[c.key])).join(','))].join('\r\n')
    await writeFile(path+'.tmp',data,'utf8');await rename(path+'.tmp',path)
    if(issues.length)await writeFile(path.replace(/\.csv$/,'_缺项清单.csv'),'\uFEFF'+['订单号,缺失内容,说明',...issues.map(i=>Object.values(i).map(csvCell).join(','))].join('\r\n'),'utf8')
  }else{
    const book=new ExcelJS.Workbook();book.creator='买家订单导出台';const sheet=book.addWorksheet('订单明细',{views:[{state:'frozen',ySplit:1}]})
    sheet.columns=columns.map(c=>({...c,width:c.key==='title'?38:c.key==='address'?40:c.key==='imageUrl'?16:c.key==='id'||c.key.endsWith('At')?24:18}))
    for(const r of rows)sheet.addRow({...r,imageUrl:r.imageUrl})
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:columns.length}}
    sheet.getRow(1).height=28;sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF193E38'}};c.alignment={vertical:'middle'}})
    for(const c of columns){if(['id','tracking','phone','itemId','sellerId','支付宝交易号','子订单号','SKU ID'].includes(c.key))sheet.getColumn(c.key).numFmt='@';if(['paid','freight','refund','unitPrice'].includes(c.key))sheet.getColumn(c.key).numFmt='0.00'}
    const imageColumn=columns.findIndex(c=>c.key===(task.platform==='pdd'?'embeddedImage':'imageUrl'));const cache=new Map<string,number|Error>()
    if(images&&loadImage&&imageColumn>=0){
      const imageTotal=rows.filter(r=>r.imageUrl).length;let imageCurrent=0
      for(let n=0;n<rows.length;n++){
        const url=rows[n].imageUrl;if(!url)continue
        onProgress?.({phase:'images',current:++imageCurrent,total:imageTotal})
        try{
          let imageId=cache.get(url);if(imageId instanceof Error)throw imageId
          if(imageId===undefined){const b=await loadImage(url);const extension=b[0]===0x89&&b[1]===0x50?'png':b[0]===0xff&&b[1]===0xd8?'jpeg':b.subarray(0,3).toString()==='GIF'?'gif':null;if(!extension)throw new Error('图片格式无法嵌入');imageId=book.addImage({base64:b.toString('base64'),extension});cache.set(url,imageId)}
          sheet.addImage(imageId,{tl:{col:imageColumn+0.1,row:n+1+0.08},ext:{width:78,height:78},editAs:'oneCell'});sheet.getRow(n+2).height=65;sheet.getCell(n+2,imageColumn+1).value=''
        }catch{cache.set(url,new Error('图片获取失败'));issues.push({订单号:String(rows[n].id),缺失内容:'商品图片',说明:'保留图片链接，可稍后重试'})}
      }
    }
    sheet.eachRow((row,n)=>{if(n>1)row.eachCell(c=>{c.alignment={vertical:'middle',wrapText:true}})})
    if(issues.length){const tab=book.addWorksheet('缺项清单');tab.columns=[{header:'订单号',key:'订单号',width:28},{header:'缺失内容',key:'缺失内容',width:30},{header:'说明',key:'说明',width:65}];tab.addRows(issues);tab.getRow(1).font={bold:true}}
    onProgress?.({phase:'write'});await book.xlsx.writeFile(path+'.tmp');await rename(path+'.tmp',path)
  }
  return{path,count:orders.length,missing:issues.length}
}
