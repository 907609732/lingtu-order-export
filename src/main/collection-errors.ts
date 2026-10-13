export type MtopFailure = { category:string; code:string }

// Serialized into the official page alongside the SDK bridge. Keep this function
// self-contained and return only known codes, never the platform's raw message.
export function mtopFailure(value:any):MtopFailure {
  const groups:Record<string,string[]>={
    login_or_verification:['FAIL_SYS_SESSION_EXPIRED','FAIL_SYS_SESSION_EXPIRED_2','FAIL_SYS_USER_VALIDATE','FAIL_SYS_LOGIN','FAIL_SYS_TOKEN_EXOIRED','FAIL_SYS_TOKEN_EXPIRED','FAIL_SYS_TOKEN_EMPTY'],
    platform_service:['FAIL_SYS_SERVICE_INNER_FAULT','FAIL_SYS_SYSTEM_BUSY','FAIL_SYS_SERVICE_NOT_EXIST','FAIL_SYS_API_NOT_FOUNDED'],
    platform_limit:['FAIL_SYS_TRAFFIC_LIMIT','FAIL_SYS_FLOW_LIMIT'],
    request_rejected:['FAIL_SYS_ILLEGAL_ACCESS','FAIL_SYS_ACCESS_DENIED','FAIL_SYS_PARAM_MISSING','FAIL_SYS_PARAM_FORMAT_ERROR','FAIL_SYS_REQUEST_EXPIRED'],
    timeout:['TIMEOUT','FAIL_SYS_REQUEST_TIMEOUT','FAIL_SYS_SERVICE_TIMEOUT'],
    network:['NETWORK_ERROR','FAIL_SYS_NETWORK_ERROR']
  }
  const codes=(Array.isArray(value?.ret)?value.ret:typeof value?.ret==='string'?[value.ret]:[]).filter((s:unknown)=>typeof s==='string').map((s:string)=>s.split('::')[0])
  for(const [category,known] of Object.entries(groups)){const code=codes.find((s:string)=>known.includes(s));if(code)return {category,code}}
  const message=typeof value?.message==='string'?value.message:''
  if(/timeout|timed out|超时/i.test(message))return {category:'timeout',code:'TIMEOUT'}
  if(/network|fetch|net::|网络/i.test(message))return {category:'network',code:'NETWORK_ERROR'}
  return {category:'request_rejected',code:'UNKNOWN_RESPONSE'}
}

export const collectionFailureText:Record<string,string>={
  login_or_verification:'需要登录或完成平台验证，请打开平台页处理后继续。',
  platform_service:'平台订单接口返回服务错误，请稍后重试；如果平台页面有订单，请保留错误码反馈。',
  platform_limit:'平台暂时限制请求，请稍后重试；如有验证提示，请在平台页面自行处理。',
  request_rejected:'订单请求未被平台接受，请查看错误码并反馈。',
  timeout:'等待平台响应超时，请检查网络后重试。',
  network:'网络请求失败，请检查网络后重试。',
  page_not_ready:'平台页面尚未准备好，请等订单列表显示后继续。',
  response_structure:'平台返回的订单结构暂未识别，已有结果已保留。'
}
export class CollectionError extends Error {
  constructor(readonly category:string,readonly platformCode?:string){super((collectionFailureText[category]||collectionFailureText.request_rejected)+(platformCode?`（错误码：${platformCode}）`:''))}
}
export function unwrapMtopResponse(response:any):any {
  if(response?.__orderdeskFailure){const failure=response.__orderdeskFailure;const safe=typeof failure.code==='string'?mtopFailure({ret:[failure.code]}):{category:Object.hasOwn(collectionFailureText,failure.category)?failure.category:'request_rejected',code:undefined};throw new CollectionError(safe.category,safe.code)}
  return response
}
