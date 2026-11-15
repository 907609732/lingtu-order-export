// Real Electron IPC, production shadow-DOM driver and native download listener.
// Every HTTPS request in the platform session is answered locally; no live platform is contacted.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {DatabaseSync} from 'node:sqlite'
const root=await mkdtemp(resolve('.test-output/official-integration-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_ALIBABA_OFFICIAL
const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('订单')
sheet.addRow(['订单编号','下单时间','实付款(元)','货品标题'])
for(const [id,date] of [['900000000000001','2026-08-10'],['900000000000002','2026-09-10'],['900000000000003','2026-10-10']])sheet.addRow([id,date+' 09:00:00','12.30','合成商品'])
const xlsx=Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
function fixture(){
 const style=document.createElement('style');style.textContent='q-button,q-select,q-date{display:inline-block;padding:12px;margin:5px;background:#ddd;cursor:pointer}q-table-tr,q-table-th{display:block;padding:8px}q-table-td{display:inline-block;padding:8px}.q-dialog{position:fixed;inset:20px;background:white;border:2px solid black;padding:20px}.ui-date-container{padding:10px;background:#eee}a{display:inline-block;padding:6px}';document.head.append(style)
 const app=document.createElement('fixture-app');document.body.append(app);const dom=app.attachShadow({mode:'open'});dom.append(style.cloneNode(true));window.generated=0;window.downloaded=[];window.fixtureMode='normal';window.beforeGenerate=false
 const time=document.createElement('order-search-time');dom.append(time);const shadow=time.attachShadow({mode:'open'});shadow.append(style.cloneNode(true))
 const select=document.createElement('q-select');select.dataset.tracker='select-order-date';select.innerHTML='<div slot="content">下单时间</div>';shadow.append(select)
 const dates=document.createElement('div');shadow.append(dates)
 const button=(label,parent,fn)=>{const b=document.createElement('q-button');b.textContent=label;b.onclick=fn;parent.append(b);return b}
 let panel,chosen
 for(const tracker of ['date-start','date-end']){const d=document.createElement('q-date');d.dataset.tracker=tracker;d.textContent=tracker;dates.append(d);d.onclick=()=>{chosen=d;panel?.remove();panel=document.createElement('div');panel.className='ui-date-container';shadow.append(panel);let month='2026-10';const render=()=>{panel.innerHTML='';const prev=document.createElement('a');prev.className='ui-date-prev';prev.textContent='<';const next=document.createElement('a');next.className='ui-date-next';next.textContent='>';const label=document.createElement('span');label.className='ui-date-switch';label.textContent=month;panel.append(prev,label,next);const shift=n=>{const dt=new Date(month+'-01T12:00:00Z');dt.setUTCMonth(dt.getUTCMonth()+n);month=dt.toISOString().slice(0,7);render()};prev.onclick=()=>shift(-1);next.onclick=()=>shift(1);for(let day=1;day<=31;day++){const value=month+'-'+String(day).padStart(2,'0');const a=document.createElement('a');a.dataset.date=value;a.textContent=String(day);a.onclick=()=>{chosen.setAttribute('value',value);time.setAttribute(chosen.dataset.tracker==='date-start'?'startdate':'enddate',value);select.firstElementChild.textContent=(time.getAttribute('startdate')||'')+' 至 '+(time.getAttribute('enddate')||'');panel.remove()};panel.append(a)}};render()}}
 button('搜索',dom,()=>{})
 window.wrongExportClicks=0
 const covered=button('导出当前条件',dom,()=>{window.wrongExportClicks++})
 covered.style.cssText='position:fixed;left:20px;top:300px;width:180px;height:30px'
 const blocker=document.createElement('div');blocker.style.cssText='position:fixed;left:10px;top:290px;width:240px;height:80px;z-index:9999;background:#eee';dom.append(blocker)
 const total=document.createElement('span');total.textContent='共3条';dom.append(total)
 const records=[{applied:'2026-01-01 00:00:00',href:'https://trade.1688.com/fixture/stale.xlsx'}]
 // No recognizable close button: production must return through its guarded navigation.
 const makeDialog=()=>{const d=document.createElement('div');d.className='q-dialog';dom.append(d);return d}
 const showRecords=()=>{const d=makeDialog();const render=()=>{d.querySelectorAll('q-table-tr,q-table-th').forEach(e=>e.remove());const h=document.createElement('q-table-th');h.textContent='申请时间';d.append(h);for(const r of records){const row=document.createElement('q-table-tr');row.className='export-record-tr';for(const t of [r.applied,r.applied,'成功']){const c=document.createElement('q-table-td');c.textContent=t;row.append(c)}const a=document.createElement('a');a.href=r.href;a.target='_blank';a.textContent='下载';a.onclick=()=>window.downloaded.push(r.href);row.append(a);d.append(row)}};button('刷新',d,render);render()}
 button('导出当前条件',dom,()=>{const d=makeDialog();d.append(document.createTextNode('批量导出'));button('查看过往导出报表',d,showRecords);button('生成新报表',d,()=>{window.generated++;if(window.fixtureMode!=='stale')records.push({applied:'2026-11-15 12:00:'+String(window.generated).padStart(2,'0'),href:'https://trade.1688.com/fixture/current.xlsx'});d.remove();showRecords()})})
}
 const html='<!doctype html><meta charset="utf-8"><body><script>('+fixture.toString()+')();document.querySelector("fixture-app").shadowRoot.querySelector("order-search-time").remove()</script>'
const executable=process.argv[2]?resolve(process.argv[2]):resolve('node_modules/electron/dist/electron.exe')
const app=await electron.launch({executablePath:executable,args:process.argv[2]?[]:['.'],env,timeout:45000})
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk)
 await expect(page.getByRole('button',{name:'① 选择采集时间',exact:true})).toBeEnabled()
 const finish=async id=>{
  for(let retry=0;retry<3;retry++){
   await expect.poll(async()=>(await page.evaluate(()=>window.desk.state())).tasks.find(t=>t.id===id).status,{timeout:90000}).not.toBe('running')
   const task=(await page.evaluate(()=>window.desk.state())).tasks.find(t=>t.id===id)
   if(task.status!=='paused'||!/应用已失去焦点/.test(task.message)||retry===2)return task
   // A real desktop user can move focus during this long native-input fixture.
   // Exercise the supported focus-pause resume instead of suppressing its guard.
   await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.show();win.focus()})
   await page.evaluate(id=>window.desk.resume(id),id)
  }
 }
 await app.evaluate(async({session},{html,xlsx})=>{
  const s=session.fromPartition('persist:orderdesk-alibaba');await s.cookies.set({url:'https://air.1688.com',name:'unb',value:'synthetic-official'})
  globalThis.fixtureRequests=[];globalThis.fixtureDownloadAttempts=0;globalThis.fixtureReportResponses=0
  s.on('will-download',(_event,item)=>{if(++globalThis.fixtureDownloadAttempts===1)setTimeout(()=>item.cancel(),20)})
  s.protocol.handle('https',req=>{
   globalThis.fixtureRequests.push(req.url)
   if(new URL(req.url).pathname==='/fixture/current.xlsx')return new Response(null,{status:302,headers:{location:'https://trade.1688.com/fixture/report-content.xlsx'}})
   if(new URL(req.url).pathname==='/fixture/report-content.xlsx'){
    const bytes=Buffer.from(xlsx,'base64'),headers={'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','content-disposition':'attachment; filename="server-orders.xlsx"'}
    if(++globalThis.fixtureReportResponses===1){let timer;const body=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,128));timer=setTimeout(()=>{try{c.enqueue(bytes.subarray(128));c.close()}catch{}},500)},cancel(){clearTimeout(timer)}});return new Response(body,{headers})}
    return new Response(bytes,{headers})
   }
   return new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}})
  })
 },{html,xlsx})
 const input={platform:'alibaba',mode:'official-export',from:'2026-08-01',to:'2026-10-31',plan:{granularity:'month',segments:[{from:'2026-08-01',to:'2026-08-31'},{from:'2026-10-01',to:'2026-10-31'}]}}
 await page.evaluate(async()=>{await window.desk.login('alibaba','ordinary');await window.desk.hidePage()})
 const paused=await page.evaluate(input=>window.desk.start(input),input)
 await expect.poll(()=>app.evaluate(async({webContents})=>{const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://air.1688.com'));return w?await w.executeJavaScript('!!document.querySelector("fixture-app")?.shadowRoot.querySelector("q-table-th")'):false}),{timeout:30000,intervals:[50]}).toBe(true)
 await page.evaluate(id=>window.desk.pause(id),paused.id)
 await new Promise(r=>setTimeout(r,500))
 assert.equal(await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://air.1688.com')).executeJavaScript('window.generated')),0)
 assert.equal((await page.evaluate(()=>window.desk.state())).tasks.find(t=>t.id===paused.id).officialExport.submission,'prepared')
 await page.evaluate(id=>window.desk.resume(id),paused.id)
 const task=paused
 const interrupted=await finish(task.id)
 assert.equal(interrupted.status,'paused',JSON.stringify(interrupted));assert.match(interrupted.message,/下载中断/)
 assert.equal(interrupted.officialExport.submission,'accepted');assert.ok(interrupted.officialExport.token);assert.equal(interrupted.count,0)
 await page.evaluate(id=>window.desk.resume(id),task.id)
 const done=await finish(task.id)
 assert.equal(done.listOutcome,'complete',JSON.stringify(done))
 assert.equal(done.officialExport.phase,'complete');assert.equal(done.count,2)
 assert.deepEqual((await page.evaluate(id=>window.desk.orders(id),task.id)).map(o=>o.id).sort(),['900000000000001','900000000000003'])
 const evidence=await app.evaluate(async({webContents})=>{const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://air.1688.com'));return {dom:await w.executeJavaScript('({generated:window.generated,downloaded:window.downloaded,wrongExportClicks:window.wrongExportClicks})'),requests:globalThis.fixtureRequests}})
 assert.equal(evidence.dom.wrongExportClicks,0)
 assert.equal(evidence.dom.generated,1);assert.deepEqual(evidence.dom.downloaded,[]);assert.ok(evidence.requests.includes('https://trade.1688.com/fixture/current.xlsx'));assert.ok(evidence.requests.includes('https://trade.1688.com/fixture/report-content.xlsx'));assert.equal(evidence.requests.some(u=>u.endsWith('/stale.xlsx')),false)
 const db=new DatabaseSync(join(root,'orders.sqlite'));db.prepare('DELETE FROM settings WHERE key=?').run('officialSubmitAt');db.close()
 const zero=await page.evaluate(input=>window.desk.start(input),{platform:'alibaba',mode:'official-export',from:'2026-11-01',to:'2026-11-15',plan:{granularity:'month',segments:[{from:'2026-11-01',to:'2026-11-15'}]}})
 const zeroDone=await finish(zero.id)
 assert.equal(zeroDone.listOutcome,'complete',JSON.stringify(zeroDone));assert.equal(zeroDone.count,0);assert.equal(zeroDone.officialExport.phase,'complete')
 await page.screenshot({path:join(root,'official-integration.png')})
 console.log(JSON.stringify({passed:true,root,defaultGate:true,realDriverDOM:true,realNativeDownload:true,nonContiguousMonths:true,zeroSelectedMonth:true,pauseBeforeGenerate:true,priorOrdinaryView:true,staleRecordNotDownloaded:true,evidence}))
}catch(error){console.error(await app.evaluate(async({webContents})=>Promise.all(webContents.getAllWebContents().filter(w=>w.getURL().startsWith('https://air.1688.com')).map(w=>w.executeJavaScript('({generated:window.generated,shadow:document.querySelector("fixture-app")?.shadowRoot.innerHTML})')))));throw error}finally{await app.close()}
