import {CancellationToken} from 'builder-util-runtime'
import type {UpdateState} from '../shared/types'
export function compareVersions(a:string,b:string):number {
 const pa=a.replace(/^v/,'').split('.').map(Number),pb=b.replace(/^v/,'').split('.').map(Number)
 for(let i=0;i<Math.max(pa.length,pb.length);i++){const d=(pa[i]||0)-(pb[i]||0);if(d)return d>0?1:-1}return 0
}
interface Adapter {
 autoDownload:boolean;autoInstallOnAppQuit:boolean;disableDifferentialDownload?:boolean
 on(event:string,listener:(value:any)=>void):unknown
 checkForUpdates():Promise<any>;downloadUpdate(token:CancellationToken):Promise<string[]>;quitAndInstall(isSilent:boolean,isForceRunAfter:boolean):void
}
export class UpdateController {
 state:UpdateState
 private checkPending?:Promise<void>;private downloadPending?:Promise<void>;private token?:CancellationToken;private generation=0
 constructor(private adapter:Adapter,private options:{current:string;supported:boolean;busy:()=>boolean;changed:(state:UpdateState)=>void}){
  this.state={status:options.supported?'idle':'unsupported',current:options.current,source:'GitHub Releases',message:options.supported?'可检查软件更新':'开发环境不支持在线升级，请使用正式安装版'}
  adapter.disableDifferentialDownload=true;adapter.autoDownload=false;adapter.autoInstallOnAppQuit=false
  adapter.on('error',()=>{if(this.state.status==='installing')this.set({status:'downloaded',message:'无法启动安装，请重试或访问官网下载'})})
  adapter.on('download-progress',value=>{if(this.state.status==='downloading'&&this.token&&!this.token.cancelled)this.set({percent:Math.max(0,Math.min(100,Number(value.percent)||0)),transferred:Number(value.transferred)||0,total:Number(value.total)||0,bytesPerSecond:Number(value.bytesPerSecond)||0})})
 }
 private set(patch:Partial<UpdateState>){this.state={...this.state,...patch};this.options.changed({...this.state})}
 assertCanStart(){if(this.state.status==='installing')throw new Error('正在重启并安装更新，请稍候')}
 check():Promise<void>{
  if(this.checkPending)return this.checkPending
  if(!this.options.supported||['downloading','downloaded','installing'].includes(this.state.status))return Promise.resolve()
  this.set({status:'checking',message:'正在检查更新',errorStage:undefined})
  this.checkPending=Promise.resolve().then(async()=>{try{const result=await this.adapter.checkForUpdates();const version=result?.updateInfo?.version;if(!version)throw new Error('Missing update metadata');this.set({status:compareVersions(version,this.options.current)>0?'available':'upToDate',latest:compareVersions(version,this.options.current)>0?version:undefined,message:compareVersions(version,this.options.current)>0?'发现新版本，可下载后安装':'当前已是最新版本'})}catch{this.set({status:'error',errorStage:'check',message:'检查更新失败，请检查网络后重试；尚未确认是否有新版'})}finally{this.checkPending=undefined}})
  return this.checkPending
 }
 download():Promise<void>{
  if(this.downloadPending)return this.state.status==='available'?this.downloadPending.then(()=>this.download()):this.downloadPending
  if(!this.options.supported||!(this.state.status==='available'||this.state.status==='error'&&this.state.errorStage==='download'))return Promise.resolve()
  const token=new CancellationToken(),generation=++this.generation;this.token=token
  this.set({status:'downloading',percent:0,transferred:0,total:0,bytesPerSecond:0,message:'正在下载更新',errorStage:undefined})
  let download:Promise<string[]>;try{download=this.adapter.downloadUpdate(token)}catch(error){download=Promise.reject(error)}
  this.downloadPending=download.then(files=>{if(generation!==this.generation||token.cancelled)return;if(!files.length)throw new Error('Missing verified file');this.set({status:'downloaded',percent:100,message:'下载与校验完成，可以重启并安装'})}).catch(()=>{if(generation===this.generation&&!token.cancelled)this.set({status:'error',errorStage:'download',message:'更新下载或校验失败，请检查网络后重试下载'})}).finally(()=>{this.downloadPending=undefined;this.token=undefined})
  return this.downloadPending
 }
 cancel(){if(this.state.status!=='downloading')return;++this.generation;this.token?.cancel();this.set({status:'available',percent:undefined,transferred:undefined,total:undefined,bytesPerSecond:undefined,message:'已取消下载，可重新下载'})}
 install(){if(this.state.status!=='downloaded')throw new Error('请先完成更新下载和校验');if(this.options.busy())throw new Error('请先暂停采集、等待详情读取和导出结束，并关闭辅助采集，再重启安装');this.set({status:'installing',message:'正在重启并安装更新'});try{this.adapter.quitAndInstall(true,true)}catch{this.set({status:'downloaded',message:'无法启动安装，请重试或访问官网下载'});throw new Error('无法启动更新安装')}}
}
