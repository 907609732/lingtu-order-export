import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Diagnostics, safeContext, safeError } from '../src/main/diagnostics'

const roots:string[]=[]
function setup(max?:number){const root=mkdtempSync(join(tmpdir(),'orderdesk-log-test-'));roots.push(root);return {root,log:new Diagnostics(root,'0.1.2',max),file:join(root,'logs','main.log')}}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})

describe('local diagnostic logging',()=>{
  it('writes nothing by default and stops immediately while retaining existing logs',()=>{
    const {root,log,file}=setup()
    log.event('app.start');expect(readdirSync(root)).toEqual([])
    log.setEnabled(true);log.event('collector.page',{platform:'taobao',page:2,count:15})
    expect(readFileSync(file,'utf8')).toContain('collector.page')
    log.setEnabled(false);const before=readFileSync(file,'utf8')
    log.event('app.exit');log.event('ipc.failed',{},new Error('secret'))
    expect(readFileSync(file,'utf8')).toBe(before)
    log.setEnabled(true);log.event('app.start',{version:'0.1.2'})
    expect(readFileSync(file,'utf8')).toContain('app.start')
  })
  it('allows only bounded operational fields and local generated task IDs',()=>{
    expect(safeContext({platform:'taobao',count:3,images:true,operation:'export',taskId:'04d81150-ce41-4843-b162-7634560b5864',account:'secret',Cookie:'token',orderId:'12345678901234567890',url:'https://private/?token=secret',path:'C:/Users/private',body:{phone:'13800000000'}})).toEqual({platform:'taobao',operation:'export',count:3,images:true,taskId:'04d81150-ce41-4843-b162-7634560b5864'})
    expect(safeContext({platform:'secret',taskId:'12345678901234567890',count:Infinity,pages:1e30,version:'secret',status:'secret'})).toEqual({})
  })
  it('keeps error category and code locations without arbitrary error text or paths',()=>{
    const error={name:'TypeError',code:'EACCES',message:'fetch failed Cookie=PRIVATE_TOKEN phone=13800000000 张三 杭州市 12345678901234567890',stack:'TypeError: PRIVATE_TOKEN\n at collect (C:\\Users\\PrivateName\\app\\out\\main\\index.js:123:45)\n at https://private/?token=PRIVATE_TOKEN:5:7'}
    expect(safeError(error)).toEqual({name:'TypeError',category:'network',code:'EACCES',locations:['main/index.js:123:45']})
    const {log,file}=setup();log.setEnabled(true);log.event('collector.failed',{account:'SECRET_ACCOUNT',body:error},error)
    const text=readFileSync(file,'utf8')
    for(const secret of ['PRIVATE_TOKEN','13800000000','张三','杭州市','12345678901234567890','PrivateName','https://','SECRET_ACCOUNT'])expect(text).not.toContain(secret)
    expect(text).toContain('main/index.js:123:45')
    expect(safeError({name:{toString:()=> 'Error',secret:'secret'},code:{toString:()=> 'EACCES',secret:'secret'}})).toEqual({name:'Error',category:'other'})
  })
  it('rotates repeatedly with only the current file and one bounded archive',()=>{
    const {root,log}=setup(1024);log.setEnabled(true)
    for(let page=0;page<400;page++)log.event('collector.page',{platform:'taobao',page,count:page})
    const files=readdirSync(join(root,'logs')).sort()
    expect(files).toEqual(['main.log','main.old.log'])
    for(const file of files)expect(statSync(join(root,'logs',file)).size).toBeLessThan(1600)
    expect(readFileSync(join(root,'logs','main.log'),'utf8')).toContain('"page":399')
  })
  it('reports an unwritable destination without exposing the filesystem error',()=>{
    const {root,log}=setup();writeFileSync(join(root,'logs'),'occupied')
    expect(()=>log.setEnabled(true)).toThrow('日志写入失败')
    expect(log.state().enabled).toBe(false);expect(log.state().error).toContain('日志写入失败')
    expect(()=>log.event('app.start')).not.toThrow()
  })
  it('keeps application operations alive on later file write failure and can retry',()=>{
    const {root,log}=setup();log.setEnabled(true)
    renameSync(join(root,'logs'),join(root,'saved-logs'));writeFileSync(join(root,'logs'),'occupied')
    expect(()=>log.event('app.start')).not.toThrow()
    expect(log.state().error).toContain('日志写入失败')
    rmSync(join(root,'logs'));mkdirSync(join(root,'logs'))
    log.setEnabled(true);expect(log.state().error).toBe('')
    log.event('app.start');expect(readFileSync(join(root,'logs','main.log'),'utf8')).toContain('app.start')
  })
})
