import {_electron as electron} from '@playwright/test'
import {mkdtemp,readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/pdd-collector-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk)
 await page.evaluate(()=>window.desk.setLogging(true))
 await app.evaluate(async({session})=>{
  globalThis.pddCalls=[];globalThis.pddFailOnce=true
  const ses=session.fromPartition('persist:orderdesk-pdd')
  await ses.cookies.set({url:'https://mobile.yangkeduo.com',name:'PDDAccessToken',value:'PRIVATE_SYNTHETIC_TOKEN'})
  await ses.cookies.set({url:'https://mobile.yangkeduo.com',name:'pdd_user_id',value:'123'})
  ses.protocol.handle('https',async request=>{
   const u=new URL(request.url)
   if(u.pathname.includes('order_list_v4')){
    const body=await request.json();globalThis.pddCalls.push(body)
    if(request.method!=='POST'||request.headers.get('AccessToken')!=='PRIVATE_SYNTHETIC_TOKEN'||body.page!==1||body.size!==30||body.type!=='all'||u.searchParams.get('pdduid')!=='123')return new Response('{}',{status:400})
    if(body.offset==='cursor-29'&&globalThis.pddFailOnce){globalThis.pddFailOnce=false;return new Response('{}',{status:503})}
    const rows=body.offset==='0'?Array.from({length:30},(_,i)=>({order_sn:`900000-${i}`,offset:`cursor-${i}`,order_time:i===0?'2026-10-01 09:00:00':'2026-10-20 09:00:00',order_amount:1901,order_goods:[{goods_id:'11',goods_name:'PRIVATE_PRODUCT',spec:'白',goods_number:3,goods_price:600}]})):[]
    return new Response(JSON.stringify({orders:rows}),{headers:{'content-type':'application/json'}})
   }
   if(u.pathname==='/order.html')return new Response(`<script>window.rawData=${JSON.stringify({data:{orderSn:u.searchParams.get('order_sn'),orderTime:'2026-10-01 09:00:00',orderAmount:1901,orderGoods:[{goodsId:'11',goodsName:'PRIVATE_PRODUCT',spec:'白',goodsNumber:3,goodsPrice:600}],receiveName:'PRIVATE_RECEIVER',mobile:'PRIVATE_PHONE',shippingAddress:'PRIVATE_ADDRESS'}})};</script>`)
   return new Response('<html><title>我的订单</title><body>合成拼多多订单页</body></html>',{headers:{'content-type':'text/html'}})
  })
 })
 await page.evaluate(()=>window.desk.login('pdd'));await page.evaluate(()=>window.desk.hidePage())
 const task=await page.evaluate(()=>window.desk.start({platform:'pdd',from:'2026-10-01',to:'2026-10-10'}))
 async function finished(id=task.id){for(let n=0;n<150;n++){const t=await page.evaluate(async id=>(await window.desk.state()).tasks.find(t=>t.id===id),id);if(t.status!=='running')return t;await new Promise(r=>setTimeout(r,100))}throw Error('PDD timed out')}
 let done=await finished();assert.equal(done.count,1);assert.equal(done.status,'partial');assert.equal(JSON.parse(done.cursor).offset,'cursor-29')
 await page.evaluate(id=>window.desk.resume(id),task.id);done=await finished()
 assert.equal(done.count,1);assert.equal(done.pages,2)
 const orders=await page.evaluate(id=>window.desk.orders(id),task.id);assert.equal(orders[0].detailState,'complete');assert.equal(orders[0].receiver,'PRIVATE_RECEIVER');assert.equal(orders[0].items.length,1)
 const requests=await app.evaluate(()=>globalThis.pddCalls);assert.deepEqual(requests.map(r=>r.offset),['0','cursor-29','cursor-29']);assert.ok(requests.every(r=>r.page===1))
 await app.evaluate(async({session})=>session.fromPartition('persist:orderdesk-pdd').cookies.set({url:'https://mobile.yangkeduo.com',name:'pdd_user_id',value:'456'}))
 await page.evaluate(id=>window.desk.retry(id),task.id);done=await finished();assert.equal(done.count,1);assert.ok(done.message.includes('账号不一致'))
 assert.equal((await app.evaluate(()=>globalThis.pddCalls)).length,3)
 await app.evaluate(async({session})=>session.fromPartition('persist:orderdesk-pdd').cookies.remove('https://mobile.yangkeduo.com','PDDAccessToken'))
 const anonymous=await page.evaluate(()=>window.desk.start({platform:'pdd',from:'2026-10-01',to:'2026-10-10'}));assert.equal((await finished(anonymous.id)).status,'needs_login')
 const logs=await readFile(join(root,'logs/main.log'),'utf8');assert.ok(!logs.includes('PRIVATE'));assert.ok(!logs.includes('900000-'));assert.ok(!logs.includes('cursor-29'))
 console.log(JSON.stringify({passed:true,synthetic:true,offsetPagination:true,exactDateFilter:true,detailBinding:true,resume:true,accountSwitchStopped:true,anonymousNeedsLogin:true,logsPrivate:true}))
}finally{await app.close()}
