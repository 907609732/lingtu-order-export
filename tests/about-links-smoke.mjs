import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'

const data=await mkdtemp(resolve('.test-output/about-links-'))
const env={...process.env,ORDERDESK_TEST_DATA:data}
delete env.ELECTRON_RUN_AS_NODE
delete env.ORDERDESK_SCREENSHOT
let app
try{
  app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
  // Intercept the real main-process external opener to verify IPC without opening external tabs.
  await app.evaluate(({shell})=>{globalThis.__aboutUrls=[];shell.openExternal=async url=>{globalThis.__aboutUrls.push(url)}})
  const page=await app.firstWindow()
  await page.getByRole('button',{name:'保存与设置',exact:true}).click()
  await expect(page.getByRole('heading',{name:'关于',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'访问官网 ↗',exact:true}).click()
  await page.getByRole('button',{name:'GitHub 仓库 ↗',exact:true}).click()
  assert.deepEqual(await app.evaluate(()=>globalThis.__aboutUrls),[
    'https://buyer.lttlt.top/',
    'https://github.com/907609732/lingtu-order-export'
  ])
  await expect(page.getByRole('button',{name:'检查更新',exact:true})).toBeEnabled()
  console.log('PASS: About buttons route through real preload/IPC to distinct official URLs; update button retained; isolated data used.')
}finally{await app?.close()}
