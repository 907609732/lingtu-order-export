// Real collector, synthetic HTTPS responses and a separate persisted database.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/primary-resume-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_SCREENSHOT
let app,p
async function launch(fail){
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000});p=await app.firstWindow();await p.waitForFunction(()=>!!window.desk)
 await app.evaluate(async({session},fail)=>{
  globalThis.resumeRequests=[];globalThis.resumeFail=fail
  const ses=session.fromPartition('persist:orderdesk-alibaba');await ses.cookies.set({url:'https://air.1688.com',name:'unb',value:'synthetic-resume'})
  ses.protocol.handle('https',request=>{
   const u=new URL(request.url)
   if(u.pathname==='/synthetic-page'){
    const month=u.searchParams.get('month'),page=Number(u.searchParams.get('page'));globalThis.resumeRequests.push({month,page})
    if(globalThis.resumeFail&&month==='2026-01'&&page===2)return new Response(JSON.stringify({ret:['TIMEOUT::synthetic']}))
    const ids=month==='2026-01'?(page===1?['101']:['101','102']):['201']
    return new Response(JSON.stringify({data:{data:{result:JSON.stringify({success:true,data:{data:ids.map(id=>({idStr:'900000000000'+id,gmtCreate:month+'-01 09:00:00',sumPayment:'1230',orderEntries:[{sourceId:'1',productName:'合成商品',quantity:{realAmount:1}}]})),pages:month==='2026-01'?2:1,pageSize:20,total:ids.length}})}}}))
   }
   return new Response(`<html><body>合成订单页<script>window.lib={mtop:{request:async o=>{const q=JSON.parse(o.data.param);await new Promise(r=>setTimeout(r,400));return fetch('/synthetic-page?month='+q.startDateTime.slice(0,7)+'&page='+q.page).then(r=>r.json())}}}</script></body></html>`,{headers:{'content-type':'text/html;charset=utf-8'}})
  })
 },fail)
}
const state=()=>p.evaluate(()=>window.desk.state())
async function waitStopped(){await expect.poll(async()=>{const s=await state();return s.tasks.length>0&&!s.tasks.some(t=>t.status==='running')},{timeout:30000}).toBe(true)}
async function months(indices){await p.getByRole('button',{name:'① 选择采集时间',exact:true}).click();await p.getByLabel('年份',{exact:true}).fill('2026');await p.getByLabel('年份',{exact:true}).press('Tab');for(const i of indices)await p.locator('.plan-segments>button').nth(i).click();await p.getByRole('button',{name:'确认采集时间',exact:true}).click()}
try{
 await launch(true);await p.locator('nav button').filter({hasText:'1688'}).click();await months([0,1]);await p.getByRole('button',{name:'② 开始采集',exact:true}).click();await expect(p.locator('.four-step-actions>.start')).toBeDisabled();await waitStopped()
 const interrupted=(await state()).tasks[0];assert.equal(interrupted.count,2);assert.equal(interrupted.listOutcome,'interrupted');assert.equal(interrupted.plan.buckets.filter(b=>b.status==='completed').length,1);assert.equal(JSON.parse(interrupted.plan.buckets.find(b=>b.status!=='completed').cursor).nextPage,2)
 await expect(p.getByRole('button',{name:'② 继续采集',exact:true})).toBeEnabled();await expect(p.getByRole('button',{name:'继续采集',exact:true})).toHaveCount(0);await p.screenshot({path:join(root,'interrupted.png')})
 const before=await app.evaluate(()=>globalThis.resumeRequests);assert.deepEqual(before,[{month:'2026-02',page:1},{month:'2026-01',page:1},{month:'2026-01',page:2}])
 await app.close();app=undefined;await launch(false);await p.locator('nav button').filter({hasText:'1688'}).click()
 await expect(p.getByRole('button',{name:'② 继续采集',exact:true})).toBeEnabled();assert.equal((await state()).tasks[0].id,interrupted.id);await p.screenshot({path:join(root,'reopened.png')})
 await p.getByRole('button',{name:'② 继续采集',exact:true}).click();await expect(p.locator('.four-step-actions>.start')).toBeDisabled();await waitStopped();await expect(p.getByRole('button',{name:'② 重置采集',exact:true})).toBeEnabled()
 const resumed=(await state()).tasks;assert.equal(resumed.length,1);assert.equal(resumed[0].id,interrupted.id);assert.equal(resumed[0].count,3);assert.equal(resumed[0].listOutcome,'complete');assert.ok(resumed[0].plan.buckets.every(b=>b.status==='completed'));assert.equal((await p.evaluate(id=>window.desk.orders(id),interrupted.id)).length,3)
 assert.deepEqual(await app.evaluate(()=>globalThis.resumeRequests),[{month:'2026-01',page:2}]);await p.screenshot({path:join(root,'completed.png')})
 // A changed confirmed selection must create a fresh task and retain the previous result.
 await months([0]);await expect(p.getByRole('button',{name:'② 开始采集',exact:true})).toBeEnabled();await expect(p.locator('.header-controls')).toContainText('保留');await p.getByRole('button',{name:'② 开始采集',exact:true}).click();await waitStopped();assert.equal((await state()).tasks.length,2);assert.equal((await p.evaluate(id=>window.desk.orders(id),interrupted.id)).length,3)
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1,checkboxChecked:false})});await p.getByRole('button',{name:'清理当前平台缓存',exact:true}).click();await expect(p.getByRole('button',{name:'② 开始采集',exact:true})).toBeDisabled();assert.equal((await state()).tasks.length,0)
 await writeFile(join(root,'result.json'),JSON.stringify({passed:true,sameTask:true,persisted:true,skipCompleted:true,nextPage:2,deduplicatedCount:3,newSelection:true,clear:true}));console.log(JSON.stringify({passed:true,root}))
}finally{if(app)await app.close()}
