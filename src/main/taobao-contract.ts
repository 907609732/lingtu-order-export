import { checkRange } from '../core/values'
import { CollectionError } from './collection-errors'

// Independently implemented from the installed 2.8.31 request contract.
// Use China calendar strings, independent of the Windows timezone.
export function taobaoMonths(from:string,to:string):string[] {
  checkRange(from,to)
  const months:string[]=[]
  let year=Number(to.slice(0,4)),month=Number(to.slice(5,7))
  while (`${year}-${String(month).padStart(2,'0')}`>=from.slice(0,7)) {
    months.push(`${year}-${String(month).padStart(2,'0')}`)
    if(--month===0){month=12;year--}
  }
  return months
}
export function taobaoListData(month:string,page:number) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!Number.isSafeInteger(page)||page<1)throw new CollectionError('response_structure')
  const year=Number(month.slice(0,4)),m=Number(month.slice(5,7))
  const days=new Date(Date.UTC(year,m,0)).getUTCDate()
  return {tabCode:'all',page,OrderType:'OrderFilter',appName:'tborder',appVersion:'3.0',
    condition:JSON.stringify({directRouteToTm2Scene:'1',wordType:'3',wordTerm:'',showText:'',itemTitle:'',
      orderFilterExtParam:JSON.stringify({beginTime:`${month}-01 00:00:00`,endTime:`${month}-${days} 23:59:59`})}),
    __needlessClearProtocol__:true}
}
const flag=(v:unknown):boolean|undefined=>v===true||v==='true'?true:v===false||v==='false'?false:undefined
const integer=(v:unknown):number|undefined=>((typeof v==='number'||typeof v==='string'&&/^\d+$/.test(v))&&Number.isSafeInteger(Number(v))&&Number(v)>=0)?Number(v):undefined
export function taobaoNextPage(response:any,page:number,received:number):number|null {
  const nodes=response?.data?.data,control=response?.data?.global?.pageControl,pagination=nodes?.pagination?.fields
  if(!nodes||typeof nodes!=='object'||(!control&&!pagination))throw new CollectionError('response_structure')
  if(pagination?.currentPage!==undefined&&integer(pagination.currentPage)!==page)throw new CollectionError('response_structure')
  const more=flag(control?.hasMore)??flag(pagination?.hasMore)
  if(flag(control?.emptyPage)===true||more===false)return null
  if(more===undefined) {
    const total=integer(pagination?.totalNum),size=integer(pagination?.pageSize)
    if(total===undefined||size===undefined||size<=0)throw new CollectionError('response_structure')
    if(page*size>=total)return null
  }
  if(!received)throw new CollectionError('response_structure')
  const next=control?.nextPageIndex??(pagination?.currentPage!==undefined?Number(pagination.currentPage)+1:page+1)
  if(!Number.isSafeInteger(Number(next))||Number(next)<=page)throw new CollectionError('response_structure')
  return Number(next)
}
