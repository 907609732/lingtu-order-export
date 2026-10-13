export type PddPageResult = { body:string } | { __orderdeskFailure:{category:string} }

export async function pddDetailRequest(orderId:string):Promise<PddPageResult> {
  const fail=(category:string):PddPageResult=>({__orderdeskFailure:{category}})
  if(location.origin!=='https://mobile.yangkeduo.com')return fail('page_not_ready')
  if(!/^[\w-]{1,100}$/.test(orderId))return fail('response_structure')
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),45000)
  try {
    const response=await fetch('/order.html?order_sn='+encodeURIComponent(orderId),{credentials:'include',redirect:'error',signal:abort.signal})
    const body=await response.text()
    if(response.status===401||/<title[^>]*>[^<]*(?:登录|验证)/i.test(body))return fail('login_or_verification')
    if(response.status===429)return fail('platform_limit')
    if(response.status>=500)return fail('platform_service')
    if(!response.ok)return fail('request_rejected')
    if(body.length>12*1024*1024)return fail('response_structure')
    return {body}
  }catch{return fail(abort.signal.aborted?'timeout':'network')}
  finally{clearTimeout(timer)}
}

// Serialized into our own signed-in official page. Credentials are ephemeral
// inputs from that page's Electron session and are never returned or logged.
export async function pddPageRequest(accessToken:string, userId:string, offset='0'):Promise<PddPageResult> {
  const fail = (category:string):PddPageResult => ({ __orderdeskFailure:{category} })
  if (location.origin !== 'https://mobile.yangkeduo.com') return fail('page_not_ready')
  const bodyText = document.body?.innerText || ''
  if (/登录|安全验证|验证码/.test(document.title) || /请先登录|请完成.*验证|请拖动.*滑块/.test(bodyText.slice(0,9000))) return fail('login_or_verification')
  if (!accessToken || accessToken.length > 8192 || /[\r\n\0]/.test(accessToken) || !/^\d{1,40}$/.test(userId)) return fail('login_or_verification')
  if (!offset || offset.length > 4096 || /[\r\n\0]/.test(offset)) return fail('response_structure')
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(),45000)
  try {
    const response = await fetch('/proxy/api/api/aristotle/order_list_v4?pdduid=' + encodeURIComponent(userId), {
      method:'POST', credentials:'include', redirect:'error', signal:abort.signal,
      headers:{'Content-Type':'application/json;charset=UTF-8',Accept:'application/json, text/plain, */*',AccessToken:accessToken},
      body:JSON.stringify({offset,origin_host_name:'mobile.yangkeduo.com',page:1,size:30,type:'all'})
    })
    const body = await response.text()
    if (response.status === 401 || /"error_code"\s*:\s*"?40001\b/.test(body)) return fail('login_or_verification')
    if (response.status === 429 || /手机网络繁忙，请稍后再试/.test(body)) return fail('platform_limit')
    if (response.status === 403) return fail('request_rejected')
    if (response.status >= 500) return fail('platform_service')
    if (!response.ok) return fail('request_rejected')
    if (body.length > 12 * 1024 * 1024 || !/^\s*\{/.test(body)) return fail('response_structure')
    return { body }
  } catch { return fail(abort.signal.aborted ? 'timeout' : 'network') }
  finally { clearTimeout(timer) }
}
