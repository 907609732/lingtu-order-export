import { BrowserWindow, WebContentsView, session } from 'electron'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'
import type { Order, PlatformId, Task } from '../shared/types'
import { allowedHost, isOrderResponse, platformById } from '../shared/platforms'
import {pendingDetails} from '../core/extraction-plan'
import { Store } from '../core/store'
import { dateText, moneyFen } from '../core/values'
import { mergeXianyuDetail, normalizePayload, parsePayload } from '../core/normalize'
import { advanceOrderPage, mtopRequest, readOrderPage } from './page-scripts'
import { safeError, type Diagnostics } from './diagnostics'
import { CollectionError, mtopFailure, unwrapMtopResponse } from './collection-errors'
import { ExecutionProgress } from './execution-progress'
import { taobaoListData, taobaoMonths, taobaoNextPage } from './taobao-contract'
import { parsePddList, parsePddDetailHtml } from './pdd-contract'
import { pddPageRequest, pddDetailRequest } from './pdd-page'
import { normalizePddDetail } from '../core/pdd-normalize'
import {taobaoDetailUrl,readTaobaoDetailPage,mergeTaobaoVisibleDetail} from './taobao-detail'
import {platformDetailUrl,mergePlatformVisibleDetail} from './platform-detail'
import {readAlibabaExport,alibabaExportUrl} from './alibaba-detail'
import {isAlibabaLoginLanding} from './platform-login'
export class Collector {
  views=new Map<PlatformId,WebContentsView>(); current?:WebContentsView; active?:string; stopped=new Set<string>(); runs=new Set<string>(); private captureCount=0; private disposing=false
  constructor(private win:BrowserWindow,private store:Store,private changed:()=>void,private diagnostics:Diagnostics){win.on('resize',()=>this.layout())}
  private progress=new Map<string,ExecutionProgress>()
  private stage(task:Task,context:Record<string,unknown>){this.progress.get(task.id)?.stage(context)}
  private async request(view:WebContentsView,api:string,data:unknown,platform:PlatformId){
    await this.assertPlanAccount(view,platform)
    const result=await view.webContents.executeJavaScript(`(${mtopRequest.toString()})(${JSON.stringify(api)},${JSON.stringify(data)},${JSON.stringify(platform)},${mtopFailure.toString()})`)
    await this.assertPlanAccount(view,platform)
    return unwrapMtopResponse(result)
  }
  private async assertPlanAccount(view:WebContentsView,platform:PlatformId){
    if(!this.active||platform==='pdd')return
    const task=this.store.get(this.active);if(!task.plan)return
    const names=platform==='jd'?['pin','pt_pin']:['unb','last_mid','_nk_','lgc']
    const cookies=await view.webContents.session.cookies.get({url:platformById(platform).url})
    const identity=task.accountCookie?cookies.find(c=>c.name===task.accountCookie):names.map(name=>cookies.find(c=>c.name===name&&c.value)).find(Boolean)
    if(!identity?.value)throw new CollectionError(task.accountKey?'account_changed':'login_or_verification')
    const key=createHash('sha256').update('orderdesk:'+platform+':'+identity.name+':'+identity.value).digest('hex')
    if(task.accountKey&&task.accountKey!==key)throw new CollectionError('account_changed')
    if(!task.accountKey)this.store.update(task.id,{accountKey:key,accountCookie:identity.name})
  }
  private pageRead(task:Task,page:number,received:number,extra:Record<string,unknown>={}){this.diagnostics.event('collector.page',{platform:task.platform,taskId:task.id,page,received,count:this.store.get(task.id).count,...extra})}
  layout(){if(this.current){const [w,h]=this.win.getContentSize();this.current.setBounds({x:200,y:146,width:Math.max(300,w-216),height:Math.max(200,h-162)})}}
  async openOrder(order:Order){
    const url=order.platform==='taobao'?taobaoDetailUrl(order.detailUrl,order.id):order.detailUrl
    let parsed:URL;try{parsed=new URL(url)}catch{throw new Error('此订单尚未取得平台详情链接')}
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!allowedHost(order.platform,parsed.hostname)||/create|submit|cancel|delete|confirm|payorder/i.test(parsed.pathname))throw new Error('此订单详情链接暂不支持打开')
    const view=await this.ensure(order.platform);await this.navigateDetail(view,url)
    this.hide();this.current=view;this.win.contentView.addChildView(view);this.layout()
  }
  private async navigateDetail(view:WebContentsView,url:string){
    await Promise.race([view.webContents.loadURL(url).catch(error=>{if(error?.errno!==-3&&error?.code!=='ERR_ABORTED')throw new CollectionError('network')}),delay(20000).then(()=>{throw new CollectionError('timeout')})])
  }
  async enrichDetails(task:Task):Promise<void>{
    if(task.platform==='taobao')return this.enrichTaobao(task)
    if(!['alibaba','pdd','jd','xianyu'].includes(task.platform))throw new Error('此平台暂不支持独立提取详情')
    if(this.runs.size)throw new Error('上一个采集任务正在结束，请稍后再试')
    this.runs.add(task.id);this.stopped.delete(task.id);this.active=task.id
    const name=platformById(task.platform).name,started=Date.now();let interrupted=false
    this.store.update(task.id,{status:'running',operation:'details',message:`正在提取${name}订单详情`});this.changed()
    this.diagnostics.event('collector.start',{platform:task.platform,taskId:task.id,count:task.count})
    this.progress.set(task.id,new ExecutionProgress(this.diagnostics,'collector',{platform:task.platform,taskId:task.id}))
    try{
      this.stage(task,{phase:'platform'});const view=await this.ensure(task.platform)
      if(this.stopped.has(task.id))return
      if(task.platform==='pdd')await this.pddDetails(task,view)
      else if(task.platform==='xianyu')await this.xianyuDetails(task,view)
      else if(task.platform==='alibaba')await this.alibabaDetails(task,view)
      else await this.jdDetails(task,view)
      if(!this.stopped.has(task.id)){const remaining=pendingDetails(this.store.orders(task.id)).length;this.store.update(task.id,{status:'partial',message:`${name}详情读取结束，${remaining?`还有 ${remaining} 笔未成功读取，可再次提取`:'已处理所有订单'}；未提供字段仍保留缺项`});this.changed()}
    }catch(error){interrupted=true;this.diagnostics.event('collector.failed',{platform:task.platform,taskId:task.id},error);if(!this.stopped.has(task.id))this.store.update(task.id,{status:error instanceof CollectionError&&error.category==='login_or_verification'?'needs_login':'partial',message:error instanceof CollectionError?error.message:'详情读取暂时中断，已保留结果，可继续提取'})}
    finally{this.runs.delete(task.id);if(this.active===task.id)this.active=undefined;this.progress.get(task.id)?.close();this.progress.delete(task.id);const latest=this.store.get(task.id);this.diagnostics.event('collector.end',{platform:task.platform,taskId:task.id,status:latest.status,count:latest.count,interrupted,durationMs:Date.now()-started});this.changed()}
  }
  async enrichTaobao(task:Task):Promise<void>{
    if(this.runs.size)throw new Error('上一个采集任务正在结束，请稍后再试')
    if(task.platform!=='taobao')throw new Error('此操作目前适用于淘宝订单')
    this.runs.add(task.id);this.stopped.delete(task.id);this.active=task.id
    const orders=pendingDetails(this.store.orders(task.id)),started=Date.now();let read=0,failed=0,interrupted=false
    this.store.update(task.id,{status:'running',operation:'details',message:'正在读取淘宝订单详情'});this.changed()
    this.diagnostics.event('collector.start',{platform:task.platform,taskId:task.id,count:orders.length})
    this.progress.set(task.id,new ExecutionProgress(this.diagnostics,'collector',{platform:task.platform,taskId:task.id}))
    try{
      this.stage(task,{phase:'platform'});const view=await this.ensure('taobao')
      for(let i=0;i<orders.length&&!this.stopped.has(task.id);i++){
        this.stage(task,{phase:'detail',current:i+1,total:orders.length})
        this.store.update(task.id,{message:`正在提取淘宝订单详情 ${i+1} / ${orders.length}`});this.changed()
        try{
          const url=taobaoDetailUrl(orders[i].detailUrl,orders[i].id)
          await this.assertPlanAccount(view,'taobao')
          await this.navigateDetail(view,url)
          let merged:Order|undefined,lastError:unknown,previous='',stable=0
          for(let attempt=0;attempt<40&&!this.stopped.has(task.id);attempt++){
            const snap=await view.webContents.executeJavaScript(`(${readTaobaoDetailPage.toString()})()`)
            try{const candidate=mergeTaobaoVisibleDetail(orders[i],snap);const signature=JSON.stringify({...candidate,capturedAt:''});stable=signature===previous?stable+1:0;previous=signature;merged=candidate;if(stable>=3)break}catch(error){merged=undefined;stable=0;previous='';lastError=error;if(error instanceof CollectionError&&error.category==='login_or_verification')throw error}
            await delay(250)
          }
          if(this.stopped.has(task.id))return
          if(!merged)throw lastError||new CollectionError('response_structure')
          await this.assertPlanAccount(view,'taobao')
          merged.detailReadAt=new Date().toISOString();this.store.add(task.id,[merged]);read++;this.changed()
          this.diagnostics.event('collector.detail',{platform:'taobao',taskId:task.id,current:i+1,total:orders.length})
        }catch(error){
          if(error instanceof CollectionError&&['login_or_verification','platform_limit','account_changed','network','timeout'].includes(error.category))throw error
          failed++;this.diagnostics.event('collector.detail_failed',{platform:'taobao',taskId:task.id,current:i+1,total:orders.length},error,'warn')
        }
        if(i+1<orders.length)await delay(900)
      }
      if(!this.stopped.has(task.id))this.store.update(task.id,{status:'partial',message:`详情读取结束：${read} 笔取得可见字段${failed?`，${failed} 笔暂未识别`:''}；未获取字段仍待核对，已有结果可导出`})
    }catch(error){interrupted=true;this.diagnostics.event('collector.failed',{platform:'taobao',taskId:task.id},error);if(!this.stopped.has(task.id))this.store.update(task.id,{status:error instanceof CollectionError&&error.category==='login_or_verification'?'needs_login':'partial',message:error instanceof CollectionError?error.message:'详情读取暂时中断，已有订单已保留，请重试'})}
    finally{this.runs.delete(task.id);if(this.active===task.id)this.active=undefined;this.progress.get(task.id)?.close();this.progress.delete(task.id);const latest=this.store.get(task.id);this.diagnostics.event('collector.end',{platform:'taobao',taskId:task.id,status:latest.status,count:latest.count,interrupted,durationMs:Date.now()-started});this.changed()}
  }
  hide(){if(this.current){this.win.contentView.removeChildView(this.current);this.current=undefined}}
  async show(id:PlatformId):Promise<void>{
    const loading=this.ensure(id)
    const view=this.views.get(id)
    if(view){this.hide();this.current=view;this.win.contentView.addChildView(view);this.layout()}
    // Show the official page while it loads; its analytics/assets must not freeze the host UI.
    await Promise.race([loading,delay(800)])
    if(id==='alibaba'&&view&&isAlibabaLoginLanding(view.webContents.getURL()))await view.webContents.loadURL(platformById(id).url).catch(()=>{})
  }
  async ensure(id:PlatformId):Promise<WebContentsView>{
    const prior=this.views.get(id);if(prior&&!prior.webContents.isDestroyed())return prior
    const ses=session.fromPartition(`persist:orderdesk-${id}`);ses.setPermissionRequestHandler((_w,_p,done)=>done(false))
    const view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}})
    let loginReturns=0
    view.webContents.on('did-navigate',(_event,url)=>{
      if(id==='alibaba'&&isAlibabaLoginLanding(url)&&loginReturns<2){loginReturns++;void view.webContents.loadURL(platformById(id).url).catch(()=>{})}
    })
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
    // Taobao list responses belong to an explicit month/page request below.
    // Unrelated official-page refreshes must not change its cursor or page count.
    if(platform==='taobao'||platform==='pdd'||task.plan||task.operation==='details')return
    try{
      const orders=normalizePayload(platform,parsePayload(body));if(!orders.length){this.diagnostics.event('collector.response',{platform,taskId:task.id,received:0});return}
      const unknown=orders.filter(o=>!o.createdAt).length;const count=this.store.add(task.id,orders);this.captureCount++
      this.diagnostics.event('collector.response',{platform,taskId:task.id,received:orders.length,unknown,count:this.store.get(task.id).count})
      this.store.update(task.id,{pages:task.pages+1,message:unknown?`${unknown} 笔订单缺少日期，未混入所选日期范围`:`已读取订单，当前范围内 ${this.store.get(task.id).count} 笔`});if(count||unknown)this.changed()
    }catch(error){this.diagnostics.event('collector.parse_failed',{platform,taskId:task.id},error,'warn')}
  }
  stop(id:string){this.diagnostics.event('collector.stop',{taskId:id});this.progress.get(id)?.close();this.progress.delete(id);this.stopped.add(id);if(this.active===id)this.active=undefined}
  async run(task:Task):Promise<void>{
    if(task.operation==='details')return this.enrichDetails(task)
    if(this.runs.size)throw new Error('上一个采集任务正在结束，请稍后再试')
    this.runs.add(task.id);this.stopped.delete(task.id);this.active=task.id
    const started=Date.now();let interrupted=false;this.diagnostics.event('collector.start',{platform:task.platform,taskId:task.id,count:task.count,pages:task.pages})
    this.progress.get(task.id)?.close();this.progress.set(task.id,new ExecutionProgress(this.diagnostics,'collector',{platform:task.platform,taskId:task.id}))
    try{
      if(platformById(task.platform).mode==='proxy'){this.stage(task,{phase:'response'});this.diagnostics.event('collector.waiting',{platform:task.platform,taskId:task.id});this.store.update(task.id,{message:'正在等待订单页面数据；请在微信小程序打开买家订单列表'});this.changed();return}
      this.stage(task,{phase:'platform'})
      const view=await this.ensure(task.platform);if(this.stopped.has(task.id))return
      if(task.plan)await this.runPlan(task,view)
      else if(task.platform==='xianyu')await this.runXianyu(task,view)
      else if(task.platform==='alibaba')await this.runAlibaba(task,view)
      else if(task.platform==='taobao')await this.runTaobao(task,view)
      else if(task.platform==='pdd')await this.runPdd(task,view)
      else if(task.platform==='jd')await this.runJD(task,view)
      else { await view.webContents.loadURL(platformById(task.platform).url);if(!this.stopped.has(task.id))await this.runPage(task,view) }
    }catch(e){interrupted=true;this.diagnostics.event('collector.failed',{platform:task.platform,taskId:task.id},e);if(!this.stopped.has(task.id)){const category=safeError(e).category;this.store.update(task.id,{listOutcome:'interrupted',status:category==='login_or_verification'?'needs_login':this.store.get(task.id).count?'partial':'failed',message:e instanceof Error?e.message:'采集暂时失败，请打开平台页检查'});this.changed()}}
    finally{this.runs.delete(task.id);if(!this.disposing){const latest=this.store.get(task.id);if(platformById(task.platform).mode!=='proxy'||latest.status!=='running'){this.progress.get(task.id)?.close();this.progress.delete(task.id)}this.diagnostics.event('collector.end',{platform:task.platform,taskId:task.id,status:latest.status,count:latest.count,pages:latest.pages,interrupted,durationMs:Date.now()-started})}}
  }
  private async runPlan(task:Task,view:WebContentsView){
    const methods={taobao:this.runTaobao,alibaba:this.runAlibaba,jd:this.runJD,pdd:this.runPdd,xianyu:this.runXianyu}
    const method=methods[task.platform as keyof typeof methods];if(!method)throw new Error('此平台暂不支持提取计划')
    for(const original of task.plan!.buckets){
      if(this.stopped.has(task.id))return
      const latest=this.store.get(task.id),plan=latest.plan!,bucket=plan.buckets.find(b=>b.id===original.id)!
      if(bucket.status==='completed')continue
      plan.currentBucket=bucket.id;bucket.status='running';plan.segments=plan.segments.map(s=>bucket.segmentIds.includes(s.id)?{...s,status:'running'}:s)
      this.store.update(task.id,{plan,cursor:bucket.cursor,listOutcome:'pending',status:'running',message:`正在提取 ${bucket.from} 至 ${bucket.to}`});this.changed()
      let returned=false
      try{await method.call(this,{...this.store.get(task.id),from:bucket.from,to:bucket.to},view);returned=true}
      finally{
        const current=this.store.get(task.id),saved=current.plan!,target=saved.buckets.find(b=>b.id===bucket.id)!
        const done=returned&&!this.stopped.has(task.id)&&current.listOutcome==='complete'
        target.cursor=current.cursor;target.status=done?'completed':this.stopped.has(task.id)?'paused':'needs_attention'
        const counts=new Map<string,number>();for(const order of this.store.orders(task.id)){const key=order.createdAt.slice(0,saved.granularity==='day'?10:7);counts.set(key,(counts.get(key)||0)+1)}
        saved.segments=saved.segments.map(segment=>({...segment,count:counts.get(segment.from.slice(0,saved.granularity==='day'?10:7))||0,status:target.segmentIds.includes(segment.id)?target.status:segment.status}))
        this.store.update(task.id,{plan:saved});this.changed()
      }
      const current=this.store.get(task.id)
      if(this.stopped.has(task.id)||current.listOutcome!=='complete')return
      this.store.update(task.id,{status:'running',listOutcome:'pending'});this.changed()
      if(current.plan!.buckets.some(b=>b.status!=='completed'))await delay(1600)
    }
    if(!this.stopped.has(task.id)){const count=this.store.get(task.id).count;this.store.update(task.id,{listOutcome:'complete',cursor:'',status:count?'partial':'completed',message:count?'提取计划的列表已全部读取，已有订单可导出；详情缺项仍待核对':'提取计划已全部查完，所选日期没有订单'});this.changed()}
  }
  async runXianyu(task:Task,view:WebContentsView){
    let cursor:{page:number;offset?:string;details?:boolean}={page:1};if(task.cursor)try{cursor=JSON.parse(task.cursor)}catch{}
    const finish=async()=>{await this.xianyuDetails(task,view);if(!this.stopped.has(task.id)){const missing=this.store.orders(task.id).some(o=>o.missing.length);this.store.update(task.id,{listOutcome:'complete',status:missing?'partial':'completed',message:missing?'订单列表已读完，部分详情需重试':'所选日期范围读取完成'});this.changed()}}
    if(cursor.details){await finish();return}
    for(let page=cursor.page,reads=0;reads<500&&!this.stopped.has(task.id);page++,reads++){
      this.stage(task,{phase:'page',page})
      const response=await this.request(view,'mtop.idle.web.trade.bought.list',{pageNumber:page,orderStatus:'ALL',...(cursor.offset?{offsetRow:cursor.offset}:{})},'xianyu');if(this.stopped.has(task.id))return
      if(!Array.isArray(response?.data?.items))throw new CollectionError('response_structure')
      const orders=normalizePayload('xianyu',response);this.store.add(task.id,orders);this.store.update(task.id,{pages:page,message:`正在读取第 ${page} 页`});this.changed()
      this.pageRead(task,page,orders.length)
      const older=orders.some(o=>o.createdAt&&o.createdAt.slice(0,10)<task.from)
      if(older||!(response.data.nextPage===true||response.data.nextPage==='true')){this.store.update(task.id,{cursor:JSON.stringify({...cursor,details:true})});await finish();return}
      cursor={page:page+1,offset:response.data.lastEndRow};this.store.update(task.id,{cursor:JSON.stringify(cursor)});await delay(1300)
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{listOutcome:'limit',status:'partial',message:'已达到本次分页上限，可继续处理'});this.changed()}
  }
  async runAlibaba(task:Task,view:WebContentsView){
    const pageSize=20
    let firstPage=1;if(task.cursor)try{firstPage=JSON.parse(task.cursor).nextPage||1}catch{}
    for(let page=firstPage,reads=0;reads<1000&&!this.stopped.has(task.id);page++,reads++){
      this.stage(task,{phase:'page',page})
      const data={serviceId:'OrderListDataLineService.buyerOrderList',param:JSON.stringify({startDateTime:task.from+' 00:00:00',endDateTime:task.to+' 23:59:59',page,pageSize})}
      const response=await this.request(view,'mtop.1688.trading.dataline.service',data,'alibaba');if(this.stopped.has(task.id))return
      const result=response?.data?.data?.result
      const parsed=typeof result==='string'?parsePayload(result):result
      if(!parsed?.success||!Array.isArray(parsed?.data?.data))throw new CollectionError('response_structure')
      const orders=normalizePayload('alibaba',parsed);this.store.add(task.id,orders)
      this.pageRead(task,page,orders.length)
      this.store.update(task.id,{pages:page,cursor:JSON.stringify({nextPage:page+1}),message:`正在读取 1688 第 ${page} 页`});this.changed()
      if(parsed.data.data.length===0||page>=Number(parsed.data.pages)){
        this.store.update(task.id,{listOutcome:'complete',status:'partial',message:'1688 列表读取结束；收货、物流、发票等详情仍需核对，已有结果可以导出'});this.changed();return
      }
      await delay(1500)
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{listOutcome:'limit',status:'partial',message:'本次达到分页上限，已有结果可导出'});this.changed()}
  }
  async runJD(task:Task,view:WebContentsView){
    const currentYear=Number(dateText(Date.now()).slice(0,4));let pages=task.pages,resume:{year?:number;nextPage?:number}={};if(task.cursor)try{resume=JSON.parse(task.cursor)}catch{}
    const base:Partial<Order>={platform:'jd',account:'当前账号',paidAt:'',shippedAt:'',completedAt:'',status:'',shop:'',sellerId:'',paidFen:null,freightFen:null,refundFen:null,refundStatus:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',detailUrl:'',extra:{},source:'page',capturedAt:new Date().toISOString()}
    for(let year=resume.year??Math.min(Number(task.to.slice(0,4)),currentYear);year>=Number(task.from.slice(0,4))&&!this.stopped.has(task.id);year--){
      let signature=''
      for(let page=year===resume.year?(resume.nextPage||1):1,reads=0;reads<1000&&!this.stopped.has(task.id);page++,reads++){
        this.stage(task,{phase:'page',page,year})
        const url=new URL(platformById('jd').url);url.searchParams.set('d',year===currentYear?'2':String(year));url.searchParams.set('s','4096');url.searchParams.set('page',String(page))
        await this.assertPlanAccount(view,'jd');await this.navigateDetail(view,url.href);await delay(1200);await this.assertPlanAccount(view,'jd');if(this.stopped.has(task.id))return
        let snap:any
        for(let attempt=0;attempt<20&&!this.stopped.has(task.id);attempt++){
          snap=await view.webContents.executeJavaScript(`(${readOrderPage.toString()})('jd')`)
          if(snap.blocked||((snap.rows.length||snap.empty)&&(!snap.modern||(snap.selectedRange===(year===currentYear?'今年内订单':`${year}年订单`)&&(snap.empty||snap.page===page)))))break
          if(attempt<19)await delay(500)
        }
        if(this.stopped.has(task.id))return
        if(snap.blocked)throw new CollectionError('login_or_verification')
        if(snap.modern&&(snap.selectedRange!==(year===currentYear?'今年内订单':`${year}年订单`)||(!snap.empty&&(snap.page!==page||!snap.totalPages||snap.totalPages<page||snap.hasNext!==(page<snap.totalPages)))))throw new CollectionError('response_structure')
        if(!snap.rows.length&&!snap.empty)throw new CollectionError('response_structure')
        if(snap.rows.length&&snap.signature===signature)throw new CollectionError('response_structure')
        signature=snap.signature
        const rows:Order[]=snap.rows.map((r:any)=>({...base,...r,createdAt:dateText(r.createdAt),paidFen:moneyFen(r.paid),detailState:'pending',missing:['订单详情']}))
        this.store.add(task.id,rows);this.store.update(task.id,{pages:++pages,cursor:JSON.stringify(snap.hasNext&&!snap.empty?{year,nextPage:page+1}:{year:year-1,nextPage:1}),message:`正在读取京东 ${year} 年第 ${page} 页`});this.changed()
        this.pageRead(task,page,rows.length,{year})
        if(!snap.hasNext||snap.empty)break
        if(reads===999){this.store.update(task.id,{listOutcome:'limit',status:'partial',message:'京东本年度达到分页上限，可继续采集'});this.changed();return}
      }
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{listOutcome:'complete',status:'partial',message:'京东所选年份列表已读取，订单详情和平台完整范围仍需核对'});this.changed()}
  }
  async runTaobao(task:Task,view:WebContentsView){
    if(!view.webContents.getURL().startsWith('https://buyertrade.taobao.com/trade/itemlist/'))await this.navigateDetail(view,platformById('taobao').url)
    const months=taobaoMonths(task.from,task.to)
    let start=0,firstPage=1,reads=0
    if(task.cursor)try{const c=JSON.parse(task.cursor);if(months.includes(c.month)&&Number.isSafeInteger(c.nextPage)&&c.nextPage>0){start=months.indexOf(c.month);firstPage=c.nextPage}}catch{}
    for(let index=start;index<months.length&&!this.stopped.has(task.id);index++){
      let page=index===start?firstPage:1,signature=''
      while(!this.stopped.has(task.id)&&reads<1000){
        const month=months[index],context={phase:'page',page,year:Number(month.slice(0,4)),month:Number(month.slice(5,7))}
        this.stage(task,context)
        const response=await this.request(view,'mtop.taobao.order.queryboughtlistV2',taobaoListData(month,page),'taobao')
        if(this.stopped.has(task.id))return
        const orders=normalizePayload('taobao',response),nextSignature=orders.map(o=>o.id).sort().join('|')
        if(orders.length&&signature===nextSignature)throw new CollectionError('response_structure')
        signature=nextSignature
        this.store.add(task.id,orders)
        const next=taobaoNextPage(response,page,orders.length)
        const cursor=next?{month,nextPage:next}:index+1<months.length?{month:months[index+1],nextPage:1}:undefined
        this.store.update(task.id,{pages:this.store.get(task.id).pages+1,cursor:cursor?JSON.stringify(cursor):'',message:`正在读取淘宝 ${month} 第 ${page} 页`});this.changed()
        this.pageRead(task,page,orders.length,context);reads++
        if(next===null)break
        page=next;await delay(1600)
      }
      if(reads>=1000&&this.store.get(task.id).cursor){this.store.update(task.id,{listOutcome:'limit',status:'partial',message:'本次达到分页上限，已保存月份和页码，可继续采集'});this.changed();return}
      if(index+1<months.length)await delay(1600)
    }
    if(!this.stopped.has(task.id)){
      const count=this.store.get(task.id).count
      this.store.update(task.id,count?{listOutcome:'complete',status:'partial',message:'淘宝所选月份列表已读取；订单详情仍需补全，已有结果可以导出'}:{listOutcome:'complete',status:'completed',message:`已查完 ${task.from} 至 ${task.to}，该下单日期范围内没有订单。请调整日期范围或核对当前账号。`});this.changed()
    }
  }
  private async pddIdentity(task:Task,view:WebContentsView){
    const cookies=await view.webContents.session.cookies.get({url:'https://mobile.yangkeduo.com/'})
    const accessToken=cookies.find(c=>c.name==='PDDAccessToken')?.value||'',userId=cookies.find(c=>c.name==='pdd_user_id')?.value||''
    if(!accessToken||!/^\d{1,40}$/.test(userId))throw new CollectionError('login_or_verification')
    const accountKey=createHash('sha256').update('orderdesk:pdd:'+userId).digest('hex'),latest=this.store.get(task.id)
    if((latest.accountKey&&latest.accountKey!==accountKey)||(!latest.accountKey&&latest.count>0))throw new CollectionError('account_changed')
    if(!latest.accountKey)this.store.update(task.id,{accountKey})
    return {accessToken,userId}
  }
  async runPdd(task:Task,view:WebContentsView){
    let offset='0',details=false
    if(task.cursor)try{const c=JSON.parse(task.cursor);if(c.kind==='pdd'&&typeof c.offset==='string'){offset=c.offset;details=c.details===true}}catch{}
    const finish=async()=>{await this.pddDetails(task,view);if(!this.stopped.has(task.id)){this.store.update(task.id,{listOutcome:'complete',status:'partial',message:'拼多多列表和详情已处理；可导出结果及缺项清单，平台完整范围仍需核对'});this.changed()}}
    if(details){await finish();return}
    const seen=new Set<string>()
    for(let read=0;read<1000&&!this.stopped.has(task.id);read++){
      if(seen.has(offset))throw new CollectionError('response_structure');seen.add(offset)
      const page=this.store.get(task.id).pages+1;this.stage(task,{phase:'page',page})
      const {accessToken,userId}=await this.pddIdentity(task,view)
      const result=unwrapMtopResponse(await view.webContents.executeJavaScript(`(${pddPageRequest.toString()})(${JSON.stringify(accessToken)},${JSON.stringify(userId)},${JSON.stringify(offset)})`))
      if(this.stopped.has(task.id))return
      await this.pddIdentity(task,view)
      const response= parsePayload(result.body),batch=parsePddList(response,offset),orders=normalizePayload('pdd',response)
      if(batch.orders.length!==orders.length)throw new CollectionError('response_structure')
      this.store.add(task.id,orders)
      const lastDate=orders.at(-1)?.createdAt,ended=batch.ended||!!(lastDate&&lastDate.slice(0,10)<task.from)
      this.store.update(task.id,{pages:page,cursor:JSON.stringify(ended?{kind:'pdd',offset,details:true}:{kind:'pdd',offset:batch.nextOffset}),message:`正在读取拼多多第 ${page} 页`});this.changed()
      this.pageRead(task,page,orders.length)
      if(ended){await finish();return}
      offset=batch.nextOffset!;await delay(1600)
    }
    if(!this.stopped.has(task.id)){this.store.update(task.id,{listOutcome:'limit',status:'partial',message:'本次达到分页上限，已保存进度，可继续采集'});this.changed()}
  }
  private async pddDetails(task:Task,view:WebContentsView){
    const orders=pendingDetails(this.store.orders(task.id))
    for(let i=0;i<orders.length&&!this.stopped.has(task.id);i++){
      this.stage(task,{phase:'detail',current:i+1,total:orders.length})
      await this.pddIdentity(task,view)
      try{
        const result=unwrapMtopResponse(await view.webContents.executeJavaScript(`(${pddDetailRequest.toString()})(${JSON.stringify(orders[i].id)})`))
        if(this.stopped.has(task.id))return
        await this.pddIdentity(task,view)
        this.store.add(task.id,[{...normalizePddDetail(orders[i],parsePddDetailHtml(result.body,orders[i].id)),detailReadAt:new Date().toISOString()}])
      }catch(error){
        if(error instanceof CollectionError&&['login_or_verification','account_changed','platform_limit','network','timeout'].includes(error.category))throw error
        this.diagnostics.event('collector.detail_failed',{platform:task.platform,taskId:task.id},error,'warn')
      }
      this.store.update(task.id,{message:`正在补全拼多多订单详情 ${i+1} / ${orders.length}`});this.changed()
      this.diagnostics.event('collector.detail',{platform:task.platform,taskId:task.id,current:i+1,total:orders.length})
      if(i+1<orders.length)await delay(900)
    }
  }
  async xianyuDetails(task:Task,view:WebContentsView){
    const all=pendingDetails(this.store.orders(task.id))
    for(let i=0;i<all.length&&!this.stopped.has(task.id);i++){
      this.stage(task,{phase:'detail',current:i+1,total:all.length})
      let order=all[i]
      try{const response=await this.request(view,'mtop.idle.web.trade.order.detail',{tid:order.id},'xianyu');order=mergeXianyuDetail(order,response)}catch(error){if(error instanceof CollectionError&&['login_or_verification','platform_limit','account_changed','network','timeout'].includes(error.category))throw error;this.diagnostics.event('collector.detail_failed',{platform:task.platform,taskId:task.id},error,'warn');order={...order,missing:[...order.missing,'订单详情']}}
      if(this.stopped.has(task.id))return
      if(order.detailState==='complete')order.detailReadAt=new Date().toISOString()
      this.store.add(task.id,[order]);this.store.update(task.id,{message:`正在补全订单详情 ${i+1} / ${all.length}`});this.changed();await delay(900)
      this.diagnostics.event('collector.detail',{platform:task.platform,taskId:task.id,current:i+1,total:all.length})
    }
  }
  private async jdDetails(task:Task,view:WebContentsView){await this.visibleDetails(task,view)}
  private async alibabaDetails(task:Task,view:WebContentsView){
    const api='mtop.1688.trading.dataline.service',hash=(value:string)=>createHash('sha256').update(value).digest('hex')
    const records=async()=>{const response=await this.request(view,api,{serviceId:'OrderExportDataLineService.exportRecords',param:'buyerOrder'},'alibaba');if(!Array.isArray(response?.data?.data))throw new CollectionError('response_structure');return response.data.data as {path?:string;gmtCreate?:string;exportStatus?:string}[]}
    let checkpoint=this.store.get(task.id).detailExport
    if(!checkpoint){
      const previous=(await records()).filter(r=>typeof r.path==='string').map(r=>hash(r.path!));if(this.stopped.has(task.id))return
      checkpoint={requestedAt:new Date().toISOString(),previous};this.store.update(task.id,{detailExport:checkpoint})
      const response=await this.request(view,api,{serviceId:'OrderExportDataLineService.buyerExportOrder',param:JSON.stringify({exportType:'buyerOrder',startDateTime:task.from+' 00:00:00',endDateTime:task.to+' 23:59:59'})},'alibaba')
      const token=String(response?.data?.data||'');if(!/^\d{13}$/.test(token))throw new CollectionError('response_structure')
      checkpoint.token=token;this.store.update(task.id,{detailExport:checkpoint})
    }
    for(let attempt=0;attempt<12&&!this.stopped.has(task.id);attempt++){
      this.stage(task,{phase:'detail',current:attempt+1,total:12});this.store.update(task.id,{message:`等待1688官方详情文件生成（${attempt+1} / 12），可以暂停后继续`});this.changed()
      const all=await records();if(this.stopped.has(task.id))return
      const candidates=all.filter(r=>{if(r.exportStatus!=='SUCCESS'||!r.path||checkpoint!.previous.includes(hash(r.path)))return false;const stamp=dateText(r.gmtCreate);if(checkpoint!.token)return stamp===dateText(Number(checkpoint!.token));const delta=Date.parse(stamp.replace(' ','T')+'+08:00')-Date.parse(checkpoint!.requestedAt);return delta>=-1000&&delta<=30000})
      if(candidates.length>1)throw new CollectionError('response_structure')
      if(candidates.length===1){
        const response=await view.webContents.session.fetch(alibabaExportUrl(candidates[0].path!));if(!response.ok)throw new CollectionError('network')
        if(response.url)alibabaExportUrl(response.url)
        const reader=response.body?.getReader();if(!reader)throw new CollectionError('response_structure');const chunks:Buffer[]=[];let size=0
        try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32*1024*1024)throw new Error('官方详情文件超过32MB，请缩小日期范围');chunks.push(Buffer.from(value));if(this.stopped.has(task.id))return}}finally{await reader.cancel().catch(()=>{})}
        const rows=await readAlibabaExport(Buffer.concat(chunks),pendingDetails(this.store.orders(task.id)))
        if(this.stopped.has(task.id))return
        await this.assertPlanAccount(view,'alibaba');this.store.add(task.id,rows);this.changed()
        this.diagnostics.event('collector.detail',{platform:'alibaba',taskId:task.id,current:rows.length,total:task.count})
        return
      }
      if(attempt<11)await delay(10000)
    }
    if(!this.stopped.has(task.id))throw new Error('1688官方文件暂未生成，请稍后继续提取详情')
  }
  private async visibleDetails(task:Task,view:WebContentsView){
    const orders=pendingDetails(this.store.orders(task.id))
    for(let i=0;i<orders.length&&!this.stopped.has(task.id);i++){
      this.stage(task,{phase:'detail',current:i+1,total:orders.length})
      this.store.update(task.id,{message:`正在提取${platformById(task.platform).name}订单详情 ${i+1} / ${orders.length}`});this.changed()
      try{
        const url=platformDetailUrl(task.platform,orders[i].detailUrl,orders[i].id)
        await this.assertPlanAccount(view,task.platform);await this.navigateDetail(view,url)
        let merged:Order|undefined,previous='',stable=0
        for(let attempt=0;attempt<40&&!this.stopped.has(task.id);attempt++){
          const snap=await view.webContents.executeJavaScript(`(${readTaobaoDetailPage.toString()})()`)
          try{const candidate=mergePlatformVisibleDetail(orders[i],snap),signature=JSON.stringify({...candidate,capturedAt:''});stable=signature===previous?stable+1:0;previous=signature;merged=candidate;if(stable>=3)break}
          catch(error){merged=undefined;stable=0;previous='';if(error instanceof CollectionError&&error.category==='login_or_verification')throw error}
          await delay(250)
        }
        if(this.stopped.has(task.id))return
        if(!merged)throw new CollectionError('response_structure')
        await this.assertPlanAccount(view,task.platform)
        this.store.add(task.id,[{...merged,detailReadAt:new Date().toISOString()}]);this.changed()
        this.diagnostics.event('collector.detail',{platform:task.platform,taskId:task.id,current:i+1,total:orders.length})
      }catch(error){if(error instanceof CollectionError&&['login_or_verification','platform_limit','account_changed','network','timeout'].includes(error.category))throw error;this.diagnostics.event('collector.detail_failed',{platform:task.platform,taskId:task.id,current:i+1,total:orders.length},error,'warn')}
      if(i+1<orders.length)await delay(900)
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
