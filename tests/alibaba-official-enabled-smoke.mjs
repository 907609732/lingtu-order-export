// Isolated real IPC/default gate verification. No platform navigation or collection.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
await mkdir(resolve('.test-output'),{recursive:true})
for(const disabled of [false,true]){
 const root=await mkdtemp(resolve('.test-output/official-enabled-'))
 const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
 if(disabled)env.ORDERDESK_ALIBABA_OFFICIAL='0';else delete env.ORDERDESK_ALIBABA_OFFICIAL
 let app
 try{
  app=await electron.launch({executablePath:resolve(process.argv[2]||'node_modules/electron/dist/electron.exe'),args:process.argv[2]?[]:['.'],env,timeout:45000})
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk)
  const state=await page.evaluate(()=>window.desk.state())
  assert.equal(state.alibabaOfficialExportAvailable,!disabled,'normal builds must enable official export by default')
  await page.locator('nav button').filter({hasText:'1688'}).click()
  await page.getByRole('button',{name:'模式二 · 官方导出',exact:true}).click()
  await page.getByRole('button',{name:'① 选择采集时间',exact:true}).click()
  await page.locator('.plan-segments>button').first().click()
  await page.getByRole('button',{name:'确认采集时间',exact:true}).click()
  const start=page.getByRole('button',{name:'② 官方导出',exact:true})
  if(disabled){
   await expect(start).toBeDisabled()
   const result=await page.evaluate(async()=>{try{await window.desk.start({platform:'alibaba',mode:'official-export',from:'2026-01-01',to:'2026-01-31'});return ''}catch(e){return String(e)}})
   assert.match(result,/停用|未开放/)
   assert.equal((await page.evaluate(()=>window.desk.state())).tasks.length,0)
  }else{
   await expect(start).toBeEnabled()
   await expect(page.locator('.official-mode-note')).toContainText('所选月份')
  }
  console.log(JSON.stringify({passed:true,disabled,root,platformTasksStarted:0}))
 }finally{if(app)await app.close()}
}
