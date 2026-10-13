import { afterEach,describe,expect,it,vi } from 'vitest'
import { mkdtempSync,readdirSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Diagnostics } from '../src/main/diagnostics'
import { ExecutionLog } from '../src/main/execution-log'
import { ExecutionProgress } from '../src/main/execution-progress'
const roots:string[]=[]
function setup(){const root=mkdtempSync(join(tmpdir(),'execution-log-'));roots.push(root);const diagnostics=new Diagnostics(root,'0.1.3'),journal=new ExecutionLog();diagnostics.onEvent=journal.accept;return {root,diagnostics,journal}}
afterEach(()=>{vi.useRealTimers();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
describe('live execution feedback',()=>{
  it('reports real stages with file logging off and does not create files',()=>{
    const {root,diagnostics,journal}=setup()
    diagnostics.event('collector.start',{platform:'taobao',count:0})
    diagnostics.event('collector.stage',{platform:'taobao',phase:'page',page:2})
    diagnostics.event('collector.page',{platform:'taobao',page:2,received:20,count:32})
    const rows=journal.snapshot('taobao')
    expect(rows.map(r=>r.message)).toEqual(['开始采集订单，当前已保存 0 笔。','正在读取第 2 页订单…','第 2 页读取完成，本页识别 20 笔，所选范围内累计 32 笔。'])
    expect(rows[2].level).toBe('success');expect(readdirSync(root)).toEqual([])
  })
  it('keeps platform feeds separate and bounded to the latest 300 entries',()=>{
    const {diagnostics,journal}=setup();diagnostics.event('app.start')
    for(let page=1;page<=400;page++)diagnostics.event('collector.page',{platform:'taobao',page})
    diagnostics.event('collector.start',{platform:'jd'})
    const tao=journal.snapshot('taobao'),jd=journal.snapshot('jd')
    expect(tao).toHaveLength(300);expect(tao[0].message).toContain('第 101 页')
    expect(jd).toHaveLength(2);expect(jd.some(r=>r.message.includes('第 400 页'))).toBe(false)
    tao[0].message='modified';expect(journal.snapshot('taobao')[0].message).not.toBe('modified')
  })
  it('shows a safe and useful login failure without disclosing error payloads',()=>{
    const {diagnostics,journal}=setup()
    diagnostics.event('collector.failed',{platform:'pdd',account:'PRIVATE_ACCOUNT'},new Error('请登录 Cookie=PRIVATE_TOKEN phone=13800000000'))
    const text=JSON.stringify(journal.snapshot('pdd'))
    expect(text).toContain('需要登录');expect(text).not.toMatch(/PRIVATE|13800000000|Cookie/)
  })
  it('distinguishes partial results, successful completion and export stages',()=>{
    const {diagnostics,journal}=setup()
    diagnostics.event('collector.end',{platform:'taobao',status:'partial',count:10})
    diagnostics.event('collector.end',{platform:'taobao',status:'completed',count:10})
    diagnostics.event('export.progress',{platform:'taobao',phase:'images',current:3,total:10})
    diagnostics.event('export.progress',{platform:'taobao',phase:'write'})
    diagnostics.event('export.done',{platform:'taobao',count:10,missing:2})
    const rows=journal.snapshot('taobao')
    expect(rows[0].level).toBe('warning');expect(rows[0].message).toContain('仍需核对')
    expect(rows[1].level).toBe('success');expect(rows[2].message).toContain('3 / 10')
    expect(rows[3].message).toContain('写入');expect(rows[4].message).toContain('2 项核对说明')
  })
  it('emits wait feedback while a stage is pending and stops when closed',()=>{
    vi.useFakeTimers();const {diagnostics,journal}=setup()
    const progress=new ExecutionProgress(diagnostics,'collector',{platform:'taobao'})
    progress.stage({phase:'page',page:3});vi.advanceTimersByTime(10000)
    expect(journal.snapshot('taobao').at(-1)?.message).toContain('第 3 页订单，已等待 10 秒')
    progress.stage({phase:'detail',current:1,total:5});vi.advanceTimersByTime(10000)
    expect(journal.snapshot('taobao').at(-1)?.message).toContain('详情 1 / 5')
    progress.close();const count=journal.snapshot('taobao').length;vi.advanceTimersByTime(30000)
    expect(journal.snapshot('taobao')).toHaveLength(count)
  })
  it('a failed display subscriber cannot break collection or file logging',()=>{
    const {diagnostics,root}=setup();diagnostics.onEvent=()=>{throw new Error('display closed')}
    expect(()=>diagnostics.event('collector.start',{platform:'taobao'})).not.toThrow()
    diagnostics.setEnabled(true);expect(()=>diagnostics.event('collector.start',{platform:'taobao'})).not.toThrow()
    expect(readdirSync(join(root,'logs'))).toContain('main.log')
  })
})
