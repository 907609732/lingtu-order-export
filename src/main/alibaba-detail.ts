import ExcelJS from 'exceljs'
import type {Order} from '../shared/types'
import {dateText} from '../core/values'
import {CollectionError} from './collection-errors'

const aliases={id:['订单编号','订单号'],receiver:['收货人姓名','收货人'],address:['收货地址'],phone:['联系手机','联系电话','收货电话'],logistics:['物流公司'],tracking:['运单号','物流单号','快递单号'],remark:['订单备注','买家留言'],paidAt:['付款时间','支付时间'],shippedAt:['发货时间'],completedAt:['完成时间','交易成功时间']} as const
export async function readAlibabaExport(buffer:Buffer,orders:Order[]):Promise<Order[]>{
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as any)
 const expected=new Map(orders.map(o=>[o.id,o])),found=new Map<string,Map<string,Set<string>>>();let validHeader=false
 for(const sheet of workbook.worksheets){let columns=new Map<string,number[]>()
  sheet.eachRow(row=>{
   if(!columns.size){const headers=new Map<string,number>();row.eachCell((cell,index)=>headers.set(cell.text.trim(),index));for(const [key,names] of Object.entries(aliases)){const indices=names.filter(n=>headers.has(n)).map(n=>headers.get(n)!);if(indices.length)columns.set(key,indices)}if(!columns.has('id'))columns=new Map();else validHeader=true;return}
   const cell=row.getCell(columns.get('id')![0]);if(typeof cell.value==='number'&&!Number.isSafeInteger(cell.value))return
   const id=cell.text.trim().replace(/^['’]/,'');if(!expected.has(id))return
   const values=found.get(id)||new Map<string,Set<string>>();for(const [key,indices] of columns){if(key==='id')continue;const available=indices.map(index=>row.getCell(index).text.trim()).filter(Boolean);for(const value of key==='remark'?available:available.slice(0,1)){const set=values.get(key)||new Set<string>();set.add(value);values.set(key,set)}}found.set(id,values)
  })
 }
 if(!validHeader)throw new CollectionError('response_structure')
 const result:Order[]=[]
 for(const [id,values] of found){const original=expected.get(id)!,next={...original,extra:{...original.extra}};let recognized=0
  for(const key of ['receiver','address','phone','logistics','tracking','remark'] as const){const v=values.get(key);if(v?.size){if(['receiver','address','phone'].includes(key)&&v.size!==1)continue;next[key]=[...v].join('\n');recognized++}}
  for(const key of ['paidAt','shippedAt','completedAt'] as const){const v=values.get(key);if(v?.size===1){const value=dateText([...v][0]);if(value){next[key]=value;recognized++}}}
  if(recognized){next.detailReadAt=new Date().toISOString();next.capturedAt=next.detailReadAt;next.extra['详情读取状态']='已读取1688官方导出字段，缺项仍待核对';result.push(next)}
 }
 return result
}
export function alibabaExportUrl(raw:string):string{let url:URL;try{url=new URL(raw)}catch{throw new CollectionError('response_structure')};if(url.protocol!=='https:'||url.hostname!=='trade.1688.com'||url.username||url.password||url.port||!url.pathname.startsWith('/tradeorder-1688/')||!url.pathname.endsWith('.xlsx'))throw new CollectionError('response_structure');return url.href}
