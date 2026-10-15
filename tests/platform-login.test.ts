import {it,expect} from 'vitest'
import {isAlibabaLoginLanding} from '../src/main/platform-login'
it('returns only known post-login home pages to 1688, preserving login and verification',()=>{
 for(const url of ['https://error.taobao.com/tbpc/error.html','https://www.taobao.com/','https://www.taobao.com/index.htm?from=login','https://i.taobao.com/my_taobao.htm'])expect(isAlibabaLoginLanding(url)).toBe(true)
 for(const url of ['https://login.taobao.com/member/login.jhtml','https://www.taobao.com/markets/verify','https://trade.1688.com/order/buyer_order_list.htm','https://www.taobao.com.evil.example/','https://buyertrade.taobao.com/trade/detail.htm'])expect(isAlibabaLoginLanding(url)).toBe(false)
})
