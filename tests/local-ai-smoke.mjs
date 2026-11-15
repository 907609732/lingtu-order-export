import {_electron as electron} from '@playwright/test'
import {Client} from '@modelcontextprotocol/sdk/client/index.js'
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'
import {DatabaseSync} from 'node:sqlite'
import {mkdtemp,readFile,access} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {setTimeout as delay} from 'node:timers/promises'

const root=await mkdtemp(resolve('.test-output/local-ai-'))
const env={...process.env,ORDERDESK_TEST_DATA:root,ORDERDESK_LOCAL_API:'1'}
delete env.ELECTRON_RUN_AS_NODE
delete env.ORDERDESK_SCREENSHOT
const connectionFile=join(root,'ai','connection.json')
let app,client
try{
  app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
  const page=await app.firstWindow()
  await page.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor()
  const fixture=JSON.parse(await readFile('tests/fixtures/ai-order.json','utf8'))
  const now=new Date().toISOString()
  const task={id:'local-ai-fixture',platform:'pdd',account:'合成测试账号',from:'2026-10-01',to:'2026-10-01',status:'paused',createdAt:now,updatedAt:now,count:1,pages:1,message:'合成数据，仅验证接口',cursor:'private-cursor',accountCookie:'private-cookie',exportedPath:''}
  const db=new DatabaseSync(join(root,'orders.sqlite'))
  db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(task.id,task.platform,JSON.stringify(task))
  db.prepare('INSERT INTO task_orders VALUES(?,?,?)').run(task.id,fixture.id,JSON.stringify(fixture))
  db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('outputDir',join(root,'exports'));db.close()
  let connection
  for(let n=0;n<100;n++){
    try{connection=JSON.parse(await readFile(connectionFile,'utf8'));break}catch{await delay(100)}
  }
  assert.ok(connection,'local API discovery must become ready after the window loads')
  assert.equal((await fetch(connection.url+'/v1/tools/get_state',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401)
  client=new Client({name:'codex-smoke',version:'1'})
  await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('out/mcp/server.mjs')],env:{...process.env,LINGTU_ORDER_CONNECTION:connectionFile}}))
  const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='export_orders'))
  async function call(name,args={}){const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse(result.content[0].text)}
  const state=await call('get_state');assert.equal(state.tasks[0].id,task.id);assert.ok(!JSON.stringify(state).includes('private-'))
  const orders=await call('list_orders',{taskId:task.id});assert.equal(orders.total,1);assert.equal(orders.orders[0].id,fixture.id)
  const exported=await call('export_orders',{taskId:task.id,format:'xlsx',images:false});await access(exported.path)
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(exported.path)
  assert.equal(workbook.worksheets[0].getCell('E2').value,fixture.id);assert.equal(workbook.worksheets[0].getCell('I2').value,40.5)
  const csv=await call('export_orders',{taskId:task.id,format:'csv'});assert.ok((await readFile(csv.path,'utf8')).includes(fixture.id))
  const ui=await page.evaluate(()=>window.desk.state());assert.equal(ui.tasks[0].exportedPath,csv.path)
  // Invalid dates and an already-running platform must not create duplicate tasks.
  const invalid=await client.callTool({name:'start_collection',arguments:{platform:'taobao',from:'2026-02-30',to:'2026-03-01'}});assert.equal(invalid.isError,true)
  assert.equal((await call('list_tasks')).length,1)
  const busyDb=new DatabaseSync(join(root,'orders.sqlite'))
  busyDb.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify({...task,status:'running'}),task.id);busyDb.close()
  const busy=await client.callTool({name:'start_collection',arguments:{platform:'pdd',from:'2026-10-01',to:'2026-10-01'}})
  assert.equal(busy.isError,true);assert.match(busy.content[0].text,/暂停/);assert.equal((await call('list_tasks')).length,1)
  console.log(JSON.stringify({passed:true,checks:['real Electron API','Bearer authentication','real stdio MCP handshake','task credential redaction','paged orders','xlsx values','csv output','shared UI task state','invalid input leaves tasks intact','same-platform busy protection']}))
}finally{await client?.close();await app?.close()}
