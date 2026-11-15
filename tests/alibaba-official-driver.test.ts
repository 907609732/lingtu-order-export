import {it,expect} from 'vitest'
import {createAlibabaOfficialDriver,decodeOfficialToken,encodeOfficialToken,officialFilename} from '../src/main/alibaba-official-page'
const range={from:'2026-10-01',to:'2026-10-31'}
const fast={submitPollMs:1,recordPollMs:1,submitAttempts:3,recordAttempts:3,settleMs:1}
type Kind='install'|'probe'|'state'|'coords'|'pick'|'range'|'list'|'total'|'search'|'records'|'now'|'dialog'|'liststate'|'unknown'
const coords={select:{x:1,y:1},dateStart:{x:1,y:1},dateEnd:{x:1,y:1},search:{x:1,y:1},export:{x:1,y:1},generate:{x:1,y:1},viewRecords:null,refresh:null}
function classify(code:string):Kind{
 if(code.includes('window.__od.v===1'))return 'install'
 if(code.includes('hasDateSelect'))return 'probe'
 if(code.includes('var c=od.center')||code.includes('scrollIntoView'))return 'coords'
 if(code.includes('dropdown:!!(s&&'))return 'state'
 if(code.includes('ui-date-prev'))return 'pick'
 if(code.includes('startdate'))return 'range'
 if(code.includes('dates.slice(0,6)'))return 'list'
 if(code.includes('total:Number(match[1])'))return 'total'
 if(code.includes('共('))return 'search'
 if(code.includes('export-record-tr'))return 'records'
 if(code.includes('padStart'))return 'now'
 if(code.includes("byText('生成新报表')"))return 'dialog'
 if(code.includes('table:table,dialog:dialog'))return 'liststate'
 return 'unknown'
}
function makeDriver(handler:(kind:Kind)=>unknown){
 const kinds:Kind[]=[];const clicks:{x:number;y:number}[]=[]
 const contents={executeJavaScript:async(code:string)=>{const kind=classify(code);kinds.push(kind);return handler(kind)},click:async(x:number,y:number)=>{clicks.push({x,y})}}
 return {contents,kinds,clicks}
}
const healthy=(kind:Kind)=>{
 if(kind==='probe')return {verification:false,hasDateSelect:true,hasSearch:true,hasExport:true,activeTab:'全部订单'}
 if(kind==='state')return {dropdown:true,panel:false}
 if(kind==='coords')return {x:1,y:1}
 if(kind==='pick')return {ok:true}
 if(kind==='range')return {found:true,start:range.from,end:range.to,label:range.from+' 至 '+range.to}
 if(kind==='list')return {dates:[range.from]}
 if(kind==='total')return {total:24}
 if(kind==='search')return {total:24,activeTab:'全部订单'}
 if(kind==='dialog')return {generate:{x:1,y:1}}
 if(kind==='now')return {now:'2026-11-15 15:17:00'}
 if(kind==='liststate')return {table:false,dialog:true}
 return null
}
it('encodes and decodes the task token, rejecting malformed values',()=>{
 const token=encodeOfficialToken({from:range.from,to:range.to,total:24,appliedAt:'2026-11-15 16:02:11'})
 expect(decodeOfficialToken(token)).toEqual({from:range.from,to:range.to,total:24,appliedAt:'2026-11-15 16:02:11'})
 for(const bad of ['','a~b~c~d','2026-10-01~2026-10-31~x~2026-11-15 16:02:11','2026-10-01~2026-10-31~24','2026-10-01~2026-10-31~24~2026-11-15'])expect(decodeOfficialToken(bad)).toBeNull()
})
it('accepts only xlsx report links and derives the filename',()=>{
 expect(officialFilename('https://trade.1688.com/tradeorder-1688/20261115/29/27838371_1794686189000.xlsx?Expires=1&Signature=x')).toBe('27838371_1794686189000.xlsx')
 expect(officialFilename('https://trade.1688.com/a/b.zip')).toBe('')
 expect(officialFilename('not a url')).toBe('')
})
it('drives a real mouse through the date picker and reads the all-results total',async()=>{
 const {contents,kinds,clicks}=makeDriver(healthy)
 const driver=createAlibabaOfficialDriver(contents,fast)
 await expect(driver.search(range)).resolves.toEqual({from:range.from,to:range.to,scope:'all-results',total:24})
 expect(clicks.length).toBe(2)
 expect(kinds).toContain('pick');expect(kinds).not.toContain('search');expect(kinds).toContain('total')
})
it('pauses with a verification error when the live page asks for login or a slider',async()=>{
 const {contents}=makeDriver(kind=>kind==='probe'?{verification:true,hasDateSelect:true,hasSearch:true,hasExport:true,activeTab:''}:null)
 await expect(createAlibabaOfficialDriver(contents,fast).search(range)).rejects.toMatchObject({category:'login_or_verification'})
})
it('refuses a page that is not on the all-orders tab or has an unexpected structure',async()=>{
 const wrongTab=makeDriver(kind=>kind==='probe'?{verification:false,hasDateSelect:true,hasSearch:true,hasExport:true,activeTab:'待付款'}:null)
 await expect(createAlibabaOfficialDriver(wrongTab.contents,fast).search(range)).rejects.toThrow(/全部订单/)
 const missing=makeDriver(kind=>kind==='probe'?{verification:false,hasDateSelect:true,hasSearch:false,hasExport:true,activeTab:''}:null)
 await expect(createAlibabaOfficialDriver(missing.contents,fast).search(range)).rejects.toThrow(/结构/)
})
it('refuses a search whose date range or total cannot be confirmed',async()=>{
 const badPick=makeDriver(kind=>kind==='pick'?{error:'mismatch:2026-10-02'}:healthy(kind))
 await expect(createAlibabaOfficialDriver(badPick.contents,fast).search(range)).rejects.toThrow(/开始日期/)
 const noTotal=makeDriver(kind=>kind==='total'?{total:null}:healthy(kind))
 await expect(createAlibabaOfficialDriver(noTotal.contents,fast).search(range)).rejects.toThrow(/总数/)
})
it('refuses to drive a page without real mouse input',async()=>{
 const contents={executeJavaScript:async(code:string)=>classify(code)==='install'?'installed':healthy(classify(code))}
 await expect(createAlibabaOfficialDriver(contents,fast).search(range)).rejects.toThrow(/真实鼠标点击/)
})
it('submits through the export dialog and returns a token carrying the range',async()=>{
 let reads=0
 const {contents}=makeDriver(kind=>{
  if(kind==='records'){reads++;return {rows:reads===1?[{applied:'2026-11-15 03:56:29',finished:'2026-11-15 03:56:45',status:'导出成功',href:'',filename:''}]:[{applied:'2026-11-15 16:02:11',finished:'',status:'导出中',href:'',filename:''}]}}
  return healthy(kind)
 })
 const driver=createAlibabaOfficialDriver(contents,fast)
 await driver.search(range)
 const submitted=await driver.submit()
 expect(submitted.from).toBe(range.from);expect(submitted.total).toBe(24)
 expect(decodeOfficialToken(submitted.token)).toEqual({from:range.from,to:range.to,total:24,appliedAt:'2026-11-15 16:02:11'})
})
it('never resolves a submission whose new record never appears',async()=>{
 const {contents}=makeDriver(kind=>kind==='records'?{rows:[{applied:'2026-11-15 03:56:29',finished:'',status:'导出成功',href:'',filename:''}]}:healthy(kind))
 const driver=createAlibabaOfficialDriver(contents,fast)
 await driver.search(range)
 await expect(driver.submit()).rejects.toThrow(/提交结果未知/)
})
it('refuses to submit before a verified search',async()=>{
 const {contents}=makeDriver(healthy)
 await expect(createAlibabaOfficialDriver(contents,fast).submit()).rejects.toThrow(/尚未完成搜索/)
})
it('waits for the report to finish and returns only the task-owned xlsx link',async()=>{
 const href='https://trade.1688.com/tradeorder-1688/20261115/29/27838371_1794686189000.xlsx?Expires=1797278204&Signature=x'
 let reads=0
 const {contents}=makeDriver(kind=>{
  if(kind==='records'){reads++;return {rows:[{applied:'2026-11-15 16:02:11',finished:reads===1?'':'2026-11-15 16:02:26',status:reads===1?'导出中':'导出成功',href:reads===1?'':href,filename:''}]}}
  return healthy(kind)
 })
 const token=encodeOfficialToken({from:range.from,to:range.to,total:24,appliedAt:'2026-11-15 16:02:11'})
 const record=await createAlibabaOfficialDriver(contents,fast).record(token)
 expect(record).toEqual({token,from:range.from,to:range.to,total:24,url:href,filename:'27838371_1794686189000.xlsx'})
 expect(reads).toBeGreaterThan(1)
})
it('stops on a failed record, a missing record and a non-xlsx link',async()=>{
 const token=encodeOfficialToken({from:range.from,to:range.to,total:24,appliedAt:'2026-11-15 16:02:11'})
 const failed=makeDriver(kind=>kind==='records'?{rows:[{applied:'2026-11-15 16:02:11',finished:'',status:'导出失败',href:'',filename:''}]}:healthy(kind))
 await expect(createAlibabaOfficialDriver(failed.contents,fast).record(token)).rejects.toThrow(/生成失败/)
 const missing=makeDriver(kind=>kind==='records'?{rows:[]}:healthy(kind))
 await expect(createAlibabaOfficialDriver(missing.contents,fast).record(token)).rejects.toThrow(/超时/)
 const zip=makeDriver(kind=>kind==='records'?{rows:[{applied:'2026-11-15 16:02:11',finished:'',status:'导出成功',href:'https://trade.1688.com/a/b.zip',filename:'b.zip'}]}:healthy(kind))
 await expect(createAlibabaOfficialDriver(zip.contents,fast).record(token)).rejects.toThrow(/xlsx/)
 await expect(createAlibabaOfficialDriver(zip.contents,fast).record('bad-token')).rejects.toThrow(/标识无效/)
})
it('checks cancellation before any real input',async()=>{
 const {contents,clicks}=makeDriver(healthy)
 const stop=new AbortController();stop.abort()
 await expect(createAlibabaOfficialDriver(contents,{...fast,signal:stop.signal} as any).search(range)).rejects.toThrow()
 expect(clicks).toHaveLength(0)
})
it('rejects nonfinite real mouse coordinates',async()=>{
 const {contents,clicks}=makeDriver(kind=>kind==='coords'?{x:NaN,y:1}:healthy(kind))
 await expect(createAlibabaOfficialDriver(contents,fast).search(range)).rejects.toThrow()
 expect(clicks).toHaveLength(0)
})
it('checks verification during record polling',async()=>{
 let reads=0
 const {contents}=makeDriver(kind=>kind==='probe'?{...healthy(kind) as object,verification:reads>0}:kind==='records'?(reads++,{rows:[]}):healthy(kind))
 const token=encodeOfficialToken({...range,total:24,appliedAt:'2026-11-15 16:02:11'})
 await expect(createAlibabaOfficialDriver(contents,fast).record(token)).rejects.toMatchObject({category:'login_or_verification'})
})
it('reconciles unknown submission from baseline without generating another report',async()=>{
 const old='2099-01-01 00:00:00',fresh='2020-01-01 00:00:00'
 const {contents,clicks}=makeDriver(kind=>kind==='records'?{rows:[{applied:old},{applied:fresh}]}:healthy(kind))
 const driver=createAlibabaOfficialDriver(contents,fast)
 const result=await driver.reconcile!(range,24,[old])
 expect(decodeOfficialToken(result.token)?.appliedAt).toBe(fresh)
 // Only opening the records list is allowed; there is no submission or search.
 expect(clicks.length).toBeLessThanOrEqual(2)
})
it('rejects multiple new records and duplicate timestamps rather than choosing newest',async()=>{
 for(const dates of [['2026-11-15 16:02:11','2026-11-15 16:02:12'],['2026-11-15 16:02:11','2026-11-15 16:02:11']]){
  const {contents}=makeDriver(kind=>kind==='records'?{rows:dates.map(applied=>({applied}))}:healthy(kind))
  await expect(createAlibabaOfficialDriver(contents,fast).reconcile!(range,24,[])).rejects.toThrow(/不唯一|重复/)
 }
})
it('persists baseline before generating and stops when the account guard changes at the hook',async()=>{
 const old='2026-11-15 16:02:11';let block=false;let saved:string[]=[]
 const {contents,clicks}=makeDriver(kind=>kind==='records'?{rows:[{applied:old}]}:healthy(kind))
 const driver=createAlibabaOfficialDriver(contents,{...fast,guard:async()=>{if(block)throw Error('账号变化')},beforeSubmit:async baseline=>{saved=baseline;block=true}})
 await driver.search(range)
 let markedUnknown=false
 await expect(driver.submit(()=>{markedUnknown=true})).rejects.toThrow(/账号变化/)
 expect(markedUnknown).toBe(false)
 expect(saved).toEqual([old]);expect(clicks).toHaveLength(4)
})
it('rejects duplicate timestamp records and a changed stable href on resume',async()=>{
 const appliedAt='2026-11-15 16:02:11',href='https://fixture.invalid/a.xlsx'
 const token=encodeOfficialToken({...range,total:24,appliedAt,href})
 for(const rows of [[{applied:appliedAt},{applied:appliedAt}],[{applied:appliedAt,href:'https://fixture.invalid/b.xlsx'}]]){
  const {contents}=makeDriver(kind=>kind==='records'?{rows}:healthy(kind))
  await expect(createAlibabaOfficialDriver(contents,fast).record(token)).rejects.toThrow(/不明确/)
 }
})
it('marks unknown only immediately before the real generate click',async()=>{
 let baselineSaved=false,marked=false;let unknownBeforeBaseline=false
 const {contents}=makeDriver(kind=>kind==='records'?{rows:marked?[{applied:'2026-11-15 16:02:12'}]:[{applied:'2026-11-15 16:02:11'}]}:healthy(kind))
 const driver=createAlibabaOfficialDriver(contents,{...fast,beforeSubmit:()=>{baselineSaved=true}})
 await driver.search(range)
 await driver.submit(()=>{unknownBeforeBaseline=!baselineSaved;marked=true})
 expect(marked).toBe(true);expect(unknownBeforeBaseline).toBe(false)
})
