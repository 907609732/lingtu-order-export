import { app,BrowserWindow,dialog,ipcMain,Menu,shell,nativeImage } from 'electron'
import { dirname,join,resolve,sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { Store } from '../core/store'
import { exportOrders } from '../core/exporter'
import { platforms,platformById } from '../shared/platforms'
import { Collector } from './collector'
import { OrderProxy } from './proxy'
import { Diagnostics } from './diagnostics'
import { ExecutionLog } from './execution-log'
import { ExecutionProgress } from './execution-progress'
import type { ExportInput,PlatformId,StartInput,UpdateInfo } from '../shared/types'
import { WEBSITE_URL } from '../shared/config'
import { checkLatest,compareVersions } from './updater'
import { reportLaunch } from './analytics'
import {chooseUserData} from './user-data'
const root=dirname(fileURLToPath(import.meta.url))
app.setName('灵兔 AI 电商平台买家订单导出工具')
if(process.env.ORDERDESK_TEST_DATA)app.setPath('userData',resolve(process.env.ORDERDESK_TEST_DATA))
else app.setPath('userData',chooseUserData(app.getPath('appData')))
let store:Store,collector:Collector,proxy:OrderProxy,win:BrowserWindow,diagnostics:Diagnostics,journal:ExecutionLog;let exporting=false
let latestUpdate:UpdateInfo|null=null
let logNotification:ReturnType<typeof setTimeout>|undefined
const executionChanged=()=>{if(logNotification)return;logNotification=setTimeout(()=>{logNotification=undefined;if(win&&!win.isDestroyed())win.webContents.send('desk:executionChanged')},100);logNotification.unref()}
const change=()=>{if(win&&!win.isDestroyed())win.webContents.send('desk:changed')}
const run=(id:string)=>{void collector.run(store.get(id)).catch(e=>{diagnostics.event('collector.failed',{taskId:id},e);store.update(id,{status:'failed',message:e.message});change()})}
function bind(name:string,fn:(...args:any[])=>any){ipcMain.handle('desk:'+name,async(event,...args)=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('不允许此页面访问本机数据')
  const started=Date.now(),quiet=['state','orders','hidePage','setLogging','reportError','executionLogs','setExecutionLogVisible'].includes(name)
  if(!quiet)diagnostics.event('ipc.start',{operation:name})
  try{const result=await fn(...args);if(!quiet)diagnostics.event('ipc.done',{operation:name,durationMs:Date.now()-started});return result}
  catch(error){if(!['reportError','executionLogs'].includes(name)){const input=args[0];let platform=typeof input==='object'?input?.platform:input;try{if(typeof input==='string'&&!platforms.some(p=>p.id===input))platform=store.get(input).platform;else if(input?.taskId)platform=store.get(input.taskId).platform}catch{}diagnostics.event('ipc.failed',{operation:name,platform,durationMs:Date.now()-started},error)}throw error}
})}
function target(id:unknown):PlatformId{return platformById(String(id)).id}
function idle(){if(store.tasks().some(t=>t.status==='running'))throw new Error('请先暂停当前采集任务')}
async function imageBytes(url:string):Promise<Buffer>{
  const u=new URL(url.startsWith('//')?'https:'+url:url);if(!['https:','http:'].includes(u.protocol)||!['alicdn.com','taobaocdn.com','360buyimg.com','jd.com','pddpic.com','yangkeduo.com','dewu.com','poizon.com','ecukwai.com','kwai.net','ksapisrv.com','meituan.net','dianping.com','ele.me','elemecdn.com'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw new Error('图片地址不属于平台图片域名')
  const folder=join(app.getPath('userData'),'images');await mkdir(folder,{recursive:true});const file=join(folder,createHash('sha256').update(u.href).digest('hex')+'.png');try{return await readFile(file)}catch{}
  const response=await fetch(u.href,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error('图片读取失败')
  if(Number(response.headers.get('content-length')||0)>6*1024*1024)throw new Error('图片过大')
  const chunks:Uint8Array[]=[];let size=0;for await(const chunk of response.body as any){size+=chunk.length;if(size>6*1024*1024)throw new Error('图片过大');chunks.push(chunk)}
  const buffer=Buffer.concat(chunks);const image=nativeImage.createFromBuffer(buffer);if(image.isEmpty())throw new Error('图片格式无法读取')
  const resized=image.resize({width:160}).toPNG();await writeFile(file,resized);return resized
}
app.whenReady().then(async()=>{
  diagnostics=new Diagnostics(app.getPath('userData'),app.getVersion())
  journal=new ExecutionLog(executionChanged);diagnostics.onEvent=journal.accept
  await mkdir(app.getPath('userData'),{recursive:true});store=new Store(join(app.getPath('userData'),'orders.sqlite'))
  if(store.setting('loggingEnabled')==='true')try{diagnostics.setEnabled(true)}catch{/* The settings screen exposes log storage failures. */}
  diagnostics.event('app.start',{version:app.getVersion()})
  Menu.setApplicationMenu(null)
  win=new BrowserWindow({width:1320,height:870,minWidth:1120,minHeight:740,show:false,title:'灵兔 AI 电商平台买家订单导出工具',backgroundColor:'#f5f5f7',titleBarStyle:'hidden',...(process.platform==='win32'?{titleBarOverlay:{color:'#f5f5f7',symbolColor:'#52525b',height:44}}:{}),icon:nativeImage.createFromPath(join(root,'../../build/icon.png')),webPreferences:{preload:join(root,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault())
  win.webContents.on('render-process-gone',(_e,d)=>diagnostics.event('renderer.gone',{reason:d.reason,exitCode:d.exitCode},undefined,'error'))
  win.webContents.on('preload-error',(_e,_path,error)=>diagnostics.event('renderer.preload_failed',{},error))
  collector=new Collector(win,store,change,diagnostics);proxy=new OrderProxy(join(app.getPath('userData'),'proxy-ca'),(p,b)=>collector.accept(p,b),diagnostics)
  bind('state',()=>({platforms,tasks:store.tasks(),outputDir:store.setting('outputDir'),version:app.getVersion(),logging:diagnostics.state(),showExecutionLog:store.setting('showExecutionLog')!=='false',proxy:{running:proxy.running,port:proxy.port,certificate:proxy.certificate},update:latestUpdate}))
  bind('executionLogs',(platform:PlatformId)=>journal.snapshot(target(platform)))
  bind('setExecutionLogVisible',(visible:unknown)=>{if(typeof visible!=='boolean')throw new Error('执行日志开关参数无效');store.setting('showExecutionLog',String(visible));change()})
  bind('setLogging',(enabled:unknown)=>{
    if(typeof enabled!=='boolean')throw new Error('日志开关参数无效')
    const previous=diagnostics.state().enabled
    try{diagnostics.setEnabled(enabled);store.setting('loggingEnabled',String(enabled))}
    catch(error){if(diagnostics.state().enabled!==previous)try{diagnostics.setEnabled(previous)}catch{};throw error}
    finally{change()}
  })
  bind('openLogs',async()=>{await mkdir(diagnostics.directory,{recursive:true});if(await shell.openPath(diagnostics.state().directory))throw new Error('无法打开日志文件夹，请在资源管理器中打开设置页显示的路径')})
  bind('reportError',(origin:unknown,error:unknown)=>{if(['window','promise','vue'].includes(String(origin)))diagnostics.event('renderer.error',{origin},error)})
  bind('orders',(id:string)=>store.orders(id))
  bind('login',async(id:PlatformId)=>{target(id);diagnostics.event('platform.open',{platform:id});await collector.show(id)})
  bind('hidePage',()=>collector.hide())
  bind('start',(input:StartInput)=>{idle();target(input.platform);const task=store.create(input);run(task.id);change();return task})
  bind('enrichDetails',(id:string)=>{idle();const task=store.get(id);if(task.platform!=='taobao'||!task.count)throw new Error('请先采集淘宝订单列表');void collector.enrichTaobao(task).catch(error=>{diagnostics.event('collector.failed',{taskId:id,platform:task.platform},error);store.update(id,{status:'partial',message:'详情读取暂时中断，已有订单已保留'});change()})})
  bind('openOrder',async(id:string,orderId:string)=>{idle();const order=store.orders(id).find(o=>o.id===orderId);if(!order)throw new Error('订单不存在');await collector.openOrder(order)})
  const taskAction=(id:string,action:string)=>diagnostics.event('task.action',{taskId:id,platform:store.get(id).platform,action})
  bind('pause',(id:string)=>{collector.stop(id);store.update(id,{status:'paused',message:'已暂停，当前结果已保存在本机'});taskAction(id,'pause');change()})
  bind('resume',(id:string)=>{idle();store.update(id,{status:'running',message:'正在继续采集'});taskAction(id,'resume');run(id);change()})
  bind('retry',(id:string)=>{idle();store.update(id,{status:'running',operation:'list',message:'正在重新检查订单和详情',cursor:''});taskAction(id,'retry');run(id);change()})
  bind('finish',(id:string)=>{collector.stop(id);store.update(id,{status:'partial',message:'已结束本次读取；仅代表已获取的记录，平台完整范围未自动验证'});taskAction(id,'finish');change()})
  bind('chooseDirectory',async()=>{collector.hide();const result=await dialog.showOpenDialog(win,{title:'选择订单导出目录',properties:['openDirectory','createDirectory'],defaultPath:store.setting('outputDir')||app.getPath('documents')});if(result.canceled)return store.setting('outputDir');store.setting('outputDir',result.filePaths[0]);change();return result.filePaths[0]})
  bind('export',async(input:ExportInput)=>{
    if(exporting)throw new Error('正在生成文件，请等待本次导出结束');if(!['xlsx','csv'].includes(input.format))throw new Error('不支持的文件格式')
    const directory=store.setting('outputDir');if(!directory)throw new Error('请先选择保存目录');const task=store.get(input.taskId),started=Date.now();exporting=true
    const progress=new ExecutionProgress(diagnostics,'export',{platform:task.platform,taskId:task.id})
    diagnostics.event('export.start',{platform:task.platform,taskId:task.id,count:task.count,format:input.format,images:!!input.images&&input.format==='xlsx'})
    try{const result=await exportOrders(task,store.orders(input.taskId),directory,input.format,!!input.images,async url=>{try{return await imageBytes(url)}catch(error){diagnostics.event('export.image_failed',{platform:task.platform,taskId:task.id},error,'warn');throw error}},value=>progress.stage(value));store.update(input.taskId,{exportedPath:result.path});diagnostics.event('export.done',{platform:task.platform,taskId:task.id,format:input.format,images:!!input.images,count:result.count,missing:result.missing,durationMs:Date.now()-started});change();return result}finally{progress.close();exporting=false}
  })
  bind('openOutput',async()=>{const dir=store.setting('outputDir');if(dir)await shell.openPath(dir)})
  bind('openExport',(id:string)=>{const path=store.get(id).exportedPath;const dir=store.setting('outputDir');if(path&&dir&&resolve(path).startsWith(resolve(dir)+sep))shell.showItemInFolder(path)})
  bind('clear',async(id:PlatformId)=>{idle();target(id);collector.hide();const r=await dialog.showMessageBox(win,{type:'warning',title:'清理本机采集记录',message:`清理 ${platformById(id).name} 的采集缓存和任务记录？`,detail:'已经导出的文件和平台上的订单不会删除。此操作不能撤销。',buttons:['保留','清理缓存'],defaultId:0,cancelId:0});if(r.response===1){store.clear(id);change()}})
  bind('proxyStart',async(id:PlatformId)=>{target(id);if(platformById(id).mode!=='proxy')throw new Error('此平台使用软件内登录');await proxy.start(id);change()})
  bind('proxyStop',()=>{proxy.stop();change()})
  bind('certificate',async()=>{if(!proxy.running)throw new Error('请先开启辅助采集');await shell.openPath(proxy.certificate)})
  bind('proxySettings',()=>shell.openExternal('ms-settings:network-proxy'))
  bind('checkUpdate',async()=>{const latest=await checkLatest();if(latest&&compareVersions(latest.latest,app.getVersion())>0){latestUpdate={...latest,current:app.getVersion()};if(win&&!win.isDestroyed())win.webContents.send('desk:updateAvailable',latestUpdate)}return latestUpdate})
  bind('openUpdate',()=>{if(latestUpdate?.url)shell.openExternal(latestUpdate.url)})
  bind('openWebsite',()=>{if(WEBSITE_URL)shell.openExternal(WEBSITE_URL)})
  // 后台记录启动、上报日活、检查更新；均不影响正常使用，失败静默。
  if(!process.env.ORDERDESK_TEST_DATA)void (async()=>{const installId=store.installId();store.logLaunch(app.getVersion());await reportLaunch(installId,app.getVersion());const latest=await checkLatest();if(latest&&compareVersions(latest.latest,app.getVersion())>0){latestUpdate={...latest,current:app.getVersion()};if(win&&!win.isDestroyed())win.webContents.send('desk:updateAvailable',latestUpdate)}})()
  win.once('ready-to-show',()=>win.show())
  if(process.env.ELECTRON_RENDERER_URL)await win.loadURL(process.env.ELECTRON_RENDERER_URL);else await win.loadFile(join(root,'../renderer/index.html'))
  win.show()
  if(process.env.ORDERDESK_SCREENSHOT){setTimeout(async()=>{await writeFile(process.env.ORDERDESK_SCREENSHOT!,(await win.webContents.capturePage()).toPNG())},2000)}
}).catch(error=>{diagnostics?.event('app.start_failed',{},error);dialog.showErrorBox('灵兔 AI 电商平台买家订单导出工具启动失败',error instanceof Error?error.message:'无法初始化本机数据');app.quit()})
process.on('unhandledRejection',error=>diagnostics?.event('app.unhandled_rejection',{},error))
process.on('uncaughtExceptionMonitor',error=>diagnostics?.event('app.uncaught_exception',{},error))
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',()=>{proxy?.stop();collector?.dispose();diagnostics?.event('app.exit');store?.close()})
