import { Proxy } from 'http-mitm-proxy'
import net from 'node:net'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { allowedHost, isOrderResponse } from '../shared/platforms'
import type { PlatformId } from '../shared/types'
import type { Diagnostics } from './diagnostics'
// Only the explicitly selected platform is inspected. Other CONNECTs are tunneled unchanged.
export class OrderProxy {
  private proxy?:Proxy;private starting=false;private epoch=0;platform?:PlatformId;readonly port=17869;readonly certificate:string
  constructor(private directory:string,private capture:(platform:PlatformId)=>((body:string)=>void),private diagnostics:Diagnostics){this.certificate=join(directory,'certs','ca.pem')}
  get running(){return !!this.proxy}
  async start(platform:PlatformId):Promise<void>{
    if(this.starting)throw new Error('辅助采集正在启动，请稍后再试')
    if(this.proxy){if(this.platform!==platform)throw new Error('请先停止当前辅助平台，再切换辅助采集');return}
    this.starting=true;const epoch=++this.epoch
    try{
    this.platform=platform;await mkdir(this.directory,{recursive:true});const proxy=new Proxy()
    proxy.onError((_ctx,error)=>this.diagnostics.event('proxy.error',{platform:this.platform},error,'warn'))
    proxy.onConnect((req,socket,head,done)=>{
      const target=req.url||'';const [host,portString]=target.split(':');const port=Number(portString||443)
      if(allowedHost(platform,host)){done();return}
      if(!host||!Number.isInteger(port)||port<1||port>65535){socket.destroy();return}
      const remote=net.connect({host,port},()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket)})
      remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy())
    })
    proxy.onRequest((ctx,done)=>{
      const consume=this.capture(platform);const url=`${ctx.isSSL?'https':'http'}://${ctx.clientToProxyRequest.headers.host}${ctx.clientToProxyRequest.url}`
      if(platform&&isOrderResponse(platform,url)){
        ctx.use(Proxy.gunzip);let size=0;const chunks:Buffer[]=[]
        ctx.onResponseData((_c,chunk,next)=>{size+=chunk.length;if(size<=12*1024*1024)chunks.push(Buffer.from(chunk));else chunks.length=0;next(null,chunk)})
        ctx.onResponseEnd((_c,next)=>{if(chunks.length&&size<=12*1024*1024){try{if(this.epoch===epoch)consume?.(Buffer.concat(chunks).toString('utf8'))}catch{}}next()})
      }
      done()
    })
    await new Promise<void>((resolve,reject)=>proxy.listen({port:this.port,host:'127.0.0.1',sslCaDir:this.directory,timeout:25000},err=>err?reject(err):resolve()));if(epoch!==this.epoch){proxy.close();throw new Error('辅助采集启动已取消')}this.proxy=proxy
    this.diagnostics.event('proxy.start',{platform})
    }catch(error){if(epoch===this.epoch)this.platform=undefined;throw error}finally{this.starting=false}
  }
  stop(){this.epoch++;if(this.proxy)this.diagnostics.event('proxy.stop',{platform:this.platform});this.proxy?.close();this.proxy=undefined;this.platform=undefined}
}
