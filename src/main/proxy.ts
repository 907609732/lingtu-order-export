import { Proxy } from 'http-mitm-proxy'
import net from 'node:net'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { allowedHost, isOrderResponse } from '../shared/platforms'
import type { PlatformId } from '../shared/types'
// Only the explicitly selected platform is inspected. Other CONNECTs are tunneled unchanged.
export class OrderProxy {
  private proxy?:Proxy;platform?:PlatformId;readonly port=17869;readonly certificate:string
  constructor(private directory:string,private consume:(platform:PlatformId,body:string)=>void){this.certificate=join(directory,'certs','ca.pem')}
  get running(){return !!this.proxy}
  async start(platform:PlatformId):Promise<void>{
    if(this.proxy){this.platform=platform;return}
    this.platform=platform;await mkdir(this.directory,{recursive:true});const proxy=new Proxy()
    proxy.onError((_ctx,_err)=>{/* Do not log URLs, cookies or request bodies. Errors are surfaced by missing-response status. */})
    proxy.onConnect((req,socket,head,done)=>{
      const target=req.url||'';const [host,portString]=target.split(':');const port=Number(portString||443)
      if(this.platform&&allowedHost(this.platform,host)){done();return}
      if(!host||!Number.isInteger(port)||port<1||port>65535){socket.destroy();return}
      const remote=net.connect({host,port},()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket)})
      remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy())
    })
    proxy.onRequest((ctx,done)=>{
      const platform=this.platform;const url=`${ctx.isSSL?'https':'http'}://${ctx.clientToProxyRequest.headers.host}${ctx.clientToProxyRequest.url}`
      if(platform&&isOrderResponse(platform,url)){
        ctx.use(Proxy.gunzip);let size=0;const chunks:Buffer[]=[]
        ctx.onResponseData((_c,chunk,next)=>{size+=chunk.length;if(size<=12*1024*1024)chunks.push(Buffer.from(chunk));else chunks.length=0;next(null,chunk)})
        ctx.onResponseEnd((_c,next)=>{if(chunks.length&&size<=12*1024*1024){try{this.consume(platform,Buffer.concat(chunks).toString('utf8'))}catch{}}next()})
      }
      done()
    })
    await new Promise<void>((resolve,reject)=>proxy.listen({port:this.port,host:'127.0.0.1',sslCaDir:this.directory,timeout:25000},err=>err?reject(err):resolve()));this.proxy=proxy
  }
  stop(){this.proxy?.close();this.proxy=undefined;this.platform=undefined}
}
