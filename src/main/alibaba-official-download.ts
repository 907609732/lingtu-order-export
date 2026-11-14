import type {WebContents,DownloadItem,Event} from 'electron'
import {mkdir,mkdtemp,readFile,stat,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import type {OfficialRecord} from './alibaba-official-export'
const active=new WeakSet<WebContents>(),maxBytes=32*1024*1024
/** Reuses JD session-download structure, but only an exact task-owned HTTPS record is eligible. */
export async function downloadAlibabaOfficialReport(contents:WebContents,record:OfficialRecord,trigger:()=>Promise<void>,options:{directory:string;assertAccount():Promise<void>;signal?:AbortSignal;timeoutMs?:number}):Promise<{bytes:Buffer;path:string;sha256:string}>{
 const url=new URL(record.url)
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)1688\.com$/.test(url.hostname)||!record.token||!record.filename.endsWith('.xlsx'))throw Error('官方报表下载来源尚未验证')
 if(active.has(contents))throw Error('当前官方报表正在下载')
 if(options.signal?.aborted)throw Error('官方报表下载已暂停')
 await options.assertAccount();active.add(contents);let folder:string|undefined,keep=false
 try{
  await mkdir(options.directory,{recursive:true});folder=await mkdtemp(join(options.directory,'alibaba-official-'));const path=join(folder,'report.xlsx')
  const bytes=await new Promise<Buffer>((resolve,reject)=>{
   let item:DownloadItem|undefined,settled=false
   const finish=(error?:Error,bytes?:Buffer)=>{if(settled)return;settled=true;clearTimeout(timer);contents.session.removeListener('will-download',willDownload);options.signal?.removeEventListener('abort',abort);if(item){item.removeListener('updated',updated);item.removeListener('done',done);if(error)item.cancel()}if(error)reject(error);else resolve(bytes!)}
   const abort=()=>finish(Error('官方报表下载已暂停'))
   const updated=()=>{if(item&&(item.getReceivedBytes()>maxBytes||item.getTotalBytes()>maxBytes))finish(Error('官方报表超过32MB，请缩小范围'))}
   const done=(_event:Event,state:string)=>{if(state!=='completed'){finish(Error('官方报表下载中断，未入库'));return}void(async()=>{try{await options.assertAccount();const size=(await stat(path)).size;if(!size||size>maxBytes)throw Error('官方报表文件体积无效');finish(undefined,await readFile(path))}catch(error){finish(error instanceof Error?error:Error('官方报表读取失败'))}})()}
   const willDownload=(_event:Event,candidate:DownloadItem,source:WebContents)=>{
    if(settled||item||source!==contents||candidate.getURL()!==record.url||candidate.getFilename()!==record.filename)return
    if(candidate.getURLChain().some(value=>value!==record.url))return
    item=candidate
    try{candidate.setSavePath(path);candidate.on('updated',updated);candidate.once('done',done);updated();void options.assertAccount().catch(error=>finish(error))}catch{finish(Error('官方报表保存失败'))}
   }
   const timer=setTimeout(()=>finish(Error('等待当前官方报表下载超时，未入库')),options.timeoutMs??45000)
   contents.session.on('will-download',willDownload);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted){abort();return}
   void Promise.resolve().then(trigger).catch(error=>finish(error instanceof Error?error:Error('官方报表下载操作失败')))
  })
  keep=true;return {bytes,path,sha256:createHash('sha256').update(bytes).digest('hex')}
 }finally{active.delete(contents);if(folder&&!keep)await rm(folder,{recursive:true,force:true}).catch(()=>{})}
}
