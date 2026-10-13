import { describe, expect, it } from 'vitest'
import { normalizePayload, parsePayload } from '../src/core/normalize'
import { mergeOrders } from '../src/core/merge'

const orderId='12345678901234567890'
function fixture(){
  return {data:{data:{
    shop:{tag:'shopInfo',id:orderId,fields:{orderId,createTime:'2026-10-01 10:00:00',shopName:'合成测试店',outUrl:'//test.tmall.com/shop/view_shop.htm?user_number_id=98765432109876543210',orderDetailUrl:'//buyertrade.taobao.com/trade/detail/trade_item_detail.htm?biz_order_id='+orderId}},
    pay:{tag:'orderPayment',id:orderId,fields:{actualFee:{value:'￥29.01'},pcPostFee:{value:'￥0.00'}}},
    itemA:{tag:'orderItemInfo',id:orderId+'_11111111111111111111',fields:{orderId,item:{itemId:'88888888888888888888',skuId:'77777777777777777777',title:'同商品不同规格',quantity:'3',skuInfo:[{skuKey:'颜色',skuValue:'白色'},{skuKey:'尺寸',skuText:'大'}],pic:'//img.alicdn.com/test.png',itemUrl:'//item.taobao.com/item.htm?id=88888888888888888888',priceInfo:{actualTotalFee:'￥19.01'}}}},
    itemB:{tag:'orderItemInfo',id:orderId+'_22222222222222222222',fields:{orderId,item:{itemId:'88888888888888888888',skuId:'77777777777777777778',title:'同商品不同规格',quantity:'1',skuText:'黑色',priceInfo:{actualTotalFee:'￥10.00'}}}},
    orphan:{tag:'shopInfo',id:'not-displayed',fields:{orderId:'not-displayed'}},
    stray:{tag:'orderItemInfo',id:orderId+'_stray',fields:{orderId,item:{title:'未显示节点'}}}
  },hierarchy:{structure:{orderContainer:['shopOrderContainer_displayed'],shopOrderContainer_displayed:['shop','paymentCol','detailCol'],paymentCol:['pay'],detailCol:['itemA','nested'],nested:['itemB','detailCol']}}}}
}
describe('淘宝安装包字段合同',()=>{
  it('只读取 hierarchy 中显示的订单和商品，循环关系不死循环',()=>{
    const orders=normalizePayload('taobao',fixture());expect(orders).toHaveLength(1);expect(orders[0].items).toHaveLength(2)
    expect(orders[0].id).toBe(orderId);expect(orders[0].paidFen).toBe(2901)
  })
  it('行实付合计不能冒充多件商品单价，合计分值精确保留',()=>{
    const o=normalizePayload('taobao',fixture())[0]
    expect(o.items[0].unitPriceFen).toBeNull();expect(o.items[0].extra?.['商品实付合计(元)']).toBe('19.01')
    expect(o.items[1].unitPriceFen).toBe(1000)
  })
  it('同商品两个子订单和 SKU 不合并，长标识不经 Number 转换',()=>{
    const o=normalizePayload('taobao',parsePayload(JSON.stringify(fixture())))[0]
    expect(o.items[0].id).toBe('11111111111111111111');expect(o.items[1].id).toBe('22222222222222222222')
    expect(o.items[0].extra?.['商品ID']).toBe('88888888888888888888');expect(o.items[0].extra?.['SKU ID']).toBe('77777777777777777777')
    const updated=structuredClone(o);updated.items[1].spec='黑色更新'
    const merged=mergeOrders(o,updated);expect(merged.items).toHaveLength(2);expect(merged.items.map(i=>i.spec)).toEqual(['颜色:白色; 尺寸:大','黑色更新'])
    expect(o.sellerId).toBe('98765432109876543210')
  })
  it('SKU 数组、协议相对链接和无 hierarchy 的旧响应有明确回退',()=>{
    const payload:any=fixture();delete payload.data.hierarchy;delete payload.data.data.orphan;delete payload.data.data.stray
    const o=normalizePayload('taobao',payload)[0]
    expect(o.items[0].spec).toBe('颜色:白色; 尺寸:大');expect(o.items[0].productUrl).toBe('https://item.taobao.com/item.htm?id=88888888888888888888')
    expect(o.detailUrl).toMatch(/^https:/);expect(o.items[1].spec).toBe('黑色')
  })
})
