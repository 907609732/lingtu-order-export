import {_electron as electron,expect} from '@playwright/test'
import {spawn} from 'node:child_process'
import {mkdtemp} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
const data=await mkdtemp(resolve('.test-output/update-single-instance-'));const env={...process.env,ORDERDESK_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE
let app,second
try{app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000});const page=await app.firstWindow();await expect(page.getByRole('button',{name:'软件更新',exact:true})).toBeVisible();second=spawn(resolve('node_modules/electron/dist/electron.exe'),['.'],{env,stdio:'ignore'});const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{second.kill();reject(Error('second instance remained running with the same userData'))},5000);second.once('exit',code=>{clearTimeout(timer);resolve(code)});second.once('error',reject)});assert.equal(code,0);await page.getByRole('button',{name:'软件更新',exact:true}).click();await expect(page.getByRole('heading',{name:'软件更新',exact:true})).toBeVisible();console.log('PASS: second Electron instance with same isolated userData exits; first remains usable')}
finally{second?.kill();await app?.close()}
