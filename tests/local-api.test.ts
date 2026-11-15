import {afterEach,describe,expect,it} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {request} from 'node:http'
import {startLocalApi} from '../src/ai/local-api'

const cleanups:(()=>Promise<void>)[]=[]
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
async function setup(invoke:(op:string,args:any[])=>any=()=>({version:'test',tasks:[]})){
  const dir=await mkdtemp(join(tmpdir(),'lingtu-api-'));cleanups.push(()=>rm(dir,{recursive:true,force:true}))
  const file=join(dir,'connection.json');const api=await startLocalApi({connectionFile:file,invoke});cleanups.push(()=>api.close())
  const connection=JSON.parse(await readFile(file,'utf8'))
  const call=(tool:string,args:unknown={},headers:Record<string,string>={})=>fetch(connection.url+'/v1/tools/'+tool,{method:'POST',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json',...headers},body:JSON.stringify(args)})
  return {api,file,connection,call}
}
describe('local AI API',()=>{
  it('rejects unauthenticated, browser-origin and rebound-host calls before business actions',async()=>{
    let calls=0;const s=await setup(()=>{calls++;return {}})
    expect((await s.call('get_state',{}, {authorization:''})).status).toBe(401)
    expect((await s.call('get_state',{}, {origin:'https://attacker.example'})).status).toBe(403)
    const hostile=await new Promise<number|undefined>((resolve,reject)=>{const req=request(s.connection.url+'/v1/tools/get_state',{method:'POST',headers:{host:'attacker.example',authorization:'Bearer '+s.connection.token,'content-type':'application/json'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end('{}')})
    expect(hostile).toBe(403)
    expect(calls).toBe(0)
    expect((await s.call('open_login',{platform:'taobao'})).status).toBe(200);expect(calls).toBe(1)
  })
  it('rejects impossible/reversed dates, unsupported platforms, extra args, unknown tools and oversized payloads',async()=>{
    let calls=0;const s=await setup(()=>{calls++;return {}})
    for(const args of [{platform:'taobao',from:'2026-02-30',to:'2026-03-01'},{platform:'taobao',from:'2026-03-01',to:'2026-02-01'},{platform:'unknown',from:'2026-01-01',to:'2026-02-01'},{platform:'taobao',from:'2026-01-01',to:'2026-02-01',cookie:'secret'}])expect((await s.call('start_collection',args)).status).toBe(400)
    expect((await s.call('clear_records')).status).toBe(404)
    expect((await s.call('get_state',{large:'x'.repeat(70000)})).status).toBe(413)
    expect(calls).toBe(0)
  })
  it('returns task progress without cookie, account key or official checkpoint tokens',async()=>{
    const task={id:'one',platform:'taobao',status:'paused',message:'needs attention',accountCookie:'secret-cookie',accountKey:'secret-key',cursor:'secret-cursor',officialExport:{token:'download-secret'}}
    const s=await setup(()=>({version:'test',tasks:[task],proxy:{certificate:'private-path'}}))
    const body=await (await s.call('get_state')).text()
    expect(body).toContain('needs attention');for(const secret of ['secret-cookie','secret-key','secret-cursor','download-secret','private-path'])expect(body).not.toContain(secret)
  })
  it('paginates order results and validates bounds',async()=>{
    const s=await setup(()=>[{id:'a'},{id:'b'},{id:'c'}])
    const response=await (await s.call('list_orders',{taskId:'one',offset:1,limit:1})).json()
    expect(response.result).toEqual({total:3,offset:1,limit:1,orders:[{id:'b'}]})
    expect((await s.call('list_orders',{taskId:'one',limit:10000})).status).toBe(400)
  })
  it('maps validated arguments to the existing actions and rotates discovery on restart',async()=>{
    const received:any[]=[];const s=await setup((op,args)=>{received.push([op,args]);return {id:'one'}})
    expect((await s.call('start_collection',{platform:'taobao',from:'2026-01-01',to:'2026-01-31'})).status).toBe(200)
    expect(received).toEqual([['start',[{platform:'taobao',from:'2026-01-01',to:'2026-01-31',mode:'ordinary'}]]])
    await s.api.close();expect(await readFile(s.file,'utf8').catch(()=>null)).toBeNull()
    const next=await startLocalApi({connectionFile:s.file,invoke:()=>({})});cleanups.push(()=>next.close())
    const connection=JSON.parse(await readFile(s.file,'utf8'));expect(connection.token).not.toBe(s.connection.token)
    expect((await fetch(connection.url+'/v1/tools/get_state',{method:'POST',headers:{authorization:'Bearer '+s.connection.token,'content-type':'application/json'},body:'{}'})).status).toBe(401)
  })
})
