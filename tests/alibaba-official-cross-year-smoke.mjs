// Renderer-only fixture: isolated app profile, no website requests. Verifies cross-year month selection.
import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/cross-year-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
let app
try{
 app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
 const p=await app.firstWindow()
 await p.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor()
 await p.getByRole('button',{name:'① 选择采集时间',exact:true}).click()
 await expect(p.getByRole('dialog')).toBeVisible()
 await expect(p.locator('.plan-segments>button')).toHaveCount(12)
 await p.getByLabel('跨年多选').check()
 await expect(p.getByRole('dialog').locator('.plan-year #plan-end-year')).toHaveCount(1)
 const fromYear=p.getByLabel('年份',{exact:true})
 await fromYear.fill('2025');await fromYear.press('Enter');await fromYear.press('Tab')
 await expect(p.locator('.plan-segments>button')).toHaveCount(24)
 await p.locator('.plan-segments>button').filter({hasText:'2025-12'}).click()
 await p.locator('.plan-segments>button').filter({hasText:'2026-01'}).click()
 await expect(p.locator('.plan-selection-head')).toContainText('2 / 24 个月')
 await p.getByRole('button',{name:'确认采集时间',exact:true}).click()
 await expect(p.getByRole('dialog')).toHaveCount(0)
 await expect(p.locator('.collection-time-summary')).toContainText('2025 年 · 12 月')
 await expect(p.locator('.collection-time-summary')).toContainText('2026 年 · 1 月')
 assert.equal((await p.evaluate(()=>window.desk.state())).tasks.length,0,'confirming a cross-year range must not create a task')
 await p.getByRole('button',{name:'① 选择采集时间',exact:true}).click()
 await expect(p.getByLabel('跨年多选')).toBeChecked()
 await expect(p.locator('.plan-segments>button.selected')).toHaveCount(2)
 await p.getByRole('button',{name:'取消',exact:true}).last().click()
 console.log(JSON.stringify({passed:true,root,months:24,selected:2}))
}finally{if(app)await app.close()}
