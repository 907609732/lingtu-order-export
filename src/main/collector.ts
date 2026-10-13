import { BrowserWindow, WebContentsView, session } from 'electron'
import { setTimeout as delay } from 'node:timers/promises'
import type { Order, PlatformId, Task } from '../shared/types'
import { allowedHost, isOrderResponse, platformById } from '../shared/platforms'
import { Store } from '../core/store'
import { dateText, moneyFen } from '../core/values'
import { mergeXianyuDetail, normalizePayload, parsePayload } from '../core/normalize'
import { advanceOrderPage, mtopRequest, readOrderPage } from './page-scripts'
import { safeError, type Diagnostics } from './diagnostics'
import { CollectionError, mtopFailure, unwrapMtopResponse } from './collection-errors'
import { ExecutionProgress } from './execution-progress'
export class Collector {
  views=new Map<PlatformId,WebContentsView>(); current?:WebContentsView; active?:string; stopped=new Set<string>(); runs=new Set<string>(); private captureCount=0; private disposing=false
  constructor(private win:BrowserWindow,private store:Store,private changed:()=>void,private diagnostics:Diagnostics){win.on('resize',()=>this.layout())}
  private progress=new Map<string,ExecutionProgress>()
  private stage(task:Task,context:Record<string,unknown>){this.progress.get(task.id)?.stage(context)}
  private async request(view:WebContentsView,api:string,data:unknown,platform:PlatformId){
    const result=await view.webContents.executeJavaScript(`(${mtopRequest.toString()})(${JSON.stringify(api)},${JSON.stringify(data)},${JSON.stringify(platform)},${mtopFailure.toString()})`)
    return unwrapMtopResponse(result)
  }
  private pageRead(task:Task,page:number,received:number,extra:Record<string,unknown>={}){this.diagnostics.event('collector.page',{platform:task.platform,taskId:task.id,page,received,count:this.store.get(task.id).count,...extra})}
  layout(){if(this.current){const [w,h]=this.win.getContentSize();this.current.setBounds({x:244,y:174,width:Math.max(300,w-268),height:Math.max(200,h-196)})}}
  hide(){if(this.current){this.win.contentView.removeChildView(this.current);this.current=undefined}}
  async show(id:PlatformId):Promise<void>{
    const loading=this.ensure(id)
    const view=this.views.get(id)
    if(view){this.hide();this.current=view;this.win.contentView.addChildView(view);this.layout()}
    // Show the official page while it loads; its analytics/assets must not freeze the host UI.
    await Promise.race([loading,delay(800)])
  }
  async ensure(id:PlatformId):Promise<WebContentsView>{
    const prior=this.views.get(id);if(prior&&!prior.webContents.isDestroyed())return prior
    const ses=session.fromPartition(`persist:orderdesk-${id}`);ses.setPermissionRequestHandler((_w,_p,done)=>done(false))
    const view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}})
    view.webContents.setWindowOpenHandler(({url})=>{try{if(allowedHost(id,new URL(url).hostname))void view.webContents.loadURL(url)}catch{}return{action:'deny'}})
    view.webContents.on('will-navigate',(event,url)=>{try{const host=new URL(url).hostname;if(!allowedHost(id,host)&&!['login.taobao.com','passport.jd.com','passport.pinduoduo.com'].includes(host))event.preventDefault()}catch{event.preventDefault()}})
    view.webContents.on('did-fail-load',(_e,code)=>{if(code===-3)return;this.diagnostics.event('platform.load_failed',{platform:id,networkCode:code},undefined,'warn');if(this.active){const t=this.store.get(this.active);if(t.platform===id)this.store.update(t.id,{status:'partial',message:'平台页面加载失败，请检查网络后继续'});this.changed()}})
    view.webContents.on('render-process-gone',(_e,d)=>this.diagnostics.event('platform.gone',{platform:id,reason:d.reason,exitCode:d.exitCode},undefined,'error'))
    this.views.set(id,view)
    try{
      view.webContents.debugger.attach('1.3');void view.webContents.debugger.sendCommand('Network.enable',{maxResourceBufferSize:12*1024*1024,maxTotalBufferSize:24*1024*1024}).catch(error=>this.diagnostics.event('platform.debugger_failed',{platform:id},error))
      const pending=new Map<string,string>()
      view.webContents.debugger.on('message',(_e,method,p)=>{
        if(method==='Network.responseReceived'&&isOrderResponse(id,p.response.url)&&/json|javascript|text/.test(p.response.mimeType||''))pending.set(p.requestId,p.response.url)
        if(method==='Network.loadingFailed')pending.delete(p.requestId)
        if(method==='Network.loadingFinished'&&pending.has(p.requestId)){pending.delete(p.requestId);if(!this.active)return;void view.webContents.debugger.sendCommand('Network.getResponseBody',{requestId:p.requestId}).then(r=>this.accept(id,r.base64Encoded?Buffer.from(r.body,'base64').toString('utf8'):r.body)).catch(error=>this.diagnostics.event('platform.response_failed',{platform:id},error,'warn'))}
      })
    }catch(error){this.diagnostics.event('platform.debugger_failed',{platform:id},error)}
    await view.webContents.loadURL(platformById(id).url).catch(()=>{})
    return view
  }
  accept(platform:PlatformId,body:string):void{
    if(!this.active)return;const task=this.store.get(this.active);if(task.platform!==platform||task.status!=='running')return
    try{
      const orders=normalizePayload(platform,parsePayload(body));if(!orders.length){this.diagnostics.event('collector.response',{platform,taskId:task.id,received:0});return}
      const unknown=orders.filter(o=>!o.createdAt).length;const count=this.store.add(task.id,orders);this.captureCount++
      this.diagnostics.event('collector.response',{platform,taskId:task.id,received:orders.length,unknown,count:this.store.get(task.id).count})
      this.store.update(task.id,{pages:task.pages+1,message:unknown?`${unknown} 笔订单缺少日期，未混入所选日期范围`:`已读取订单，当前范围内 ${this.store.get(task.id).count} 笔`});if(count||unknown)this.changed()
    }catch(error){this.diagnostics.event('collector.parse_failed',{platform,taskId:task.id},error,'warn')}
  }
  stop(id:string){this.diagnostics.event('collector.stop',{taskId:id});this.progress.get(id)?.close();this.progress.delete(id);this.stopped.add(id);if(this.active===id)this.active=undefined}
  async run(task:Task):Promise<void>{
    if(this.runs.size)throw new Error('上一个采集任务正在结束，请稍后再试')
    this.runs.add(task.id);this.stopped.delete(task.id);this.active=task.id
    const started=Date.now();let interrupted=false;this.diagnostics.event('collector.start',{platform:task.platform,taskId:task.id,count:task.count,pages:task.pages})
    this.progress.get(task.id)?.close();this.progress.set(task.id,new ExecutionProgress(this.diagnostics,'collector',{platform:task.platform,taskId:task.id}))
    try{
      if(platformById(task.platform).mode==='proxy'){this.stage(task,{phase:'response'});this.diagnostics.event('collector.waiting',{platform:task.platform,taskId:task.id});this.store.update(task.id,{message:'正在等待订单页面数据；请在微信小程序打开买家订单列表'});this.changed();return}
      this.stage(task,{phase:'platform'})
      const view=await this.ensure(task.platform);if(this.stopped.has(task.id))return
      if(task.platform==='xianyu')await this.runXianyu(task,view)
      else if(task.platform==='alibaba')await this.runAlibaba(task,view)
      else if(task.platform==='taobao')await this.runTaobao(task,view)
      else if(task.platform==='jd')await this.runJD(task,view)
      else { await view.webContents.loadURL(platformById(task.platform).url);if(!this.stopped.has(task.id))await this.runPage(task,view) }
    }catch(e){interrupted=true;this.diagnostics.event('collector.failed',{platform:task.platform,taskId:task.id},e);if(!this.stopped.has(task.id)){const category=safeError(e).category;this.store.update(task.id,{status:category==='login_or_verification'?'needs_login':this.store.get(task.id).count?'partial':'failed',message:e instanceof Error?e.message:'采集暂时失败，请打开平台页检查'});this.changed()}}
    finally{this.runs.delete(task.id);if(!this.disposing){const latest=this.store.get(task.id);if(platformById(task.platform).mode!=='proxy'||latest.status!=='running'){this.progress.get(task.id)?.close();this.progress.delete(task.id)}this.diagnostics.event('collector.end',{platform:task.platform,taskId:task.id,status:latest.status,count:latest.count,pages:latest.pages,interrupted,durationMs:Date.now()-started})}}
  }
  async runXianyu(task:Task,view:WebContentsView){
    let cursor:{page:number;offset?:string}={page:1};if(task.cursor)try{cursor=JSON.parse(task.cursor)}catch{}
    for(let page=cursor.page;page<=500&&!this.stopped.has(task.id);page++){
      this.stage(task,{phase:'page',page})
      const response=await this.request(view,'mtop.idle.web.trade.bought.list',{pageNumber:page,orderStatus:'ALL',...(cursor.offset?{offsetRow:cursor.offset}:{})},'xianyu')
      if(!Array.isArray(response?.data?.items))throw new CollectionError('response_structure')
      const orders=normalizePayload('xianyu',response);this.store.add(task.id,orders);this.store.update(task.id,{pages:page,message:`正在读取第 ${page} 页`});this.changed()
      this.pageRead(task,page,orders.length)
      const older=orders.some(o=>o.createdAt&&o.createdAt.slice(0,10)<task.from)
      if(older||!(response.data.nextPage===true||response.data.nextPage==='true')){await this.xianyuDetails(task,view);if(!this.stopped.has(task.id)){const all=this.store.orders(task.id);const missing=all.some(o=>o.missing.length);this.store.update(task.id,{status:missing?'partial':'completed',message:missing?'订单列表已读完，部分详情需重试':'所选日期范围读取完成'});this.changed()}return}
      cursor={page:page+1,offset:response.data.lastEndRow};this.store.update(task.id,{cursor:JSON.stringify(cursor)});await delay(1300)
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{status:'partial',message:'已达到本次分页上限，可继续处理'});this.changed()}
  }
  async runAlibaba(task:Task,view:WebContentsView){
    const pageSize=20
    for(let page=1;page<=1000&&!this.stopped.has(task.id);page++){
      this.stage(task,{phase:'page',page})
      const data={serviceId:'OrderListDataLineService.buyerOrderList',param:JSON.stringify({startDateTime:task.from+' 00:00:00',endDateTime:task.to+' 23:59:59',page,pageSize})}
      const response=await this.request(view,'mtop.1688.trading.dataline.service',data,'alibaba')
      const result=response?.data?.data?.result
      const parsed=typeof result==='string'?parsePayload(result):result
      if(!parsed?.success||!Array.isArray(parsed?.data?.data))throw new CollectionError('response_structure')
      const orders=normalizePayload('alibaba',parsed);this.store.add(task.id,orders)
      this.pageRead(task,page,orders.length)
      this.store.update(task.id,{pages:page,cursor:String(page),message:`正在读取 1688 第 ${page} 页`});this.changed()
      if(parsed.data.data.length===0||page>=Number(parsed.data.pages)){
        this.store.update(task.id,{status:'partial',message:'1688 列表读取结束；收货、物流、发票等详情仍需核对，已有结果可以导出'});this.changed();return
      }
      await delay(1500)
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{status:'partial',message:'本次达到分页上限，已有结果可导出'});this.changed()}
  }
  async runJD(task:Task,view:WebContentsView){
    const currentYear=Number(dateText(Date.now()).slice(0,4));let pages=0
    const base:Partial<Order>={platform:'jd',account:'当前账号',paidAt:'',shippedAt:'',completedAt:'',status:'',shop:'',sellerId:'',paidFen:null,freightFen:null,refundFen:null,refundStatus:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',detailUrl:'',extra:{},source:'page',capturedAt:new Date().toISOString()}
    for(let year=Math.min(Number(task.to.slice(0,4)),currentYear);year>=Number(task.from.slice(0,4))&&!this.stopped.has(task.id);year--){
      let signature=''
      for(let page=1;page<=1000&&!this.stopped.has(task.id);page++){
        this.stage(task,{phase:'page',page,year})
        const url=new URL(platformById('jd').url);url.searchParams.set('d',year===currentYear?'2':String(year));url.searchParams.set('s','4096');url.searchParams.set('page',String(page))
        await view.webContents.loadURL(url.href);await delay(1200);if(this.stopped.has(task.id))return
        const snap=await view.webContents.executeJavaScript(`(${readOrderPage.toString()})('jd')`)
        if(snap.blocked)throw new Error(snap.message)
        if(!snap.rows.length&&!snap.empty)throw new Error('京东页面尚未识别到订单，请打开平台页检查登录或验证')
        if(snap.rows.length&&snap.signature===signature)throw new Error('京东返回了重复页面，已有结果已保留，请检查平台筛选')
        signature=snap.signature
        const rows:Order[]=snap.rows.map((r:any)=>({...base,...r,createdAt:dateText(r.createdAt),paidFen:moneyFen(r.paid),detailState:'pending',missing:['订单详情']}))
        this.store.add(task.id,rows);this.store.update(task.id,{pages:++pages,cursor:JSON.stringify({year,page}),message:`正在读取京东 ${year} 年第 ${page} 页`});this.changed()
        this.pageRead(task,page,rows.length,{year})
        if(!snap.hasNext||snap.empty)break
        if(page===1000)throw new Error('京东本年度达到分页上限，已有结果已保留')
      }
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{status:'partial',message:'京东所选年份列表已读取，订单详情和平台完整范围仍需核对'});this.changed()}
  }
  async runTaobao(task:Task,view:WebContentsView){
    for(let page=1;page<=1000&&!this.stopped.has(task.id);page++){
      this.stage(task,{phase:'page',page})
      const data={tabCode:'all',page,OrderType:'OrderList',appName:'tborder',appVersion:'3.0',condition:JSON.stringify({directRouteToTm2Scene:'1'}),__needlessClearProtocol__:true}
      const response=await this.request(view,'mtop.taobao.order.queryboughtlistV2',data,'taobao')
      const nodes=response?.data?.data,pagination=nodes?.pagination?.fields,control=response?.data?.global?.pageControl
      if(!nodes||(!pagination&&!control))throw new CollectionError('response_structure')
      const orders=normalizePayload('taobao',response);this.store.add(task.id,orders)
      this.pageRead(task,page,orders.length)
      this.store.update(task.id,{pages:page,cursor:String(page),message:`正在读取淘宝第 ${page} 页`});this.changed()
      const total=Number(pagination?.totalNum),size=Number(pagination?.pageSize)
      if(control?.emptyPage===true||control?.emptyPage==='true'||(Number.isFinite(total)&&size>0&&page*size>=total)){
        this.store.update(task.id,{status:'partial',message:'淘宝列表读取结束；订单详情仍需补全，已有结果可以导出'});this.changed();return
      }
      if(!orders.length)throw new Error('平台订单结构暂未识别，已保留此前结果，请核对平台页面')
      await delay(1600)
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{status:'partial',message:'本次达到分页上限，已有结果可导出'});this.changed()}
  }
  async xianyuDetails(task:Task,view:WebContentsView){
    const all=this.store.orders(task.id)
    for(let i=0;i<all.length&&!this.stopped.has(task.id);i++){
      this.stage(task,{phase:'detail',current:i+1,total:all.length})
      let order=all[i]
      try{const response=await this.request(view,'mtop.idle.web.trade.order.detail',{tid:order.id},'xianyu');order=mergeXianyuDetail(order,response)}catch(error){this.diagnostics.event('collector.detail_failed',{platform:task.platform,taskId:task.id},error,'warn');order={...order,missing:[...order.missing,'订单详情']}}
      this.store.add(task.id,[order]);this.store.update(task.id,{message:`正在补全订单详情 ${i+1} / ${all.length}`});this.changed();await delay(900)
      this.diagnostics.event('collector.detail',{platform:task.platform,taskId:task.id,current:i+1,total:all.length})
    }
  }
  async runPage(task:Task,view:WebContentsView){
    let stagnant=0,lastSignature='',lastCapture=-1
    for(let page=0;page<600&&!this.stopped.has(task.id);page++){
      this.stage(task,{phase:'page',page:page+1})
      await delay(page===0?2000:1800);if(this.stopped.has(task.id))return
      const snap=await view.webContents.executeJavaScript(`(${readOrderPage.toString()})(${JSON.stringify(task.platform)})`)
      if(snap.blocked)throw new Error(snap.message)
      const base:Partial<Order>={platform:task.platform,account:'当前账号',paidAt:'',shippedAt:'',completedAt:'',status:'',shop:'',sellerId:'',paidFen:null,freightFen:null,refundFen:null,refundStatus:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',detailUrl:'',extra:{},source:'page',capturedAt:new Date().toISOString()}
      const rows:Order[]=snap.rows.map((r:any)=>({...base,...r,createdAt:dateText(r.createdAt),paidFen:moneyFen(r.paid),detailState:'pending',missing:['订单详情']}))
      if(rows.length)this.store.add(task.id,rows)
      this.pageRead(task,page+1,rows.length)
      const changed=snap.signature!==lastSignature||this.captureCount!==lastCapture;stagnant=changed?0:stagnant+1;lastSignature=snap.signature;lastCapture=this.captureCount
      const count=this.store.get(task.id).count;this.store.update(task.id,{message:`已读取 ${count} 笔，正在检查后续订单`,cursor:JSON.stringify({page,signature:lastSignature})});this.changed()
      if(snap.empty&&count===0){this.store.update(task.id,{status:'partial',message:'当前平台页面未显示订单，请核对页面筛选是否覆盖所选日期'});this.changed();return}
      if((snap.rows.length&&!snap.hasNext)||snap.ended||stagnant>=4){this.store.update(task.id,{status:'partial',message:snap.ended?'已到列表末尾，可导出已有结果；详情完整性待核对':stagnant>=4?'页面没有加载新订单，请检查登录、筛选或页面验证；已有数据可导出':'当前列表已读取，部分详情需补全；可导出已有结果'});this.changed();return}
      await view.webContents.executeJavaScript(`(${advanceOrderPage.toString()})()`)
    }
  }
  dispose(){this.disposing=true;for(const p of this.progress.values())p.close();this.progress.clear();for(const t of this.store.tasks())if(t.status==='running')this.stop(t.id);for(const v of this.views.values())if(!v.webContents.isDestroyed())v.webContents.close();this.views.clear()}
}
