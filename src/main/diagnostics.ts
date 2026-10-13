import log from 'electron-log/node'
import { closeSync, mkdirSync, openSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { LoggingState } from '../shared/types'
import { CollectionError, collectionFailureText, mtopFailure } from './collection-errors'

// electron-log's shared file registry uses its default console for I/O failures.
// Keep those raw errors (which may include a local username) out of console output too.
log.transports.console.writeFn=()=>{}

const events = new Set([
  'logging.enabled','logging.disabled','app.start','app.exit','app.start_failed',
  'app.unhandled_rejection','app.uncaught_exception','ipc.start','ipc.done','ipc.failed',
  'renderer.error','renderer.gone','renderer.preload_failed','platform.load_failed',
  'platform.debugger_failed','platform.response_failed','platform.gone',
  'collector.start','collector.waiting','collector.response','collector.parse_failed',
  'collector.page','collector.detail_failed','collector.failed','collector.end','collector.stop',
  'export.done','export.image_failed','proxy.start','proxy.stop','proxy.error',
  'collector.stage','collector.wait','collector.detail','task.action','platform.open',
  'export.start','export.progress','export.wait'
] as const)
type Event = typeof events extends Set<infer T> ? T : never
type Level = 'info' | 'warn' | 'error'
export type DiagnosticListener = (event: string, context: Record<string,unknown>, error: Record<string,unknown>|undefined, level: Level) => void
const enums:Record<string,readonly string[]> = {
  platform:['taobao','alibaba','pdd','jd','xianyu','dewu','kuaishou','eleme','meituan'],
  operation:['state','orders','hidePage','setLogging','login','start','pause','resume','retry','finish','chooseDirectory','export','openOutput','openExport','clear','proxyStart','proxyStop','certificate','proxySettings','openLogs'],
  status:['running','paused','needs_login','partial','completed','failed'],
  format:['xlsx','csv'],origin:['window','promise','vue'],
  phase:['platform','page','detail','rows','images','write','response'],action:['pause','resume','retry','finish'],
  reason:['clean-exit','abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure','memory-eviction']
}
const counters = new Set(['count','pages','page','received','missing','unknown','durationMs','exitCode','networkCode','current','total','seconds','year'])
const errorNames = new Set(['Error','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','AggregateError','AbortError','TimeoutError'])
const errorCodes = new Set(['ENOENT','EACCES','EPERM','ENOSPC','EIO','EBUSY','EEXIST','EADDRINUSE','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','ERR_NETWORK','ERR_ABORTED','SQLITE_BUSY','SQLITE_ERROR'])
const writeFailure = '日志写入失败，请检查磁盘空间和文件夹权限，再重新开启日志。'

// Only explicitly approved operational fields enter the file. Never serialize payloads,
// arbitrary messages, URLs, account/order IDs, request headers or output paths.
export function safeContext(context:Record<string,unknown>):Record<string,unknown> {
  const safe:Record<string,unknown> = {}
  for (const [key,values] of Object.entries(enums)) if (typeof context[key]==='string' && values.includes(context[key] as string)) safe[key]=context[key]
  for (const key of counters) if (typeof context[key]==='number' && Number.isFinite(context[key]) && Math.abs(context[key] as number)<=1e9) safe[key]=Math.round(context[key] as number)
  if (typeof context.images==='boolean') safe.images=context.images
  if (typeof context.interrupted==='boolean') safe.interrupted=context.interrupted
  if (typeof context.taskId==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(context.taskId)) safe.taskId=context.taskId
  if (typeof context.version==='string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(context.version)) safe.version=context.version
  return safe
}

export function safeError(error:unknown):Record<string,unknown> {
  try {
    const e=error && typeof error==='object' ? error as Record<string,unknown> : {}
    const message=typeof e.message==='string' ? e.message.slice(0,4000) : typeof error==='string' ? error.slice(0,4000) : ''
    const category=error instanceof CollectionError&&Object.hasOwn(collectionFailureText,error.category)?error.category
      : /登录|验证|login|captcha/i.test(message)?'login_or_verification'
      : /timeout|timed out|超时/i.test(message)?'timeout'
      : /ENOSPC|disk.*full|磁盘/i.test(message)?'disk'
      : /EACCES|EPERM|permission/i.test(message)?'permission'
      : /network|fetch|net::|ECONN|ENOTFOUND|网络/i.test(message)?'network'
      : /结构|解析|JSON|重复页面|列表未返回/i.test(message)?'response_structure'
      : /目录|文件格式|日期|任务|platform|平台不存在/i.test(message)?'input_or_state' : 'other'
    const safe:Record<string,unknown>={name:typeof e.name==='string'&&errorNames.has(e.name)?e.name:'Error',category}
    if(error instanceof CollectionError&&error.platformCode)safe.platformCode=mtopFailure({ret:[error.platformCode]}).code
    if (typeof e.code==='string'&&errorCodes.has(e.code)) safe.code=e.code
    // Retain only bundled code locations, without stack messages, local usernames or URLs.
    const stack=typeof e.stack==='string'?e.stack.slice(0,12000):''
    const locations=[...stack.matchAll(/(?:out[\/\\](main[\/\\]index\.js|preload[\/\\]index\.cjs)|(?:out[\/\\])?renderer[\/\\]assets[\/\\](index-[\w-]{1,40}\.js)):(\d{1,7}):(\d{1,7})(?=[)\s]|$)/g)]
      .slice(0,6).map(m=>`${(m[1]||'renderer/'+m[2]).replaceAll('\\','/')}:${m[3]}:${m[4]}`)
    if (locations.length) safe.locations=locations
    return safe
  } catch { return {name:'Error',category:'other'} }
}

export class Diagnostics {
  readonly directory:string
  private logger=log.create({logId:'diagnostics-'+randomUUID()})
  private enabled=false
  private problem=''
  private listening=false
  onEvent?:DiagnosticListener
  constructor(userData:string,private version:string,maxBytes=5*1024*1024) {
    this.directory=join(userData,'logs')
    // No console interception, renderer bridge or automatic error serialization.
    for (const transport of Object.values(this.logger.transports)) if (transport) transport.level=false
    this.logger.transports.console.writeFn=()=>{}
    const file=this.logger.transports.file
    file.resolvePathFn=()=>join(this.directory,'main.log')
    file.maxSize=maxBytes
    file.sync=true
  }
  state():LoggingState {
    // MSIX-hosted launches can redirect AppData. Explorer runs outside that view;
    // Node's native realpath reveals the physical directory that Explorer can open.
    let directory=this.directory
    try{directory=realpathSync.native(directory)}catch{try{directory=join(realpathSync.native(dirname(directory)),'logs')}catch{}}
    return {enabled:this.enabled,directory,error:this.problem}
  }
  setEnabled(enabled:boolean):void {
    if (!enabled) {
      this.event('logging.disabled')
      this.enabled=false;this.logger.transports.file.level=false;this.problem=''
      return
    }
    this.problem=''
    try {
      mkdirSync(this.directory,{recursive:true})
      closeSync(openSync(join(this.directory,'main.log'),'a'))
      if (!this.listening) {
        this.logger.transports.file.getFile().on('error',()=>{this.problem=writeFailure})
        this.listening=true
      }
      this.enabled=true;this.logger.transports.file.level='info'
      this.event('logging.enabled',{version:this.version})
      if (this.problem) throw new Error(writeFailure)
    } catch {
      this.enabled=false;this.logger.transports.file.level=false;this.problem=writeFailure
      throw new Error(writeFailure)
    }
  }
  event(event:Event,context:Record<string,unknown>={},error?:unknown,level:Level=error===undefined?'info':'error'):void {
    if (!events.has(event)) return
    const safe=safeContext(context),failure=error===undefined?undefined:safeError(error)
    // Live progress works independently of file logging and disk availability.
    try{this.onEvent?.(event,safe,failure,level)}catch{/* A display subscriber must not interrupt work. */}
    if (!this.enabled || this.problem) return
    try { this.logger[level](JSON.stringify({event,...safe,...(failure===undefined?{}:{error:failure})})) }
    catch { this.problem=writeFailure }
  }
}
