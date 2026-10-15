import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp,writeFile,readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/order-browser-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_SCREENSHOT
const stamp='2026-03-28 12:00:00'
const makeOrder=i=>({platform:'taobao',account:'合成账号',id:String(90000000000000000000n+BigInt(i)),createdAt:stamp,paidAt:'2026-03-28 12:01:00',shippedAt:'2026-03-29 09:00:00',completedAt:'2026-03-30 09:00:00',status:i%2?'交易成功':'待发货',shop:i%2?'测试商家甲':'测试商家乙',sellerId:'99999999999999999999',paidFen:i*100,freightFen:0,refundFen:i===1?0:null,refundStatus:i===1?'退款处理中':'',receiver:'合成收货人'+i,phone:'1380000'+String(i).padStart(4,'0'),address:'合成测试地址 '+i,logistics:'合成快递',tracking:'SYNTHETIC'+i,remark:'合成备注 '+i,detailUrl:'https://trade.taobao.com/trade/detail/trade_order_detail.htm?biz_order_id='+String(90000000000000000000n+BigInt(i)),items:[{id:'SKU-'+i,title:'合成商品 '+i,spec:'白色 / 大号',quantity:2,unitPriceFen:null,imageUrl:'',productUrl:'',extra:{'子订单号':'SUB-'+i,'SKU ID':'SKU-'+i,'商品实付合计(元)':String(i)}}],extra:{'物流状态':'合成待签收','订单标记':'合成标记'},missing:['订单详情'],source:'response',capturedAt:stamp,detailState:'pending'})
const task=(id,count)=>({id,platform:'taobao',account:'合成账号',from:'2026-03-28',to:'2026-03-28',status:'partial',createdAt:stamp,updatedAt:stamp,count,pages:1,message:'合成订单，仅用于验证界面',cursor:'',exportedPath:''})
const db=new DatabaseSync(join(root,'orders.sqlite'));db.exec('CREATE TABLE tasks(id TEXT PRIMARY KEY,platform TEXT,payload TEXT);CREATE TABLE task_orders(task_id TEXT,order_id TEXT,payload TEXT,PRIMARY KEY(task_id,order_id));CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)')
for(const [id,count,offset] of [['details-case',3,500],['browser-case',120,0]]){db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(id,'taobao',JSON.stringify(task(id,count)));for(let i=1;i<=count;i++){const o=makeOrder(i+offset);db.prepare('INSERT INTO task_orders VALUES(?,?,?)').run(id,o.id,JSON.stringify(o))}}
db.prepare('INSERT INTO settings VALUES(?,?)').run('outputDir',join(root,'exports'));db.close()
let app
const launch=async()=>{app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000});const p=await app.firstWindow();await p.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor();return p}
try{
 let p=await launch();const errors=[];p.on('pageerror',e=>errors.push(e.message))
 await expect(p.locator('.order-summary')).toContainText('120 / 120');await expect(p.locator('.order-id')).toHaveCount(50)
 await p.getByLabel('搜索订单数据').fill('SYNTHETIC37 白色');await expect(p.locator('.order-id')).toHaveCount(1)
 await p.locator('.order-id').click();await expect(p.locator('.order-detail')).toContainText('合成收货人37');await expect(p.locator('.order-detail')).toContainText('合成测试地址 37');await expect(p.locator('.order-detail')).toContainText('SUB-37');await expect(p.locator('.order-detail')).toContainText('未获取')
 await p.getByRole('button',{name:'清空筛选'}).click();await p.getByLabel('订单状态筛选').selectOption('待发货');await expect(p.locator('.order-summary')).toContainText('60 / 120')
 await p.getByRole('button',{name:'清空筛选'}).click();await p.getByLabel('每页条数').selectOption('20');await expect(p.locator('.order-id')).toHaveCount(20)
 await p.getByRole('button',{name:'下一页',exact:true}).click();await expect(p.locator('.order-pagination strong')).toHaveText('2 / 6')
 await p.getByLabel('搜索订单数据').fill('SYNTHETIC120');await expect(p.locator('.order-pagination strong')).toHaveText('1 / 1');await expect(p.locator('.order-id')).toHaveCount(1)
 await p.getByRole('button',{name:/显示列/}).click();await p.locator('.column-menu').getByLabel('运费',{exact:true}).check();await p.getByLabel('关闭列设置').click()
 await p.getByLabel('商品图片',{exact:true}).check();await p.getByRole('button',{name:'专注看表'}).click();await expect(p.locator('.table-focused')).toBeVisible();await p.screenshot({path:join(root,'focused.png')});await p.getByRole('button',{name:'退出大表'}).click()
 await p.getByRole('button',{name:'清空筛选'}).click();await p.getByLabel('每页条数').selectOption('50');await p.screenshot({path:join(root,'table.png')})
 // All-record export is explicit even while the local table is filtered.
 await p.getByLabel('搜索订单数据').fill('SYNTHETIC120');await p.locator('.export-options summary').click();await p.getByLabel('嵌入商品图片').uncheck();await p.locator('.export-options summary').click();await p.getByRole('button',{name:'导出文件'}).click();await expect(p.locator('.notice')).toContainText('已导出 120 笔订单',{timeout:30000})
 await p.getByLabel('查看历史采集任务').selectOption('details-case')
 await app.evaluate(({session})=>{globalThis.blockDetail=true;session.fromPartition('persist:orderdesk-taobao').protocol.handle('https',request=>{const u=new URL(request.url),id=u.searchParams.get('biz_order_id');const modern=`<html><body>订单编号<br>${id}<span>复制</span><br>付款时间<br>2026-03-28 12:15:00<div class="addressItem--sample"><span>地址</span><div><div>PRIVATE_ADDRESS</div><div class="userInfo--sample">PRIVATE_RECEIVER 13800001111</div></div></div><div class="logisticsPackageHeader--sample"><div class="logisticsPackageEXTxt--sample">PRIVATE_COMPANY</div><div class="logisticsPackageNo--sample">PRIVATE_TRACKING</div></div><div class="logisticsItem--sample"><span>运</span><div><span>已签收</span><span>合成签收描述</span><span class="btnCheckContainer--sample">查看物流</span></div></div></body></html>`;return new Response(id?(globalThis.blockDetail&&id.endsWith('502')?'<html><title>登录</title><body>密码登录<input type="password"></body></html>':id.endsWith('501')?modern:`<html><body>订单号：${id}<br>付款时间：2026-03-28 12:15:00<br>收货人：PRIVATE_RECEIVER<br>联系电话：13800001111<br>收货地址：PRIVATE_ADDRESS<br>物流公司：PRIVATE_COMPANY<br>物流单号：PRIVATE_TRACKING</body></html>`):'<html><body>合成平台列表页</body></html>',{headers:{'content-type':'text/html;charset=utf-8'}})})})
 await p.getByRole('button',{name:/^提取订单详情/}).click()
 async function waitTask(){let s;for(let i=0;i<200;i++){s=await p.evaluate(()=>window.desk.state());if(s.tasks.find(t=>t.id==='details-case').status!=='running')return s;await new Promise(r=>setTimeout(r,100))}throw Error('detail task timeout')}
 let s=await waitTask();assert.equal(s.tasks.find(t=>t.id==='details-case').status,'needs_login')
 let items=await p.evaluate(()=>window.desk.orders('details-case'));assert.equal(items[0].receiver,'PRIVATE_RECEIVER');assert.equal(items[0].address,'PRIVATE_ADDRESS');assert.equal(items[0].phone,'13800001111');assert.equal(items[0].logistics,'PRIVATE_COMPANY');assert.equal(items[0].tracking,'PRIVATE_TRACKING');assert.equal(items[0].extra['物流状态'],'已签收 合成签收描述');assert.notEqual(items[2].receiver,'PRIVATE_RECEIVER')
 await app.evaluate(()=>{globalThis.blockDetail=false});await p.getByRole('button',{name:'继续采集',exact:true}).click();s=await waitTask();assert.equal(s.tasks.find(t=>t.id==='details-case').status,'partial')
 items=await p.evaluate(()=>window.desk.orders('details-case'));assert.equal(items.length,3);assert.ok(items.every(o=>o.receiver==='PRIVATE_RECEIVER'&&o.paidAt==='2026-03-28 12:15:00'))
 const logs=await p.evaluate(()=>window.desk.executionLogs('taobao'));assert.ok(!JSON.stringify(logs).includes('PRIVATE_'))
 await p.getByLabel('查看历史采集任务').selectOption('browser-case');await p.locator('.order-id').first().click();await p.locator('.order-detail').first().scrollIntoViewIfNeeded();await p.screenshot({path:join(root,'expanded.png')})
 await app.close();app=undefined;p=await launch();await p.getByRole('button',{name:/显示列/}).click();await expect(p.locator('.column-menu').getByLabel('运费',{exact:true})).toBeChecked();await expect(p.getByLabel('商品图片',{exact:true})).toBeChecked();await p.getByLabel('关闭列设置').click()
 assert.deepEqual(errors,[]);const result={passed:true,synthetic:true,checks:['120 rows and paging','search recipient tracking sku','combined filters','expand all fields','columns and images persisted','focus table','all-record export','detail verification pause and resume','no private fields in log'],root};await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{if(app)await app.close()}
