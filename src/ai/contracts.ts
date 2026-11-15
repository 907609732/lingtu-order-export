import {z} from 'zod'
import {checkRange} from '../core/values'

const platform=z.enum(['taobao','alibaba','pdd','jd','xianyu','dewu','kuaishou','eleme','meituan'])
const taskId=z.string().min(1).max(200)
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const mode=z.enum(['ordinary','official-export']).default('ordinary')
const taskSchema=z.object({taskId}).strict()
type Definition={description:string;schema:z.ZodObject<any>;operation:string;args:(input:any)=>any[];readOnly:boolean}
const taskTool=(operation:string,description:string):Definition=>({description,schema:taskSchema,operation,args:i=>[i.taskId],readOnly:false})
export const aiTools:Record<string,Definition>={
  get_state:{description:'查看软件版本、平台及任务状态。needs_login 表示需人工登录/验证；不保证平台账号当前有效。',schema:z.object({}).strict(),operation:'state',args:()=>[],readOnly:true},
  list_tasks:{description:'列出采集任务、进度和导出路径。partial 不代表完整导出。',schema:z.object({}).strict(),operation:'state',args:()=>[],readOnly:true},
  get_task:{description:'查看一个任务的进度和需要人工处理的提示。',schema:taskSchema,operation:'aiGetTask',args:i=>[i.taskId],readOnly:true},
  list_orders:{description:'分页读取本机已采集订单，可能包含个人信息，仅在用户需要时读取。',schema:z.object({taskId,offset:z.number().int().min(0).max(1000000).default(0),limit:z.number().int().min(1).max(200).default(50)}).strict(),operation:'orders',args:i=>[i.taskId],readOnly:true},
  open_login:{description:'在软件中打开平台页面，用户自行登录或处理验证码；此操作不会代填密码。',schema:z.object({platform,mode}).strict(),operation:'login',args:i=>[i.platform,i.mode],readOnly:false},
  start_collection:{description:'按起止日期（含首尾）创建异步采集任务。返回任务 ID 后用 get_task 查看进度；不要反复重复创建。官方导出仅支持 1688。',schema:z.object({platform,from:date,to:date,mode,plan:z.object({granularity:z.enum(['month','day']),segments:z.array(z.object({from:date,to:date}).strict()).min(1).max(1000)}).strict().optional()}).strict(),operation:'start',args:i=>[i],readOnly:false},
  pause_collection:taskTool('pause','暂停一个采集任务，保留已采集结果。'),
  resume_collection:taskTool('resume','继续暂停或需要登录的采集任务；先完成软件中的登录/验证。'),
  retry_collection:taskTool('retry','重试任务未完成的范围。请先检查任务状态和错误原因。'),
  enrich_details:taskTool('enrichDetails','异步补齐已采集订单的详情，以 get_task 查看后续进度。'),
  export_orders:{description:'导出本机任务为 Excel/CSV。使用软件已选目录；首次未选择时保存到文档/电商订单导出。返回本机路径和缺项数量，不代表平台范围完整。',schema:z.object({taskId,format:z.enum(['xlsx','csv']).default('xlsx'),images:z.boolean().default(false)}).strict(),operation:'aiExport',args:i=>[i],readOnly:false}
}

// Positive selection prevents new internal credentials/checkpoints leaking through future fields.
export function publicTask(task:any){
  if(!task||typeof task!=='object')return task
  const keys=['id','platform','mode','account','from','to','status','createdAt','updatedAt','count','pages','message','exportedPath','operation','activityPhase','listOutcome']
  return Object.fromEntries(keys.filter(key=>task[key]!==undefined).map(key=>[key,task[key]]))
}
export async function executeAiTool(name:string,input:unknown,invoke:(operation:string,args:any[])=>any):Promise<unknown>{
  const tool=Object.hasOwn(aiTools,name)?aiTools[name]:undefined
  if(!tool)throw new Error('未知 AI 工具')
  const parsed:any=tool.schema.parse(input)
  if(parsed.platform&&parsed.mode==='official-export'&&parsed.platform!=='alibaba')throw new Error('官方导出仅支持 1688')
  if(name==='start_collection'){
    checkRange(parsed.from,parsed.to)
    for(const segment of parsed.plan?.segments??[])checkRange(segment.from,segment.to)
  }
  const result=await invoke(tool.operation,tool.args(parsed))
  if(name==='get_state')return {version:result.version,platforms:result.platforms,tasks:result.tasks.map(publicTask),outputDir:result.outputDir,exporting:result.exporting,platformRuns:result.platformRuns,alibabaOfficialExportAvailable:result.alibabaOfficialExportAvailable}
  if(name==='list_tasks')return result.tasks.map(publicTask)
  if(name==='get_task'||name==='start_collection')return publicTask(result)
  if(name==='list_orders')return {total:result.length,offset:parsed.offset,limit:parsed.limit,orders:result.slice(parsed.offset,parsed.offset+parsed.limit)}
  return result??null
}
