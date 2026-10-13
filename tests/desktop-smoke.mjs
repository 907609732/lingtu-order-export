import { _electron as electron } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'

const root = resolve('.test-output/desktop-smoke')
await mkdir(root, { recursive: true })
const env = { ...process.env, ORDERDESK_TEST_DATA: root }
delete env.ELECTRON_RUN_AS_NODE
delete env.ORDERDESK_SCREENSHOT
let app
try {
  app = await electron.launch({ executablePath: resolve('node_modules/electron/dist/electron.exe'), args: ['.'], env, timeout: 45000 })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: '淘宝 / 天猫订单导出' }).waitFor()
  await page.evaluate(()=>window.desk.setLogging(true))
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const label of ['1688','拼多多','京东','闲鱼','得物','快手','饿了么','美团','淘宝 / 天猫']) {
    await page.locator('nav button').filter({ has: page.locator('span', { hasText: label }) }).click()
    await page.getByRole('heading', { name: `${label}订单导出`, exact: true }).waitFor()
  }
  await page.screenshot({ path: join(root,'empty.png') })
  const now = new Date().toISOString()
  const task = { id:'synthetic-ui-check',platform:'pdd',account:'测试账号',from:'2026-10-01',to:'2026-10-01',status:'partial',createdAt:now,updatedAt:now,count:1,pages:1,message:'合成数据，仅验证软件界面与导出流程',cursor:'',exportedPath:'' }
  const order = { platform:'pdd',account:'测试账号',id:'12345678901234567890',createdAt:'2026-10-01 09:00:00',paidAt:'',shippedAt:'',completedAt:'',status:'测试订单',shop:'测试店铺',sellerId:'',paidFen:4050,freightFen:null,refundFen:null,refundStatus:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',detailUrl:'',items:[{id:'fixture',title:'合成测试商品',spec:'测试规格',quantity:2,unitPriceFen:2000,imageUrl:'',productUrl:''}],extra:{},missing:['订单详情'],source:'response',capturedAt:now,detailState:'pending' }
  const db = new DatabaseSync(join(root,'orders.sqlite'))
  db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?,?)').run(task.id,task.platform,JSON.stringify(task))
  db.prepare('INSERT OR REPLACE INTO task_orders VALUES(?,?,?)').run(task.id,order.id,JSON.stringify(order))
  db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('outputDir',join(root,'exports'))
  db.close()
  await page.reload()
  await page.locator('nav button').filter({hasText:'拼多多'}).click()
  await page.getByText('合成测试商品', {exact:true}).waitFor()
  await page.getByLabel('嵌入商品图片').uncheck()
  await page.getByRole('button', {name:'导出文件'}).click()
  await page.getByText('已导出 1 笔订单', {exact:false}).waitFor({timeout:30000})
  const state = await page.evaluate(() => window.desk.state())
  const path = state.tasks.find(t => t.id === 'synthetic-ui-check').exportedPath
  assert.ok((await readFile(path)).length > 1000)
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(path)
  assert.equal(book.worksheets[0].getCell('E2').value, order.id)
  assert.equal(book.worksheets[0].getCell('I2').value, 40.5)
  assert.ok(book.getWorksheet('缺项清单'))
  const logs=await readFile(join(root,'logs','main.log'),'utf8')
  assert.ok(logs.includes('export.done'))
  assert.ok(!logs.includes(order.id));assert.ok(!logs.includes(order.items[0].title))
  await page.screenshot({path:join(root,'exported.png')})
  await app.close(); app = undefined
  app = await electron.launch({ executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000 })
  const reopened = await app.firstWindow()
  await reopened.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor()
  await reopened.locator('nav button').filter({hasText:'拼多多'}).click()
  await reopened.getByText('合成测试商品',{exact:true}).waitFor()
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:true,checks:['9 platform screens','real renderer and IPC','xlsx export','text order id','amount in yuan','missing report','persistent restart'],screenshots:[join(root,'empty.png'),join(root,'exported.png')]}))
} finally { if (app) await app.close() }
