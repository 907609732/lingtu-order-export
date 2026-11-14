import type {Order,Task} from '../shared/types'
import {readJdExport,JdExportError} from './jd-export'
import {CollectionError} from './collection-errors'
export interface JdExportPage {modern:boolean;selectedRange:string;page:number;totalPages:number;hasNext:boolean;empty:boolean;blocked:boolean;rows:{id:string}[];signature:string}
export function validateJdExportPage(snap:JdExportPage,year:number,page:number,currentYear:number):void{
 if(snap?.blocked)throw new CollectionError('login_or_verification')
 if(!snap||!snap.modern||snap.selectedRange!==(year===currentYear?'今年内订单':`${year}年订单`)||!Array.isArray(snap.rows)||!snap.empty&&(snap.page!==page||!Number.isSafeInteger(snap.totalPages)||snap.totalPages<page||snap.hasNext!==(page<snap.totalPages))||!snap.rows.length&&!snap.empty)throw new JdExportError('京东官方导出前的年份或页码未就绪，请检查订单列表后继续')
 if(new Set(snap.rows.map(row=>row.id)).size!==snap.rows.length)throw new JdExportError('京东当前页订单重复，未下载或推进本页，请稍后重试')
}
export async function collectJdExportPages(options:{
 from:string;to:string;currentYear:number;checkpoint?:Task['jdDetailExport'];existing:()=>Order[];stopped:()=>boolean;checkAccount:()=>Promise<void>
 load:(year:number,page:number)=>Promise<JdExportPage>;download:(snapshot:JdExportPage)=>Promise<Buffer>
 commit:(orders:Order[],checkpoint:NonNullable<Task['jdDetailExport']>)=>void
 progress:(event:{year:number;page:number;matched:number;updated:number;total:number})=>void
 stage?:(year:number,page:number)=>void
}):Promise<{matched:number;updated:number}>{
 const maxYear=Math.min(Number(options.to.slice(0,4)),options.currentYear),minYear=Number(options.from.slice(0,4)),checkpoint=options.checkpoint
 if(checkpoint&&(!Number.isSafeInteger(checkpoint.year)||checkpoint.year>maxYear||checkpoint.year<minYear-1||!Number.isSafeInteger(checkpoint.nextPage)||checkpoint.nextPage<1||checkpoint.nextPage>100000))throw new JdExportError('京东官方导出续跑页码无效，请重新建立任务')
 let updated=checkpoint?.updated||0
 const matched=()=>options.existing().filter(order=>order.extra['详情读取状态']?.includes('京东官方导出')).length
 for(let year=checkpoint?.year??maxYear;year>=minYear&&!options.stopped();year--){let signature=''
  for(let page=year===checkpoint?.year?checkpoint.nextPage:1,reads=0;reads<1000&&!options.stopped();page++,reads++){
   options.stage?.(year,page);await options.checkAccount();if(options.stopped())break
   const snap=await options.load(year,page);if(options.stopped())break;await options.checkAccount();validateJdExportPage(snap,year,page,options.currentYear)
   if(snap.rows.length&&snap.signature===signature)throw new JdExportError('京东订单列表重复返回上一页，未推进导出页码，请稍后继续')
   signature=snap.signature
   let rows:Order[]=[],count=0
   if(!snap.empty){await options.checkAccount();const buffer=await options.download(snap);if(options.stopped())break;await options.checkAccount();const result=await readJdExport(buffer,options.existing(),{from:options.from,to:options.to,year,pageOrderIds:snap.rows.map(row=>row.id)});if(options.stopped())break;await options.checkAccount();rows=result.orders;count=result.updated}
   if(options.stopped())break
   const next=snap.hasNext&&!snap.empty?{year,nextPage:page+1,updated:updated+count}:{year:year-1,nextPage:1,updated:updated+count}
   options.commit(rows,next);updated+=count;options.progress({year,page,matched:matched(),updated,total:options.existing().length})
   if(!snap.hasNext||snap.empty)break
   if(reads===999)throw new JdExportError('京东本年度达到分页上限，已有结果保留，可继续官方导出')
  }
 }
 return {matched:matched(),updated}
}
