import ExcelJS from 'exceljs'
import type {Order,DateSegment,AlibabaOfficialAudit} from '../shared/types'
import {checkRange,inRange,moneyFen} from '../core/values'
export interface AlibabaOfficialReportOptions {account:string;from:string;to:string;segments?:DateSegment[];expectedTotal?:number}
const aliases:Record<string,string[]>={id:['订单编号','订单号'],createdAt:['下单时间','订单创建时间','创建时间'],paidFen:['订单实付款(元)','实付款(元)','实付款','订单实付款'],title:['商品名称','货品名称'],quantity:['数量','购买数量'],unitPriceFen:['单价(元)','单价'],account:['买家会员名','买家账号'],spec:['规格','商品规格'],shop:['卖家公司名','卖家名称','店铺名称'],status:['订单状态','交易状态'],freightFen:['运费(元)','运费'],refundFen:['退款金额(元)','退款金额'],receiver:['收货人姓名','收货人'],phone:['联系手机','联系电话','收货电话'],address:['收货地址'],tracking:['运单号','物流单号','快递单号'],logistics:['物流公司'],remark:['订单备注','买家留言'],paidAt:['付款时间','支付时间'],shippedAt:['发货时间'],completedAt:['完成时间','交易成功时间']}
function date(value:unknown):string {
 if(value instanceof Date)return value.toISOString().slice(0,19).replace('T',' ')
 const m=/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(value).trim());if(!m)throw new Error('报表日期无效或不支持')
 const [,y,mo,d,h='00',mi='00',s='00']=m;const utc=new Date(Date.UTC(+y,+mo-1,+d,+h,+mi,+s));if(utc.getUTCFullYear()!==+y||utc.getUTCMonth()!==+mo-1||utc.getUTCDate()!==+d||+h>23||+mi>59||+s>59)throw new Error('报表日期无效')
 return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')} ${h.padStart(2,'0')}:${mi}:${s}`
}
export async function readAlibabaOfficialReport(buffer:Buffer,options:AlibabaOfficialReportOptions):Promise<{orders:Order[];audit:AlibabaOfficialAudit}>{
 checkRange(options.from,options.to);if(!options.account.trim())throw new Error('必须绑定报表账号');for(const s of options.segments||[]){checkRange(s.from,s.to);if(s.from<options.from||s.to>options.to)throw new Error('所选月份超出任务范围')}
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer as any)
 const audit:AlibabaOfficialAudit={rows:0,uniqueOrders:0,importedOrders:0,outOfRange:0,accountMismatch:0,duplicates:0,missing:0,conflicts:[],warnings:['真实官方表头及导出范围尚未验收；范围完整性待核对'],scopeVerified:false}
 const orders=new Map<string,Order>(),seen=new Set<string>(),allIds=new Set<string>(),creationDates=new Map<string,string>();let recognized=false
 for(const sheet of workbook.worksheets){if(!sheet.rowCount)continue;const header=sheet.getRow(1);const headers:string[]=[];header.eachCell((c,i)=>headers[i]=c.text.trim());const columns=new Map<string,number[]>();for(const [key,names] of Object.entries(aliases)){const indices=headers.flatMap((v,i)=>names.includes(v)?[i]:[]);if(indices.length)columns.set(key,indices)}
 for(const required of ['id','createdAt','paidFen','title'])if(!columns.has(required))throw new Error(`不支持的报表表头，缺少${aliases[required][0]}`);recognized=true
 for(let n=2;n<=sheet.rowCount;n++){const row=sheet.getRow(n);if(!row.hasValues)continue;audit.rows++
 const get=(key:string)=>{const values=(columns.get(key)||[]).map(i=>row.getCell(i)).filter(c=>c.text.trim());if(new Set(values.map(c=>c.text.trim())).size>1)throw new Error(`第${n}行同义字段冲突：${key}`);return values[0]}
 const text=(key:string)=>get(key)?.text.trim()||'';const idCell=get('id');const id=text('id').replace(/^['’]/,'');if(!idCell||!/^\d+$/.test(id)||(typeof idCell.value==='number'&&(!Number.isSafeInteger(idCell.value)||String(idCell.value).length>15))||typeof idCell.value==='object')throw new Error(`第${n}行订单编号精度不可靠或缺失`)
 const createdAt=date(get('createdAt')?.value);allIds.add(id)
 const raw:Record<string,string>={};headers.forEach((h,i)=>{if(h)raw[`${h}${headers.indexOf(h)!==i?`[${i}]`:''}`]=row.getCell(i).text});const fingerprint=JSON.stringify([id,raw]);if(seen.has(fingerprint)){audit.duplicates++;continue}seen.add(fingerprint)
 if(text('account')&&text('account')!==options.account){audit.accountMismatch++;continue}
 const previousDate=creationDates.get(id);if(previousDate&&previousDate!==createdAt)throw new Error(`订单${id}下单时间冲突：${previousDate} / ${createdAt}，整份报表未导入，请核对原始报表`)
 creationDates.set(id,createdAt)
 if(!inRange(createdAt,options.from,options.to)||(options.segments&&!options.segments.some(s=>inRange(createdAt,s.from,s.to)))){audit.outOfRange++;continue}
 const money=(key:string)=>{const value=text(key);if(!value)return null;const amount=moneyFen(value);if(amount===null||amount<0||!/^[¥￥\s]*[\d,]+(?:\.\d{1,2})?\s*元?$/.test(value))throw new Error(`第${n}行金额无效：${key}`);return amount}
 if(!text('title')||!text('paidFen'))throw new Error(`第${n}行缺少商品或订单金额`)
 const quantity=text('quantity')?Number(text('quantity')):null;if(quantity!==null&&(!Number.isFinite(quantity)||quantity<=0))throw new Error(`第${n}行数量无效`)
 const next:Order={platform:'alibaba',account:options.account,id,createdAt,paidAt:'',shippedAt:'',completedAt:'',status:text('status'),shop:text('shop'),sellerId:'',paidFen:money('paidFen'),freightFen:money('freightFen'),refundFen:money('refundFen'),refundStatus:'',receiver:text('receiver'),phone:text('phone'),address:text('address'),logistics:text('logistics'),tracking:text('tracking'),remark:text('remark'),detailUrl:'',items:[],extra:{'官方报表原始行':JSON.stringify([raw])},missing:[],source:'page',capturedAt:new Date().toISOString()}
 for(const key of ['paidAt','shippedAt','completedAt'] as const)if(text(key))next[key]=date(get(key)!.value)
 next.items.push({id:`${id}:${sheet.id}:${n}`,title:text('title'),spec:text('spec'),quantity,unitPriceFen:money('unitPriceFen'),imageUrl:'',productUrl:'',extra:raw})
 const prior=orders.get(id);if(prior){for(const key of ['createdAt','paidAt','shippedAt','completedAt','paidFen','freightFen','refundFen','receiver','phone','address','shop','status','tracking','logistics','remark'] as const){const a=prior[key],b=next[key];if(a!==''&&a!==null&&b!==''&&b!==null&&a!==b){audit.conflicts.push({orderId:id,field:key,values:[String(a),String(b)]});prior.missing.push(`冲突:${key}`);(prior as any)[key]=typeof a==='number'?null:''}else if((a===''||a===null)&&!prior.missing.includes(`冲突:${key}`))(prior as any)[key]=b}prior.items.push(...next.items);prior.extra['官方报表原始行']=JSON.stringify([...JSON.parse(prior.extra['官方报表原始行']),raw])}else orders.set(id,next)
 }
 }
 if(!recognized)throw new Error('未找到受支持的报表表头')
 for(const o of orders.values()){for(const key of ['receiver','phone','address','shop','status'] as const)if(!o[key])o.missing.push(key);audit.missing+=o.missing.length}
 audit.uniqueOrders=allIds.size;audit.importedOrders=orders.size;if(options.expectedTotal!==undefined&&options.expectedTotal!==orders.size)audit.warnings.push(`官方数量${options.expectedTotal}与导入唯一订单数${orders.size}不一致`)
 if(audit.accountMismatch)audit.warnings.push('发现其他账号记录，已排除');if(!columnsAccount(workbook))audit.warnings.push('报表不含买家账号列，账号绑定需由下载流程核验')
 return {orders:[...orders.values()],audit}
}
function columnsAccount(workbook:ExcelJS.Workbook):boolean{return workbook.worksheets.some(s=>{let found=false;s.getRow(1).eachCell(c=>{if(aliases.account.includes(c.text.trim()))found=true});return found})}
