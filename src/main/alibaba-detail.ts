import ExcelJS from 'exceljs'
import type {Order,Task} from '../shared/types'
import {createHash} from 'node:crypto'
import {dateText} from '../core/values'
import {CollectionError} from './collection-errors'

export interface AlibabaDetailRecord {path?:string;gmtCreate?:string;exportStatus?:string}
/** The response timestamp can lag the report's creation second. Bind to the
 * pre-submit baseline and a unique, narrowly timed new record instead of exact seconds.
 * With a server token, compare platform times only; the PC clock can be skewed. */
export function selectAlibabaDetailReport(records:AlibabaDetailRecord[],checkpoint:NonNullable<Task['detailExport']>):AlibabaDetailRecord|undefined{
 const requested=Date.parse(checkpoint.requestedAt),token=checkpoint.token===undefined?undefined:Number(checkpoint.token)
 if(!Array.isArray(checkpoint.previous)||(token===undefined?!Number.isFinite(requested):!/^\d{13}$/.test(checkpoint.token!)||!Number.isFinite(token)))throw new CollectionError('response_structure')
 const candidates=records.filter(record=>{
  if(record.exportStatus!=='SUCCESS'||typeof record.path!=='string'||!record.path||checkpoint.previous.includes(createHash('sha256').update(record.path).digest('hex')))return false
  const stamp=dateText(record.gmtCreate);if(!stamp)return false
  const created=Date.parse(stamp.replace(' ','T')+'+08:00')
  return token===undefined?created>=requested-1000&&created<=requested+30000:Math.abs(created-token)<=5000
 })
 if(candidates.length>1)throw new CollectionError('response_structure')
 return candidates[0]
}

const aliases={id:['订单编号','订单号'],receiver:['收货人姓名','收货人'],address:['收货地址'],phone:['联系手机','联系电话','收货电话'],logistics:['物流公司'],tracking:['运单号','物流单号','快递单号'],remark:['订单备注','买家留言'],paidAt:['付款时间','支付时间'],shippedAt:['发货时间'],completedAt:['完成时间','交易成功时间']} as const
// Read loaded values only: formulas use cached results and hyperlinks use display text.
function reportValue(value:unknown,id=false):string{
 if(value===null||value===undefined)return ''
 if(typeof value==='string')return value
 if(typeof value==='number')return Number.isFinite(value)&&(!id||(Number.isSafeInteger(value)&&Math.abs(value)<1e15))?String(value):''
 if(typeof value==='boolean')return id?'':String(value)
 if(value instanceof Date)return id||!Number.isFinite(value.getTime())?'':value.toISOString().slice(0,19).replace('T',' ')
 if(typeof value==='object'){
  if('richText' in value&&Array.isArray(value.richText))return value.richText.map(part=>reportValue(part.text,id)).join('')
  if('hyperlink' in value&&'text' in value)return reportValue(value.text,id)
  if('formula' in value||'sharedFormula' in value)return 'result' in value?reportValue(value.result,id):''
 }
 return ''
}
function reportCellText(cell:ExcelJS.Cell,id=false):string{
 try{return reportValue(cell.value,id).trim()}catch{throw new CollectionError('detail_report_format')}
}
export async function readAlibabaExport(buffer:Buffer,orders:Order[]):Promise<Order[]>{
 if(!buffer.length)throw new CollectionError('detail_report_empty')
 if(buffer.length>32*1024*1024)throw new CollectionError('detail_report_too_large')
 if((buffer.length<2||buffer.readUInt16LE(0)!==0x4b50)){
  const text=buffer.subarray(0,16384).toString('utf8')
  if(/<html|<!doctype html/i.test(text)&&/请.{0,12}(滑块验证|完成验证|登录)|FAIL_SYS_USER_VALIDATE|nc-container|baxia-dialog/i.test(text))throw new CollectionError('login_or_verification')
  throw new CollectionError('detail_report_format')
 }
 const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(buffer as any)}catch{throw new CollectionError('detail_report_parse')}
 const expected=new Map(orders.map(o=>[o.id,o])),found=new Map<string,Map<string,Set<string>>>();let validHeader=false
 for(const sheet of workbook.worksheets){let columns=new Map<string,number[]>()
  sheet.eachRow(row=>{
   if(!columns.size){const headers=new Map<string,number>();row.eachCell((cell,index)=>headers.set(reportCellText(cell),index));for(const [key,names] of Object.entries(aliases)){const indices=names.filter(n=>headers.has(n)).map(n=>headers.get(n)!);if(indices.length)columns.set(key,indices)}if(!columns.has('id'))columns=new Map();else validHeader=true;return}
   const cell=row.getCell(columns.get('id')![0])
   const id=reportCellText(cell,true).replace(/^['’]/,'');if(!expected.has(id))return
   const values=found.get(id)||new Map<string,Set<string>>();for(const [key,indices] of columns){if(key==='id')continue;const available=indices.map(index=>reportCellText(row.getCell(index))).filter(Boolean);for(const value of key==='remark'?available:available.slice(0,1)){const set=values.get(key)||new Set<string>();set.add(value);values.set(key,set)}}found.set(id,values)
  })
 }
 if(!validHeader)throw new CollectionError('detail_report_format')
 if(orders.length&&!found.size)throw new CollectionError('detail_report_no_match')
 const result:Order[]=[]
 for(const [id,values] of found){const original=expected.get(id)!,next={...original,extra:{...original.extra}};let recognized=0
  for(const key of ['receiver','address','phone','logistics','tracking','remark'] as const){const v=values.get(key);if(v?.size){if(['receiver','address','phone'].includes(key)&&v.size!==1)continue;next[key]=[...v].join('\n');recognized++}}
  for(const key of ['paidAt','shippedAt','completedAt'] as const){const v=values.get(key);if(v?.size===1){const value=dateText([...v][0]);if(value){next[key]=value;recognized++}}}
  if(recognized){next.detailReadAt=new Date().toISOString();next.capturedAt=next.detailReadAt;next.extra['详情读取状态']='已读取1688官方导出字段，缺项仍待核对';result.push(next)}
 }
 if(found.size&&!result.length)throw new CollectionError('detail_report_no_fields')
 return result
}
export function alibabaExportUrl(raw:string):string{let url:URL;try{url=new URL(raw)}catch{throw new CollectionError('response_structure')};if(url.protocol!=='https:'||url.hostname!=='trade.1688.com'||url.username||url.password||url.port||!url.pathname.startsWith('/tradeorder-1688/')||!url.pathname.endsWith('.xlsx'))throw new CollectionError('response_structure');return url.href}
