import type {DateSegment,ExtractionPlan,PlanInput,PlatformId,Order,Task} from '../shared/types'
import {checkRange,inRange} from './values'
export const planPlatforms:PlatformId[]=['taobao','alibaba','pdd','jd','xianyu']
export function dateSegments(from:string,to:string,granularity:'day'|'month'):DateSegment[]{
  checkRange(from,to)
  if(!['day','month'].includes(granularity))throw new Error('请选择按月或按天')
  const result:DateSegment[]=[];let cursor=from
  while(cursor<=to){
    const date=new Date(cursor+'T00:00:00Z')
    const next=granularity==='day'?new Date(date.getTime()+86400000):new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1))
    const end=new Date(next.getTime()-86400000).toISOString().slice(0,10)
    result.push({from:cursor,to:end<to?end:to});cursor=next.toISOString().slice(0,10)
    if(result.length>5000)throw new Error('单个计划最多选择 5000 个日期段，请缩小范围')
  }
  return result
}
export function createPlan(platform:PlatformId,from:string,to:string,input:PlanInput):ExtractionPlan{
  if(!planPlatforms.includes(platform))throw new Error('此平台暂不支持提取计划')
  checkRange(from,to)
  if(!input||!['day','month'].includes(input.granularity)||!Array.isArray(input.segments)||!input.segments.length||input.segments.length>5000)throw new Error('请选择有效的提取日期段')
  const allowed=new Set(dateSegments(from,to,input.granularity).map(s=>s.from+':'+s.to))
  const selected=new Map<string,DateSegment>()
  for(const segment of input.segments){if(!segment||!allowed.has(segment.from+':'+segment.to))throw new Error('提取日期段超出范围或粒度不匹配');selected.set(segment.from+':'+segment.to,segment)}
  const segments=[...selected.values()].sort((a,b)=>a.from.localeCompare(b.from)).map(s=>({...s,id:s.from+':'+s.to,status:'pending' as const,count:0}))
  const groups=new Map<string,typeof segments>()
  for(const segment of segments){const key=platform==='taobao'?segment.from.slice(0,7):platform==='jd'?segment.from.slice(0,4):platform==='alibaba'?segment.id:'all';groups.set(key,[...(groups.get(key)||[]),segment])}
  const buckets=[...groups].map(([id,parts])=>({id,from:parts[0].from,to:parts.at(-1)!.to,segmentIds:parts.map(s=>s.id),status:'pending' as const,cursor:''})).sort((a,b)=>b.from.localeCompare(a.from))
  return {granularity:input.granularity,segments,buckets}
}
export function acceptsPlanDate(plan:ExtractionPlan|undefined,date:string):boolean{return !plan||plan.segments.some(s=>inRange(date,s.from,s.to))}
export function pendingDetails(orders:Order[]):Order[]{return orders.filter(o=>!o.detailReadAt&&o.detailState!=='complete'&&!o.extra['详情读取状态'])}
export function shouldHighlightDetails(task:Task|undefined,orders:Order[]):boolean{return task?.platform==='taobao'&&task.status!=='running'&&task.status!=='needs_login'&&task.listOutcome==='complete'&&(!task.plan||task.plan.segments.every(s=>s.status==='completed'))&&pendingDetails(orders).length>0}
