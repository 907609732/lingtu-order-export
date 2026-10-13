import {_electron as electron} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/taobao-pagination-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk)
 await app.evaluate(({session})=>session.fromPartition('persist:orderdesk-taobao').protocol.handle('https',()=>new Response('<html><title>合成订单页</title></html>',{headers:{'content-type':'text/html'}})))
 await page.evaluate(()=>window.desk.login('taobao'));await page.evaluate(()=>window.desk.hidePage())
 await app.evaluate(async({webContents})=>{
  const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com/'))
  await wc.executeJavaScript(`window.calls=[];window.failOnce=true;window.lib={mtop:{request:async options=>{
   const d=options.data,filter=JSON.parse(JSON.parse(d.condition).orderFilterExtParam),month=filter.beginTime.slice(0,7);
   if(d.OrderType!=='OrderFilter'||!filter.endTime.endsWith('23:59:59'))throw Error('Invalid contract');
   window.calls.push({month,page:d.page});
   if(d.page===3&&window.failOnce){window.failOnce=false;throw {ret:['FAIL_SYS_SERVICE_INNER_FAULT']};}
   if(month==='2026-09')return {ret:['SUCCESS'],data:{data:{},global:{pageControl:{emptyPage:true}}}};
   const id='90000000000000'+d.page;
   return {ret:['SUCCESS'],data:{data:{shop:{tag:'shopInfo',id,fields:{orderId:id,createTime:d.page===1?'2026-10-01 09:00:00':'2026-10-20 09:00:00'}}},global:{pageControl:{hasMore:d.page===1,nextPageIndex:d.page===1?3:4}}}};
  }}};void 0`)
 })
 const task=await page.evaluate(()=>window.desk.start({platform:'taobao',from:'2026-09-15',to:'2026-10-10'}))
 async function finished(){for(let n=0;n<200;n++){const t=await page.evaluate(async id=>(await window.desk.state()).tasks.find(t=>t.id===id),task.id);if(t.status!=='running')return t;await new Promise(r=>setTimeout(r,100))}throw Error('Collection timed out')}
 let done=await finished();assert.equal(done.status,'partial');assert.equal(done.count,1);assert.deepEqual(JSON.parse(done.cursor),{month:'2026-10',nextPage:3})
 await page.evaluate(id=>window.desk.resume(id),task.id);done=await finished()
 assert.equal(done.count,1);assert.equal(done.pages,3);assert.equal(done.cursor,'')
 const calls=await app.evaluate(async({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com/')).executeJavaScript('window.calls'))
 assert.deepEqual(calls,[{month:'2026-10',page:1},{month:'2026-10',page:3},{month:'2026-10',page:3},{month:'2026-09',page:1}])
 const logs=await page.evaluate(()=>window.desk.executionLogs('taobao'));assert.ok(logs.some(l=>l.message.includes('2026 年9 月')))
 console.log(JSON.stringify({passed:true,synthetic:true,platformNextPage:true,resumesInterruptedPage:true,monthBoundary:true,exactDateFilter:true,saved:done.count,pages:done.pages}))
}finally{await app.close()}
