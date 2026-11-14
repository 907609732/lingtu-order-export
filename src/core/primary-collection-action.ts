import type {Task,StartInput} from '../shared/types'
type CollectionTime=Omit<StartInput,'platform'>
export function sameCollectionTime(task:Task,input:CollectionTime):boolean{
 if(task.from!==input.from||task.to!==input.to)return false
 if(!task.plan||!input.plan)return !task.plan&&!input.plan
 const ranges=(plan:NonNullable<CollectionTime['plan']>)=>plan.segments.map(s=>[s.from,s.to]).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]))
 return task.plan.granularity===input.plan.granularity&&JSON.stringify(ranges(task.plan))===JSON.stringify(ranges(input.plan))
}
export function primaryCollectionAction(task:Task|undefined,input:CollectionTime|undefined,pendingDetails:number):'start'|'resume'|'reset'|'running'{
 if(task?.status==='running')return 'running'
 if(!task||!input||!sameCollectionTime(task,input))return 'start'
 const interrupted=['paused','needs_login','failed','partial'].includes(task.status)
 if(interrupted&&task.operation==='details'&&pendingDetails>0)return 'resume'
 if(task.status==='completed'||task.listOutcome==='complete')return 'reset'
 return interrupted?'resume':'start'
}
