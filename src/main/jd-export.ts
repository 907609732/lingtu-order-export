import ExcelJS from 'exceljs'
import type {Order} from '../shared/types'
import {dateText,inRange} from '../core/values'
export class JdExportError extends Error {}
export interface JdExportScope {from:string;to:string;pageOrderIds?:string[];year?:number}
export interface JdExportResult {orders:Order[];matched:number;updated:number}
const columns={id:'订单号',createdAt:'订单时间',receiver:'收货人姓名',phone:'收货人电话',address:'收货地址',logistics:'物流公司',tracking:'物流单号'} as const
const detailFields=['receiver','phone','address','logistics','tracking'] as const
const missingLabels={receiver:'收货人',phone:'联系电话',address:'收货地址',logistics:'物流公司',tracking:'物流单号'} as const
const text=(value:string)=>value.trim().replace(/^['’]/,'')
const available=(value:string)=>!!value&&!/^(?:-+|无|未提供|null|undefined)$/i.test(value)
export async function readJdExport(buffer:Buffer,orders:Order[],scope:JdExportScope):Promise<JdExportResult>{
 if(buffer.length>32*1024*1024)throw new JdExportError('京东官方导出文件超过32MB，请缩小日期范围')
 const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(buffer as any)}catch{throw new JdExportError('京东官方导出文件无法解析，请重试当前页')}
 const expected=new Map(orders.filter(o=>o.platform==='jd').map(o=>[o.id,o])),page=scope.pageOrderIds?new Set(scope.pageOrderIds):undefined
 const groups=new Map<string,{dates:Set<string>;values:Map<string,Set<string>>}>();let headerFound=false
 for(const sheet of workbook.worksheets){let indices:Record<string,number>|undefined
  sheet.eachRow(row=>{
   if(!indices){const headers=new Map<string,number>();row.eachCell((cell,index)=>headers.set(cell.text.trim(),index));if(!Object.values(columns).every(name=>headers.has(name)))return;indices=Object.fromEntries(Object.entries(columns).map(([key,name])=>[key,headers.get(name)!]));headerFound=true;return}
   const idCell=row.getCell(indices.id),id=text(idCell.text);if(!id)return
   if(typeof idCell.value==='number'&&!Number.isSafeInteger(idCell.value)||!/^\d{8,40}$/.test(id))throw new JdExportError('京东官方导出的订单号无效或已丢失精度，未写入本页')
   if(page&&!page.has(id))throw new JdExportError('京东官方导出文件与当前页订单不一致，请重试当前页')
   const createdAt=dateText(text(row.getCell(indices.createdAt).text));if(!createdAt||scope.year&&Number(createdAt.slice(0,4))!==scope.year)throw new JdExportError('京东官方导出日期与所选年份不一致，未写入本页')
   const group=groups.get(id)||{dates:new Set<string>(),values:new Map<string,Set<string>>()};group.dates.add(createdAt)
   for(const field of detailFields){const value=text(row.getCell(indices[field]).text);if(available(value)){const set=group.values.get(field)||new Set<string>();set.add(value);group.values.set(field,set)}}groups.set(id,group)
  })
 }
 if(!headerFound)throw new JdExportError('未识别京东官方导出表头，请确认下载的是订单文件')
 if(page&&([...page].some(id=>!groups.has(id))||page.size!==groups.size))throw new JdExportError('京东官方导出文件未覆盖当前页全部订单，请重试当前页')
 const result:JdExportResult={orders:[],matched:0,updated:0}
 for(const [id,group] of groups){const before=expected.get(id);if(!before)continue
  if(group.dates.size!==1)throw new JdExportError('京东官方导出同一订单日期冲突，未写入本页')
  const createdAt=[...group.dates][0];if(!inRange(createdAt,scope.from,scope.to))continue
  if(before.createdAt.slice(0,10)!==createdAt.slice(0,10))throw new JdExportError('京东官方导出订单日期与任务记录不一致，未写入本页')
  const next={...before,items:before.items,extra:{...before.extra},missing:[...before.missing]};let changed=false
  for(const field of detailFields){const values=group.values.get(field);if(!next[field]&&values?.size===1){next[field]=[...values][0];changed=true}if(!next[field]&&!next.missing.includes(missingLabels[field]))next.missing.push(missingLabels[field])}
  const now=new Date().toISOString();next.detailReadAt=now;next.capturedAt=now;next.detailState=before.detailState||'pending';next.extra['详情读取状态']='已读取京东官方导出字段，缺项仍待核对'
  if([...group.values.values()].some(values=>values.size>1))next.extra['京东官方导出核对说明']='同一订单存在冲突字段，冲突值未覆盖已有记录，请人工核对'
  result.orders.push(next);result.matched++;if(changed)result.updated++
 }
 return result
}

// Serialized only into the official order page; clicks are deliberately limited
// to the two official export actions, never generic confirmation buttons.
export function clickJdExportAction(action:'open'|'download'):{clicked:boolean;blocked:boolean}{
 const body=document.body?.innerText||''
 if(/请先登录|扫码登录|安全验证|请完成.*验证|请拖动.*滑块/.test(body)||/登录|验证/.test(document.title)||location.hostname!=='order.jd.com')return {clicked:false,blocked:true}
 const wanted=action==='open'?'导出订单':'下载订单'
 const candidates=Array.from(document.querySelectorAll('button,a,[role="button"],span,div')).filter(el=>(el as HTMLElement).offsetParent&&el.textContent?.trim()===wanted&&!el.hasAttribute('disabled')&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(String(el.className)))
 const target=candidates.find(el=>!Array.from(el.children).some(child=>child.textContent?.trim()===wanted)) as HTMLElement|undefined
 if(target){target.click();return {clicked:true,blocked:false}}return {clicked:false,blocked:false}
}
