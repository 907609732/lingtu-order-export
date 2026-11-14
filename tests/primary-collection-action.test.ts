import {describe,it,expect} from 'vitest'
import {primaryCollectionAction,sameCollectionTime} from '../src/core/primary-collection-action'
import type {Task,StartInput} from '../src/shared/types'
const input={from:'2026-01-01',to:'2026-02-28',plan:{granularity:'month',segments:[{from:'2026-01-01',to:'2026-01-31'},{from:'2026-02-01',to:'2026-02-28'}]}} satisfies Omit<StartInput,'platform'>
const task={...input,id:'checkpoint',status:'partial',listOutcome:'interrupted',operation:'list'} as Task
 describe('primary collection action',()=>{
 it('resumes unfinished lists with the same confirmed selection',()=>{for(const status of ['paused','needs_login','failed','partial'] as const)expect(primaryCollectionAction({...task,status},input,0)).toBe('resume')})
 it('compares bounds, granularity and segment ranges independent of ordering',()=>{expect(sameCollectionTime(task,{...input,plan:{...input.plan,segments:[...input.plan.segments].reverse()}})).toBe(true);expect(primaryCollectionAction(task,{...input,to:'2026-03-31'},0)).toBe('start');expect(sameCollectionTime(task,{...input,plan:undefined})).toBe(false);expect(sameCollectionTime(task,{...input,plan:{...input.plan,granularity:'day'}})).toBe(false)})
 it('resumes interrupted manual details even when the list is complete',()=>{for(const status of ['paused','needs_login','failed','partial'] as const)expect(primaryCollectionAction({...task,status,operation:'details',listOutcome:'complete'},input,2)).toBe('resume');expect(primaryCollectionAction({...task,operation:'details',listOutcome:'complete'},input,0)).toBe('reset')})
 it('resets finished lists and starts after cache clearing',()=>{expect(primaryCollectionAction({...task,listOutcome:'complete'},input,0)).toBe('reset');expect(primaryCollectionAction({...task,status:'completed'},input,0)).toBe('reset');expect(primaryCollectionAction(undefined,input,0)).toBe('start');expect(primaryCollectionAction({...task,status:'running'},input,0)).toBe('running')})
})
