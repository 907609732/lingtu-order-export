import type { ExecutionEntry,PlatformId } from '../shared/types'
import type { DiagnosticListener } from './diagnostics'
import { collectionFailureText } from './collection-errors'

const failureText:Record<string,string>={
  ...collectionFailureText,
  login_or_verification:'需要登录或完成平台验证，请打开平台页处理后继续。',
  timeout:'等待超时，请检查网络或平台页面后重试。',network:'网络请求失败，请检查网络连接或平台页面。',
  response_structure:'平台返回的订单结构暂未识别，已有结果已保留。',
  disk:'磁盘写入失败，请检查可用空间。',permission:'文件访问被拒绝，请检查文件夹权限。',
  input_or_state:'当前日期、任务状态或保存目录不符合要求，请按界面提示检查。',
  other:'操作出现异常，请查看界面提示；可开启文件日志进一步排查。'
}
const operations:Record<string,string>={start:'开始采集',login:'打开平台页',export:'导出文件',resume:'继续采集',retry:'重试采集',pause:'暂停采集',finish:'结束读取',openLogs:'打开日志目录',chooseDirectory:'选择保存目录',clear:'清理记录',proxyStart:'启动辅助采集'}
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.round(value)):0
function stage(c:Record<string,unknown>):string {
  if(c.phase==='response')return '等待小程序订单数据'
  if(c.phase==='page')return `读取${c.year?`${number(c.year)} 年` : ''}第 ${number(c.page)} 页订单`
  if(c.phase==='detail')return `补全订单详情 ${number(c.current)} / ${number(c.total)}`
  if(c.phase==='images')return `处理商品图片 ${number(c.current)} / ${number(c.total)}`
  if(c.phase==='write')return '写入导出文件'
  if(c.phase==='rows')return '整理订单数据'
  return '加载平台页面'
}

// Small, bounded live feed, following the cloud warehouse app's onLog/getLogs pattern.
// Only sanitized diagnostics enter this adapter; no response bodies are displayed.
export class ExecutionLog {
  private sequence=0
  private buffers=new Map<string,ExecutionEntry[]>()
  constructor(private changed:()=>void=()=>{}){}
  accept:DiagnosticListener=(event,c,error,rawLevel)=>{
    let message='',level:ExecutionEntry['level']=rawLevel==='warn'?'warning':rawLevel==='error'?'error':'info'
    const count=number(c.count),page=number(c.page),received=number(c.received)
    const reason=(failureText[String(error?.category)]||failureText.other)+(error?.platformCode?`（错误码：${error.platformCode}）`:'')
    switch(event){
      case 'app.start':message='程序已启动，等待操作。';break
      case 'platform.open':message='正在打开官方平台页面，请在页面中完成登录或验证。';break
      case 'collector.start':message=`开始采集订单，当前已保存 ${count} 笔。`;break
      case 'collector.stage':message=`正在${stage(c)}…`;break
      case 'collector.wait':case 'export.wait':message=`仍在${stage(c)}，已等待 ${number(c.seconds)} 秒，请稍候…`;break
      case 'collector.page':message=`${c.year?`${number(c.year)} 年` : ''}第 ${page} 页读取完成，本页识别 ${received} 笔，所选范围内累计 ${count} 笔。`;level='success';break
      case 'collector.response':if(received)message=`收到平台订单数据，识别 ${received} 笔，范围内累计 ${count} 笔。${number(c.unknown)?`另有 ${number(c.unknown)} 笔缺少日期，未计入。`:''}`;break
      case 'collector.detail':message=`订单详情已处理 ${number(c.current)} / ${number(c.total)}。`;break
      case 'collector.detail_failed':message='本笔订单详情暂未获取，保留缺项标记并继续。';break
      case 'collector.waiting':message='正在等待小程序订单数据，请打开对应平台的买家订单列表并翻页。';break
      case 'collector.failed':message=`采集暂时中断：${reason}`;break
      case 'collector.parse_failed':message='收到的数据暂时无法解析，等待下一批订单响应。';break
      case 'collector.end':
        if(c.status==='completed'){message=`采集完成，共 ${count} 笔订单，可导出文件。`;level='success'}
        else if(c.status==='partial'){message=c.interrupted?`采集已中断，已保留 ${count} 笔。请检查上方错误提示后重试，已有结果可导出。`:`本次列表读取结束，已保留 ${count} 笔；详情或采集范围仍需核对，可先导出。`;level='warning'}
        else if(c.status==='needs_login'){message=`任务等待处理，已保留 ${count} 笔。请按上方提示处理后继续采集。`;level='warning'}
        else if(c.status==='failed'){message=`采集失败，已保留 ${count} 笔，请检查错误提示。`;level='error'}
        break
      case 'task.action':message=({pause:'已暂停采集，当前结果保留在本机。',resume:'继续采集，正在恢复读取…',retry:'开始重试，正在重新检查订单和详情…',finish:'已结束本次读取，可以导出已有结果。'} as Record<string,string>)[String(c.action)]||'';break
      case 'export.start':message=`开始导出 ${count} 笔订单，格式 ${c.format==='csv'?'CSV':'Excel'}${c.images?'，包含商品图片':''}。`;break
      case 'export.progress':message=c.phase==='rows'?`正在整理 ${number(c.total)} 条商品明细…`:`正在${stage(c)}…`;break
      case 'export.image_failed':message='一张商品图片获取失败，将保留链接并继续导出。';break
      case 'export.done':message=`导出完成，已保存 ${count} 笔订单${number(c.missing)?`，附 ${number(c.missing)} 项核对说明`:''}。`;level='success';break
      case 'platform.load_failed':message=`平台页面加载失败（网络代码 ${Number(c.networkCode)||0}），请检查网络后重试。`;break
      case 'platform.debugger_failed':message='平台响应监听暂不可用，将尝试从页面读取。';level='warning';break
      case 'platform.response_failed':message='本次订单响应读取失败，等待后续响应或重试。';break
      case 'platform.gone':message='平台页面进程已退出，请重新打开平台页。';break
      case 'proxy.start':message='辅助采集监听已启动，等待小程序订单页面。';break
      case 'proxy.stop':message='辅助采集监听已停止。';break
      case 'proxy.error':message=`辅助采集连接异常：${reason}`;break
      case 'ipc.failed':message=`${operations[String(c.operation)]||'操作'}失败：${reason}`;break
      case 'renderer.error':case 'app.unhandled_rejection':case 'app.uncaught_exception':message=`程序出现异常：${reason}`;break
    }
    if(!message)return
    const platform=c.platform as PlatformId|undefined, key=platform||'global'
    const entry:ExecutionEntry={id:++this.sequence,time:new Date().toISOString(),level,message,...(platform?{platform}:{}),...(typeof c.taskId==='string'?{taskId:c.taskId}:{})}
    const buffer=this.buffers.get(key)||[];buffer.push(entry);if(buffer.length>300)buffer.splice(0,buffer.length-300);this.buffers.set(key,buffer)
    this.changed()
  }
  snapshot(platform:PlatformId):ExecutionEntry[]{return [...(this.buffers.get('global')||[]),...(this.buffers.get(platform)||[])].sort((a,b)=>a.id-b.id).slice(-300).map(e=>({...e}))}
}
