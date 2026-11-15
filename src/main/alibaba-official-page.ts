import type {OfficialDriver,OfficialRecord} from './alibaba-official-export'
import {CollectionError} from './collection-errors'
/** Read-only diagnostics for tooling and tests; kept self-contained for direct injection. */
export function inspectAlibabaOfficialPage(){
 const visible=(e:Element)=>{const box=e.getBoundingClientRect();return box.width>0&&box.height>0}
 const controls=Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)
 const labels=controls.map(e=>(e.textContent||'').trim())
 const inputs=Array.from(document.querySelectorAll('input')).filter(visible)
 return {dateControls:inputs.filter(e=>/开始时间|结束时间|下单时间/.test(`${e.getAttribute('aria-label')||''} ${e.placeholder}`)).length===2,currentConditionExport:labels.includes('导出当前条件')||labels.includes('导出当前筛选条件'),search:labels.includes('搜索'),verification:/请完成验证|滑动验证|请先登录/.test(document.body.innerText)}
}
export interface OfficialTokenParts {from:string;to:string;total:number;appliedAt:string;href?:string}
export interface OfficialProbe {url:string;verification:boolean;hasDateSelect:boolean;hasSearch:boolean;hasExport:boolean;activeTab:string}
export interface OfficialRecordRow {applied:string;finished:string;status:string;href:string;filename:string}
export interface OfficialPoint {x:number;y:number}
export type OfficialTarget='select'|'dateStart'|'dateEnd'|'search'|'export'|'generate'|'viewRecords'|'refresh'
export interface OfficialPageAdapter {executeJavaScript(code:string):Promise<unknown>;click?(x:number,y:number):Promise<void>}
export interface OfficialDriverOptions {submitPollMs?:number;recordPollMs?:number;submitAttempts?:number;recordAttempts?:number;settleMs?:number;guard?:()=>Promise<void>;signal?:AbortSignal;beforeSubmit?:(baseline:string[])=>void|Promise<void>;onSubmitted?:(result:OfficialTokenParts&{token:string})=>void|Promise<void>}
const tokenSeparator='~'
/** The token carries its own range so a resumed task can still verify the record without driver memory. */
export function encodeOfficialToken(parts:OfficialTokenParts):string{return [parts.from,parts.to,String(parts.total),parts.appliedAt,...(parts.href?[encodeURIComponent(parts.href)]:[])].join(tokenSeparator)}
export function decodeOfficialToken(token:string):OfficialTokenParts|null{
 const [from,to,total,appliedAt,href]=String(token||'').split(tokenSeparator)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||!/^\d+$/.test(total||'')||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(appliedAt||''))return null
 try{return {from,to,total:Number(total),appliedAt,...(href?{href:decodeURIComponent(href)}:{})}}catch{return null}
}
export function officialFilename(url:string):string{
 try{const name=decodeURIComponent(new URL(url).pathname.split('/').pop()||'');return /\.xlsx$/i.test(name)?name:''}catch{return ''}
}
const INSTALL=`(function(){
 if(window.__od&&window.__od.v===1)return 'already';
 var all=function(){var out=[];var walk=function(root){var list=root.querySelectorAll('*');for(var i=0;i<list.length;i++){var el=list[i];out.push(el);if(el.shadowRoot)walk(el.shadowRoot)}};walk(document);return out};
 var text=function(el){return el?String(el.textContent||'').replace(/\\s+/g,' ').trim():''};
 var vis=function(el){if(!el)return false;var n=el;while(n&&n.nodeType===1){var cs=getComputedStyle(n);if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse'||cs.opacity==='0')return false;n=n.parentElement||(n.getRootNode&&n.getRootNode().host)}var b=el.getBoundingClientRect();return Number.isFinite(b.width)&&Number.isFinite(b.height)&&b.width>0&&b.height>0};
 var verification=function(){return all().some(function(el){if(!vis(el))return false;var tag=String(el.tagName||'');var src=el.getAttribute('src')||'';var id=String(el.id||'')+' '+String(el.className||'');return (tag==='IFRAME'&&/captcha|login\\.taobao|passport\\.|_____tmd_____\\/punish|baxia/i.test(src))||/^(nocaptcha|nc_1_wrapper)$/.test(el.id||'')||/nc-container|baxia-dialog/.test(id)||(tag==='INPUT'&&el.getAttribute('type')==='password')||(!el.children.length&&/请完成验证|滑动验证|请先登录|请登录后|验证码/.test(text(el)))})};
 var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
 var panel=function(){return all().filter(function(el){return String(el.className||'').indexOf('ui-date-container')>=0&&getComputedStyle(el).display!=='none'})[0]};
 var byText=function(target,tag){tag=tag||'Q-BUTTON';return all().filter(function(el){return el.tagName===tag&&text(el)===target&&vis(el)})[0]};
 var dateHost=function(tracker){return all().filter(function(el){return el.tagName==='Q-DATE'&&el.getAttribute('data-tracker')===tracker})[0]};
 var dateSelect=function(){return all().filter(function(el){return el.tagName==='Q-SELECT'&&el.getAttribute('data-tracker')==='select-order-date'})[0]};
 var center=function(el){if(!el||!vis(el))return null;var b=el.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}};
 window.__od={v:1,verification:verification,all:all,text:text,vis:vis,sleep:sleep,panel:panel,byText:byText,dateHost:dateHost,dateSelect:dateSelect,center:center};
 return 'installed';
})()`
const PROBE=`(async function(){
 var od=window.__od;if(!od)return {error:'no-helpers'};
 var body=od.text(document.body||document.documentElement);
 var active='';
 od.all().forEach(function(el){var cls=String(el.className||'');if(/tab/i.test(cls)&&/active|selected|current/i.test(cls)&&!active&&od.text(el))active=od.text(el)});
 return {url:location.href,verification:od.verification(),hasDateSelect:!!od.dateSelect(),hasSearch:!!od.byText('搜索'),hasExport:!!od.byText('导出当前条件'),activeTab:active};
})()`
const STATE=`(function(){var od=window.__od;var s=od.dateHost('date-start');return {dropdown:!!(s&&od.vis(s)),panel:!!od.panel()}})()`
function coordsScript(target:OfficialTarget):string{return `(function(target){
 var od=window.__od;
 var el=null;
 if(target==='select')el=od.dateSelect();
 else if(target==='dateStart')el=od.dateHost('date-start');
 else if(target==='dateEnd')el=od.dateHost('date-end');
 else if(target==='search')el=od.byText('搜索');
 else if(target==='export')el=od.byText('导出当前条件');
 else if(target==='generate')el=od.byText('生成新报表');
 else if(target==='viewRecords')el=od.byText('查看过往导出报表');
 else if(target==='refresh')el=od.byText('刷新');
 if(!el||!od.vis(el))return null;
 try{el.scrollIntoView({block:'center'})}catch(e){}
 var box=el.getBoundingClientRect();
 var hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
 if(!hit){
  window.scrollBy(0,260);
  try{el.scrollIntoView({block:'center'})}catch(e){}
  box=el.getBoundingClientRect();
  hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
  if(!hit)return null;
 }
 var related=hit===el||(el.contains&&el.contains(hit));var ancestor=el;while(ancestor&&!related){ancestor=ancestor.parentElement||(ancestor.getRootNode&&ancestor.getRootNode().host);if(ancestor===hit)related=true}if(!related)return null;
 if(box.width<=0||box.height<=0)return null;
 return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)};
})(${JSON.stringify(target)})`}
const RANGE_STATE=`(function(){
 var od=window.__od;
 var host=od.all().filter(function(el){return el.tagName==='ORDER-SEARCH-TIME'})[0];
 if(!host)return {found:false};
 var select=host.shadowRoot&&host.shadowRoot.querySelector('q-select');
 var label=select?od.text(select.querySelector('div[slot="content"]')||select):'';
 return {found:true,start:host.getAttribute('startdate')||'',end:host.getAttribute('enddate')||'',label:label.slice(0,80)};
})()`
const LIST_SAMPLE=`(function(){
 var od=window.__od;var dates=[];
 var ol=od.all();
 for(var i=0;i<ol.length;i++){
  var el=ol[i];
  if(el.children&&el.children.length===0){
   var t=od.text(el);
   var m=/(\\d{4}-\\d{2}-\\d{2}) \\d{2}:\\d{2}:\\d{2}/.exec(t);
   if(m&&t.length<80)dates.push(m[1]);
  }
 }
 return {dates:dates.slice(0,6),count:dates.length};
})()`
function pickScript(tracker:'date-start'|'date-end',value:string):string{return `(function(){
 var od=window.__od;if(!od)return {error:'no-helpers'};
 var host=od.dateHost(${JSON.stringify(tracker)});if(!host)return {error:'no-host'};
 if(host.getAttribute('value')===${JSON.stringify(value)})return {ok:true};
 var box=od.panel();if(!box)return {error:'no-panel'};
 var sw=box.querySelector('.ui-date-switch');if(!sw)return {error:'no-switch'};
 var target=${JSON.stringify(value)}.slice(0,7),label=od.text(sw);
 var el=label===target?box.querySelector('a[data-date="'+${JSON.stringify(value)}+'"]'):box.querySelector(label>target?'.ui-date-prev':'.ui-date-next');
 return el?{point:od.center(el)}:{error:'no-cell-or-arrow'};
})()`}
const READ_ROWS=`(async function(){
 var od=window.__od;if(!od)return {error:'no-helpers'};
 var visibleHeader=function(){return od.all().filter(function(el){return el.tagName==='Q-TABLE-TH'&&od.text(el)==='申请时间'&&od.vis(el)})[0]};
 var header=null;
 for(var i=0;i<40&&!header;i++){header=visibleHeader();if(!header)await od.sleep(250)}
 if(!header)return {error:'no-record-table'};
 var rows=od.all().filter(function(el){return el.tagName==='Q-TABLE-TR'&&String(el.className||'').indexOf('export-record-tr')>=0&&od.vis(el)});
 var out=[];
 rows.forEach(function(row){
  var cells=Array.prototype.slice.call(row.children).filter(function(el){return el.tagName==='Q-TABLE-TD'});
  if(cells.length<3)return;
  var anchor=row.querySelector('a');
  var href=anchor?anchor.getAttribute('href')||'':'';
  var name='';
  if(href){try{name=decodeURIComponent(href.split('?')[0].split('/').pop()||'')}catch(e){name=''}}
  out.push({applied:od.text(cells[0]),finished:od.text(cells[1]),status:od.text(cells[2]),href:href,filename:name});
 });
 return {rows:out};
})()`
const LIST_STATE=`(function(){
 var od=window.__od;
 var table=!!od.all().filter(function(el){return el.tagName==='Q-TABLE-TH'&&od.text(el)==='申请时间'&&od.vis(el)})[0];
 var dialog=!!od.all().filter(function(el){return /q-dialog/.test(String(el.className||''))&&od.vis(el)&&/批量导出/.test(od.text(el))})[0];
 return {table:table,dialog:dialog};
})()`
const CLOSE_DIALOG=`(function(){var od=window.__od;var controls=od.all().filter(function(el){return od.vis(el)&&(/^(关闭|Close|close|×|✕)$/.test(el.getAttribute('aria-label')||od.text(el))||/dialog-close|modal-close|close-btn|close-button/.test(String(el.className||'')))});for(var i=controls.length-1;i>=0;i--){var el=controls[i],p=el;while(p){if(p.getAttribute&&p.getAttribute('role')==='dialog'||/q-dialog|modal/.test(String(p.className||'')))return od.center(el);p=p.parentElement||(p.getRootNode&&p.getRootNode().host)}}return null})()`
function stableHref(href:string){try{const u=new URL(href);return u.origin+u.pathname}catch{return href}}
export function createAlibabaOfficialDriver(contents:OfficialPageAdapter,options:OfficialDriverOptions={}):OfficialDriver{
 const submitPollMs=options.submitPollMs??3000,recordPollMs=options.recordPollMs??5000,submitAttempts=options.submitAttempts??20,recordAttempts=options.recordAttempts??60,settleMs=options.settleMs??800
 const guard=async()=>{if(options.signal?.aborted)throw new Error('官方导出已暂停，断点已保留');await options.guard?.();if(options.signal?.aborted)throw new Error('官方导出已暂停，断点已保留')}
 const wait=async(ms:number)=>{await guard();await new Promise<void>((resolve,reject)=>{const signal=options.signal;const done=()=>{signal?.removeEventListener('abort',abort);resolve()};const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new Error('官方导出已暂停，断点已保留'))};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});await guard()}
 const run=async <T=unknown>(code:string):Promise<T>=>{await guard();await contents.executeJavaScript(INSTALL);await guard();const probe=await contents.executeJavaScript(PROBE) as OfficialProbe;if(probe?.verification)throw new CollectionError('login_or_verification');await guard();return await contents.executeJavaScript(code) as T}
 const tap=async(target:OfficialTarget,retryMs=0,beforeClick?:()=>void|Promise<void>)=>{
  const deadline=Date.now()+retryMs
  for(;;){
   const point=await run<OfficialPoint|null>(coordsScript(target))
   if(point){
    if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error('官方页面点击坐标无效，已停止')
    if(!contents.click)throw new Error('当前环境不支持真实鼠标点击，无法自动操作官方页面')
    await guard();await beforeClick?.();await guard();await contents.click(point.x,point.y)
    return true
   }
   if(Date.now()>=deadline)return false
   await wait(300)
  }
 }
 let last:{from:string;to:string;total:number}|undefined
 const ensure=async()=>{
  // The official page is a shadow-DOM application: freshly opened views need time before any control exists.
  for(let attempt=0;attempt<20;attempt++){
   const probe=await run<OfficialProbe&{error?:string}>(PROBE)
   if(probe?.verification)throw new CollectionError('login_or_verification')
   if(probe&&probe.hasDateSelect&&probe.hasSearch&&probe.hasExport){
    if(probe.activeTab&&!/全部/.test(probe.activeTab))throw new Error('官方订单页当前不在「全部订单」标签，已停止且未提交导出')
    return probe
   }
   await wait(settleMs)
  }
  throw new Error('官方订单页结构与已确认版本不一致，已停止且未提交导出')
 }
 const pick=async(tracker:'date-start'|'date-end',value:string)=>{
  for(let attempt=0;attempt<45;attempt++){
   const result=await run<{ok?:boolean;point?:OfficialPoint;error?:string}>(pickScript(tracker,value))
   if(result?.ok)return result
   const point=result?.point
   if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!contents.click)return {ok:false}
   await guard();await contents.click(point.x,point.y);await wait(350)
  }
  return {ok:false}
 }
 const ensureDropdown=async()=>{
  // The shadow-DOM app binds pointer handlers a moment after the controls render, so a click can be swallowed early.
  for(let attempt=0;attempt<8;attempt++){
   const state=await run<{dropdown?:boolean}>(STATE)
   if(state?.dropdown)return
   if(!await tap('select'))throw new Error('官方订单页未找到下单时间筛选，已停止且未提交导出')
   await wait(Math.max(1200,settleMs*2))
   const after=await run<{dropdown?:boolean}>(STATE)
   if(after?.dropdown)return
   await wait(800)
  }
  throw new Error('无法展开官方下单时间筛选，已停止且未提交导出')
 }
 const readRows=async(refresh=false)=>{
  const state=await run<{table?:boolean;dialog?:boolean}>(LIST_STATE)
  if(!state?.table){
   if(!state?.dialog){
    if(!await tap('export'))throw new Error('官方订单页未找到「导出当前条件」，已停止')
    await wait(settleMs*3)
   }
   if(!await tap('viewRecords'))throw new Error('官方导出弹窗中未找到「查看过往导出报表」，已停止')
   await wait(settleMs*2)
  }else if(refresh){
   // The record list keeps its old status until the refresh button is clicked.
   if(await tap('refresh'))await wait(settleMs)
  }
  const result=await run<{rows?:OfficialRecordRow[];error?:string}>(READ_ROWS)
  if(!result||result.error||!Array.isArray(result.rows))throw new Error('无法读取官方导出记录，已停止')
  return result.rows
 }
 const assertUnique=(ids:string[])=>{if(ids.some(id=>!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(id))||new Set(ids).size!==ids.length)throw new Error('官方导出记录时间重复或无效，归属不明确，已停止')}
 const reconcile=async(range:{from:string;to:string},total:number,baseline:string[])=>{
  assertUnique(baseline)
  for(let attempt=0;attempt<submitAttempts;attempt++){
   await wait(submitPollMs);const rows=await readRows(true);assertUnique(rows.map(row=>row.applied))
   const fresh=rows.filter(row=>!baseline.includes(row.applied))
   if(fresh.length>1)throw new Error('官方新增导出记录不唯一，提交结果未知，已停止')
   if(fresh.length===1){const row=fresh[0];const parts={...range,total,appliedAt:row.applied,...(row.href?{href:stableHref(row.href)}:{})};const result={...parts,token:encodeOfficialToken(parts)};await options.onSubmitted?.(result);await guard();return result}
  }
  throw new Error('导出记录中未出现本次新增报表，提交结果未知，请先在导出记录中确认')
 }
 return {
  async search(range){
   await ensure()
   await wait(Math.max(1500,settleMs*2))
   await ensureDropdown()
   if(!await tap('dateStart',6000))throw new Error('官方订单页未找到开始日期控件，已停止且未提交导出')
   await wait(settleMs)
   const start=await pick('date-start',range.from)
   if(!start?.ok)throw new Error('无法在官方页面设置开始日期，已停止且未提交导出')
   const state=await run<{dropdown?:boolean}>(STATE)
   if(!state?.dropdown){await ensureDropdown()}
   if(!await tap('dateEnd',8000))throw new Error('官方订单页未找到结束日期控件，已停止且未提交导出')
   await wait(settleMs)
   const end=await pick('date-end',range.to)
   if(!end?.ok)throw new Error('无法在官方页面设置结束日期，已停止且未提交导出')
   // The controls can show a value the page never applied; both the attributes and the visible label must agree.
   const applied=await run<{found?:boolean;start?:string;end?:string;label?:string}>(RANGE_STATE)
   if(!applied?.found||applied.start!==range.from||applied.end!==range.to)throw new Error(`官方页面未接受所选日期（当前 ${applied?.start||'空'} 至 ${applied?.end||'空'}），已停止且未提交导出`)
   if(!(applied.label||'').includes(range.from)||!(applied.label||'').includes(range.to))throw new Error(`官方页面筛选摘要未显示所选日期（当前显示「${applied.label||'空'}」），已停止且未提交导出`)
   // The platform export ignores the date filter, and its search button resets the filter to the saved default view,
   // so the driver records the requested range as evidence and reads the visible total without touching search.
   const result=await run<{total?:number|null}>((`(function(){
    var od=window.__od;
    var nodes=od.all().filter(function(el){return el.children.length===0});
    for(var i=0;i<nodes.length;i++){var value=od.text(nodes[i]).replace(/\\s/g,'');var match=/^共(\\d+)条$/.exec(value);if(match)return {total:Number(match[1])}}
    return {total:null};
   })()`))
   if(typeof result?.total!=='number'||!Number.isSafeInteger(result.total)||result.total<0)throw new Error('无法读取官方订单总数，已停止且未提交导出')
   last={from:range.from,to:range.to,total:result.total}
   return {from:range.from,to:range.to,scope:'all-results',total:result.total}
  },
  async submit(beforeClick?:()=>void|Promise<void>){
   if(!last)throw new Error('官方导出尚未完成搜索，已停止且未提交导出')
   if(!await tap('export'))throw new Error('官方订单页未找到「导出当前条件」，已停止且未提交导出')
   let dialog=false
   for(let attempt=0;attempt<80&&!dialog;attempt++){
    await wait(250)
    dialog=!!(await run<OfficialPoint|null>(coordsScript('generate')))
   }
   if(!dialog)throw new Error('官方导出确认弹窗未出现，已停止且未提交导出')
   const baseline=(await readRows()).map(row=>row.applied)
   assertUnique(baseline)
   // Return through a visible confirmed close control; never click the backdrop or guess coordinates.
   for(let depth=0;depth<4;depth++){
    const state=await run<{table?:boolean;dialog?:boolean}>(LIST_STATE)
    if(!state?.table&&await run<OfficialPoint|null>(coordsScript('generate')))break
    const point=await run<OfficialPoint|null>(CLOSE_DIALOG)
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!contents.click)throw new Error('无法安全关闭导出记录弹窗，未提交新报表')
    await guard();await contents.click(point.x,point.y);await wait(settleMs)
   }
   if((await run<{table?:boolean}>(LIST_STATE))?.table)throw new Error('导出记录弹窗未确认关闭，未提交新报表')
   if(!await run<OfficialPoint|null>(coordsScript('generate'))){if(!await tap('export'))throw new Error('无法返回生成报表弹窗');await wait(settleMs)}
   await guard();await options.beforeSubmit?.([...baseline]);await guard()
   if(!await tap('generate',0,beforeClick))throw new Error('弹窗中未找到「生成新报表」，提交结果未知，请先在导出记录中确认')
   return reconcile(last,last.total,baseline)
  },
  reconcile,
  async record(token){
   const parts=decodeOfficialToken(token)
   if(!parts)throw new Error('官方导出记录标识无效，未下载历史文件')
   // A resumed task starts on a fresh page, so the record list must not be read before the page is ready.
   await ensure()
   await wait(Math.max(1500,settleMs*2))
   for(let attempt=0;attempt<recordAttempts;attempt++){
    const rows=await readRows(true)
    const matches=rows.filter(item=>item.applied===parts.appliedAt);if(matches.length>1)throw new Error('官方导出记录时间重复，归属不明确，已停止');const row=matches[0];if(row&&parts.href&&stableHref(row.href)!==parts.href)throw new Error('官方导出记录链接已变化，归属不明确，已停止')
    if(row){
     if(/失败|不通过/.test(row.status))throw new Error('官方报表生成失败，已停止且未下载')
     if(/成功/.test(row.status)&&row.href){
      const filename=officialFilename(row.href)
      if(!filename)throw new Error('官方报表下载地址不是可识别的 xlsx，已停止')
      return {token,from:parts.from,to:parts.to,total:parts.total,url:row.href,filename} as OfficialRecord
     }
    }
    await wait(recordPollMs)
   }
   throw new Error('等待官方报表生成超时，导出记录已保留，可稍后继续')
  }
 }
}
/** Clicks the exact task-owned download link; the download itself is validated by URL and account. */
export async function triggerAlibabaOfficialDownload(contents:OfficialPageAdapter,url:string,options:Pick<OfficialDriverOptions,'guard'|'signal'>={}):Promise<void>{
 const check=async()=>{if(options.signal?.aborted)throw new Error('官方导出已暂停');await options.guard?.();if(options.signal?.aborted)throw new Error('官方导出已暂停')}
 await check()
 await contents.executeJavaScript(INSTALL)
 const probe=await contents.executeJavaScript(PROBE) as OfficialProbe
 if(probe?.verification)throw new CollectionError('login_or_verification')
 await check()
 const point=await contents.executeJavaScript(`(function(){var od=window.__od;var anchors=od.all().filter(function(el){return el.tagName==='A'&&el.getAttribute('href')===${JSON.stringify(url)}&&od.vis(el)});return anchors.length===1?od.center(anchors[0]):null})()`) as OfficialPoint|null
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!contents.click)throw new Error('未找到任务对应的唯一官方报表下载链接')
 await check();await contents.click(point.x,point.y)
}

/** Self-contained injected diagnostics, also exercised against isolated DOM fixtures. */
export const officialPageScripts={install:INSTALL,probe:PROBE,readRows:READ_ROWS}
