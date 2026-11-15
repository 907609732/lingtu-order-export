import type {DateSegment,ExtractionPlan,PlanInput,PlatformId,Order,Task} from '../shared/types'
import {checkRange,inRange} from './values'
export const planPlatforms:PlatformId[]=['taobao','alibaba','pdd','jd','xianyu']
export const detailPlatforms:PlatformId[]=['taobao','alibaba','pdd','jd','xianyu']
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
/** Previous calendar month in the same date format the rest of the plan uses. */
export function previousMonthSegment(now:string=new Date().toISOString()):DateSegment{
  const match=/^(\d{4})-(\d{2})-\d{2}/.exec(now);if(!match)throw new Error('读取当前日期失败')
  const first=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1))
  first.setUTCMonth(first.getUTCMonth()-1)
  const end=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,1)-86400000)
  return {from:first.toISOString().slice(0,10),to:end.toISOString().slice(0,10)}
}
/** Whole-month candidates across any number of years, ascending. Never spans a partial year. */
export function monthCandidates(fromYear:number,toYear:number):DateSegment[]{
  if(!Number.isInteger(fromYear)||!Number.isInteger(toYear)||fromYear<1970||toYear>2999||fromYear>toYear)throw new Error('请选择有效的年份范围')
  if(toYear-fromYear>99)throw new Error('年份范围最多 100 年，请缩小范围')
  const result:DateSegment[]=[]
  for(let year=fromYear;year<=toYear;year++)result.push(...dateSegments(`${year}-01-01`,`${year}-12-31`,'month'))
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
export function shouldHighlightDetails(task:Task|undefined,orders:Order[]):boolean{return !!task&&detailPlatforms.includes(task.platform)&&task.status!=='running'&&task.status!=='needs_login'&&task.listOutcome==='complete'&&(!task.plan||task.plan.segments.every(s=>s.status==='completed'))&&pendingDetails(orders).length>0}

// Completion requires evidence for the selected list scope and every stored detail.
// Call only after a successful run, never from error/pause handlers.
export function collectionComplete(task:Task,orders:Order[]):boolean{
  return task.mode!=='official-export'&&task.listOutcome==='complete'&&task.count===orders.length&&
    (!task.plan||(task.plan.segments.length>0&&task.plan.buckets.length>0&&task.plan.segments.every(s=>s.status==='completed')&&task.plan.buckets.every(b=>b.status==='completed')))&&
    orders.every(o=>(!!o.detailReadAt||o.detailState==='complete')&&o.missing.length===0)
}
