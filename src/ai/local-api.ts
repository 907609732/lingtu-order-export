import {createServer,type IncomingMessage,type ServerResponse} from 'node:http'
import {randomBytes,timingSafeEqual} from 'node:crypto'
import {mkdir,writeFile,rename,readFile,unlink} from 'node:fs/promises'
import {dirname} from 'node:path'
import {aiTools,executeAiTool} from './contracts'

class HttpError extends Error{constructor(public status:number,message:string){super(message)}}
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value))}
async function body(req:IncomingMessage){
  if(!req.headers['content-type']?.startsWith('application/json'))throw new HttpError(415,'需要 application/json')
  if(Number(req.headers['content-length'])>65536)throw new HttpError(413,'请求过大')
  const chunks:Buffer[]=[];let size=0
  for await(const chunk of req){size+=chunk.length;if(size>65536)throw new HttpError(413,'请求过大');chunks.push(chunk)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new HttpError(400,'无效 JSON')}
}
export async function startLocalApi(options:{connectionFile:string;invoke:(operation:string,args:any[])=>any;onCall?:(tool:string,success:boolean)=>void}){
  const token=randomBytes(32).toString('hex');let expectedHost='';let closed=false
  const server=createServer(async(req,res)=>{
    try{
      if(req.headers.host!==expectedHost||req.headers.origin!==undefined||req.headers['sec-fetch-site']!==undefined)throw new HttpError(403,'仅允许本机 AI 客户端调用')
      const supplied=Buffer.from(req.headers.authorization||'');const expected=Buffer.from('Bearer '+token)
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new HttpError(401,'访问密钥无效，请重新读取连接文件')
      if(req.method!=='POST')throw new HttpError(405,'仅支持 POST')
      const name=req.url?.match(/^\/v1\/tools\/([a-z_]+)$/)?.[1]
      if(!name||!Object.hasOwn(aiTools,name))throw new HttpError(404,'工具不存在')
      const input=await body(req)
      try{const result=await executeAiTool(name,input,options.invoke);options.onCall?.(name,true);reply(res,200,{result})}
      catch(error){options.onCall?.(name,false);throw error}
    }catch(error){if(!res.destroyed)reply(res,error instanceof HttpError?error.status:400,{error:error instanceof Error?error.message:'调用失败'})}
  })
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=30
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve()})})
  const address=server.address();if(!address||typeof address==='string')throw new Error('无法启动本机接口')
  expectedHost='127.0.0.1:'+address.port
  const close=async()=>{
    if(closed)return;closed=true
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))
    try{const current=JSON.parse(await readFile(options.connectionFile,'utf8'));if(current.token===token)await unlink(options.connectionFile)}catch{}
  }
  try{
    await mkdir(dirname(options.connectionFile),{recursive:true,mode:0o700})
    const temp=options.connectionFile+'.'+process.pid+'.tmp'
    await writeFile(temp,JSON.stringify({version:1,url:'http://'+expectedHost,token,pid:process.pid}),{mode:0o600})
    await rename(temp,options.connectionFile)
  }catch(error){await close();throw error}
  return {close}
}
