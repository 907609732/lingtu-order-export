import {it,expect} from 'vitest'
import {runInNewContext} from 'node:vm'
import {officialPageScripts} from '../src/main/alibaba-official-page'
function element(tag:string,text='',attrs:Record<string,string>={},hidden=false){
 const el:any={tagName:tag,nodeType:1,textContent:text,children:[],className:'',id:'',parentElement:null,shadowRoot:null,hidden,getAttribute:(k:string)=>attrs[k]||null,getBoundingClientRect:()=>({x:0,y:0,width:100,height:20}),getRootNode:()=>({}),querySelector:()=>null}
 return el
}
async function probe(nodes:any[]){
 const document={body:element('BODY'),querySelectorAll:()=>nodes}
 const context:any={window:{},document,location:{href:'https://fixture.invalid/'},getComputedStyle:(el:any)=>({display:el.hidden?'none':'block',visibility:'visible',opacity:'1'}),setTimeout}
 runInNewContext(officialPageScripts.install,context)
 return runInNewContext(officialPageScripts.probe,context)
}
it('detects a visible verification prompt inside an actual injected shadow tree',async()=>{
 const host=element('CUSTOM-HOST');const prompt=element('SPAN','请完成验证');host.shadowRoot={querySelectorAll:()=>[prompt]};prompt.getRootNode=()=>({host})
 expect((await probe([host])).verification).toBe(true)
 host.hidden=true
 expect((await probe([host])).verification).toBe(false)
})
it('detects visible captcha iframe URL but ignores a hidden captcha iframe',async()=>{
 const iframe=element('IFRAME','',{src:'https://fixture.invalid/_____tmd_____/punish'})
 expect((await probe([iframe])).verification).toBe(true)
 iframe.hidden=true
 expect((await probe([iframe])).verification).toBe(false)
})
it('extracts actual injected visible record rows and preserves timestamps and href',async()=>{
 const header=element('Q-TABLE-TH','申请时间')
 const row=element('Q-TABLE-TR');row.className='export-record-tr'
 row.children=[element('Q-TABLE-TD','2026-11-15 16:02:11'),element('Q-TABLE-TD',''),element('Q-TABLE-TD','导出中')]
 const anchor=element('A','',{href:'https://fixture.invalid/report.xlsx?signature=test'});row.querySelector=()=>anchor
 const hidden=element('Q-TABLE-TR');hidden.className='export-record-tr';hidden.hidden=true;hidden.children=row.children
 const document={body:element('BODY'),querySelectorAll:()=>[header,row,hidden]}
 const context:any={window:{},document,getComputedStyle:(el:any)=>({display:el.hidden?'none':'block',visibility:'visible',opacity:'1'}),setTimeout}
 runInNewContext(officialPageScripts.install,context)
 const result=await runInNewContext(officialPageScripts.readRows,context)
 expect(result.rows).toEqual([{applied:'2026-11-15 16:02:11',finished:'',status:'导出中',href:'https://fixture.invalid/report.xlsx?signature=test',filename:'report.xlsx'}])
})
