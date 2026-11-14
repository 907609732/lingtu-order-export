import {it,expect} from 'vitest'
import {isAlibabaLoginLanding,alibabaBrowserUserAgent} from '../src/main/platform-login'
it('returns only known post-login home pages to 1688, preserving login and verification',()=>{
 for(const url of ['https://error.taobao.com/tbpc/error.html','https://www.taobao.com/','https://www.taobao.com/index.htm?from=login','https://i.taobao.com/my_taobao.htm'])expect(isAlibabaLoginLanding(url)).toBe(true)
 for(const url of ['https://login.taobao.com/member/login.jhtml','https://www.taobao.com/markets/verify','https://trade.1688.com/order/buyer_order_list.htm','https://www.taobao.com.evil.example/','https://buyertrade.taobao.com/trade/detail.htm'])expect(isAlibabaLoginLanding(url)).toBe(false)
})
it('uses the installed Windows Chromium version without Electron or the Chinese product token',()=>{
 const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) 电商平台采购订单导出/0.1.22 Chrome/152.0.7977.130 Electron/44.7.0 Safari/537.36'
 expect(alibabaBrowserUserAgent(ua)).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36')
})
it('leaves an ordinary Chromium browser user agent unchanged',()=>{
 const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7900.1 Safari/537.36'
 expect(alibabaBrowserUserAgent(ua)).toBe(ua)
})
it('preserves the real operating system and Chromium version on other systems',()=>{
 for(const os of ['Macintosh; Intel Mac OS X 14_7_1','X11; Linux x86_64']){
  const base=`Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko)`
  expect(alibabaBrowserUserAgent(base+' OrderDesk/0.1.22 Chrome/149.0.7827.6 Electron/43.0.0 Safari/537.36')).toBe(base+' Chrome/149.0.7827.6 Safari/537.36')
 }
})
