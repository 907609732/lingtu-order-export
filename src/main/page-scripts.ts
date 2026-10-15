import { mtopFailure } from './collection-errors'
// These functions are serialized into a sandboxed official platform page. No Node APIs.
export function readOrderPage(platform:string):any {
  const visible=(el:Element)=>!!(el as HTMLElement).offsetParent
  const body=document.body?.innerText||''
  if((/请完成.*验证|请拖动.*滑块|安全验证|访问过于频繁|请先登录|扫码登录/.test(body)||/登录/.test(document.title))&&body.length<9000)return {blocked:true,rows:[],message:'请在平台页面完成登录或验证'}
  const txt=(root:Element,sel:string)=>root.querySelector(sel)?.textContent?.trim()||''
  const attr=(root:Element,sel:string,name:string)=>root.querySelector(sel)?.getAttribute(name)||''
  const rows:any[]=[]
  const modern=platform==='jd'&&!!document.querySelector('[class*="selectContainer-"], [class*="orderCard-"]')
  const roots=platform==='jd'?Array.from(document.querySelectorAll(modern?'[class*="orderCard-"]':'tbody[id^="tb-"],.order-tb tbody')):platform==='taobao'?Array.from(document.querySelectorAll('[class*="index-mod__order-container"],.js-order-container,[data-id][class*="bought-wrapper"],.bought-wrapper-mod__table')):[]
  for(const root of roots){
    const t=(root as HTMLElement).innerText||'';const id=(t.match(/订单(?:编号|号)[：:\s]*(\d[\d-]{7,})/)||[])[1]||root.id.replace(/^tb-/,'').match(/^\d{8,}$/)?.[0]||root.getAttribute('data-id')||''
    if(!id)continue
    const created=(t.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}(?:\s+\d{2}:\d{2}:\d{2})?/)||[])[0]||''
    const products=Array.from(root.querySelectorAll(modern?'[class*="productItem-"]':platform==='jd'?'.goods-item':'[class*="item-mod__item"],.item'))
    const goods=(products.length?products:[root]).map((el:any,n:number)=>({id:(attr(el,'a[href*="item"]','href').match(/\/(\d+)\.html/)||[])[1]||String(n),title:txt(el,platform==='jd'?'.p-name a':'[class*="production-mod__production"] a span,.item-title,.title')||txt(el,'a[href*="item.htm"],a[href*="item.jd.com"]')||attr(el,'img','alt'),spec:txt(el,'.p-props,[class*="props"]'),quantity:Number(txt(platform==='jd'?el.closest('tr')||el:el,'.goods-number,.quantity').replace(/[^\d.]/g,''))||null,unitPriceFen:null,imageUrl:(attr(el,'img','data-lazy-img')||attr(el,'img','data-original')||attr(el,'img','src')).replace(/^\/\//,'https://'),productUrl:attr(el,'a[href*="item"]','href')}))
    const amount=txt(root,'.amount span,[class*="price-mod__real"]')||(t.match(/(?:实付|实付款|总额)[^\d]{0,8}([\d,.]+)/)||[])[1]||''
    if(modern)for(let i=0;i<goods.length;i++){const el=products[i];if(!el)continue;goods[i].title=txt(el,'[class*="productTitle-"]');goods[i].quantity=Number(txt(el,'[class*="countNum-"]'))||null;goods[i].spec=txt(el,'[class*="productSpec-"]')}
    rows.push({id,createdAt:created,items:goods,paid:modern?txt(root,'[class*="priceRow-"]'):amount,shop:txt(root,modern?'[class*="shopNames-"]':'.shop-txt,.seller-mod__container,[class*="seller-mod"]'),status:txt(root,modern?'[class*="statusText-"]':'.order-status,[class*="trade-status"]'),receiver:txt(root,modern?'[class*="userName-"]':'.consignee .txt'),detailUrl:attr(root,'a[href*="order_details"],a[href*="trade/detail"],a[href*="details.jd.com"]','href')})
  }
  const next=Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el=>visible(el)&&/^(下一页|下页|Next|›|>)$/.test(el.textContent?.trim()||'')&&!el.hasAttribute('disabled')&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(el.className||''))
  const empty=/暂无订单|暂无相关订单|没有相关订单|没有找到符合条件|您还没有订单/.test(body)
  const ended=/没有更多订单|没有更多了|到底了/.test(body)
  return {rows,blocked:false,hasNext:!!next,empty,ended,signature:rows.map(x=>x.id).join('|'),title:document.title,modern,selectedRange:modern?txt(document.documentElement,'[class*="selectContainer-"] [class*="text-"]'):'',page:modern?Number(txt(document.documentElement,'[class*="activePage-"]')):undefined,totalPages:modern?Number(txt(document.documentElement,'[class*="totalText-"]').match(/\d+/)?.[0]):undefined}
}
export function advanceOrderPage():string {
  const next=Array.from(document.querySelectorAll('a,button,[role="button"]')).find(el=>(el as HTMLElement).offsetParent&&/^(下一页|下页|Next|›|>)$/.test(el.textContent?.trim()||'')&&!el.hasAttribute('disabled')&&el.getAttribute('aria-disabled')!=='true'&&!/disabled/.test(el.className||'')) as HTMLElement|undefined
  if(next){next.click();return 'next'}
  const scrollable=Array.from(document.querySelectorAll('*')).filter(el=>{const e=el as HTMLElement;return e.clientHeight>200&&e.scrollHeight>e.clientHeight+30&&/(auto|scroll)/.test(getComputedStyle(el).overflowY)}) as HTMLElement[]
  for(const el of scrollable)el.scrollTop=el.scrollHeight
  window.scrollTo(0,document.body.scrollHeight);return 'scroll'
}
export async function mtopRequest(api:string,data:any,platform='xianyu',classify=mtopFailure):Promise<any>{
  const w=window as any
  const blocked=()=>/登录|安全验证|验证码/.test(document.title)||/login\.taobao\.com|passport\./.test(location.hostname)||[...document.querySelectorAll('iframe[src*="login.taobao.com"],iframe[src*="passport.1688.com"]')].some(el=>!!el.getClientRects().length)
  const failure=(category:string,code?:string)=>({__orderdeskFailure:{category,code}})
  for(let attempt=0;attempt<32&&!(w.lib?.mtop||w.mtop)?.request;attempt++){
    if(blocked())return failure('login_or_verification')
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  if(blocked())return failure('login_or_verification')
  const mtop=w.lib?.mtop||w.mtop
  if(!mtop?.request)return failure('page_not_ready')
  return new Promise(resolve=>{
    let settled=false
    const finish=(v:any)=>{if(settled)return;settled=true;clearTimeout(timer);resolve(v)}
    const timer=setTimeout(()=>finish(failure('timeout','TIMEOUT')),25000)
    const fail=(v:any)=>finish({__orderdeskFailure:classify(v)})
    const done=(v:any)=>{const ret=Array.isArray(v?.ret)?v.ret:typeof v?.ret==='string'?[v.ret]:[];if(ret.length&&!ret.some((s:unknown)=>typeof s==='string'&&s.split('::')[0]==='SUCCESS'))fail(v);else finish(v)}
    try {
      const options=platform==='xianyu'?{appKey:'34839810',accountSite:'xianyu',needLoginPC:false,sessionOption:'AutoLoginOnly'}:{appKey:'12574478',ecode:1,needLogin:true}
      // Match the official Windows buyer page's request contract. Without its
      // client tag/raw response mode, this endpoint returns SERVICE_INNER_FAULT.
      const buyerOptions=platform==='taobao'?{valueType:'original',ttid:'1@tbwang_windows_1.0.0#pc',preventFallback:true}:{}
      const result=mtop.request({api,v:'1.0',data,type:'POST',dataType:'json',timeout:20000,...options,...buyerOptions},done,fail)
      if(result?.then)result.then(done,fail)
    } catch(error) { fail(error) }
  })
}
