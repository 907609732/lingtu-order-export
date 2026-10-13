import {_electron as electron} from '@playwright/test'
import {mkdtemp,readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import assert from 'node:assert/strict'
const root=await mkdtemp(resolve('.test-output/mtop-failures-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_SCREENSHOT
const app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
try{
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.desk)
 await page.evaluate(()=>window.desk.setLogging(true))
 await app.evaluate(({session})=>session.fromPartition('persist:orderdesk-taobao').protocol.handle('https',()=>new Response('<html><title>我的淘宝</title><body>合成页面</body></html>',{headers:{'content-type':'text/html;charset=utf-8'}})))
 await page.evaluate(()=>window.desk.login('taobao'));await page.evaluate(()=>window.desk.hidePage())
 const results=[]
 for(const mode of ['service','login','timeout','network','structure','success','partial']){
  await app.evaluate(async({webContents},mode)=>{
   const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://buyertrade.taobao.com/'))
   await wc.executeJavaScript(`window.lib={mtop:{request:(options,success,fail)=>{
    const mode=${JSON.stringify(mode)};
    if(options.ttid!=='1@tbwang_windows_1.0.0#pc'||options.valueType!=='original'||!options.preventFallback)return Promise.reject({ret:['FAIL_SYS_SERVICE_INNER_FAULT::missing buyer contract']});
    if(mode==='service'){fail({ret:['FAIL_SYS_SERVICE_INNER_FAULT::PRIVATE_TOKEN 请登录']});return;}
    if(mode==='login')return Promise.reject({ret:['FAIL_SYS_SESSION_EXPIRED::PRIVATE_TOKEN']});
    if(mode==='timeout')return Promise.reject({ret:['TIMEOUT::PRIVATE_TOKEN']});
    if(mode==='network')return Promise.reject(new Error('network PRIVATE_TOKEN'));
    if(mode==='structure')return Promise.resolve({ret:['SUCCESS'],data:{unknown:true}});
    if(mode==='partial'&&options.data.page===2)return Promise.reject({ret:['FAIL_SYS_SERVICE_INNER_FAULT::PRIVATE_TOKEN']});
    return Promise.resolve({ret:['SUCCESS'],data:{data:{pagination:{fields:{pageSize:1,totalNum:mode==='partial'?2:0}},...(mode==='partial'?{shop:{tag:'shopInfo',id:'900000000000001',fields:{orderId:'900000000000001',createTime:'2026-10-01 09:00:00',shopName:'PRIVATE_SHOP'}}}:{})},global:{pageControl:{emptyPage:mode!=='partial'}}}});
   }}};void 0`)
  },mode)
  const task=await page.evaluate(()=>window.desk.start({platform:'taobao',from:'2026-10-01',to:'2026-10-14'}))
  let done;for(let n=0;n<120;n++){done=await page.evaluate(async id=>(await window.desk.state()).tasks.find(t=>t.id===id),task.id);if(done.status!=='running')break;await new Promise(r=>setTimeout(r,100))}
  assert.equal(done.status,mode==='login'?'needs_login':['success','partial'].includes(mode)?'partial':'failed')
  const logs=await page.evaluate(()=>window.desk.executionLogs('taobao'));const own=logs.filter(l=>l.taskId===task.id).map(l=>l.message).join('\n')
  assert.ok(!own.includes('PRIVATE'))
  if(mode==='service'){assert.ok(own.includes('FAIL_SYS_SERVICE_INNER_FAULT'));assert.ok(!own.includes('需要登录'));}
  if(mode==='partial'){assert.equal(done.count,1);assert.ok(own.includes('采集已中断，已保留 1 笔'));}
  results.push({mode,status:done.status,count:done.count})
 }
 const log=await readFile(join(root,'logs/main.log'),'utf8');assert.ok(!log.includes('PRIVATE'));assert.ok(log.includes('"platformCode":"FAIL_SYS_SERVICE_INNER_FAULT"'))
 console.log(JSON.stringify({passed:true,synthetic:true,results,rawErrorsOmitted:true}))
}finally{await app.close()}
