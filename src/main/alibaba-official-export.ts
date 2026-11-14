export interface OfficialRange {from:string;to:string}
export interface OfficialCheckpoint {phase:'search'|'submit'|'waiting'|'download'|'import'|'complete';segmentIndex:number;accountKey?:string;submission?:'prepared'|'unknown'|'accepted';token?:string;expectedTotal?:number;audit?:unknown;filePath?:string}
export interface OfficialRecord extends OfficialRange {token:string;total:number;url:string;filename:string}
export interface OfficialDriver {search(range:OfficialRange):Promise<OfficialRange&{scope:string;total:number}>;submit():Promise<OfficialRange&{token:string;total:number}>;record(token:string):Promise<OfficialRecord>}
export interface OfficialOptions {ranges:OfficialRange[];account():Promise<string>;checkpoint():OfficialCheckpoint|undefined;save(value:OfficialCheckpoint):void;download(record:OfficialRecord):Promise<Buffer>;import(bytes:Buffer,range:OfficialRange,total:number):Promise<unknown>;stopped?():boolean}
/** The driver must establish visible official search scope and record ownership. No API fallback. */
export async function runAlibabaOfficialExport(driver:OfficialDriver,options:OfficialOptions):Promise<void>{
 let state:OfficialCheckpoint=options.checkpoint()||{phase:'search',segmentIndex:0}
 const save=(patch:Partial<OfficialCheckpoint>)=>{state={...state,...patch};options.save(state)}
 const guard=async()=>{if(options.stopped?.())throw Error('官方导出已暂停，断点已保留');const key=await options.account();if(!key||state.accountKey&&key!==state.accountKey)throw Error('账号已变化或尚未登录，停止官方导出');if(!state.accountKey)save({accountKey:key})}
 await guard()
 if(state.phase==='complete')return
 if(state.submission==='unknown')throw Error('上次提交结果未知，请先在官方导出记录中确认；为避免重复申请，未再次提交')
 for(let index=state.segmentIndex;index<options.ranges.length;index++){
  const range=options.ranges[index]
  await guard()
  if(state.submission!=='accepted'){
   save({phase:'search',segmentIndex:index})
   const search=await driver.search(range)
   if(search.from!==range.from||search.to!==range.to||search.scope!=='all-results'||!Number.isSafeInteger(search.total)||search.total<0)throw Error('无法验证官方完整搜索范围、日期及总数，已停止且未提交导出')
   await guard();save({phase:'submit',submission:'prepared',expectedTotal:search.total})
   // Save before the click. A crash or rejected DOM promise is never permission to click again.
   save({submission:'unknown'})
   const submitted=await driver.submit()
   if(!submitted.token||submitted.from!==range.from||submitted.to!==range.to||submitted.total!==search.total)throw Error('官方导出申请归属不明确，提交结果未知，停止重复申请')
   save({phase:'waiting',submission:'accepted',token:submitted.token})
  }
  await guard()
  const record=await driver.record(state.token!)
  if(record.token!==state.token||record.from!==range.from||record.to!==range.to||record.total!==state.expectedTotal)throw Error('官方导出记录归属或范围不匹配，未下载历史文件')
  await guard();save({phase:'download'})
  const bytes=await options.download(record)
  await guard();save({phase:'import'})
  const audit=await options.import(bytes,range,record.total)
  await guard();save({audit,segmentIndex:index+1,phase:index+1===options.ranges.length?'complete':'search',submission:undefined,token:undefined,expectedTotal:undefined,filePath:undefined})
 }
}
