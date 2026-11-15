import {it,expect} from 'vitest'
import {createPlan,monthCandidates,previousMonthSegment} from '../src/core/extraction-plan'
import {sameCollectionTime} from '../src/core/primary-collection-action'
import type {Task} from '../src/shared/types'
it('defaults to the previous calendar month, also across a year boundary',()=>{
 expect(previousMonthSegment('2026-01-15T00:00:00.000Z')).toEqual({from:'2025-12-01',to:'2025-12-31'})
 expect(previousMonthSegment('2026-03-31')).toEqual({from:'2026-02-01',to:'2026-02-28'})
 expect(previousMonthSegment('2024-03-01')).toEqual({from:'2024-02-01',to:'2024-02-29'})
})
it('lists whole months across several years in ascending order',()=>{
 const months=monthCandidates(2025,2026)
 expect(months).toHaveLength(24)
 expect(months[0]).toEqual({from:'2025-01-01',to:'2025-01-31'})
 expect(months[11]).toEqual({from:'2025-12-01',to:'2025-12-31'})
 expect(months[12]).toEqual({from:'2026-01-01',to:'2026-01-31'})
 expect(months.at(-1)).toEqual({from:'2026-12-01',to:'2026-12-31'})
 expect(monthCandidates(2026,2026)).toHaveLength(12)
})
it('rejects an inverted, unsupported or oversized year range',()=>{
 for(const args of [[2026,2025],[1969,2026],[2026,3000]] as [number,number][])expect(()=>monthCandidates(...args)).toThrow(/年份/)
 expect(()=>monthCandidates(2000,2999)).toThrow(/100/)
 expect(()=>monthCandidates(2026.5 as unknown as number,2026)).toThrow(/年份/)
})
it('keeps a cross-year month selection as an official export plan',()=>{
 const plan=createPlan('alibaba','2025-01-01','2026-12-31',{granularity:'month',segments:[{from:'2026-02-01',to:'2026-02-28'},{from:'2025-11-01',to:'2025-11-30'}]})
 expect(plan.segments.map(s=>s.id)).toEqual(['2025-11-01:2025-11-30','2026-02-01:2026-02-28'])
 expect(plan.buckets.map(b=>b.id)).toEqual(['2026-02-01:2026-02-28','2025-11-01:2025-11-30'])
})
it('rejects a selected month that falls outside the chosen year range',()=>{
 expect(()=>createPlan('alibaba','2026-01-01','2026-12-31',{granularity:'month',segments:[{from:'2025-12-01',to:'2025-12-31'}]})).toThrow(/超出范围/)
})
it('treats the same cross-year selection as one collection time and a different one as new',()=>{
 const task={platform:'alibaba',mode:'official-export',from:'2025-01-01',to:'2026-12-31',plan:createPlan('alibaba','2025-01-01','2026-12-31',{granularity:'month',segments:[{from:'2025-12-01',to:'2025-12-31'},{from:'2026-01-01',to:'2026-01-31'}]})} as unknown as Task
 const same={mode:'official-export' as const,from:task.from,to:task.to,plan:{granularity:'month' as const,segments:[{from:'2026-01-01',to:'2026-01-31'},{from:'2025-12-01',to:'2025-12-31'}]}}
 expect(sameCollectionTime(task,same)).toBe(true)
 expect(sameCollectionTime(task,{...same,plan:{granularity:'month',segments:[{from:'2025-12-01',to:'2025-12-31'}]}})).toBe(false)
})
