import type {WebContents,DownloadItem,Event} from 'electron'
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {JdExportError} from './jd-export'
const active=new WeakSet<WebContents>()
const maxBytes=32*1024*1024
export async function downloadJdExport(contents:WebContents,trigger:()=>Promise<void>,options:{signal?:AbortSignal;timeoutMs?:number;directory?:string}={}):Promise<Buffer>{
 if(active.has(contents))throw new JdExportError('京东官方导出正在等待当前页下载，请稍后再试')
 if(options.signal?.aborted)throw new JdExportError('京东官方导出已暂停，本页未推进')
 active.add(contents);let folder:string|undefined
 try{
  folder=await mkdtemp(join(options.directory||tmpdir(),'lingtu-jd-export-'));const file=join(folder,'orders.xlsx')
  return await new Promise<Buffer>((resolve,reject)=>{
   let item:DownloadItem|undefined,settled=false
   const finish=(error?:Error,buffer?:Buffer)=>{if(settled)return;settled=true;clearTimeout(timer);contents.session.removeListener('will-download',willDownload);options.signal?.removeEventListener('abort',abort);if(item){item.removeListener('updated',updated);item.removeListener('done',done);if(error)try{item.cancel()}catch{}}if(error)reject(error);else resolve(buffer!)}
   const abort=()=>finish(new JdExportError('京东官方导出已暂停或取消，本页未推进'))
   const updated=()=>{if(item&&(item.getTotalBytes()>maxBytes||item.getReceivedBytes()>maxBytes))finish(new JdExportError('京东官方导出文件超过32MB，请缩小日期范围'))}
   const done=(_event:Event,state:string)=>{if(state!=='completed'){finish(new JdExportError('京东官方导出下载中断，请重试当前页'));return}void (async()=>{try{if((await stat(file)).size>maxBytes)throw new JdExportError('京东官方导出文件超过32MB，请缩小日期范围');const bytes=await readFile(file);finish(undefined,bytes)}catch(error){finish(error instanceof JdExportError?error:new JdExportError('京东官方导出下载文件无法读取，请重试当前页'))}})()}
   const willDownload=(_event:Event,candidate:DownloadItem,source:WebContents)=>{
    if(settled||item||source!==contents)return
    let url:URL;try{url=new URL(candidate.getURL())}catch{return}
    if(url.protocol!=='blob:'||url.origin!=='https://order.jd.com'||!/\.xlsx$/i.test(candidate.getFilename()))return
    item=candidate
    try{item.setSavePath(file);item.on('updated',updated);item.once('done',done);updated()}catch{finish(new JdExportError('无法保存京东官方导出临时文件，请重试当前页'))}
   }
   const timer=setTimeout(()=>finish(new JdExportError('等待京东官方导出下载超时，请检查页面后重试当前页')),options.timeoutMs??45000)
   contents.session.on('will-download',willDownload);options.signal?.addEventListener('abort',abort,{once:true})
   if(options.signal?.aborted){abort();return}
   void Promise.resolve().then(trigger).catch(error=>finish(error instanceof Error?error:new JdExportError('京东官方导出下载操作未完成，请重试当前页')))
  })
 }finally{active.delete(contents);if(folder)await rm(folder,{recursive:true,force:true}).catch(()=>{})}
}
