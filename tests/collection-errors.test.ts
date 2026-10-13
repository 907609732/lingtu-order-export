import { afterEach,describe,expect,it,vi } from 'vitest'
import { mtopFailure, unwrapMtopResponse, CollectionError } from '../src/main/collection-errors'
import { mtopRequest } from '../src/main/page-scripts'
import { safeError } from '../src/main/diagnostics'

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
function page(request?:any){vi.stubGlobal('window',{lib:{mtop:request?{request}:undefined}});vi.stubGlobal('document',{title:'我的淘宝'});vi.stubGlobal('location',{hostname:'buyertrade.taobao.com'})}
describe('platform errors and buyer request contract',()=>{
  it('does not treat an internal service fault as expired login',()=>{
    const result=mtopFailure({ret:['FAIL_SYS_SERVICE_INNER_FAULT::PRIVATE_TOKEN 请登录'],data:{private:'PRIVATE_ORDER'}})
    expect(result).toEqual({category:'platform_service',code:'FAIL_SYS_SERVICE_INNER_FAULT'})
    let error:unknown;try{unwrapMtopResponse({__orderdeskFailure:result})}catch(e){error=e}
    expect(safeError(error)).toMatchObject({category:'platform_service',platformCode:'FAIL_SYS_SERVICE_INNER_FAULT'})
    expect(String(error)).not.toMatch(/PRIVATE|需要登录/)
  })
  it('distinguishes explicit login, timeout, network and rate limit codes',()=>{
    expect(mtopFailure({ret:['FAIL_SYS_SESSION_EXPIRED::私密账号']})).toEqual({category:'login_or_verification',code:'FAIL_SYS_SESSION_EXPIRED'})
    expect(mtopFailure({ret:['FAIL_SYS_TRAFFIC_LIMIT::私密']})).toMatchObject({category:'platform_limit'})
    expect(mtopFailure(new Error('fetch failed PRIVATE_TOKEN'))).toEqual({category:'network',code:'NETWORK_ERROR'})
    expect(mtopFailure(new Error('timed out PRIVATE_TOKEN'))).toEqual({category:'timeout',code:'TIMEOUT'})
    expect(mtopFailure({ret:['PRIVATE_TOKEN::请登录']})).toEqual({category:'request_rejected',code:'UNKNOWN_RESPONSE'})
    expect(()=>unwrapMtopResponse({__orderdeskFailure:{category:'PRIVATE',code:'PRIVATE_TOKEN'}})).toThrow('UNKNOWN_RESPONSE')
    expect(safeError(new CollectionError('response_structure'))).toMatchObject({category:'response_structure'})
  })
  it('sends the official buyer options and retains the original successful response',async()=>{
    const response={ret:['SUCCESS::调用成功'],data:{data:{pagination:{fields:{totalNum:0}}}}}
    const request=vi.fn((_o,success)=>{success(response);return Promise.reject({ret:['FAIL_SYS_SESSION_EXPIRED']})});page(request)
    expect(await mtopRequest('mtop.taobao.order.queryboughtlistV2',{page:1},'taobao')).toBe(response)
    expect(request.mock.calls[0][0]).toMatchObject({type:'POST',valueType:'original',ttid:'1@tbwang_windows_1.0.0#pc',preventFallback:true})
  })
  it('classifies SDK failure callbacks and rejects error responses from success callbacks',async()=>{
    page((_o:any,_success:any,fail:any)=>fail({ret:['FAIL_SYS_SERVICE_INNER_FAULT::PRIVATE']}))
    expect(await mtopRequest('api',{},'taobao')).toEqual({__orderdeskFailure:{category:'platform_service',code:'FAIL_SYS_SERVICE_INNER_FAULT'}})
    page(()=>Promise.resolve({ret:['FAIL_SYS_SESSION_EXPIRED::PRIVATE']}))
    expect(await mtopRequest('api',{},'taobao')).toEqual({__orderdeskFailure:{category:'login_or_verification',code:'FAIL_SYS_SESSION_EXPIRED'}})
  })
  it('waits for delayed SDK readiness and distinguishes a missing SDK from a login page',async()=>{
    vi.useFakeTimers();page();const waiting=mtopRequest('api',{},'taobao')
    setTimeout(()=>{(window as any).lib.mtop={request:()=>Promise.resolve({ret:['SUCCESS']})}},750)
    await vi.advanceTimersByTimeAsync(1000);expect(await waiting).toEqual({ret:['SUCCESS']})
    page();const missing=mtopRequest('api',{},'taobao');await vi.advanceTimersByTimeAsync(8000)
    expect(await missing).toEqual({__orderdeskFailure:{category:'page_not_ready',code:undefined}})
    vi.stubGlobal('document',{title:'淘宝登录'});expect(await mtopRequest('api',{},'taobao')).toEqual({__orderdeskFailure:{category:'login_or_verification',code:undefined}})
  })
  it('stops waiting on timeout even if the SDK never settles',async()=>{
    vi.useFakeTimers();page(()=>undefined);const waiting=mtopRequest('api',{},'taobao')
    await vi.advanceTimersByTimeAsync(25000);expect(await waiting).toEqual({__orderdeskFailure:{category:'timeout',code:'TIMEOUT'}})
  })
})
