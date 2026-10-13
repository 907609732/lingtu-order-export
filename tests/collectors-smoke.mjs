// Network-isolated integration tests. All accounts, orders and pages are synthetic.
import { _electron as electron } from '@playwright/test'
import { mkdtemp,readFile } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
const root=await mkdtemp(resolve('.test-output/collectors-'))
const env={...process.env,ORDERDESK_TEST_DATA:root};delete env.ELECTRON_RUN_AS_NODE;delete env.ORDERDESK_SCREENSHOT
let app
const orderSN='991001-000000000000001'
try {
  app=await electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['.'],env,timeout:45000})
  const page=await app.firstWindow();await page.getByRole('heading',{name:'淘宝 / 天猫订单导出'}).waitFor()
  await page.evaluate(()=>window.desk.setLogging(true))
  await app.evaluate(({session},{orderSN})=>{
    for(const platform of ['taobao','alibaba','pdd','jd','xianyu']){
      const ses=session.fromPartition(`persist:orderdesk-${platform}`)
      ses.protocol.handle('https',request=>{
        const u=new URL(request.url)
        if(platform==='pdd'&&u.pathname.includes('order_list'))return new Response(JSON.stringify({orders:[{order_sn:orderSN,order_time:'2026-10-01 09:00:00',order_amount:2300,order_goods:[{goods_id:'11',goods_name:'合成商品',goods_number:1,goods_price:2300}]}]}),{headers:{'content-type':'application/json'}})
        let script='',body='合成平台测试页'
        if(platform==='taobao')script=`window.lib={mtop:{request:()=>Promise.resolve(${JSON.stringify({data:{data:{shop:{tag:'shopInfo',id:'100000000000001',fields:{orderId:'100000000000001',createTime:'2026-10-01 09:00:00',shopName:'合成店'}},pay:{tag:'orderPayment',id:'100000000000001',fields:{actualFee:{value:'12.30'}}},item:{tag:'orderItemInfo',id:'100000000000001_1',fields:{orderId:'100000000000001',item:{itemId:'1',title:'合成商品',quantity:1}}},pagination:{fields:{currentPage:1,pageSize:30,totalNum:1}}},global:{pageControl:{emptyPage:false}}}})})}}`
        if(platform==='alibaba')script=`window.lib={mtop:{request:()=>Promise.resolve(${JSON.stringify({data:{data:{result:JSON.stringify({success:true,data:{data:[{idStr:'200000000000001',gmtCreate:'2026-10-01 09:00:00',sumPayment:'2345',orderEntries:[{sourceId:'1',productName:'合成商品',quantity:{realAmount:1}}]}],pages:1,pageSize:20,total:1}})}}})})}}`
        if(platform==='xianyu')script=`window.lib={mtop:{request:o=>Promise.resolve(o.api.endsWith('bought.list')?${JSON.stringify({data:{items:[{commonData:{orderIdStr:'300000000000001',itemId:'1'},head:{data:{createTime:'2026-10-01 09:00:00',userInfo:{userNick:'合成用户'}}},content:{data:{detailInfo:{auctionTitle:'合成商品'},priceInfo:{price:'18.20',buyAmount:1}}}}],nextPage:false}})}:${JSON.stringify({data:{components:[{render:'orderInfoVO',data:{orderInfoList:[{title:'收货地址',value:'合成测试地址'}],priceInfo:{billList:[{title:'运费',value:'0.00'}]}}}]}})})}}`
        if(platform==='pdd'){body+=' 没有更多订单';script="fetch('/proxy/api/order_list').then(r=>r.json())"}
        if(platform==='jd'){
          const year=u.searchParams.get('d')==='2025'?'2025':'2026',id=year+'000000000001'
          body=`<table class="order-tb"><tbody id="tb-${id}"><tr><td>订单号：${id} ${year}-10-01 09:00:00</td></tr><tr><td><div class="goods-item"><div class="p-name"><a href="https://item.jd.com/11.html">合成京东商品</a></div></div><span class="goods-number">x2</span></td><td class="amount"><span>¥12.30</span></td><td class="order-status">已完成</td></tr></tbody></table>`
        }
        return new Response(`<html><head><title>订单集成测试</title></head><body>${body}<script>${script}</script></body></html>`,{headers:{'content-type':'text/html;charset=utf-8'}})
      })
    }
  },{orderSN})
  const results=[]
  for(const platform of ['taobao','alibaba','pdd','jd','xianyu']){
    const started=Date.now();await page.evaluate(p=>window.desk.login(p),platform)
    assert.ok(Date.now()-started<5000,'login view should appear promptly')
    await page.evaluate(()=>window.desk.hidePage())
    const task=await page.evaluate(p=>window.desk.start({platform:p,from:p==='jd'?'2025-10-01':'2026-10-01',to:'2026-10-01'}),platform)
    for(let attempt=0;attempt<160;attempt++){
      const current=await page.evaluate(async id=>(await window.desk.state()).tasks.find(t=>t.id===id),task.id)
      if(current&&current.status!=='running')break
      if(attempt===159)throw new Error(`${platform}: collector did not finish`)
      await delay(250)
    }
    const orders=await page.evaluate(id=>window.desk.orders(id),task.id)
    const state=await page.evaluate(()=>window.desk.state()),finished=state.tasks.find(t=>t.id===task.id)
    assert.equal(orders.length,platform==='jd'?2:1,`${platform}: ${finished.message}`)
    assert.ok(orders.every(o=>o.paidFen!==null))
    if(platform==='xianyu'){assert.equal(finished.status,'completed');assert.equal(orders[0].address,'合成测试地址');assert.deepEqual(orders[0].missing,[])}
    else assert.equal(finished.status,'partial')
    results.push({platform,count:orders.length,status:finished.status})
  }
  const isolated=await app.evaluate(async({webContents})=>{
    const all=webContents.getAllWebContents().filter(w=>w.getURL().startsWith('https://'))
    return Promise.all(all.map(w=>w.executeJavaScript('({node:typeof require,bridge:typeof window.desk})')))
  })
  assert.ok(isolated.every(v=>v.node==='undefined'&&v.bridge==='undefined'))
  const logs=await readFile(join(root,'logs','main.log'),'utf8')
  for(const result of results)assert.ok(logs.includes(`"platform":"${result.platform}"`))
  assert.ok(logs.includes('collector.page'));assert.ok(logs.includes('collector.response'));assert.ok(logs.includes('collector.end'))
  for(const secret of [orderSN,'100000000000001','200000000000001','300000000000001','合成测试地址','合成用户','合成商品'])assert.ok(!logs.includes(secret))
  console.log(JSON.stringify({passed:true,synthetic:true,results,sandbox:true,diagnosticLogs:true}))
} finally {if(app)await app.close()}
