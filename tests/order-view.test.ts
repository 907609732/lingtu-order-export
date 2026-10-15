import {describe,it,expect} from 'vitest'
import type {Order} from '../src/shared/types'
import {filterOrders,money,afterSale,searchText,safeImage} from '../src/renderer/src/order-view'
import {normalizePayload} from '../src/core/normalize'
const fixture=():Order=>normalizePayload('taobao',{orderId:'12345678901234567890',createTime:'2026-03-28 12:30:00',items:[{title:'合成商品',skuText:'白色',quantity:2}]})[0]
const defaults={query:'',status:'',shop:'',detail:'',sortKey:'paidFen',descending:false}
describe('订单表浏览',()=>{
 it('收货电话、物流、规格和扩展字段都可检索，多个词必须同时命中',()=>{const o={...fixture(),phone:'13800000000',tracking:'YT123456',items:[{...fixture().items[0],spec:'白色 大号',extra:{'SKU ID':'long-sku'}}]};expect(searchText(o)).toContain('long-sku');expect(filterOrders([o],{...defaults,query:'138000 白色'})).toHaveLength(1);expect(filterOrders([o],{...defaults,query:'138000 黑色'})).toHaveLength(0)})
 it('金额排序覆盖全体记录，未知金额始终在后，零元不是缺失',()=>{const zero={...fixture(),id:'zero',paidFen:0},unknown={...fixture(),id:'unknown',paidFen:null},big={...fixture(),id:'big',paidFen:20000};expect(filterOrders([big,unknown,zero],defaults).map(o=>o.id)).toEqual(['zero','big','unknown']);expect(filterOrders([zero,unknown,big],{...defaults,descending:true}).map(o=>o.id)).toEqual(['big','zero','unknown']);expect(money(0)).toBe('¥ 0.00');expect(money(null)).toBe('未获取')})
 it('状态、店铺和缺项筛选可以组合，不把申请售后入口当售后记录',()=>{const a={...fixture(),shop:'测试店',status:'交易成功',missing:[],refundFen:null,refundStatus:'',items:[{...fixture().items[0],extra:{'售后操作':'申请售后'}}]},b={...a,id:'another',refundStatus:'退款成功',missing:['订单详情']};expect(afterSale(a)).toBe('');expect(filterOrders([a,b],{...defaults,status:'交易成功',shop:'测试店',detail:'refund'}).map(o=>o.id)).toEqual(['another']);expect(filterOrders([a,b],{...defaults,detail:'complete'})).toEqual([a])})
 it('商品图仅接受平台图片域名和 HTTPS',()=>{expect(safeImage('//img.alicdn.com/item.png')).toBe('https://img.alicdn.com/item.png');for(const s of ['javascript:alert(1)','file:///secret','https://alicdn.com.evil.test/a','https://user:password@img.alicdn.com/a','http://img.alicdn.com/a'])expect(safeImage(s)).toBe('')})
})
