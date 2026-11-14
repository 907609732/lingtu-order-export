import type {PlatformId} from '../shared/types'
export interface RunLease {platform:PlatformId;taskId:string;stopping:boolean;captureCount:number;generation:symbol;waiting:boolean}
export class RunRegistry {
 readonly leases=new Map<PlatformId,RunLease>()
 acquire(platform:PlatformId,taskId:string){if(this.leases.has(platform))throw new Error('当前平台任务正在运行或结束，请稍后再试');const lease:RunLease={platform,taskId,stopping:false,captureCount:0,generation:Symbol(taskId),waiting:false};this.leases.set(platform,lease);return lease}
 valid(lease:RunLease|undefined):lease is RunLease{return !!lease&&!lease.stopping&&this.leases.get(lease.platform)===lease}
 stop(taskId:string){for(const lease of this.leases.values())if(lease.taskId===taskId){lease.stopping=true;if(lease.waiting)this.release(lease)}}
 release(lease:RunLease){if(this.leases.get(lease.platform)===lease)this.leases.delete(lease.platform)}
}
