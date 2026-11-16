import {it,expect,vi} from 'vitest'
const views:any[]=[]
vi.mock('electron',()=>({session:{fromPartition:()=>({setPermissionRequestHandler(){},cookies:{get:async()=>[]}})},WebContentsView:class{setBounds(){}webContents:any;constructor(){const events:any={};this.webContents={events,getUserAgent:()=>'',setUserAgent(){},isDestroyed:()=>false,on:(name:string,fn:any)=>events[name]=fn,setWindowOpenHandler(){},loadURL:vi.fn(async()=>{}),debugger:{attach(){},isAttached:()=>false,sendCommand:vi.fn(async()=>({body:'{}'})),on:(name:string,fn:any)=>events[name]=fn},close(){}};views.push(this)}}}))
import {Collector} from '../src/main/collector'
import {CollectionError} from '../src/main/collection-errors'
function fixture(){const tasks:any={a:{id:'a',platform:'taobao',status:'running'},b:{id:'b',platform:'jd',status:'running'}};const store:any={get:(id:string)=>tasks[id],update:(id:string,patch:any)=>Object.assign(tasks[id],patch),orders:()=>[],add:vi.fn()};const c:any=new Collector({on(){},contentView:{addChildView(){},removeChildView(){}},getContentSize:()=>[1200,800]} as any,store,()=>{},{event(){}} as any);c.ensure=async()=>({});return{c,tasks,store}}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve}}
function alibabaModeFixture(){
 const {tasks,store}=fixture();Object.assign(tasks.a,{platform:'alibaba',mode:'ordinary',count:0,pages:0,listOutcome:'complete',message:''})
 const c:any=new Collector({on(){},contentView:{addChildView(){},removeChildView(){}},getContentSize:()=>[1200,800]} as any,store,()=>{},{event(){}} as any)
 return {c,tasks,store}
}
it('starts ordinary collection after an official-export view using its own platform lease',async()=>{
 const {c,tasks,store}=alibabaModeFixture();const official=await c.ensure('alibaba','official-export')
 const entered:any[]=[];c.runAlibaba=async(task:any,view:any)=>{entered.push(view);store.update(task.id,{status:'partial',message:'ordinary list read'})}
 await c.run(tasks.a)
 expect(entered).toHaveLength(1);expect(entered[0]).not.toBe(official);expect(tasks.a.message).toBe('ordinary list read');expect(c.platformRuns).toEqual([])
})
it('opens ordinary detail extraction after an official-export view without rejecting its own lease',async()=>{
 const {c,tasks}=alibabaModeFixture();const official=await c.ensure('alibaba','official-export');const entered:any[]=[]
 c.alibabaDetails=async(_task:any,view:any)=>entered.push(view)
 await c.enrichDetails(tasks.a)
 expect(entered).toHaveLength(1);expect(entered[0]).not.toBe(official);expect(c.platformRuns).toEqual([])
})
it('opens an ordinary order detail after an official view but rejects mode switches owned by another run',async()=>{
 const {c}=alibabaModeFixture();const official=await c.ensure('alibaba','official-export');const other=c.registry.acquire('alibaba','other')
 await expect(c.show('alibaba','ordinary')).rejects.toThrow(/暂停/)
 expect(c.views.get('alibaba')).toBe(official);c.registry.release(other)
 c.navigateDetail=async()=>{}
 await expect(c.openOrder({platform:'alibaba',id:'123',detailUrl:'https://trade.1688.com/order/detail.htm?orderId=123'})).resolves.toBeUndefined()
 expect(c.current).not.toBe(official);expect(c.platformRuns).toEqual([])
})
it('routes valid captured orders to their owner and drops valid old-generation payloads',()=>{
 const {c,tasks,store}=fixture();Object.assign(tasks.a,{platform:'alibaba',pages:0,count:0})
 const old=c.registry.acquire('alibaba','a'),other=c.registry.acquire('jd','b'),capture=c.capture('alibaba')
 const body=JSON.stringify({idStr:'1002',gmtCreate:'2026-10-01 10:00:00',sumPayment:'100',orderEntries:[{sourceId:'1',productName:'synthetic',quantity:{realAmount:1}}]})
 capture(body);expect(store.add).toHaveBeenCalledWith('a',[expect.objectContaining({platform:'alibaba',id:'1002'})]);expect(old.captureCount).toBe(1);expect(other.captureCount).toBe(0)
 store.add.mockClear();c.stop('a');c.registry.release(old);c.stopped.delete('a');const resumed=c.registry.acquire('alibaba','a')
 capture(body);expect(store.add).not.toHaveBeenCalled();c.capture('alibaba')(body)
 expect(store.add).toHaveBeenCalledOnce();expect(resumed.captureCount).toBe(1);expect(other.captureCount).toBe(0)
})
it('runs two platforms with real overlap; stopping one rejects reentry until drain',async()=>{const {c,tasks}=fixture(),a=deferred(),b=deferred(),entered:string[]=[];c.runTaobao=async()=>{entered.push('a');await a.promise};c.runJD=async()=>{entered.push('b');await b.promise};const pa=c.run(tasks.a),pb=c.run(tasks.b);await Promise.resolve();expect(entered).toEqual(['a','b']);c.stop('a');expect(()=>c.assertIdle('taobao')).toThrow();expect(c.platformRuns.find((x:any)=>x.platform==='jd').stopping).toBe(false);a.resolve();await pa;expect(()=>c.assertIdle('taobao')).not.toThrow();b.resolve();await pb;expect(c.platformRuns).toEqual([])})
it('verification failure on A leaves B owned and running',async()=>{const {c,tasks}=fixture(),b=deferred();c.runTaobao=async()=>{throw new CollectionError('login_or_verification')};c.runJD=async()=>b.promise;const pa=c.run(tasks.a),pb=c.run(tasks.b);await pa;expect(tasks.a.status).toBe('needs_login');expect(tasks.b.status).toBe('running');expect(c.platformRuns.map((x:any)=>x.taskId)).toEqual(['b']);b.resolve();await pb})
it('request capture closure rejects stopped and resumed same-id owners',()=>{const{c,tasks,store}=fixture();tasks.a.platform='alibaba';const old=c.registry.acquire('alibaba','a'),capture=c.capture('alibaba');c.stop('a');c.registry.release(old);c.stopped.delete('a');c.registry.acquire('alibaba','a');capture('{}');expect(store.add).not.toHaveBeenCalled()})
it('deduplicates initialization and rejects concurrent mode replacement',async()=>{const gate=deferred();const c:any=new Collector({on(){}} as any,{} as any,()=>{},{event(){}} as any);const create=c.createView.bind(c);c.createView=async(...args:any[])=>{const view=await create(...args);await gate.promise;return view};const a=c.ensure('alibaba'),b=c.ensure('alibaba');await expect(c.ensure('alibaba','official-export')).rejects.toThrow();gate.resolve();expect(await a).toBe(await b)})
it('binds CDP bodies before stop and never reassigns them to resumed task or another platform',async()=>{const {tasks,store}=fixture();tasks.a.platform='alibaba';const c:any=new Collector({on(){}} as any,store,()=>{},{event(){}} as any);const view:any=await c.ensure('alibaba'),jd:any=await c.ensure('jd');const old=c.registry.acquire('alibaba','a'),other=c.registry.acquire('jd','b');let resolve!:(x:any)=>void;view.webContents.debugger.sendCommand=vi.fn(()=>new Promise(r=>resolve=r));const accept=vi.spyOn(c,'accept');view.webContents.events.message({},'Network.requestWillBeSent',{requestId:'same'});view.webContents.events.message({},'Network.responseReceived',{requestId:'same',response:{url:'https://air.1688.com/order/list',mimeType:'application/json'}});view.webContents.events.message({},'Network.loadingFinished',{requestId:'same'});jd.webContents.events.message({},'Network.requestWillBeSent',{requestId:'same'});c.stop('a');c.registry.release(old);c.stopped.delete('a');const resumed=c.registry.acquire('alibaba','a');resolve({body:'{}'});await Promise.resolve();expect(accept).toHaveBeenCalledWith('alibaba','{}',old);expect(c.registry.valid(old)).toBe(false);expect(c.registry.valid(resumed)).toBe(true);expect(c.registry.valid(other)).toBe(true);expect(store.add).not.toHaveBeenCalled()})
it('checks each task account explicitly and rejects changed identity using stored binding',async()=>{const {c,tasks}=fixture();tasks.a.plan={};tasks.b.plan={};const a=c.registry.acquire('taobao','a'),b=c.registry.acquire('jd','b');c.taskLeases.set(tasks.a,a);c.taskLeases.set(tasks.b,b);let identity='buyer-a';const av:any={webContents:{session:{cookies:{get:async()=>[{name:'unb',value:identity}]}}}},bv:any={webContents:{session:{cookies:{get:async()=>[{name:'pin',value:'buyer-b'}]}}}};await c.assertPlanAccount(av,'taobao',tasks.a);await c.assertPlanAccount(bv,'jd',tasks.b);expect(tasks.a.accountKey).not.toBe(tasks.b.accountKey);identity='changed';await expect(c.assertPlanAccount(av,'taobao',tasks.a)).rejects.toMatchObject({category:'account_changed'});expect(c.registry.valid(b)).toBe(true)})
it('retains proxy waiting ownership and permits browser while rejecting second auxiliary platform',async()=>{const {c,tasks}=fixture();tasks.a.platform='dewu';await c.run(tasks.a);expect(c.platformRuns.map((x:any)=>x.taskId)).toEqual(['a']);expect(()=>c.assertIdle('meituan')).toThrow();expect(()=>c.assertIdle('jd')).not.toThrow();c.stop('a');expect(()=>c.assertIdle('meituan')).not.toThrow()})
