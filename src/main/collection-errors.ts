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
  account_changed:'当前登录账号与任务账号不一致，或旧任务尚未绑定账号；请切回原账号，或新建采集任务。',
  detail_download_network:'1688详情文件下载请求失败，请检查网络后继续。',
  detail_download_source:'1688详情文件下载跳转到不受支持的报表地址，已停止导入。',
  detail_download_http:'1688详情文件下载返回HTTP错误，已有结果已保留。',
  detail_download_interrupted:'1688详情文件下载中断，已有结果已保留，可继续提取。',
  detail_report_pending:'1688官方详情报表暂未生成，已有订单和报表申请已保留，可稍后继续提取。',
  detail_report_empty:'1688详情文件为空，已有结果已保留。',
  detail_report_too_large:'1688详情文件超过32MB，请缩小日期范围。',
  detail_report_format:'1688详情文件不是可识别的Excel报表，已有结果已保留。',
  detail_report_parse:'1688详情Excel报表解析失败，已有结果已保留。',
  detail_report_no_match:'1688详情报表未匹配到当前待处理订单，已有结果已保留。',
  detail_report_no_fields:'1688详情报表未包含可导入的详情字段，已有结果已保留。',
  response_structure:'平台返回的订单结构暂未识别，已有结果已保留。'
}
export class CollectionError extends Error {
  constructor(readonly category:string,readonly platformCode?:string){super((collectionFailureText[category]||collectionFailureText.request_rejected)+(platformCode?`（错误码：${platformCode}）`:''))}
}
export function unwrapMtopResponse(response:any):any {
  if(response?.__orderdeskFailure){const failure=response.__orderdeskFailure;const safe=typeof failure.code==='string'?mtopFailure({ret:[failure.code]}):{category:Object.hasOwn(collectionFailureText,failure.category)?failure.category:'request_rejected',code:undefined};throw new CollectionError(safe.category,safe.code)}
  return response
}
