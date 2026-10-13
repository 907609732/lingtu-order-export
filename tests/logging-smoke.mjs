// Real Electron renderer/IPC, using a new isolated data directory and synthetic errors only.
import { _electron as electron, expect } from '@playwright/test'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

const root=await mkdtemp(resolve('.test-output/logging-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_SCREENSHOT
const file=join(root,'logs','main.log')
let app
async function launch(){
  app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
  const page=await app.firstWindow()
  await page.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor()
  await page.getByRole('button',{name:'保存与设置'}).click()
  await page.getByRole('heading',{name:'问题排查日志'}).waitFor()
  return page
}
try{
  let page=await launch()
  let toggle=page.getByRole('switch',{name:'问题排查日志'})
  await expect(toggle).toHaveAttribute('aria-checked','false')
  assert.ok(!(await readdir(root)).includes('logs'),'default off must not create logs')
  await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await expect(toggle).toBeEnabled()
  assert.ok((await readFile(file,'utf8')).includes('logging.enabled'))
  await page.evaluate(async()=>{
    try{await window.desk.start({platform:'taobao',from:'INVALID_PRIVATE_DATE',to:'2026-10-01'})}catch{}
    const error=new TypeError('Cookie=PRIVATE_TOKEN; account=PRIVATE_ACCOUNT; phone=13800000000; 杭州市合成地址')
    window.dispatchEvent(new ErrorEvent('error',{error,message:error.message}))
    await window.desk.reportError('promise',{name:'Error',message:error.message,stack:error.stack})
  })
  for(let attempt=0;attempt<50;attempt++){
    if((await readFile(file,'utf8')).includes('renderer.error'))break
    await delay(50)
  }
  const content=await readFile(file,'utf8')
  assert.ok(content.includes('ipc.failed'));assert.ok(content.includes('renderer.error'))
  for(const secret of ['PRIVATE_TOKEN','PRIVATE_ACCOUNT','13800000000','杭州市合成地址','INVALID_PRIVATE_DATE'])assert.ok(!content.includes(secret))
  await app.evaluate(({shell})=>{shell.openPath=async path=>{globalThis.openedLogPath=path;return ''}})
  await page.getByRole('button',{name:'打开日志文件夹'}).click()
  await expect(toggle).toBeEnabled()
  assert.equal(await app.evaluate(()=>globalThis.openedLogPath),join(root,'logs'))
  await page.screenshot({path:join(root,'logging-on.png')})
  await app.close();app=undefined

  page=await launch();toggle=page.getByRole('switch',{name:'问题排查日志'})
  await expect(toggle).toHaveAttribute('aria-checked','true')
  assert.ok((await readFile(file,'utf8')).includes('app.start'))
  await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');await expect(toggle).toBeEnabled()
  const stopped=await readFile(file,'utf8')
  await page.evaluate(async()=>{
    await window.desk.reportError('vue',{name:'Error',message:'ignored after disabling',stack:''})
    try{await window.desk.start({platform:'taobao',from:'invalid',to:'invalid'})}catch{}
  })
  await app.close();app=undefined
  assert.equal(await readFile(file,'utf8'),stopped)

  page=await launch();toggle=page.getByRole('switch',{name:'问题排查日志'})
  await expect(toggle).toHaveAttribute('aria-checked','false')
  await page.screenshot({path:join(root,'logging-off.png')})
  await app.close();app=undefined
  assert.equal(await readFile(file,'utf8'),stopped,'disabled must persist and never append on restart or quit')
  console.log(JSON.stringify({passed:true,checks:['settings switch','default off','file writing','IPC and renderer errors','sensitive data omitted','open folder','enabled persistence','disabled persistence','no writes after disabling'],screenshots:[join(root,'logging-on.png'),join(root,'logging-off.png')]}))
}finally{if(app)await app.close()}
