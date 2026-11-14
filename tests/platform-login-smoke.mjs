import {_electron as electron,expect} from '@playwright/test'
import {mkdtemp} from 'node:fs/promises'
import {resolve} from 'node:path'
import assert from 'node:assert/strict'
const results=[]
for(const mode of ['iframe','main','preserve','loop']){
 const root=await mkdtemp(resolve('.test-output/login-return-')),env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE
 const app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
 try{
  const p=await app.firstWindow();await p.waitForFunction(()=>!!window.desk)
  await app.evaluate(({session},mode)=>{
   globalThis.loginVisits=0
   session.fromPartition('persist:orderdesk-alibaba').protocol.handle('https',req=>{
    const u=new URL(req.url);let body='合成订单页面'
    if(u.hostname==='air.1688.com'){
     globalThis.loginVisits++
     if(mode==='preserve')body='<iframe src="https://login.taobao.com/member/login.jhtml"></iframe><iframe src="https://www.taobao.com/markets/verify"></iframe>'
     else if(mode==='main'&&globalThis.loginVisits===1)body='<script>location.href="https://error.taobao.com/tbpc/error.html"</script>'
     else if(mode==='loop'||(mode==='iframe'&&globalThis.loginVisits===1))body='<iframe src="https://login.taobao.com/member/login.jhtml"></iframe>'
    }else if(u.hostname==='login.taobao.com'&&mode!=='preserve'&&!u.searchParams.has('preserve'))body='<script>location.replace("https://error.taobao.com/tbpc/error.html")</script>'
    return new Response('<html><body>'+body+'</body></html>',{headers:{'content-type':'text/html;charset=utf-8'}})
   })
  },mode)
  await p.evaluate(()=>window.desk.login('alibaba'))
  if(mode==='preserve'){
   await expect.poll(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().includes('air.1688.com'))?.mainFrame.framesInSubtree.map(f=>f.url).join()),{timeout:10000}).toContain('markets/verify')
   await p.waitForTimeout(300);assert.equal(await app.evaluate(()=>globalThis.loginVisits),1)
  }else{
   await expect.poll(()=>app.evaluate(()=>globalThis.loginVisits),{timeout:10000}).toBeGreaterThanOrEqual(2)
   await expect.poll(()=>app.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>w.getURL().startsWith('https://')).map(w=>w.getURL()).join()),{timeout:10000}).toContain('air.1688.com')
   if(mode==='loop'){
    await p.waitForTimeout(600);const visits=await app.evaluate(()=>globalThis.loginVisits);assert.ok(visits<=3,'login recovery must stop after at most two returns');await p.waitForTimeout(300);assert.equal(await app.evaluate(()=>globalThis.loginVisits),visits)
   }else{
    await app.evaluate(async({webContents})=>{const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://'));await w.loadURL('https://login.taobao.com/member/login.jhtml?preserve=1')})
    await p.waitForTimeout(300);assert.ok((await app.evaluate(({webContents})=>webContents.getAllWebContents().map(w=>w.getURL()))).some(u=>u.includes('login.taobao.com')))
   }
  }
  results.push({mode,visits:await app.evaluate(()=>globalThis.loginVisits)})
 }finally{await app.close()}
}
console.log(JSON.stringify({passed:true,results}))
