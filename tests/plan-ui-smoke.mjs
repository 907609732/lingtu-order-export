import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/plan-ui-'));const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
const db=new DatabaseSync(join(root,'orders.sqlite'));db.exec('CREATE TABLE tasks(id TEXT PRIMARY KEY,platform TEXT,payload TEXT);CREATE TABLE task_orders(task_id TEXT,order_id TEXT,payload TEXT,PRIMARY KEY(task_id,order_id));CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)')
const legacy={id:'legacy',platform:'taobao',account:'synthetic',from:'2026-01-01',to:'2026-03-01',status:'partial',createdAt:'2026-01-01',updatedAt:'2026-01-01',count:0,pages:0,message:'旧任务',cursor:'',exportedPath:''};db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(legacy.id,legacy.platform,JSON.stringify(legacy));db.prepare('INSERT INTO settings VALUES(?,?)').run('outputDir',join(root,'exports'));db.close()
const app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
try{
 const p=await app.firstWindow();await p.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor();assert.equal(await p.locator('.detail-highlight').count(),0)
 await app.evaluate(async({session})=>{
  const ses=session.fromPartition('persist:orderdesk-taobao');await ses.cookies.set({url:'https://buyertrade.taobao.com',name:'unb',value:'synthetic-plan-account'})
  const response=month=>{const id='90000000000000'+month.slice(-2);return {data:{data:{shop:{tag:'shopInfo',id,fields:{orderId:id,orderDetailUrl:'https://trade.taobao.com/trade/detail/trade_order_detail.htm?biz_order_id='+id,createTime:month+'-01 09:00:00',shopName:'合成商家'}},pay:{tag:'orderPayment',id,fields:{actualFee:{value:'12.30'}}},item:{tag:'orderItemInfo',id:id+'_1',fields:{orderId:id,item:{itemId:'1',title:'合成计划商品',quantity:1}}}},global:{pageControl:{hasMore:false}}}}}
  ses.protocol.handle('https',req=>{const u=new URL(req.url),id=u.searchParams.get('biz_order_id');return new Response(id?`<html><body>订单号：${id}<br>付款时间：2026-03-01 12:00:00<br>收货人：合成姓名<br>联系电话：13800000000<br>收货地址：合成地址</body></html>`:`<html><body>合成订单页<script>window.requestedMonths=[];const responses=${JSON.stringify({'2026-01':response('2026-01'),'2026-03':response('2026-03')})};window.lib={mtop:{request:async o=>{const m=JSON.parse(JSON.parse(o.data.condition).orderFilterExtParam).beginTime.slice(0,7);window.requestedMonths.push(m);return responses[m]}}}</script></body></html>`,{headers:{'content-type':'text/html;charset=utf-8'}})})
 })
 await p.getByRole('button',{name:'提取计划',exact:true}).click();await expect(p.getByRole('dialog')).toBeVisible()
 await expect(p.locator('.plan-segments>button')).toHaveCount(3);await p.locator('.plan-segments>button').filter({hasText:'2026-02'}).click();await expect(p.locator('.plan-selection-head')).toContainText('2 / 3')
 await p.screenshot({path:join(root,'selection.png')});await p.getByRole('button',{name:'按所选日期开始'}).click();await expect(p.getByRole('dialog')).toHaveCount(0)
 await expect(p.locator('.plan-inline')).toContainText('2 / 2',{timeout:20000});await expect(p.locator('.detail-highlight')).toContainText('2');await expect(p.locator('.detail-prompt')).toContainText('列表已采集完成')
 const state=await p.evaluate(()=>window.desk.state()),task=state.tasks.find(t=>t.plan);assert.equal(task.count,2);assert.equal(task.listOutcome,'complete');assert.ok(task.plan.segments.every(s=>s.status==='completed'))
 const requests=await app.evaluate(async({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().includes('list_bought_items')).executeJavaScript('window.requestedMonths'));assert.deepEqual(requests,['2026-03','2026-01'])
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,740));await p.screenshot({path:join(root,'highlight-small.png')});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await p.getByRole('button',{name:'计划进度',exact:true}).click();await expect(p.locator('.plan-segments .completed')).toHaveCount(2);await p.screenshot({path:join(root,'completed-plan.png')});await p.getByRole('button',{name:'关闭',exact:true}).last().click()
 await p.getByRole('button',{name:/^提取订单详情/}).click();await expect.poll(async()=>{const rows=await p.evaluate(id=>window.desk.orders(id),task.id);return rows.filter(o=>o.detailReadAt).length},{timeout:25000}).toBe(2);await expect(p.getByRole('button',{name:/^提取订单详情/})).toBeDisabled();await expect(p.locator('.detail-highlight')).toHaveCount(0)
 const orders=await p.evaluate(id=>window.desk.orders(id),task.id);assert.ok(orders.every(o=>o.detailReadAt));assert.ok(orders.every(o=>o.missing.includes('订单详情')),'Missing fields must not be fabricated as complete')
 await p.locator('.export-options summary').click();await p.getByLabel('嵌入商品图片').uncheck();await p.locator('.export-options summary').click();await p.getByRole('button',{name:/^导出文件/}).click();await expect(p.locator('.notice')).toContainText('已导出 2 笔订单')
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(2560,1392));await p.screenshot({path:join(root,'wide.png')})
 await writeFile(join(root,'result.json'),JSON.stringify({passed:true,count:2,queries:requests,highlight:true,detailReadTracking:true,mergedExport:true}));console.log(JSON.stringify({passed:true,root}))
}finally{await app.close()}
