// This function is serialized into a sandboxed official platform page. No Node APIs.
export function readOrderPage(platform:string):any {
  const visible=(el:Element)=>!!(el as HTMLElement).offsetParent
  const body=document.body?.innerText||''
  if((/请完成.*验证|请拖动.*滑块|安全验证|访问过于频繁|请先登录|扫码登录/.test(body)||/登录/.test(document.title))&&body.length<9000)return {blocked:true,rows:[],message:'请在平台页面完成登录或验证'}
  const txt=(root:Element,sel:string)=>root.querySelector(sel)?.textContent?.trim()||''
  const attr=(root:Element,sel:string,name:string)=>root.querySelector(sel)?.getAttribute(name)||''
  const rows:any[]=[]
  const roots=platform==='jd'?Array.from(document.querySelectorAll('tbody[id^="tb-"],.order-tb tbody')):platform==='taobao'?Array.from(document.querySelectorAll('[class*="index-mod__order-container"],.js-order-container,[data-id][class*="bought-wrapper"],.bought-wrapper-mod__table')):[]
  for(const root of roots){
    const t=(root as HTMLElement).innerText||'';const id=(t.match(/订单(?:编号|号)[：:\s]*(\d[\d-]{7,})/)||[])[1]||root.id.replace(/^tb-/,'').match(/^\d{8,}$/)?.[0]||root.getAttribute('data-id')||''
    if(!id)continue
    const created=(t.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{2}:\d{2}:\d{2})?/)||[])[0]||''
    const products=Array.from(root.querySelectorAll(platform==='jd'?'.goods-item':'[class*="item-mod__item"],.item'))
    const goods=(products.length?products:[root]).map((el:any,n:number)=>({id:(attr(el,'a[href*="item"]','href').match(/\/(\d+)\.html/)||[])[1]||String(n),title:txt(el,platform==='jd'?'.p-name a':'[class*="production-mod__production"] a span,.item-title,.title')||txt(el,'a[href*="item.htm"],a[href*="item.jd.com"]')||attr(el,'img','alt'),spec:txt(el,'.p-props,[class*="props"]'),quantity:Number(txt(platform==='jd'?el.closest('tr')||el:el,'.goods-number,.quantity').replace(/[^\d.]/g,''))||null,unitPriceFen:null,imageUrl:(attr(el,'img','data-lazy-img')||attr(el,'img','data-original')||attr(el,'img','src')).replace(/^\/\//,'https://'),productUrl:attr(el,'a[href*="item"]','href')}))
    const amount=txt(root,'.amount span,[class*="price-mod__real"]')||(t.match(/(?:实付|实付款|总额)[^\d]{0,8}([\d,.]+)/)||[])[1]||''
    rows.push({id,createdAt:created,items:goods,paid:amount,shop:txt(root,'.shop-txt,.seller-mod__container,[class*="seller-mod"]'),status:txt(root,'.order-status,[class*="trade-status"]'),receiver:txt(root,'.consignee .txt'),detailUrl:attr(root,'a[href*="order_details"],a[href*="trade/detail"],a[href*="details.jd.com"]','href')})
  }
  const next=Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el=>visible(el)&&/^(下一页|下页|Next|›|>)$/.test(el.textContent?.trim()||'')&&!el.hasAttribute('disabled')&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(el.className||''))
  const empty=/暂无订单|没有相关订单|没有找到符合条件|您还没有订单/.test(body)
  const ended=/没有更多订单|没有更多了|到底了/.test(body)
  return {rows,blocked:false,hasNext:!!next,empty,ended,signature:rows.map(x=>x.id).join('|'),title:document.title}
}
export function advanceOrderPage():string {
  const next=Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el=>(el as HTMLElement).offsetParent&&/^(下一页|下页|Next|›|>)$/.test(el.textContent?.trim()||'')&&!el.hasAttribute('disabled')&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(el.className||'')) as HTMLElement|undefined
  if(next){next.click();return 'next'}
  const scrollable=Array.from(document.querySelectorAll('*')).filter(el=>{const e=el as HTMLElement;return e.clientHeight>200&&e.scrollHeight>e.clientHeight+30&&/(auto|scroll)/.test(getComputedStyle(el).overflowY)}) as HTMLElement[]
  for(const el of scrollable)el.scrollTop=el.scrollHeight
  window.scrollTo(0,document.body.scrollHeight);return 'scroll'
}
export function mtopRequest(api:string,data:any,platform='xianyu'):Promise<any>{
  return new Promise((resolve,reject)=>{
    const w=window as any;const mtop=w.lib?.mtop||w.mtop
    if(!mtop?.request){reject(new Error('平台页面尚未准备好，请完成登录后重试'));return}
    const timer=setTimeout(()=>reject(new Error('平台响应超时')),25000)
    const done=(v:any)=>{clearTimeout(timer);resolve(v)};const fail=()=>{clearTimeout(timer);reject(new Error('平台要求重新登录、验证或稍后重试'))}
    try {
      const options=platform==='xianyu'?{appKey:'34839810',accountSite:'xianyu',needLoginPC:false,sessionOption:'AutoLoginOnly'}:{appKey:'12574478',ecode:1,needLogin:true}
      const result=mtop.request({api,v:'1.0',data,type:'POST',dataType:'json',timeout:20000,...options},done,fail)
      if(result?.then)result.then(done,fail)
    } catch { fail() }
  })
}
