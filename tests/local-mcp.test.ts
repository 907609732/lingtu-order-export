import {expect,it} from 'vitest'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createMcpServer} from '../src/mcp/server'
import {startLocalApi} from '../src/ai/local-api'

it('discovers tools, validates inputs, bridges actions and survives software restart without copying its key',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'lingtu-mcp-'));const file=join(dir,'connection.json')
  const calls:any[]=[]
  let api=await startLocalApi({connectionFile:file,invoke:(op,args)=>{calls.push([op,args]);return {id:'created',status:'running',accountCookie:'secret'}}})
  const server=createMcpServer(file);const client=new Client({name:'test-codex',version:'1'})
  const [left,right]=InMemoryTransport.createLinkedPair()
  try{
    await server.connect(left);await client.connect(right)
    const tools=await client.listTools();expect(tools.tools.map(t=>t.name)).toContain('export_orders');expect(tools.tools.map(t=>t.name)).not.toContain('clear')
    const invalid=await client.callTool({name:'start_collection',arguments:{platform:'unknown'}});expect(invalid.isError).toBe(true);expect(calls).toHaveLength(0)
    const result=await client.callTool({name:'start_collection',arguments:{platform:'taobao',from:'2026-01-01',to:'2026-01-31'}})
    expect(result.isError).not.toBe(true);expect(JSON.stringify(result)).toContain('created');expect(JSON.stringify(result)).not.toContain('secret');expect(calls[0][0]).toBe('start')
    const first=await readFile(file,'utf8');await api.close()
    const offline=await client.callTool({name:'get_task',arguments:{taskId:'created'}});expect(offline.isError).toBe(true);expect(JSON.stringify(offline)).toContain('启动')
    api=await startLocalApi({connectionFile:file,invoke:()=>({id:'created',status:'paused'})})
    expect(await readFile(file,'utf8')).not.toBe(first)
    const restarted=await client.callTool({name:'get_task',arguments:{taskId:'created'}});expect(restarted.isError).not.toBe(true);expect(JSON.stringify(restarted)).toContain('paused')
  }finally{await client.close();await server.close();await api.close();await rm(dir,{recursive:true,force:true})}
})
