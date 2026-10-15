// Exercise live UI updates BEFORE a synthetic platform request finishes.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp,readdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import assert from 'node:assert/strict'

const root=await mkdtemp(resolve('.test-output/execution-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_SCREENSHOT
let app
const response=page=>({data:{data:{
  shop:{tag:'shopInfo',id:'90000000000000'+page,fields:{orderId:'90000000000000'+page,createTime:'2026-10-01 09:00:00',shopName:'PRIVATE_SHOP'}},
  pay:{tag:'orderPayment',id:'90000000000000'+page,fields:{actualFee:{value:'12.30'}}},
  item:{tag:'orderItemInfo',id:'90000000000000'+page+'_1',fields:{orderId:'90000000000000'+page,item:{itemId:'1',title:'PRIVATE_PRODUCT',quantity:1}}},
  pagination:{fields:{currentPage:page,pageSize:1,totalNum:2}}
},global:{pageControl:{emptyPage:false}}}})
async function launch(){app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000});const page=await app.firstWindow();await page.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor();return page}
try{
  let page=await launch()
  const live=page.getByRole('log',{name:'实时执行日志',includeHidden:true})
  await expect(live).toContainText('程序已启动')
  assert.equal((await page.evaluate(()=>window.desk.state())).logging.enabled,false)
  await app.evaluate(({session},{first,second})=>{
    session.fromPartition('persist:orderdesk-taobao').protocol.handle('https',()=>new Response(`<html><body>合成平台页面<script>
      window.lib={mtop:{request:async req=>{const page=req.data.page;if(page===1)await new Promise(resolve=>window.releasePage=resolve);return page===1?${JSON.stringify(first)}:${JSON.stringify(second)}}}};
    </script></body></html>`,{headers:{'content-type':'text/html;charset=utf-8'}}))
  },{first:response(1),second:response(2)})
  await page.evaluate(()=>window.desk.login('taobao'));await page.evaluate(()=>window.desk.hidePage())
  await page.getByLabel('开始日期').fill('2026-10-01');await page.getByLabel('结束日期').fill('2026-10-02')
  await page.getByRole('button',{name:'开始采集'}).click()
  await expect(live).toContainText('正在读取2026 年10 月第 1 页订单')
  await expect(live).toBeVisible()
  assert.equal((await page.evaluate(()=>window.desk.state())).tasks[0].status,'running')
  await expect(live).toContainText('已等待 10 秒',{timeout:22000})
  await page.screenshot({path:join(root,'live-wait.png')})
  await app.evaluate(async({webContents})=>{const platform=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://'));await platform.executeJavaScript('window.releasePage()')})
  await expect(live).toContainText('第 2 页读取完成',{timeout:15000})
  await expect(live).toContainText('本次列表读取结束，已保留 2 笔')
  await expect(page.locator('.task-strip')).toHaveClass(/partial/)
  const text=await live.innerText();for(const secret of ['PRIVATE_SHOP','PRIVATE_PRODUCT','900000000000001','900000000000002'])assert.ok(!text.includes(secret))
  // Filter switch must not show another platform's collection activity.
  await page.locator('nav button').filter({hasText:'京东'}).click();await expect(live).not.toContainText('第 2 页读取完成')
  await page.locator('nav button').filter({hasText:'淘宝 / 天猫'}).click();await expect(live).toContainText('第 2 页读取完成')
  const db=new DatabaseSync(join(root,'orders.sqlite'));db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('outputDir',join(root,'exports'));db.close()
  await page.reload();await expect(live).toContainText('第 2 页读取完成')
  await page.locator('nav button').filter({hasText:'淘宝 / 天猫'}).click()
  await page.getByLabel('嵌入商品图片').uncheck()
  await page.getByRole('button',{name:'导出文件',exact:false}).click()
  await expect(live).toContainText('正在写入导出文件')
  await expect(live).toContainText('导出完成，已保存 2 笔订单')
  await page.getByRole('button',{name:'复制日志'}).click()
  await expect(page.getByText('已复制当前平台的执行日志',{exact:true})).toBeVisible()
  assert.ok((await app.evaluate(({clipboard})=>clipboard.readText())).includes('导出完成'))
  await page.getByLabel('自动滚动').uncheck()
  await expect(page.getByRole('button',{name:'回到最新'})).toBeVisible()
  await page.getByRole('button',{name:'回到最新'}).click();await expect(page.getByLabel('自动滚动')).toBeChecked()
  await page.screenshot({path:join(root,'live-complete.png')})
  // A real backend failure reaches the visible feed, still with file logging off.
  await app.evaluate(async({webContents})=>{const platform=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://'));await platform.executeJavaScript("window.lib.mtop.request=async()=>{throw {ret:['FAIL_SYS_SESSION_EXPIRED::PRIVATE_TOKEN']}}; void 0")})
  await page.getByRole('button',{name:'开始采集'}).click()
  await expect(live).toContainText('采集暂时中断')
  await expect(live).toContainText('需要登录或完成平台验证')
  await expect(live).not.toContainText('PRIVATE_TOKEN')
  assert.ok(!(await readdir(root)).includes('logs'),'live feedback must not enable file logging')
  await page.getByRole('button',{name:'保存与设置'}).click()
  const toggle=page.getByRole('switch',{name:'显示执行日志'})
  await expect(toggle).toHaveAttribute('aria-checked','true');await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false')
  await page.locator('nav button').filter({hasText:'淘宝 / 天猫'}).click();await expect(live).toHaveCount(0)
  await app.close();app=undefined
  page=await launch();await expect(page.getByRole('log')).toHaveCount(0)
  await page.getByRole('button',{name:'保存与设置'}).click();await page.getByRole('switch',{name:'显示执行日志'}).click()
  await page.locator('nav button').filter({hasText:'淘宝 / 天猫'}).click();await expect(page.getByRole('log')).toContainText('程序已启动')
  await app.close();app=undefined
  page=await launch();await expect(page.getByRole('log')).toBeVisible()
  console.log(JSON.stringify({passed:true,checks:['live feed before request completion','10 second wait heartbeat','2 page collection','Chinese partial and error states','platform isolation','export progress','copy logs','follow latest','file logging remains off','visible setting persists both ways'],screenshots:[join(root,'live-wait.png'),join(root,'live-complete.png')]}))
}finally{if(app)await app.close()}
