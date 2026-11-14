import {it,expect,vi} from 'vitest'
const instances:any[]=[]
vi.mock('node:fs/promises',()=>({mkdir:async()=>{}}))
vi.mock('http-mitm-proxy',()=>({Proxy:class{static gunzip={};request:any;constructor(){instances.push(this)}onError(){}onConnect(){}onRequest(fn:any){this.request=fn}listen(_options:any,done:any){done()}close(){}}}))
import {OrderProxy} from '../src/main/proxy'
function response(proxy:any){const hooks:any={};const ctx:any={isSSL:true,clientToProxyRequest:{headers:{host:'app.dewu.com'},url:'/order/list'},use(){},onResponseData(fn:any){hooks.data=fn},onResponseEnd(fn:any){hooks.end=fn}};proxy.request(ctx,()=>{});return()=>{hooks.data(ctx,Buffer.from('{}'),()=>{});hooks.end(ctx,()=>{})}}
it('rejects running proxy rebind and drops response after restart',async()=>{const received:string[]=[],p=new OrderProxy('fixture',platform=>body=>received.push(platform+body),{event(){}} as any);await p.start('dewu');const finish=response(instances.at(-1));await expect(p.start('meituan')).rejects.toThrow();expect(p.platform).toBe('dewu');p.stop();await p.start('dewu');finish();expect(received).toEqual([]);p.stop()})
it('captures the consumer at request start instead of response finish',async()=>{let owner='first';const received:string[]=[],p=new OrderProxy('fixture',()=>{const captured=owner;return()=>received.push(captured)},{event(){}} as any);await p.start('dewu');const finish=response(instances.at(-1));owner='second';finish();expect(received).toEqual(['first']);p.stop()})
