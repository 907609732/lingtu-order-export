import {describe,it,expect} from 'vitest'
import {taobaoDetailUrl,mergeTaobaoVisibleDetail} from '../src/main/taobao-detail'
import {normalizePayload} from '../src/core/normalize'
const id='12345678901234567890',url=`https://trade.taobao.com/trade/detail/trade_order_detail.htm?biz_order_id=${id}`
const order=()=>normalizePayload('taobao',{orderId:id,createTime:'2026-03-28 12:00:00',items:[{title:'合成商品'}]})[0]
describe('淘宝可见详情的绑定与保留',()=>{
 it('识别订单号旁的复制控件，但拒绝相似订单和任意后缀',()=>{const snap={url,blocked:false,text:`订单编号\n${id}复制\n付款时间\n2026-03-28 12:10:00`};expect(mergeTaobaoVisibleDetail(order(),snap).paidAt).toBe('2026-03-28 12:10:00');for(const suffix of ['9复制','商品',' 999999999999复制'])expect(()=>mergeTaobaoVisibleDetail(order(),{...snap,text:snap.text.replace(id+'复制',id+suffix)})).toThrow()})
 it('只接受同订单的官方 HTTPS 详情地址',()=>{expect(taobaoDetailUrl(url,id)).toBe(url);for(const bad of [url.replace(id,'99999999999999999999'),url.replace('https:','http:'),url.replace('trade.taobao.com','trade.taobao.com.evil.test'),url.replace('/trade/detail/','/trade/detail/cancel/'),url.replace('https://','https://user:pass@')])expect(()=>taobaoDetailUrl(bad,id)).toThrow()})
 it('只合并有明确标签且订单号一致的字段，未知字段不伪造',()=>{const base=order();const result=mergeTaobaoVisibleDetail(base,{url,blocked:false,text:`订单号：${id}\n付款时间\n2026-03-28 12:10:01\n收货人：合成收货人\n联系电话：138****0000\n收货地址：合成地址\n快递公司：合成快递\n物流单号：TEST1234\n买家留言：请妥善包装\n退款金额：¥0.00`});expect(result.paidAt).toBe('2026-03-28 12:10:01');expect(result.phone).toBe('138****0000');expect(result.address).toBe('合成地址');expect(result.tracking).toBe('TEST1234');expect(result.refundFen).toBe(0);expect(result.paidFen).toBe(base.paidFen);expect(result.detailState).toBe('pending');expect(result.missing).toContain('订单详情')})
 it('登录验证、另一订单和只有URL而没有可见订单号时拒绝合并',()=>{for(const snap of [{url,text:`订单号：${id}\n付款时间：2026-03-28 12:10:00`,blocked:true},{url,text:'订单号：99999999999999999999\n收货人：错误账号',blocked:false},{url,text:'收货人：无订单号',blocked:false}])expect(()=>mergeTaobaoVisibleDetail(order(),snap)).toThrow()})
 it('冲突的同名标签不随意选值，列表字段保持原值',()=>{const base={...order(),phone:'旧值'};const result=mergeTaobaoVisibleDetail(base,{url,blocked:false,text:`订单号：${id}\n联系电话：first\n联系电话：second\n收货人：合成收货人`});expect(result.phone).toBe('旧值');expect(result.receiver).toBe('合成收货人')})
})
