import type {OfficialDriver} from './alibaba-official-export'
/** Read-only diagnostics until the asynchronous export-record contract is independently verified. */
export function inspectAlibabaOfficialPage(){
 const visible=(e:Element)=>{const box=e.getBoundingClientRect();return box.width>0&&box.height>0}
 const controls=Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible)
 const labels=controls.map(e=>(e.textContent||'').trim())
 const inputs=Array.from(document.querySelectorAll('input')).filter(visible)
 return {dateControls:inputs.filter(e=>/开始时间|结束时间|下单时间/.test(`${e.getAttribute('aria-label')||''} ${e.placeholder}`)).length===2,currentConditionExport:labels.includes('导出当前条件')||labels.includes('导出当前筛选条件'),search:labels.includes('搜索'),verification:/请完成验证|滑动验证|请先登录/.test(document.body.innerText)}
}
export function createAlibabaOfficialDriver(contents:{executeJavaScript(code:string):Promise<unknown>}):OfficialDriver{
 return {async search(){const state=await contents.executeJavaScript(`(${inspectAlibabaOfficialPage.toString()})()`) as ReturnType<typeof inspectAlibabaOfficialPage>;if(state?.verification)throw Error('请先在官方页面完成登录或验证，再继续');const missing=[!state?.dateControls?'日期控件':undefined,!state?.currentConditionExport?'导出当前条件控件':undefined].filter(Boolean).join('、');throw Error(`官方页面导出尚未验证：${missing?`${missing}未可靠识别；`:''}异步报表记录与下载归属、真实报表表头尚待验收。自动提交未开放，未点击导出。`)},async submit(){throw Error('官方报表记录契约尚未验证，自动提交未开放')},async record(){throw Error('官方报表记录与下载归属尚未验证，未下载历史文件')}}
}
