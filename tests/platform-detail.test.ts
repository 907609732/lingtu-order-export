import {describe,it,expect} from 'vitest'
import {platformDetailUrl,mergePlatformVisibleDetail} from '../src/main/platform-detail'
import {pendingDetails,shouldHighlightDetails,detailPlatforms} from '../src/core/extraction-plan'
import type {Order,Task} from '../src/shared/types'
const row=(platform:'jd'|'alibaba')=>({platform,id:'123456789012345678',createdAt:'2026-01-01 08:00:00',paidAt:'',shippedAt:'',completedAt:'',receiver:'',phone:'',address:'',logistics:'',tracking:'',remark:'',refundStatus:'',refundFen:null,extra:{},missing:['订单详情'],detailState:'pending',items:[],capturedAt:''} as unknown as Order)
describe.each(['jd','alibaba'] as const)('%s visible detail',platform=>{
 const url=`https://${platform==='jd'?'details.jd.com/normal/item.action':'trade.1688.com/order/order_detail.htm'}?orderId=123456789012345678`
 const detail=url
 it('binds official URL and rendered order number before merging fields',()=>{
  const out=mergePlatformVisibleDetail(row(platform),{url:detail,blocked:false,text:'订单号：123456789012345678\n收货人：合成人\n收货地址：合成地址\n联系电话：13800000000\n付款时间：2026-01-01 09:30:00'})
  expect(out.receiver).toBe('合成人');expect(out.paidAt).toBe('2026-01-01 09:30:00');expect(out.missing).toContain('订单详情');expect(out.detailState).toBe('pending')
  expect(()=>mergePlatformVisibleDetail(row(platform),{url:detail,blocked:false,text:'订单号：123456789012345679\n收货人：错误订单'})).toThrow()
 })
 it('rejects external URLs, wrong IDs, write actions, login and unknown pages',()=>{
  for(const target of [detail.replace('https://','http://'),detail.replace('orderId=','other='),detail+'0',detail.replace(/\/(order|normal)\//,'/cancel/'),detail.replace('.com','.com.evil.example')])expect(()=>platformDetailUrl(platform,target,row(platform).id)).toThrow()
  expect(()=>mergePlatformVisibleDetail(row(platform),{url:detail,blocked:true,text:'登录'})).toThrow()
  expect(()=>mergePlatformVisibleDetail(row(platform),{url:detail,blocked:false,text:'未知页面'})).toThrow()
 })
})
it('all five platform entries highlight only pending details after completed lists',()=>{
 for(const platform of detailPlatforms){const task={platform,status:'partial',listOutcome:'complete'} as Task,order={...row('jd'),platform};expect(shouldHighlightDetails(task,[order])).toBe(true);expect(pendingDetails([{...order,detailReadAt:'now'}])).toHaveLength(0);expect(shouldHighlightDetails({...task,status:'running'},[order])).toBe(false)}
})
