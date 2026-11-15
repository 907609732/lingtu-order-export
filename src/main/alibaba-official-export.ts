import {createHash} from 'node:crypto'
import {checkRange} from '../core/values'
export interface OfficialRange {from:string;to:string}
export interface OfficialCheckpoint {phase:'search'|'submit'|'waiting'|'download'|'import'|'complete';segmentIndex:number;rangeSignature?:string;accountKey?:string;submission?:'prepared'|'unknown'|'accepted';token?:string;baseline?:string[];expectedTotal?:number;audit?:unknown;filePath?:string;fileSha256?:string}
export interface OfficialRecord extends OfficialRange {token:string;total:number;url:string;filename:string;accountKey?:string}
export interface OfficialDownload {bytes:Buffer;sha256?:string}
export interface OfficialDriver {search(range:OfficialRange):Promise<OfficialRange&{scope:string;total:number}>;submit(beforeClick?:()=>void|Promise<void>):Promise<OfficialRange&{token:string;total:number}>;record(token:string):Promise<OfficialRecord>;reconcile?(range:OfficialRange,total:number,baseline:string[]):Promise<OfficialRange&{token:string;total:number}>}
export interface OfficialOptions {ranges:OfficialRange[];account():Promise<string>;checkpoint():OfficialCheckpoint|undefined;save(value:OfficialCheckpoint):void;download(record:OfficialRecord):Promise<Buffer|OfficialDownload>;import(bytes:Buffer,range:OfficialRange,total:number):Promise<unknown>;stopped?():boolean}
/** The driver must establish visible official search scope and record ownership. No API fallback. */
export async function runAlibabaOfficialExport(driver:OfficialDriver,options:OfficialOptions):Promise<void>{
 const ranges=options.ranges.map(({from,to})=>({from:from.trim(),to:to.trim()})).sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to))
 if(!ranges.length)throw Error('官方导出范围为空')
 for(let i=0;i<ranges.length;i++){checkRange(ranges[i].from,ranges[i].to);if(i&&ranges[i].from<=ranges[i-1].to)throw Error('官方导出范围重复或重叠')}
 let state:OfficialCheckpoint=options.checkpoint()||{phase:'search',segmentIndex:0}
 const pristine=state.phase==='search'&&state.segmentIndex===0&&!state.accountKey&&!state.submission&&!state.token&&!state.audit&&!state.expectedTotal&&!state.filePath
 if(!state.rangeSignature&&!pristine)throw Error('官方导出断点缺少范围绑定，不能安全继续；请新建任务')
 if(!Number.isSafeInteger(state.segmentIndex)||state.segmentIndex<0||state.segmentIndex>ranges.length||((state.phase==='complete')!==(state.segmentIndex===ranges.length)))throw Error('官方导出断点进度无效，不能安全继续')
 const save=(patch:Partial<OfficialCheckpoint>)=>{state={...state,baseline:options.checkpoint()?.baseline??state.baseline,...patch};options.save(state)}
 const guard=async()=>{if(options.stopped?.())throw Error('官方导出已暂停，断点已保留');const key=await options.account();if(options.stopped?.())throw Error('官方导出已暂停，断点已保留');if(!key||state.accountKey&&key!==state.accountKey)throw Error('账号已变化或尚未登录，停止官方导出');if(!state.accountKey)save({accountKey:key})}
 await guard()
 const signature=createHash('sha256').update(JSON.stringify({accountKey:state.accountKey,ranges})).digest('hex')
 if(state.rangeSignature&&state.rangeSignature!==signature)throw Error('官方导出断点与账号或所选范围不匹配，请新建任务')
 if(!state.rangeSignature)save({rangeSignature:signature})
 if(state.phase==='complete')return
 if(state.submission==='unknown')throw Error('上次提交结果未知，请先在官方导出记录中人工确认；为避免重复申请及误认他人申请，未自动继续或再次提交')
 for(let index=state.segmentIndex;index<ranges.length;index++){
  const range=ranges[index]
  await guard()
  if(state.submission!=='accepted'){
   save({phase:'search',segmentIndex:index})
   const search=await driver.search(range)
   await guard()
   if(search.from!==range.from||search.to!==range.to||!['all-results','account-report'].includes(search.scope)||!Number.isSafeInteger(search.total)||search.total<0)throw Error('无法验证官方完整搜索范围或账号报表模式，已停止且未提交导出')
   await guard();save({phase:'submit',submission:'prepared',expectedTotal:search.total})
   // Save before the click. A crash or rejected DOM promise is never permission to click again.
   const submitted=await driver.submit(async()=>{await guard();save({submission:'unknown'})})
   if(!submitted.token||submitted.from!==range.from||submitted.to!==range.to||submitted.total!==search.total)throw Error('官方导出申请归属不明确，提交结果未知，停止重复申请')
   save({phase:'waiting',submission:'accepted',token:submitted.token})
  }
  await guard()
  const record=await driver.record(state.token!)
  await guard()
  if(record.token!==state.token||record.from!==range.from||record.to!==range.to||record.total!==state.expectedTotal)throw Error('官方导出记录归属或范围不匹配，未下载历史文件')
  // A record row that names another account is never this task's file, even when token and range look right.
  if(record.accountKey&&record.accountKey!==state.accountKey)throw Error('官方导出记录属于其他账号，已停止且未下载')
  await guard();save({phase:'download'})
  const downloaded=await options.download(record)
  const bytes=Buffer.isBuffer(downloaded)?downloaded:downloaded.bytes
  const fileSha256=Buffer.isBuffer(downloaded)?undefined:downloaded.sha256
  if(!bytes?.length)throw Error('官方报表内容为空，未导入')
  await guard();save({phase:'import',...(fileSha256?{fileSha256}:{})})
  const audit=await options.import(bytes,range,record.total)
  await guard();save({audit,segmentIndex:index+1,phase:index+1===ranges.length?'complete':'search',submission:undefined,token:undefined,expectedTotal:undefined,filePath:undefined,baseline:undefined})
 }
}
