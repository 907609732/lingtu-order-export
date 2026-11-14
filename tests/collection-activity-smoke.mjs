import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/activity-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env})
 const page=await app.firstWindow();await page.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor()
 await app.evaluate(({BrowserWindow},ci)=>{const win=BrowserWindow.getAllWindows()[0];if(ci)win.show();else win.hide();win.setSize(1120,740)},!!process.env.CI)
 const db=new DatabaseSync(join(root,'orders.sqlite'))
 db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('showExecutionLog','false')
 const base={id:'synthetic-activity',platform:'alibaba',account:'合成测试',from:'2026-10-01',to:'2026-11-30',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),count:12,pages:3,message:'正在等待平台返回订单，已等待 10 秒',cursor:'',exportedPath:'',operation:'list',listOutcome:'pending',plan:{granularity:'month',segments:[{id:'a',from:'2026-10-01',to:'2026-10-31',status:'completed',count:12},{id:'b',from:'2026-11-01',to:'2026-11-30',status:'running',count:0}],buckets:[]}}
 const card=page.getByRole('status',{name:'采集活动'})
 await page.emulateMedia({reducedMotion:'no-preference'})
 async function state(patch){const task={...base,status:'running',...patch};db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?,?)').run(task.id,task.platform,JSON.stringify(task));await page.reload();if(task.status!=='running')await page.locator('nav button').filter({hasText:'1688'}).click();await page.locator('h1').filter({hasText:'1688'}).waitFor()}
 await state({});await expect(card).toBeVisible();await expect(card).toHaveAttribute('aria-busy','true');await expect(card).toContainText('正在采集订单');await expect(card).toContainText('已采集 12 笔');await expect(card).toContainText('已读取 3 页');await expect(card).toContainText('计划 1 / 2 段');await expect(page.getByRole('log')).toHaveCount(0)
 assert.ok(!/%/.test(await card.innerText()))
 assert.notEqual(await card.locator('.activity-icon').evaluate(el=>getComputedStyle(el).animationName),'none')
 await page.screenshot({path:join(root,'running-1120.png')});await page.screenshot({path:join(root,'activity-card.png'),clip:await card.boundingBox()})
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await card.locator('.activity-icon').evaluate(el=>getComputedStyle(el).animationName),'none')
 await state({operation:'details',listOutcome:'complete'});await expect(card).toContainText('正在提取订单详情');await expect(card).not.toContainText('计划');await expect(card).not.toContainText('页');await expect(card).not.toContainText('%');await expect(card).toContainText('待提取详情 0 笔')
 await state({operation:'list',activityPhase:'details'});await expect(card).toContainText('正在提取订单详情');await expect(card).not.toContainText('计划');await expect(card).not.toContainText('页')
 for(const [status,title] of [['paused','采集已暂停'],['needs_login','需要登录 / 验证'],['failed','采集遇到问题'],['partial','采集未完成']]){await state({status});await expect(card).toContainText(title);await expect(card).toHaveAttribute('aria-busy','false');assert.equal(await card.locator('.activity-icon').evaluate(el=>getComputedStyle(el).animationName),'none')}
 await state({status:'partial',listOutcome:'complete'});await expect(card).toHaveCount(0)
 await state({status:'partial',listOutcome:undefined});await expect(card).toHaveCount(0)
 await state({status:'completed',listOutcome:'complete'});await expect(card).toHaveCount(0);await expect(page.locator('.plan-inline')).toBeVisible()
 db.close();console.log(JSON.stringify({passed:true,screenshot:join(root,'running-1120.png'),checks:['list','details','paused','needs_login','failed','partial','completion','logs hidden','real segments','unknown total','reduced motion','1120px width','restore active non-Taobao']}))
}finally{await app?.close()}
