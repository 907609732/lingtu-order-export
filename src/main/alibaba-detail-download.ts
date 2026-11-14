import {alibabaExportUrl} from './alibaba-detail'
import {CollectionError} from './collection-errors'
const maxBytes=32*1024*1024
/** Keeps credentials and report contents out of errors. Uses the existing task session. */
export async function downloadAlibabaDetailExport(raw:string,fetcher:(url:string)=>Promise<Response>,stopped:()=>boolean=()=>false):Promise<Buffer|undefined>{
 if(stopped())return
 const url=alibabaExportUrl(raw)
 let response:Response
 try{response=await fetcher(url)}catch{throw new CollectionError('detail_download_network')}
 if(response.url){try{alibabaExportUrl(response.url)}catch{await response.body?.cancel().catch(()=>{});throw new CollectionError('detail_download_source')}}
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new CollectionError('detail_download_http')}
 const reader=response.body?.getReader();if(!reader)throw new CollectionError('detail_report_empty')
 const chunks:Buffer[]=[];let size=0
 try{
  if(Number(response.headers.get('content-length'))>maxBytes)throw new CollectionError('detail_report_too_large')
  for(;;){
   if(stopped())return
   let chunk:ReadableStreamReadResult<Uint8Array>
   try{chunk=await reader.read()}catch{throw new CollectionError('detail_download_interrupted')}
   if(chunk.done)break
   size+=chunk.value.byteLength;if(size>maxBytes)throw new CollectionError('detail_report_too_large')
   chunks.push(Buffer.from(chunk.value))
  }
 }finally{await reader.cancel().catch(()=>{})}
 if(!size)throw new CollectionError('detail_report_empty')
 return Buffer.concat(chunks)
}
