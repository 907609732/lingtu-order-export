// Real IPC and collectors; every platform URL is fulfilled from synthetic local data.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const root=await mkdtemp(resolve('.test-output/platform-concurrency-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk)
 await app.evaluate(async({session})=>{
  for(const platform of ['alibaba','taobao']){
   const ses=session.fromPartition('persist:orderdesk-'+platform)
   await ses.cookies.set({url:platform==='alibaba'?'https://air.1688.com':'https://buyertrade.taobao.com',name:'unb',value:'synthetic-'+platform})
   const response=platform==='alibaba'?{data:{data:{result:JSON.stringify({success:true,data:{data:[],pages:1,pageSize:20,total:0}})}}}:{data:{data:{pagination:{fields:{currentPage:1,pageSize:30,totalNum:0}}},global:{pageControl:{emptyPage:true}}}}
   ses.protocol.handle('https',()=>new Response(`<html><body>synthetic platform<script>window.hold=${platform==='alibaba'};window.started=0;window.lib={mtop:{request:()=>{window.started++;return window.hold?new Promise(resolve=>window.release=()=>resolve(${JSON.stringify(response)})):Promise.resolve(${JSON.stringify(response)})}}}</script></body></html>`,{headers:{'content-type':'text/html;charset=utf-8'}}))
  }
 })
 const input=platform=>({platform,from:'2026-10-01',to:'2026-10-31',plan:{granularity:'month',segments:[{from:'2026-10-01',to:'2026-10-31'}]}})
 const state=()=>page.evaluate(()=>window.desk.state())
 const start=platform=>page.evaluate(input=>window.desk.start(input),input(platform))
 // A completed official-mode view must be replaceable by the new ordinary run's own lease.
 await page.evaluate(()=>window.desk.login('alibaba','official-export'))
 const a=await start('alibaba')
 await expect.poll(()=>app.evaluate(({webContents})=>{const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://air.1688.com'));return w?.executeJavaScript('window.started||0')})).toBe(1)
 await assert.rejects(start('alibaba'),/当前平台|正在|采集|等待/)
 assert.equal((await state()).tasks.length,1)
 const b=await start('taobao')
 await expect.poll(async()=>(await state()).tasks.find(t=>t.id===b.id).status,{timeout:10000}).toBe('completed')
 assert.equal((await state()).tasks.find(t=>t.id===a.id).status,'running')
 const key=platform=>createHash('sha256').update('orderdesk:'+platform+':unb:synthetic-'+platform).digest('hex')
 for(const t of (await state()).tasks)assert.equal(t.accountKey,key(t.platform))
 // Hold the actual export writer using a synthetic image response, without network access.
 const db=new DatabaseSync(join(root,'orders.sqlite'))
 const reportTask=JSON.parse(db.prepare('SELECT payload FROM tasks WHERE id=?').get(b.id).payload)
 const imageUrl='https://img.alicdn.com/synthetic-concurrency.png'
 const order={platform:'taobao',account:'synthetic',id:'900000000000001',createdAt:'2026-10-01 09:00:00',paidAt:'',shippedAt:'',completedAt:'',status:'complete',shop:'synthetic',sellerId:'',paidFen:100,freightFen:null,refundFen:null,refundStatus:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',detailUrl:'',items:[{id:'1',title:'synthetic',spec:'',quantity:1,unitPriceFen:100,imageUrl,productUrl:''}],extra:{},missing:[],source:'response',capturedAt:'',detailState:'complete',detailReadAt:'2026-10-01'}
 db.prepare('INSERT INTO task_orders VALUES(?,?,?)').run(b.id,order.id,JSON.stringify(order))
 db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify({...reportTask,count:1}),b.id)
 db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('outputDir',root);db.close()
 await app.evaluate(({nativeImage},imageUrl)=>{
  const png=nativeImage.createFromBitmap(Buffer.from([0,0,0,255]),{width:1,height:1}).toPNG()
  globalThis.fetch=async raw=>{if(String(raw)!==imageUrl)throw Error('Unexpected synthetic fetch');return new Promise(resolve=>{globalThis.imageReply=()=>resolve(new Response(png,{headers:{'content-type':'image/png'}}))})}
 },imageUrl)
 const exporting=page.evaluate(id=>window.desk.export({taskId:id,format:'xlsx',images:true}),b.id)
 await expect.poll(()=>app.evaluate(()=>typeof globalThis.imageReply)).toBe('function')
 await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com')).executeJavaScript('window.hold=true;window.started=0'))
 const bDuringExport=await start('taobao');assert.equal((await state()).exporting,true)
 await expect.poll(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com')).executeJavaScript('window.started'))).toBe(1)
 await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com')).executeJavaScript('window.release()'))
 await expect.poll(async()=>(await state()).tasks.find(t=>t.id===bDuringExport.id).status).toBe('completed')
 await app.evaluate(()=>globalThis.imageReply());assert.equal((await exporting).count,1)
 // A native confirmation stays open while the same target starts: recheck before deletion.
 await app.evaluate(({dialog})=>{dialog.showMessageBox=()=>new Promise(resolve=>{globalThis.clearReply=()=>resolve({response:1})})})
 const clearing=page.evaluate(async()=>{try{await window.desk.clear('taobao');return 'deleted'}catch(error){return String(error)}})
 await expect.poll(()=>app.evaluate(()=>typeof globalThis.clearReply)).toBe('function')
 await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com')).executeJavaScript('window.hold=true;window.started=0'))
 const b2=await start('taobao')
 await expect.poll(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com')).executeJavaScript('window.started'))).toBe(1)
 await app.evaluate(()=>globalThis.clearReply())
 assert.notEqual(await clearing,'deleted');assert.equal((await state()).tasks.length,4)
 await app.evaluate(({webContents})=>Promise.all(webContents.getAllWebContents().filter(w=>/^https:\/\/(air\.1688\.com|buyertrade\.taobao\.com)/.test(w.getURL())).map(w=>w.executeJavaScript('window.release()'))))
 await expect.poll(async()=>(await state()).tasks.filter(t=>t.status==='running').length).toBe(0)
 for(const t of (await state()).tasks){assert.equal(t.status,'completed');assert.equal(t.listOutcome,'complete');assert.equal(t.accountKey,key(t.platform))}
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})})
 assert.equal(await page.evaluate(()=>window.desk.clear('taobao')),true)
 assert.deepEqual((await state()).tasks.map(t=>t.id),[a.id])
 // Replace only the fixture process's transport before starting it: no port or TLS listener is opened.
 await app.evaluate(({app})=>{
  const {createRequire}=process.getBuiltinModule('node:module')
  const {Proxy}=createRequire(app.getAppPath()+'/package.json')('http-mitm-proxy')
  Proxy.prototype.listen=function(_options,done){globalThis.proxyListenReply=()=>done()}
  Proxy.prototype.close=function(){}
 })
 const proxyStarting=page.evaluate(()=>window.desk.proxyStart('dewu')).then(()=>'started',error=>String(error))
 await expect.poll(()=>app.evaluate(()=>typeof globalThis.proxyListenReply)).toBe('function')
 await assert.rejects(page.evaluate(()=>window.desk.start({platform:'meituan',from:'2026-10-01',to:'2026-10-31'})),/初始化/)
 assert.equal((await state()).tasks.some(t=>t.platform==='meituan'),false)
 await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com')).executeJavaScript('window.hold=false'))
 const duringProxyStartup=await start('taobao')
 await expect.poll(async()=>(await state()).tasks.find(t=>t.id===duringProxyStartup.id).status).toBe('completed')
 await app.evaluate(()=>globalThis.proxyListenReply());assert.equal(await proxyStarting,'started')
 assert.equal((await state()).proxy.platform,'dewu');await page.evaluate(()=>window.desk.proxyStop())
 console.log(JSON.stringify({passed:true,root,overlap:true,officialToOrdinarySwitch:true,samePlatformGuard:true,accountIsolation:true,clearRecheck:true,exportOverlap:true,proxyInitializingGuard:true}))
}finally{if(app)await app.close()}

