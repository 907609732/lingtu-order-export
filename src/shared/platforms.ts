import type { Platform, PlatformId } from './types'
export const platforms: Platform[] = [
  { id: 'taobao', name: '淘宝 / 天猫', icon: '淘', color: '#f97316', url: 'https://buyertrade.taobao.com/trade/itemlist/list_bought_items.htm', domains: ['taobao.com','tmall.com'], mode: 'browser', reference: '淘宝版 2.8.31' },
  { id: 'alibaba', name: '1688', icon: '阿', color: '#ea580c', url: 'https://air.1688.com/app/ctf-page/trade-order-list/buyer-order-list.html', domains: ['1688.com','alibaba.com','taobao.com'], mode: 'browser', reference: '淘宝1688版 2.8.31' },
  { id: 'pdd', name: '拼多多', icon: '拼', color: '#e83f4f', url: 'https://mobile.yangkeduo.com/orders.html', domains: ['pinduoduo.com','yangkeduo.com'], mode: 'browser', reference: '拼多多版 0.0.76' },
  { id: 'jd', name: '京东', icon: '京', color: '#da3446', url: 'https://order.jd.com/center/list.action', domains: ['jd.com','jd.hk'], mode: 'browser', reference: '京东插件 0.1.2' },
  { id: 'xianyu', name: '闲鱼', icon: '闲', color: '#b8860b', url: 'https://www.goofish.com/bought', domains: ['goofish.com','taobao.com','alicdn.com'], mode: 'browser', reference: '闲鱼买家版 0.0.4' },
  { id: 'dewu', name: '得物', icon: '得', color: '#0891b2', url: 'https://app.dewu.com', domains: ['dewu.com','poizon.com'], mode: 'proxy', reference: '综合版 1.0.37' },
  { id: 'kuaishou', name: '快手', icon: '快', color: '#ee6b24', url: 'https://mp.kwaixiaodian.com', domains: ['kwaixiaodian.com','kuaishou.com'], mode: 'proxy', reference: '综合版 1.0.37' },
  { id: 'eleme', name: '饿了么', icon: '饿', color: '#168cda', url: 'https://waimai-guide.ele.me', domains: ['ele.me','eleme.cn','taobao.com'], mode: 'proxy', reference: '综合版 1.0.37' },
  { id: 'meituan', name: '美团', icon: '美', color: '#bd8b00', url: 'https://wx.waimai.meituan.com', domains: ['meituan.com','sankuai.com'], mode: 'proxy', reference: '综合版 1.0.37' }
]
export function platformById(id: string): Platform { const p = platforms.find(p => p.id === id); if (!p) throw new Error('未知平台'); return p }
export function allowedHost(id: PlatformId, host: string): boolean { return platformById(id).domains.some(d => host === d || host.endsWith('.' + d)) }
export function isOrderResponse(id: PlatformId, rawUrl: string): boolean {
  try { const u = new URL(rawUrl); return allowedHost(id,u.hostname) && /order|trade|bought|digestlist|queryorderlist/i.test(u.pathname + u.search) && !/create|submit|cancel|payorder|delete|confirmreceive/i.test(u.pathname) } catch { return false }
}
