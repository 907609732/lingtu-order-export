import {it,expect} from 'vitest'
import {normalizePayload} from '../src/core/normalize'
import {mergeOrders} from '../src/core/merge'
import {columnsFor,exportRows} from '../src/core/exporter'

it('migrates old product identities without duplicating rows or retaining total as unit price',()=>{
  const fresh=normalizePayload('taobao',{data:{data:{
    shop:{tag:'shopInfo',id:'1001',fields:{orderId:'1001',createTime:'2026-10-01',shopName:'合成店'}},
    item:{tag:'orderItemInfo',id:'1001_2001',fields:{orderId:'1001',item:{itemId:'3001',title:'合成商品',quantity:3,skuId:'4001',priceInfo:{actualTotalFee:'19.01'}}}}
  }}})[0]
  const old={...fresh,items:[{...fresh.items[0],id:'3001',unitPriceFen:1901,extra:{'子订单号':'2001'}}]}
  const merged=mergeOrders(old,fresh)
  expect(merged.items).toHaveLength(1)
  expect(merged.items[0].id).toBe('2001');expect(merged.items[0].unitPriceFen).toBeNull()
  const rows=exportRows([merged]);expect(rows[0]).toMatchObject({itemId:'3001','子订单号':'2001','SKU ID':'4001','商品实付合计(元)':'19.01',unitPrice:''})
  expect(columnsFor('taobao').map(c=>c.header)).toEqual(expect.arrayContaining(['商品ID','子订单号','SKU ID','商品实付合计(元)']))
  const another={...fresh.items[0],id:'2002',extra:{...fresh.items[0].extra,'子订单号':'2002','SKU ID':'4002'}}
  const corruptOld={...old,items:[old.items[0],{...old.items[0]}]}
  const repaired=mergeOrders(corruptOld,{...fresh,items:[fresh.items[0],another]})
  expect(repaired.items).toHaveLength(2)
  expect(repaired.items.map(i=>i.id)).toEqual(['2001','2002'])
  expect(repaired.items.every(i=>i.unitPriceFen===null)).toBe(true)
})
