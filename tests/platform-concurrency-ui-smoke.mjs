import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
const root=await mkdtemp(resolve('.test-output/platform-ui-'))
const fixture=join(root,'main.cjs')
await writeFile(fixture,`const {app,BrowserWindow,ipcMain,session}=require('electron');app.setPath('userData',__dirname);app.whenReady().then(()=>{session.defaultSession.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url)}));const task=(id,platform,status='paused')=>({id,platform,status,from:'2026-01-01',to:'2026-01-31',count:0,pages:0,message:'synthetic',createdAt:'2026-01-01',updatedAt:'2026-01-01',account:'synthetic',cursor:'',exportedPath:''});global.s={platforms:[{id:'taobao',name:'淘宝 / 天猫',color:'#f60',icon:'淘',mode:'browser'},{id:'alibaba',name:'1688',color:'#f60',icon:'阿',mode:'browser'},{id:'jd',name:'京东',color:'#f00',icon:'京',mode:'browser'}],tasks:[task('a','alibaba','running'),task('b','taobao'),task('j','jd')],platformRuns:[{platform:'alibaba',taskId:'a',stopping:false}],proxy:{running:false},logging:{enabled:false},update:{status:'unsupported'},outputDir:'synthetic',showExecutionLog:false};global.calls=[];global.delayOrders={};global.rows={};global.delayLogin=false;global.notify=()=>w.webContents.send('desk:changed');for(const name of ['state','orders','hidePage','login','start','pause','finish','resume','enrichDetails','export','executionLogs'])ipcMain.handle('desk:'+name,async(_,arg)=>{global.calls.push([name,arg]);if(name==='state')return global.s;if(name==='orders'){if(global.delayOrders[arg])await new Promise(r=>global.releaseOrders=r);return global.rows[arg]||[]}if(name==='executionLogs')return [];if(name==='start'){const t=task('new-'+arg.platform,arg.platform,'running');global.s.tasks.unshift(t);global.s.platformRuns.push({platform:arg.platform,taskId:t.id,stopping:false});return t}if(name==='login'&&global.delayLogin)await new Promise(r=>global.releaseLogin=r);if(name==='resume'){const t=global.s.tasks.find(t=>t.id===arg);t.status='running';global.s.platformRuns.push({platform:t.platform,taskId:t.id,stopping:false})}if(name==='export'){await new Promise(r=>global.releaseExport=r);return {count:1,missing:0}}});const w=new BrowserWindow({width:1350,height:900,webPreferences:{preload:${JSON.stringify(resolve('out/preload/index.cjs'))}}});w.loadFile(${JSON.stringify(resolve('out/renderer/index.html'))});});`)
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[fixture],env})
try{
 const p=await app.firstWindow();await expect(p.getByRole('heading',{name:'1688订单导出'})).toBeVisible()
 await p.locator('nav button').filter({hasText:'淘宝 / 天猫'}).click()
 await expect(p.getByRole('heading',{name:'淘宝 / 天猫订单导出'})).toBeVisible()
 await expect(p.locator('.four-step-actions>.start')).toBeEnabled()
 await p.locator('.four-step-actions>.start').click()
 await expect.poll(()=>app.evaluate(()=>global.s.platformRuns.length)).toBe(2)
 await app.evaluate(()=>{global.s.tasks.find(t=>t.id==='a').status='needs_login';global.s.platformRuns=global.s.platformRuns.filter(r=>r.taskId!=='a');global.notify()})
 await expect(p.locator('nav button').filter({hasText:'1688'})).toContainText('待验证')
 await expect(p.getByRole('heading',{name:'淘宝 / 天猫订单导出'})).toBeVisible()
 await app.evaluate(()=>{global.s.platformRuns.push({platform:'alibaba',taskId:'a',stopping:true});global.notify()})
 await p.locator('nav button').filter({hasText:'1688'}).click();await expect(p.locator('.four-step-actions>.start')).toContainText('暂停中')
 await expect(p.getByRole('button',{name:'① 选择采集时间',exact:true})).toBeDisabled()
 await expect(p.getByLabel('查看历史采集任务')).toBeDisabled()
 await expect(p.getByRole('button',{name:'模式二 · 官方导出',exact:true})).toBeDisabled()
 await expect(p.getByRole('button',{name:'清理当前平台缓存',exact:true})).toBeDisabled()
 await expect(p.getByRole('button',{name:'登录 / 查看平台页',exact:true})).toBeDisabled()
 await p.locator('nav button').filter({hasText:'京东'}).click();await expect(p.locator('.four-step-actions>.start')).toBeEnabled()
 await app.evaluate(()=>{global.delayOrders.a=true;global.rows.a=[{id:'ONLY-A',platform:'alibaba',items:[],missing:[],extra:{},createdAt:'2026-01-01',paidFen:100,shop:'A',status:'synthetic'}]})
 await p.locator('nav button').filter({hasText:'1688'}).click();await p.locator('nav button').filter({hasText:'京东'}).click()
 await app.evaluate(()=>global.releaseOrders?.());await expect(p.getByRole('heading',{name:'京东订单导出'})).toBeVisible()
 await expect(p.locator('.order-browser')).toHaveCount(0)
 // A delayed page action cannot open the browser placeholder in B.
 await app.evaluate(()=>{global.delayLogin=true})
 await p.getByRole('button',{name:'登录 / 查看平台页',exact:true}).click()
 await p.locator('nav button').filter({hasText:'淘宝 / 天猫'}).click()
 await app.evaluate(()=>global.releaseLogin());await expect(p.locator('.browser-placeholder')).toHaveCount(0)
 // Export retains A's task/format/images snapshot while B can start.
 await app.evaluate(()=>{global.delayOrders.a=false;global.s.platformRuns=[];global.s.tasks.forEach(t=>t.status='paused');global.s.tasks.find(t=>t.id==='a').status='partial';global.notify()})
 await p.locator('nav button').filter({hasText:'1688'}).click()
 await expect(p.locator('.order-browser')).toBeVisible()
 await p.getByRole('button',{name:/^④ 导出文件/}).click()
 await expect.poll(()=>app.evaluate(()=>global.calls.filter(c=>c[0]==='export').length)).toBe(1)
 await p.locator('nav button').filter({hasText:'京东'}).click()
 await expect(p.locator('.four-step-actions>.start')).toBeEnabled()
 await p.locator('.four-step-actions>.start').click()
 await expect.poll(()=>app.evaluate(()=>global.s.platformRuns.some(r=>r.platform==='jd'))).toBe(true)
 const captured=await app.evaluate(()=>global.calls.find(c=>c[0]==='export')[1])
 expect(captured).toEqual({taskId:'a',format:'xlsx',images:true})
 await app.evaluate(()=>global.releaseExport());await expect(p.locator('.notice')).toHaveCount(0)
 await expect(p.getByRole('heading',{name:'京东订单导出'})).toBeVisible()
 await app.evaluate(()=>{global.s.tasks.push({...global.s.tasks.find(t=>t.id==='a'),id:'old-a',status:'needs_login'});global.notify()})
 await expect(p.locator('nav button').filter({hasText:'1688'}).locator('.platform-status')).toHaveCount(0)
 console.log('PASS isolated platform concurrency UI: overlap, background validation, drain/history/mode guards, stale orders/login, export snapshot, old validation ignored; all HTTP blocked')
}finally{await app.close()}




