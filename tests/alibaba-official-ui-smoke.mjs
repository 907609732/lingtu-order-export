// Renderer-only fixture: isolated app profile and mocked IPC, no website requests.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/official-ui-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
 const p=await app.firstWindow();await p.waitForFunction(()=>!!window.desk)
 await p.evaluate(()=>window.desk.state())
 const gateDb=new DatabaseSync(resolve(root,'orders.sqlite'))
 try{
  const task={id:'gate-official',platform:'alibaba',mode:'official-export',account:'synthetic',from:'2026-01-01',to:'2026-01-31',status:'paused',createdAt:'2026-11-15',updatedAt:'2026-11-15',count:0,pages:0,message:'synthetic gate',cursor:'',exportedPath:''}
  gateDb.prepare('INSERT INTO tasks VALUES(?,?,?)').run(task.id,task.platform,JSON.stringify(task))
  for(const action of ['start','resume','retry']){
   const result=await p.evaluate(async action=>{try{await window.desk[action](action==='start'?{platform:'alibaba',mode:'official-export',from:'2026-01-01',to:'2026-01-31'}:'gate-official');return ''}catch(error){return String(error)}},action)
   assert.match(result,/暂未开放自动导出/)
  }
  assert.equal(gateDb.prepare('SELECT count(*) n FROM tasks').get().n,1)
  assert.equal(JSON.parse(gateDb.prepare('SELECT payload FROM tasks').get().payload).status,'paused')
 }finally{gateDb.close()}
 await app.evaluate(async({ipcMain,BrowserWindow})=>{
  const base={platform:'alibaba',account:'synthetic',from:'2026-01-01',to:'2026-01-31',status:'paused',createdAt:'2026-11-15',updatedAt:'2026-11-15',count:0,pages:0,message:'合成任务已暂停',cursor:'',exportedPath:''}
  globalThis.uiTasks=[{...base,id:'legacy'}, {...base,id:'official',mode:'official-export',from:'2026-02-01',to:'2026-02-28',officialExport:{phase:'waiting'}}]
  globalThis.uiCalls=[]
  for(const key of ['state','orders','start','resume','login','hidePage','executionLogs','export'])ipcMain.removeHandler('desk:'+key)
  ipcMain.handle('desk:state',()=>({platforms:[{id:'alibaba',name:'1688',color:'#ff6000',icon:'阿',mode:'browser'}],tasks:globalThis.uiTasks,alibabaOfficialExportAvailable:!!globalThis.uiAvailable,outputDir:'synthetic-output',version:'test',logging:{enabled:false,directory:'',error:''},showExecutionLog:false,proxy:{running:false},update:{status:'idle',current:'test'}}))
  ipcMain.handle('desk:orders',()=>globalThis.uiOrders||[]);ipcMain.handle('desk:hidePage',()=>{});ipcMain.handle('desk:executionLogs',()=>[])
  ipcMain.handle('desk:start',(_e,input)=>{globalThis.uiCalls.push(['start',input]);const t={...base,...input,id:'new-official',status:'running',officialExport:{phase:'search'}};globalThis.uiTasks.unshift(t);return t})
  ipcMain.handle('desk:resume',(_e,id)=>{globalThis.uiCalls.push(['resume',id])})
  ipcMain.handle('desk:login',(_e,...args)=>{globalThis.uiCalls.push(['login',...args])})
  ipcMain.handle('desk:export',(_e,input)=>{globalThis.uiCalls.push(['export',input]);return {count:1,path:'synthetic.xlsx',missing:0}})
  BrowserWindow.getAllWindows()[0].webContents.reload()
 })
 await p.locator('nav button').filter({hasText:'1688'}).click()
 await expect(p.getByRole('button',{name:'模式一 · 普通采集',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(p.getByRole('button',{name:'② 继续采集',exact:true})).toBeEnabled()
 await expect(p.getByLabel('查看历史采集任务').locator('option')).toHaveCount(1)
 await p.getByRole('button',{name:'模式二 · 官方导出',exact:true}).click()
 await expect(p.getByRole('button',{name:'② 继续官方导出',exact:true})).toBeDisabled()
 await expect(p.locator('.official-mode-note')).toContainText('官方页面导出流程尚待验证，暂未开放自动导出')
 await app.evaluate(({BrowserWindow})=>{globalThis.uiAvailable=true;BrowserWindow.getAllWindows()[0].webContents.send('desk:changed')})
 await expect(p.getByRole('button',{name:'② 继续官方导出',exact:true})).toBeEnabled()
 await expect(p.getByLabel('查看历史采集任务').locator('option')).toHaveCount(1)
 await expect(p.locator('.collection-time-summary')).toContainText('2026-02-01')
 await expect(p.getByRole('button',{name:'③ 自动核对',exact:true})).toBeDisabled()
 await expect(p.getByRole('button',{name:'③ 提取订单详情',exact:true})).toHaveCount(0)
 await expect(p.locator('.collection-activity')).toContainText('等待官方生成报表')
 await p.getByRole('button',{name:'② 继续官方导出',exact:true}).click()
 assert.deepEqual(await app.evaluate(()=>globalThis.uiCalls.at(-1)),['resume','official'])
 await p.getByRole('button',{name:'登录 / 查看平台页',exact:true}).click()
 assert.deepEqual(await app.evaluate(()=>globalThis.uiCalls.at(-1)),['login','alibaba','official-export'])
 await p.getByRole('button',{name:'返回导出台',exact:true}).click()
 await p.getByRole('button',{name:'模式一 · 普通采集',exact:true}).click()
 await expect(p.locator('.collection-time-summary')).toContainText('2026-01-01')
 await p.getByRole('button',{name:'模式二 · 官方导出',exact:true}).click()
 await p.getByRole('button',{name:'① 选择采集时间',exact:true}).click()
 await p.getByLabel('年份',{exact:true}).fill('2026');await p.getByLabel('年份',{exact:true}).press('Tab')
 await p.locator('.plan-segments>button').nth(2).click();await p.getByRole('button',{name:'确认采集时间',exact:true}).click()
 await expect(p.getByRole('button',{name:'② 官方导出',exact:true})).toBeEnabled()
 await p.getByRole('button',{name:'② 官方导出',exact:true}).click()
 const call=await app.evaluate(()=>globalThis.uiCalls.at(-1));assert.equal(call[0],'start');assert.equal(call[1].mode,'official-export')
 await expect(p.getByRole('button',{name:'模式一 · 普通采集',exact:true})).toBeDisabled()
 await app.evaluate(({BrowserWindow})=>{
  const t=globalThis.uiTasks[0];t.status='completed';t.count=1;t.listOutcome='complete';t.officialExport={phase:'complete',segmentIndex:1,audit:{rows:4,uniqueOrders:2,importedOrders:1,outOfRange:1,accountMismatch:1,duplicates:1,missing:1,conflicts:[{orderId:'synthetic-001',field:'金额',values:['10','11']}],warnings:['合成警告：日期字段待核对'],scopeVerified:false}}
  globalThis.uiOrders=[{...Object.fromEntries(['paidAt','shippedAt','completedAt','status','shop','sellerId','refundStatus','receiver','phone','address','logistics','tracking','remark','detailUrl','capturedAt'].map(key=>[key,''])),platform:'alibaba',account:'synthetic',id:'synthetic-001',createdAt:'2026-03-01',paidFen:1000,freightFen:null,refundFen:null,items:[{id:'synthetic-item',title:'合成商品',spec:'测试',quantity:1,unitPriceFen:1000,imageUrl:'',productUrl:''}],extra:{},missing:[],source:'page'}]
  BrowserWindow.getAllWindows()[0].webContents.send('desk:changed')
 })
 await expect(p.getByRole('button',{name:'② 重新官方导出',exact:true})).toBeEnabled()
 await expect(p.getByLabel('官方报表核对结果')).toContainText('范围完整性未核实')
 await expect(p.getByLabel('官方报表核对结果')).toContainText('未取得可核实的官网总数')
 await p.getByRole('button',{name:'③ 查看核对结果',exact:true}).click()
 await expect(p.getByLabel('官方报表核对结果')).toContainText('合成警告：日期字段待核对')
 await expect(p.getByLabel('官方报表核对结果')).toContainText('synthetic-001 · 金额：10 / 11')
 await p.getByRole('button',{name:'④ 导出文件 ↓',exact:true}).click()
 assert.deepEqual(await app.evaluate(()=>globalThis.uiCalls.at(-1)),['export',{taskId:'new-official',format:'xlsx',images:true}])
 await p.screenshot({path:resolve(root,'audit.png')})
 console.log(JSON.stringify({passed:true,root,legacy:true,modeIsolation:true,resume:true,start:true,loginMode:true}))
}finally{if(app)await app.close()}
