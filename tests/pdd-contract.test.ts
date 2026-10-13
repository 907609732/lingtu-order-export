import { afterEach, describe, expect, it, vi } from 'vitest'
import { parsePayload } from '../src/core/normalize'
import { parsePddDetailHtml, parsePddList, pddListBody } from '../src/main/pdd-contract'
import { pddPageRequest } from '../src/main/pdd-page'
import { normalizePddDetail, normalizePddList } from '../src/core/pdd-normalize'
import { mergeOrders } from '../src/core/merge'

afterEach(() => vi.unstubAllGlobals())
describe('installed PDD protocol contract', () => {
  it('starts at string zero and advances the offset while page stays one', () => {
    expect(pddListBody()).toEqual({offset:'0',origin_host_name:'mobile.yangkeduo.com',page:1,size:30,type:'all'})
    const rows = Array.from({length:30},(_,i)=>({order_sn:`demo-${i}`,offset:`cursor-${i}`}))
    const page = parsePddList({orders:rows})
    expect(page.ended).toBe(false)
    expect(pddListBody(page.nextOffset!)).toMatchObject({offset:'cursor-29',page:1})
    expect(parsePddList({orders:rows.slice(0,2)},page.nextOffset!).ended).toBe(true)
    expect(parsePddList({orders:[]}).ended).toBe(true)
  })
  it('rejects unknown envelopes, expired sessions and looping or missing offsets', () => {
    expect(()=>parsePddList({data:{orders:[]}})).toThrow('结构')
    expect(()=>parsePddList({error_code:40001})).toThrow('登录')
    expect(()=>parsePddList({orders:Array.from({length:30},()=>({order_sn:'demo',offset:'same'}))},'same')).toThrow('结构')
    expect(()=>parsePddList({orders:Array.from({length:30},()=>({order_sn:'demo'}))})).toThrow('结构')
  })
  it('extracts bound detail JSON without executing scripts or rounding long order IDs', () => {
    const id = '12345678901234567890'
    const html = `<script>window.rawData={"data":{"orderSn":${id},"orderGoods":[{"goodsName":"brace } and \\" quote"}]}};throw new Error('must not execute')</script>`
    expect(parsePddDetailHtml(html,id).orderSn).toBe(id)
    expect(()=>parsePddDetailHtml(html,'different')).toThrow('结构')
    expect(()=>parsePddDetailHtml('<script>window.rawData={data:call()}</script>',id)).toThrow('结构')
  })
  it('makes only the fixed same-origin POST and returns raw JSON without credentials', async () => {
    vi.stubGlobal('location',{origin:'https://mobile.yangkeduo.com'})
    vi.stubGlobal('document',{title:'我的订单',body:{innerText:'我的订单'}})
    const body='{"orders":[{"order_sn":12345678901234567890,"offset":"next"}]}'
    const fetch=vi.fn(async()=>({ok:true,status:200,text:async()=>body}))
    vi.stubGlobal('fetch',fetch)
    const result=await pddPageRequest('synthetic-token','123','cursor')
    expect(fetch).toHaveBeenCalledOnce()
    const [url,options]=fetch.mock.calls[0] as unknown as [string,RequestInit]
    expect(url).toBe('/proxy/api/api/aristotle/order_list_v4?pdduid=123')
    expect(JSON.parse(options.body as string)).toEqual(pddListBody('cursor'))
    expect(options).toMatchObject({method:'POST',credentials:'include',redirect:'error'})
    expect(result).toEqual({body})
    expect(JSON.stringify(result)).not.toContain('synthetic-token')
    expect('body' in result && parsePddList(parsePayload(result.body)).orders[0].order_sn).toBe('12345678901234567890')
  })
  it('does not send credentials to another origin or a visible validation page', async () => {
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
    vi.stubGlobal('location',{origin:'https://example.com'})
    expect(await pddPageRequest('synthetic-token','123')).toEqual({__orderdeskFailure:{category:'page_not_ready'}})
    vi.stubGlobal('location',{origin:'https://mobile.yangkeduo.com'})
    vi.stubGlobal('document',{title:'安全验证',body:{innerText:'请完成验证'}})
    expect(await pddPageRequest('synthetic-token','123')).toEqual({__orderdeskFailure:{category:'login_or_verification'}})
    expect(fetch).not.toHaveBeenCalled()
  })
  it('reports API session expiry without echoing the response or cookie', async () => {
    vi.stubGlobal('location',{origin:'https://mobile.yangkeduo.com'})
    vi.stubGlobal('document',{title:'我的订单',body:{innerText:''}})
    vi.stubGlobal('fetch',async()=>({status:424,ok:false,text:async()=>'{"error_code":40001,"secret":"private"}'}))
    expect(await pddPageRequest('synthetic-token','123')).toEqual({__orderdeskFailure:{category:'login_or_verification'}})
  })
  it('maps integer cents and all goods, preserves grouped orders and marks details pending', () => {
    const goods=[{goods_id:'11',goods_name:'测试商品',goods_price:1234,goods_number:2,thumb_url:'//example.com/image',spec:'规格'}]
    const simple=normalizePddList({order_sn:'demo-1',order_time:1767225600,order_amount:2468,order_goods:goods,mall:{mall_name:'测试店',id:'mall'},shipping_time:1767312000,receive_time:1767398400})!
    expect(simple).toMatchObject({paidFen:2468,createdAt:'2026-01-01 08:00:00',shop:'测试店',detailState:'pending'})
    expect(simple.items[0]).toMatchObject({unitPriceFen:1234,quantity:2,imageUrl:'https://example.com/image'})
    const group=normalizePddList({order_sn:'demo-group',type:2,display_amount:5000,group_order:{create_at:1767225600,success_time:1767312000},orders:[{order_goods:goods},{order_goods:goods}]})!
    expect(group.paidFen).toBe(5000)
    expect(group.items).toHaveLength(2)
    expect(group.shippedAt).toBe('')
    expect(group.extra['拼单成功时间']).toBe('2026-01-02 08:00:00')
    expect(normalizePddList({order_sn:12345678901234567890,order_goods:goods})).toBeNull()
  })
  it('binds detail to the same order and preserves masked contact values without inventing them', () => {
    const order=normalizePddList({order_sn:'demo',order_time:1767225600,order_amount:5000,order_goods:[]})!
    expect(normalizePddDetail(order,{orderSn:'different',orderGoods:[]})).toBe(order)
    const merged=normalizePddDetail(order,{orderSn:'demo',orderGoods:[{goodsId:'11',goodsName:'测试商品',goodsPrice:5000,goodsNumber:1}],receiveName:'张*',mobile:'138****0000',provinceName:'浙江省',cityName:'杭州市',districtName:'测试区',shippingAddress:'已遮蔽地址',shippingAmount:800,orderAmount:5000,expressInfo:{shippingName:'测试物流',trackingNumber:'demo-tracking'}})
    expect(merged).toMatchObject({detailState:'complete',receiver:'张*',phone:'138****0000',freightFen:800,paidFen:5000,logistics:'测试物流',tracking:'demo-tracking'})
    expect(merged.missing).toEqual([])
  })
  it('does not collapse equal goods in a grouped order or retain old list rows after detail',()=>{
    const goods=[{goods_id:'11',goods_name:'合成商品',goods_price:300,goods_number:1,spec:'白'}]
    const group=normalizePddList({order_sn:'group',type:2,group_order:{create_at:1767225600},display_amount:600,orders:[{order_goods:goods},{order_goods:goods}],service_amount:'invalid'})!
    expect(new Set(group.items.map(i=>i.id)).size).toBe(2);expect(group.extra['服务费（元）']).toBe('')
    expect(normalizePddDetail(group,{orderSn:'group',orderGoods:[{goodsId:'11',goodsName:'合成商品'}]}).detailState).toBe('pending')
    const list=normalizePddList({order_sn:'normal',order_time:1767225600,order_amount:300,order_goods:goods})!
    const detail=normalizePddDetail(list,{orderSn:'normal',orderGoods:[{goodsId:'11',goodsName:'合成商品',spec:'白色'}]})
    expect(mergeOrders(list,detail).items).toHaveLength(1)
    expect(mergeOrders(detail,list).items).toHaveLength(1)
  })
})
