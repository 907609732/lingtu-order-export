import {describe,it,expect,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Store} from '../src/core/store'
import {dateSegments,createPlan,acceptsPlanDate,pendingDetails,shouldHighlightDetails} from '../src/core/extraction-plan'
import {mergeOrders} from '../src/core/merge'
import {Collector} from '../src/main/collector'
import {CollectionError} from '../src/main/collection-errors'
import type {Order,PlatformId,Task} from '../src/shared/types'
vi.mock('electron',()=>({BrowserWindow:class{},WebContentsView:class{},session:{}}))
vi.mock('node:timers/promises',()=>({setTimeout:()=>Promise.resolve()}))
const platforms:PlatformId[]=['taobao','alibaba','pdd','jd','xianyu']
const order=(platform:PlatformId,id='1',date='2026-01-01'):Order=>({platform,id,createdAt:date+' 08:00:00',account:'synthetic',paidAt:'',shippedAt:'',completedAt:'',status:'',shop:'',sellerId:'',paidFen:100,freightFen:null,refundFen:null,refundStatus:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',detailUrl:'',items:[],extra:{},missing:['订单详情'],source:'response',capturedAt:'',detailState:'pending'})
function setup(platform:PlatformId){
 const store=new Store(':memory:');const collector=new Collector({on:()=>{}} as any,store,()=>{}, {event:()=>{}} as any)
 ;(collector as any).ensure=async()=>({})
 const task=store.create({platform,from:'2026-01-01',to:'2026-02-01',plan:{granularity:'day',segments:[{from:'2026-01-01',to:'2026-01-01'},{from:'2026-02-01',to:'2026-02-01'}]}})
 const method={taobao:'runTaobao',alibaba:'runAlibaba',pdd:'runPdd',jd:'runJD',xianyu:'runXianyu'}[platform as 'taobao'|'alibaba'|'pdd'|'jd'|'xianyu']
 return {store,collector,task,method}
}
describe('extraction plan dates and compatibility',()=>{
 it('clips months and includes leap day without timezone drift',()=>{
  expect(dateSegments('2024-02-28','2024-03-01','day')).toHaveLength(3)
  expect(dateSegments('2025-12-30','2026-02-02','month')).toEqual([{from:'2025-12-30',to:'2025-12-31'},{from:'2026-01-01',to:'2026-01-31'},{from:'2026-02-01',to:'2026-02-02'}])
  expect(()=>dateSegments('2026-02-30','2026-03-01','day')).toThrow()
 })
 it('normalizes duplicates, rejects unselected gaps and groups native queries',()=>{
  for(const platform of platforms){const plan=createPlan(platform,'2026-01-01','2026-01-03',{granularity:'day',segments:[{from:'2026-01-03',to:'2026-01-03'},{from:'2026-01-01',to:'2026-01-01'},{from:'2026-01-01',to:'2026-01-01'}]});expect(plan.segments).toHaveLength(2);expect(plan.buckets).toHaveLength(platform==='alibaba'?2:1);expect(acceptsPlanDate(plan,'2026-01-02')).toBe(false)}
  expect(()=>createPlan('dewu','2026-01-01','2026-01-01',{granularity:'day',segments:[{from:'2026-01-01',to:'2026-01-01'}]})).toThrow()
 })
 it('store merges IDs, excludes gaps and clear removes the plan with its orders',()=>{
  const {store,task}=setup('taobao');store.add(task.id,[order('taobao'),order('taobao','2','2026-01-02'),order('taobao','3','2026-02-01')]);store.add(task.id,[{...order('taobao'),receiver:'detail'}]);expect(store.orders(task.id)).toHaveLength(2);expect(store.orders(task.id)[0].receiver).toBe('detail');store.clear('taobao');expect(store.tasks()).toHaveLength(0);expect((store.db.prepare('SELECT COUNT(*) n FROM task_orders').get() as any).n).toBe(0);store.close()
 })
 it('highlight requires explicit list completion and unread detail, not missing fields',()=>{
  const {store,task}=setup('taobao');const rows=[order('taobao')];expect(shouldHighlightDetails({...task,status:'partial'},rows)).toBe(false);expect(shouldHighlightDetails({...task,plan:undefined,status:'partial',listOutcome:'complete'},rows)).toBe(true);expect(shouldHighlightDetails({...task,status:'partial',listOutcome:'complete'},rows)).toBe(false);expect(shouldHighlightDetails({...task,status:'running',listOutcome:'complete'},rows)).toBe(false);expect(shouldHighlightDetails({...task,status:'completed',listOutcome:'complete'},[])).toBe(false)
  const read={...rows[0],detailReadAt:'2026-10-15T00:00:00Z'};expect(pendingDetails([read])).toHaveLength(0);expect(read.missing).toContain('订单详情');expect(mergeOrders(read,rows[0]).detailReadAt).toBe(read.detailReadAt);store.close()
 })
})
describe.each(platforms)('%s plan lifecycle',platform=>{
 it.each(['success','empty','limit','network','login_or_verification','platform_limit','account_changed','paused'])('%s retains exact progress and resumes only unfinished buckets',async scenario=>{
  const {store,collector,task,method}=setup(platform);let fail=scenario,calls=0
  ;(collector as any)[method]=async(t:Task)=>{
   calls++;store.update(t.id,{cursor:'synthetic-checkpoint'})
   if(fail==='paused'){collector.stop(t.id);store.update(t.id,{status:'paused'});return}
   if(['network','login_or_verification','platform_limit','account_changed'].includes(fail))throw new CollectionError(fail)
   if(fail==='limit'){store.update(t.id,{status:'partial',listOutcome:'limit'});return}
   if(fail!=='empty')store.add(t.id,[order(platform,'1'),order(platform,'2','2026-02-01')])
   store.update(t.id,{status:'partial',listOutcome:'complete'})
  }
  await collector.run(task);const after=store.get(task.id)
  if(['success','empty'].includes(scenario)){expect(after.listOutcome).toBe('complete');expect(after.plan!.segments.every(s=>s.status==='completed')).toBe(true);expect(after.count).toBe(scenario==='empty'?0:2)}
  else{expect(after.listOutcome).not.toBe('complete');expect(after.plan!.segments.some(s=>['paused','needs_attention'].includes(s.status))).toBe(true);expect(after.plan!.buckets[0].cursor).toBe('synthetic-checkpoint');fail='success';store.update(task.id,{status:'running'});await collector.run(store.get(task.id));expect(store.get(task.id).listOutcome).toBe('complete')}
  const before=calls;await collector.run(store.get(task.id));expect(calls).toBe(before);expect(collector.runs.size).toBe(0);store.close()
 })
})

describe('plan restart checkpoints',()=>{
 it('restores interrupted bucket cursor and retains finished buckets and legacy tasks',()=>{
  const folder=mkdtempSync(join(tmpdir(),'order-plan-')),file=join(folder,'orders.sqlite');let store=new Store(file)
  try{
   const task=store.create({platform:'taobao',from:'2026-01-01',to:'2026-03-01',plan:{granularity:'month',segments:dateSegments('2026-01-01','2026-03-01','month')}})
   const plan=task.plan!;plan.buckets[0].status='completed';plan.buckets[1].status='running';plan.currentBucket=plan.buckets[1].id;for(const segment of plan.segments)if(plan.buckets[1].segmentIds.includes(segment.id))segment.status='running'
   store.update(task.id,{plan,cursor:'next-page-4'});store.close();store=new Store(file)
   const restored=store.get(task.id);expect(restored.status).toBe('paused');expect(restored.plan!.buckets[0].status).toBe('completed');expect(restored.plan!.buckets[1]).toMatchObject({status:'paused',cursor:'next-page-4'});expect(restored.plan!.segments.some(s=>s.status==='paused')).toBe(true)
  }finally{store.close();rmSync(folder,{recursive:true,force:true})}
 })
})

it.each(platforms)('%s persists running plans as paused after reopening',platform=>{
 const folder=mkdtempSync(join(tmpdir(),'order-plan-restart-')),file=join(folder,'orders.sqlite');let store=new Store(file)
 try{
  const task=store.create({platform,from:'2026-01-01',to:'2026-01-01',plan:{granularity:'day',segments:[{from:'2026-01-01',to:'2026-01-01'}]}})
  task.plan!.buckets[0].status='running';task.plan!.segments[0].status='running';store.update(task.id,{plan:task.plan,cursor:'checkpoint-3'});store.close();store=new Store(file)
  const restored=store.get(task.id);expect(restored.status).toBe('paused');expect(restored.plan!.buckets[0]).toMatchObject({status:'paused',cursor:'checkpoint-3'});expect(restored.listOutcome).not.toBe('complete')
 }finally{store.close();rmSync(folder,{recursive:true,force:true})}
})
