<script setup lang="ts">
import { computed,nextTick,onMounted,onUnmounted,ref } from 'vue'
import type { AppState,Order,PlatformId,Task,StartInput,CollectionMode } from '../../shared/types'
import ExtractionPlan from './ExtractionPlan.vue'
import {planPlatforms,detailPlatforms,pendingDetails,shouldHighlightDetails} from '../../core/extraction-plan'
import {primaryCollectionAction,sameCollectionTime} from '../../core/primary-collection-action'
import ExecutionLog from './ExecutionLog.vue'
import CollectionActivity from './CollectionActivity.vue'
import OfficialExportAudit from './OfficialExportAudit.vue'
import OrderTable from './OrderTable.vue'
import SupportAuthor from './SupportAuthor.vue'
import UpdatePanel from './UpdatePanel.vue'
import {Clock,QuestionFilled,Setting,Lock} from '@element-plus/icons-vue'
import logoUrl from './assets/logo-icon.png'
const desk = window.desk
const executionPanel=ref<InstanceType<typeof ExecutionLog>>()
const state=ref<AppState|null>(null), selected=ref<PlatformId>('taobao'), taskId=ref(''), records=ref<Order[]>([])
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const from=ref(today.slice(0,7)+'-01'),to=ref(today),format=ref<'xlsx'|'csv'>('xlsx'),images=ref(true),busy=ref(false),pageOpen=ref(false),section=ref<'export'|'history'|'settings'|'help'>('export'),query=ref(''),page=ref(1),notice=ref(''),error=ref(false)
type CollectionTime=Omit<StartInput,'platform'>
const planOpen=ref(false),timeSelections=ref<Record<string,CollectionTime>>({}),alibabaMode=ref<CollectionMode>('ordinary'),auditOpen=ref(false)
const mode=computed<CollectionMode>(()=>selected.value==='alibaba'?alibabaMode.value:'ordinary')
const officialMode=computed(()=>mode.value==='official-export')
const officialUnavailable=computed(()=>officialMode.value&&!state.value?.alibabaOfficialExportAvailable)
const timeKey=(platform:PlatformId,currentMode:CollectionMode='ordinary')=>platform+':'+currentMode
const currentTimeKey=computed(()=>timeKey(selected.value,mode.value))
const collectionTime=computed(()=>timeSelections.value[currentTimeKey.value])
const runFor=(id:PlatformId)=>state.value?.platformRuns?.find(r=>r.platform===id)
const platformBusy=(id:PlatformId)=>!!runFor(id)||!!state.value?.tasks.some(t=>t.platform===id&&t.status==='running')
const collectionRunning=computed(()=>platformBusy(selected.value))
const stopping=computed(()=>!!runFor(selected.value)?.stopping)
const exportBusy=ref(false)
function platformStatus(id:PlatformId){const run=runFor(id),latest=run?state.value?.tasks.find(t=>t.id===run.taskId):state.value?.tasks.find(t=>t.platform===id);return latest?.status==='needs_login'?{text:'待验证',kind:'attention'}:run?.stopping?{text:'暂停中',kind:'pausing'}:platformBusy(id)?{text:'采集中',kind:'running'}:null}
const listComplete=computed(()=>task.value?.listOutcome==='complete'||task.value?.status==='completed')
const timeSummary=computed(()=>{
 const input=collectionTime.value;if(!input)return '尚未选择采集时间，请先完成第一步'
 if(input.plan?.granularity==='month')return '已选时间：'+[...new Set(input.plan.segments.map(s=>s.from.slice(0,4)))].map(year=>year+' 年 · '+input.plan!.segments.filter(s=>s.from.startsWith(year)).map(s=>Number(s.from.slice(5,7))).join('、')+' 月').join('；')
 return '已选时间：'+input.from+' 至 '+input.to+(input.plan?' · 已选 '+input.plan.segments.length+' 天':'')
})
const segmentLabels={pending:'待采集',running:'采集中',completed:'列表已完成',paused:'已暂停',needs_attention:'需要处理'}
function taskTime(t:Task):CollectionTime{return {mode:t.mode||'ordinary',from:t.from,to:t.to,...(t.plan?{plan:{granularity:t.plan.granularity,segments:t.plan.segments.map(s=>({from:s.from,to:s.to}))}}:{})}}
function restoreTime(t?:Task){const key=t?timeKey(t.platform,t.mode||'ordinary'):currentTimeKey.value;if(t&&!timeSelections.value[key])timeSelections.value[key]=taskTime(t);const input=timeSelections.value[currentTimeKey.value];from.value=input?.from||today.slice(0,7)+'-01';to.value=input?.to||today}
function confirmTime(input:CollectionTime){if(collectionRunning.value)return;timeSelections.value[currentTimeKey.value]={...input,mode:mode.value};from.value=input.from;to.value=input.to;planOpen.value=false}

const detailPending=computed(()=>pendingDetails(records.value).length)
const primaryAction=computed(()=>primaryCollectionAction(task.value,collectionTime.value,detailPending.value,mode.value))
const primaryLabel=computed(()=>stopping.value?'暂停中…':collectionRunning.value?'采集中…':(officialMode.value?{start:'官方导出',resume:'继续官方导出',reset:'重新官方导出',running:'官方导出中…'}:{start:'开始采集',resume:'继续采集',reset:'重置采集',running:'采集中…'})[primaryAction.value])
const changedTime=computed(()=>!!task.value&&!!collectionTime.value&&!sameCollectionTime(task.value,collectionTime.value))
const resumeGuidance=computed(()=>officialMode.value?(primaryAction.value==='resume'?(task.value?.status==='needs_login'?'请先在平台页完成登录 / 验证，再点击②继续官方导出。':'点击②继续官方导出，将从已保存的阶段继续。'):''):primaryAction.value==='resume'?(task.value?.status==='needs_login'?'请先登录 / 完成验证，再点击②'+((task.value?.activityPhase||task.value?.operation)==='details'?'继续提取订单详情':'从断点继续采集'):'点击②'+((task.value?.activityPhase||task.value?.operation)==='details'?'继续提取订单详情':'从断点继续采集')):'')
const detailHighlight=computed(()=>!officialMode.value&&shouldHighlightDetails(task.value,records.value))
const platform=computed(()=>state.value?.platforms.find(p=>p.id===selected.value))
const tasks=computed(()=>state.value?.tasks.filter(t=>t.platform===selected.value&&(t.mode||'ordinary')===mode.value)||[])
const task=computed(()=>state.value?.tasks.find(t=>t.id===taskId.value))
const activityVisible=computed(()=>!!task.value&&(['running','paused','needs_login','failed'].includes(task.value.status)||(task.value.status==='partial'&&((!!task.value.listOutcome&&task.value.listOutcome!=='complete')||(task.value.operation==='details'&&detailPending.value>0)))))
const emptyResult=computed(()=>task.value?.status==='completed'&&task.value.count===0)
const filtered=computed(()=>records.value.filter(o=>(o.id+' '+o.shop+' '+o.items.map(i=>i.title).join(' ')).includes(query.value)))
const shown=computed(()=>filtered.value.slice((page.value-1)*30,page.value*30))
const missing=computed(()=>records.value.filter(o=>o.missing.length).length)
const labels:Record<string,string>={running:'正在采集',paused:'已暂停',needs_login:'需要登录 / 验证',partial:'已有结果 · 待核对',completed:'读取完成',failed:'需要处理'}
let off:(()=>void)|undefined;let offUpdate:(()=>void)|undefined;let refreshPending=false
let selectionVersion=0,stateRequest=0,ordersRequest=0,actionRequest=0
const context=()=>({version:selectionVersion,platform:selected.value,taskId:taskId.value})
const current=(c:ReturnType<typeof context>)=>c.version===selectionVersion&&c.platform===selected.value
async function loadOrders(){const c=context(),request=++ordersRequest;if(!c.taskId){records.value=[];return}const rows=await desk.orders(c.taskId);if(current(c)&&c.taskId===taskId.value&&request===ordersRequest)records.value=rows}
async function refresh(){const request=++stateRequest;const snapshot=await desk.state();if(request!==stateRequest)return;state.value=snapshot;await loadOrders()}
async function action(fn:()=>Promise<unknown>,message=''){const c=context(),request=++actionRequest;busy.value=true;notice.value='';error.value=false;try{await fn();if(current(c)&&message)notice.value=message;await refresh()}catch(e){if(current(c)){notice.value=String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,'');error.value=true}}finally{if(request===actionRequest)busy.value=false}}
function beginSelection(){selectionVersion++;actionRequest++;busy.value=false;planOpen.value=false;auditOpen.value=false;pageOpen.value=false;records.value=[];notice.value='';error.value=false;query.value='';page.value=1}
async function selectPlatform(id:PlatformId){beginSelection();selected.value=id;section.value='export';const latest=tasks.value.find(t=>t.id===runFor(id)?.taskId)||tasks.value.find(t=>t.status==='running')||tasks.value[0];taskId.value=latest?.id||'';restoreTime(latest);void desk.hidePage();await loadOrders()}
async function selectMode(value:CollectionMode){if(busy.value||collectionRunning.value||value===mode.value)return;beginSelection();alibabaMode.value=value;const latest=tasks.value[0];taskId.value=latest?.id||'';restoreTime(latest);void desk.hidePage();await loadOrders()}
function showAudit(){auditOpen.value=!auditOpen.value}
async function clearPlatform(){if(collectionRunning.value)return;const c=context(),id=c.platform,name=platform.value?.name;await action(async()=>{if(await desk.clear(id)){if(current(c)){taskId.value='';records.value=[];query.value='';page.value=1;for(const key of Object.keys(timeSelections.value))if(key.startsWith(id+':'))delete timeSelections.value[key];restoreTime();planOpen.value=false}if(current(c))notice.value=`已清理 ${name} 的本机采集缓存，已导出的文件保留。`}})}
async function openPage(){if(stopping.value)return;const c=context(),m=mode.value;await action(async()=>{await desk.login(c.platform,m);if(current(c))pageOpen.value=true})}
async function hidePage(){const c=context();await desk.hidePage();if(current(c))pageOpen.value=false}
async function start(){const input=collectionTime.value,c=context(),m=mode.value,primary=primaryAction.value;if(!input||busy.value||collectionRunning.value||officialUnavailable.value)return;await action(async()=>{if(primary==='resume'){await desk.resume(c.taskId)}else{const t=await desk.start({platform:c.platform,mode:m,from:input.from,to:input.to,...(input.plan?{plan:{granularity:input.plan.granularity,segments:input.plan.segments.map(s=>({from:s.from,to:s.to}))}}:{})});if(current(c)){taskId.value=t.id;page.value=1}}if(current(c)){await nextTick();executionPanel.value?.reveal(false)}})}
async function enrich(){const c=context();await action(async()=>{await desk.enrichDetails(c.taskId);if(current(c)){await nextTick();executionPanel.value?.reveal(false)}})}
async function openOrder(orderId:string){if(collectionRunning.value)return;const c=context();await action(async()=>{await desk.openOrder(c.taskId,orderId);if(current(c))pageOpen.value=true})}
async function chooseTask(event:Event){if(collectionRunning.value)return;const id=(event.target as HTMLSelectElement).value,t=tasks.value.find(t=>t.id===id);if(t)await openTask(t)}
async function exportFile(){if(exportBusy.value||state.value?.exporting||!taskId.value)return;const c=context(),input={taskId:c.taskId,format:format.value,images:images.value};exportBusy.value=true;try{if(!state.value?.outputDir)await desk.chooseDirectory();const r=await desk.export(input);if(current(c)&&taskId.value===c.taskId){notice.value=`已导出 ${r.count} 笔订单${r.missing?`，附 ${r.missing} 项核对说明`:''}。文件已保存到所选目录。`;error.value=false}await refresh()}catch(e){if(current(c)){notice.value=String(e instanceof Error?e.message:e);error.value=true}}finally{exportBusy.value=false}}
async function choose(){await hidePage();await action(()=>desk.chooseDirectory())}
async function toggleLogging(){const enabled=!state.value?.logging.enabled;await action(()=>desk.setLogging(enabled),enabled?'问题排查日志已开启，复现问题后可打开日志文件夹查看。':'问题排查日志已关闭，已有日志仍保留在本机。')}
async function toggleExecutionLog(){const visible=!state.value?.showExecutionLog;await action(()=>desk.setExecutionLogVisible(visible),visible?'执行日志已显示，回到采集页面即可查看。':'执行日志面板已隐藏，重启后保留选择。')}
async function navigate(s:'export'|'history'|'settings'|'help'){beginSelection();section.value=s;void desk.hidePage()}
async function openTask(t:Task){const run=runFor(t.platform);if(platformBusy(t.platform)&&((run&&run.taskId!==t.id)||t.status!=='running'&&!run))return;beginSelection();selected.value=t.platform;if(t.platform==='alibaba')alibabaMode.value=t.mode||'ordinary';taskId.value=t.id;timeSelections.value[timeKey(t.platform,t.mode||'ordinary')]=taskTime(t);restoreTime(t);section.value='export';void desk.hidePage();await loadOrders()}
async function openUpdate(){await navigate('settings');await nextTick();const panel=document.getElementById('software-update');panel?.scrollIntoView({behavior:'smooth',block:'center'});panel?.focus({preventScroll:true})}
function openWebsite(){void desk.openWebsite()}
function openContact(){void action(()=>desk.openContact())}
function openRepository(){void desk.openRepository()}
onMounted(async()=>{await action(async()=>{await refresh();const latest=state.value?.tasks.find(t=>t.status==='running')||tasks.value[0];if(latest)await openTask(latest)});off=desk.onChange(()=>{if(refreshPending)return;refreshPending=true;setTimeout(()=>{refreshPending=false;void refresh()},250)});offUpdate=desk.onUpdate(()=>{void refresh()})})
onUnmounted(()=>{off?.();offUpdate?.()})
</script>

<template>
  <div class="app-shell" :style="{'--workspace-extra-height':`${(task?.plan?36:0)+(detailHighlight?40:0)+(activityVisible?88:0)}px`}" :class="{'data-workspace':section==='export'}">
    <aside class="sidebar">
      <div class="brand"><img class="brand-logo" :src="logoUrl" alt="电商平台采购订单导出 Logo" /><div><strong>电商平台<br>采购订单导出</strong><small>BY 五成</small></div></div>
      <div class="nav-label">购物平台 <span>{{ state?.platforms.length || 9 }}</span></div>
      <nav><button v-for="p in state?.platforms" :key="p.id" :aria-label="p.name+(platformStatus(p.id)?'，'+platformStatus(p.id)?.text:'')" class="platform" :class="{ selected:p.id===selected && section==='export' }" @click="selectPlatform(p.id)"><i :style="{color:p.color,background:p.color+'13'}">{{p.icon}}</i><span class="platform-name">{{p.name}}</span><small v-if="platformStatus(p.id)" class="platform-status" :class="platformStatus(p.id)?.kind">{{platformStatus(p.id)?.text}}</small><b v-if="!platformStatus(p.id) && p.id===selected && section==='export'">›</b></button></nav>
      <div class="side-bottom"><button :class="{active:section==='history'}" @click="navigate('history')"><Clock aria-hidden="true"/><span>导出任务</span><small>{{state?.tasks.length||0}}</small></button><button :class="{active:section==='help'}" @click="navigate('help')"><QuestionFilled aria-hidden="true"/><span>使用教程</span></button><button :class="{active:section==='settings'}" @click="navigate('settings')"><Setting aria-hidden="true"/><span>保存与设置</span></button><div class="local-badge"><Lock aria-hidden="true"/> 数据保存在这台电脑</div></div>
    </aside>
    <main>
      <header class="topbar"><div class="breadcrumb">个人工作台 <span>/</span> {{section==='history'?'导出任务':section==='settings'?'保存与设置':section==='help'?'使用教程':platform?.name}}</div><div class="version">本机版 <span>v{{state?.version||'0.1.0'}}</span><button class="text-button update-link" @click="openUpdate">{{state?.update?.status==='available'?`新版本 v${state.update.latest}`:state?.update?.status==='downloading'?'更新下载中':state?.update?.status==='downloaded'?'更新待安装':'软件更新'}}</button></div></header>
      <div class="content" :class="section">
        <div v-if="notice" class="notice" :class="{error}">{{notice}}<button @click="notice=''">×</button></div>
        <template v-if="section==='export'">
          <div class="page-title export-title"><div class="platform-heading"><div class="eyebrow">ORDER EXPORT</div><div class="platform-title-row"><h1>{{platform?.name}}订单导出</h1><div v-if="selected==='alibaba'" class="collection-mode-switch" role="group" aria-label="1688导出模式"><button :aria-pressed="mode==='ordinary'" :disabled="busy||collectionRunning" @click="selectMode('ordinary')">模式一 · 普通采集</button><button :aria-pressed="officialMode" :disabled="busy||collectionRunning" @click="selectMode('official-export')">模式二 · 官方导出</button></div></div><p>不同平台可同时采集，切换平台后任务继续。</p></div><section v-if="!pageOpen" class="compact-controls header-controls" aria-label="采集与导出操作">
              <div class="collection-actions four-step-actions">
                <button class="secondary plan-button" :disabled="busy||collectionRunning" @click="planOpen=true">① 选择采集时间</button>
                <button class="primary start" :disabled="busy||collectionRunning||!collectionTime||officialUnavailable" :title="!collectionTime?'请先选择采集时间':primaryAction==='resume'?resumeGuidance:primaryAction==='reset'?'按当前所选时间重新采集，历史任务保留':'按所选时间开始采集'" @click="start">② {{primaryLabel}}</button>
                <button v-if="officialMode" class="secondary" :disabled="!task?.officialExport?.audit||busy||collectionRunning" title="官方报表下载后自动核对，完成后可查看结果" @click="showAudit">③ {{task?.officialExport?.audit?'查看核对结果':'自动核对'}}</button>
                <button v-else :class="['secondary',{'detail-highlight':detailHighlight}]" :disabled="!detailPlatforms.includes(selected)||!detailPending||busy||collectionRunning" :title="!detailPlatforms.includes(selected)?'此平台不支持独立提取订单详情':selected==='jd'?'通过京东官方导出补充收件信息，按本任务日期范围匹配':detailHighlight?'列表已采集完成，请提取详情':'提取尚未成功读取的官方订单详情'" @click="enrich">③ 提取订单详情<span v-if="detailPlatforms.includes(selected)&&detailPending"> · {{detailPending}}</span></button>
                <button class="primary" :disabled="!records.length||busy||collectionRunning||exportBusy||state?.exporting" title="导出本任务全部订单，表格筛选不改变导出范围" @click="exportFile">④ 导出文件 ↓</button>
                <details class="export-options"><summary>导出设置 ▾</summary><div class="export-options-panel"><label class="inline-label">文件格式<select v-model="format"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select></label><label class="checkbox"><input v-model="images" type="checkbox" :disabled="format==='csv'">嵌入商品图片</label><button class="text-button" @click="choose">{{state?.outputDir?'更改保存目录':'选择保存目录'}} ↗</button><p :title="state?.outputDir">{{state?.outputDir||'首次导出时选择保存目录'}}</p></div></details>
              </div>
              <div class="collection-time-summary" :title="timeSummary">{{timeSummary}}</div>
              <div v-if="changedTime" class="collection-time-change" role="status">采集时间已更改，点击②按新时间开始，原任务进度保留。</div>
              <div v-if="task?.status==='running'" class="collection-secondary-actions">
                <button class="text-button"  :disabled="busy||stopping" @click="action(()=>desk.pause(taskId))">暂停</button>
                <button class="text-button"  :disabled="busy||stopping" @click="action(()=>desk.finish(taskId))">结束读取</button>
              </div>
            </section><div class="button-row platform-actions"><button v-if="!pageOpen" class="secondary danger" :disabled="busy||!state||collectionRunning" :title="`清理 ${platform?.name} 的本机任务和订单记录，不删除已导出文件`" @click="clearPlatform">清理当前平台缓存</button><button class="secondary" @click="pageOpen?hidePage():openPage()" :disabled="busy||stopping">{{pageOpen?'返回导出台':platform?.mode==='proxy'?'打开平台页面':'登录 / 查看平台页'}}</button></div></div>
            <p v-if="officialMode" class="official-mode-note" role="note">{{officialUnavailable?'官方导出已在当前运行环境中停用。所选月份与历史任务会保留。':'官方报表下载后按所选月份筛选并导入；登录或验证时会暂停提示。申请期间请保持平台页显示，勿在其他窗口同时申请报表。范围与金额请查看核对结果。'}}</p>
          <div v-if="pageOpen" class="browser-placeholder"><p v-if="selected==='alibaba'">1688 使用淘宝／阿里账号登录，出现淘宝登录页属于官方跳转。登录后会返回 1688，再点击右上角“返回导出台”。</p><p v-else>请在下方的官方平台页面完成登录。完成后点击右上角“返回导出台”。</p></div>
          <template v-else>
            <section v-if="platform?.mode==='proxy'" class="proxy-guide">
              <div><strong>微信小程序辅助采集</strong><span class="tag">{{state?.proxy.running?'监听已开启 · '+(state.platforms.find(p=>p.id===state?.proxy.platform)?.name||'辅助平台'):'需要首次设置'}}</span><p>沿用综合版的本机采集方式。开启后在微信中打开对应平台的买家订单列表，已读取的订单会出现在这里。</p></div>
              <div class="button-row"><button class="secondary" :disabled="busy||collectionRunning||(state?.proxy.running&&state.proxy.platform!==selected)" @click="action(()=>desk.proxyStart(selected),'本机监听已开启，地址 127.0.0.1:17869。请完成下方证书与代理设置。')">开启辅助采集</button><button class="text-button" :disabled="!state?.proxy.running" @click="action(()=>desk.certificate())">打开本机证书</button><button class="text-button" @click="action(()=>desk.proxySettings())">打开代理设置</button></div>
              <details><summary>首次设置步骤与停止方式</summary><ol><li>开启辅助采集后，打开证书，在 Windows 中手动将其导入当前用户的受信任根证书。仅用于本机采集。</li><li>记下原来的代理设置，将手动代理临时设为 <code>127.0.0.1:17869</code>。当前程序尚不自动改动系统设置。</li><li>选择采集时间后点击“② 开始采集”，再打开对应微信小程序的订单列表并向下翻页。</li><li>结束后先恢复原来的系统代理设置，再停止辅助采集或退出软件。</li></ol><button class="text-button" :disabled="state?.proxy.platform!==selected" @click="action(()=>desk.proxyStop(),'本机监听已停止，请确认系统代理已恢复。')">停止辅助采集</button></details>
            </section>
            <div v-if="detailHighlight" class="detail-prompt" role="status">{{selected==='jd'?'通过京东官方导出补充收件信息，自动按本任务日期范围匹配，可暂停后继续。':'列表已采集完成，请提取详情'}} <span>· {{detailPending}} 笔待提取</span></div>
            <CollectionActivity v-if="task && activityVisible" :task="task" :pending-details="detailPending" :resume-guidance="resumeGuidance" :busy="busy" @verify="openPage" />
            <OfficialExportAudit v-if="officialMode && task?.officialExport?.audit" :audit="task.officialExport.audit" :expanded="auditOpen" @toggle="showAudit" />
            <details v-if="task?.plan" class="plan-inline">
              <summary><strong>采集进度 {{task.plan.segments.filter(s=>s.status==='completed').length}} / {{task.plan.segments.length}}</strong><span :title="task.message">{{task.message}}</span><span class="plan-expand">展开进度</span></summary>
              <div class="plan-segments" aria-label="采集计划进度"><div v-for="s in task.plan.segments" :key="s.id" :class="s.status"><strong>{{task.plan.granularity==='month'?s.from.slice(0,7):s.from}}</strong><small>{{s.from}} 至 {{s.to}}</small><span>{{segmentLabels[s.status]}} · {{s.count}} 笔</span></div></div>
              <p class="plan-note">{{officialMode?'逐月执行官方导出、下载与核对；范围完整性以核对结果为准。':'列表已完成仅表示该日期段的订单列表已读完，详情可在第三步补充。'}}</p>
            </details>
            <section class="results-card compact-results">
              <div v-if="!records.length" class="results-header"><h2>采集结果 <span class="count">{{records.length}}</span></h2><select v-if="tasks.length" :value="taskId" aria-label="查看历史采集任务" :disabled="busy||collectionRunning" @change="chooseTask"><option v-for="t in tasks" :key="t.id" :value="t.id">{{t.from}} 至 {{t.to}} · {{t.count}} 笔 · {{labels[t.status]}}</option></select></div>
              <div v-if="task && ['failed','needs_login'].includes(task.status)" class="task-strip" :class="task.status"><span class="dot"></span><strong>{{labels[task.status]}}</strong><span>{{task.message}}</span></div>
              <div v-if="!records.length" class="empty-state"><div class="empty-icon"><svg viewBox="0 0 72 72" fill="none"><rect x="15" y="10" width="42" height="52" rx="8" stroke="currentColor" stroke-width="2"/><path d="M26 26h20M26 36h20M26 46h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><h3>{{emptyResult?'该日期范围内没有订单':task?.status==='running'?'正在读取订单':'还没有采集订单'}}</h3><p>{{emptyResult?`${task?.from} 至 ${task?.to} 已查询完毕，请选择订单实际的下单日期后重新采集。`:task?.status==='running'?'正在按所选日期查询，请留意上方采集进度。':task?.status==='needs_login'?'请在平台页完成登录或验证，再继续采集。':task?.status==='failed'?task.message:'先点击“① 选择采集时间”，确认后点击“② 开始采集”。'}}</p><div class="empty-note">每个平台独立登录 · 原软件数据保持原样</div></div>
              <OrderTable v-else :orders="records" :platform="selected" :task-id="taskId" :busy="busy||collectionRunning" @open-order="openOrder"><template #toolbar><div class="results-heading"><select :value="taskId" :title="task?.message" aria-label="查看历史采集任务" :disabled="busy||collectionRunning" @change="chooseTask"><option v-for="t in tasks" :key="t.id" :value="t.id">{{t.from}} 至 {{t.to}} · {{t.count}} 笔 · {{labels[t.status]}}</option></select></div></template></OrderTable>
            </section>
            <ExecutionLog v-if="state?.showExecutionLog" ref="executionPanel" :platform="selected" :compact="task?.status!=='running'" />
            <div class="bottom-note">采集结果仅保存在本机，可随时重新导出。平台尚需逐一完成真实订单验收。</div>
          </template>
        </template>
        <template v-else-if="section==='history'"><div class="page-title"><div><div class="eyebrow">EXPORT HISTORY</div><h1>导出任务</h1><p>保留每次采集的结果，方便继续读取和重新导出。</p></div></div><section class="results-card"><div v-if="!state?.tasks.length" class="empty-state"><h3>暂无导出任务</h3><p>选择左侧平台开始第一次采集。</p></div><button v-for="t in state?.tasks" :key="t.id" class="history-row" @click="openTask(t)"><div><strong>{{state?.platforms.find(p=>p.id===t.platform)?.name}}</strong><span>{{t.from}} 至 {{t.to}}{{t.platform==='alibaba'?(t.mode==='official-export'?' · 官方导出':' · 普通采集'):''}}</span></div><span>{{t.count}} 笔</span><span class="tag">{{labels[t.status]}}</span><b>查看 →</b></button></section></template>
        <template v-else-if="section==='settings'">
          <div class="page-title"><div><div class="eyebrow">PREFERENCES</div><h1>保存与设置</h1><p>简单设置，方便下次继续使用。</p></div></div>
          <section class="settings-card">
            <h2>日志设置</h2>
            <div class="log-settings-group">
              <div class="logging-row"><div><h3 id="execution-log-label">显示执行日志</h3><p>{{state?.showExecutionLog?'已显示 · 在采集界面实时查看执行过程':'已隐藏 · 采集界面不显示日志面板'}}，重启后保留选择。</p></div><button role="switch" aria-labelledby="execution-log-label" :aria-checked="!!state?.showExecutionLog" :disabled="busy||!state" class="log-switch" :class="{on:state?.showExecutionLog}" @click="toggleExecutionLog"><span></span></button></div>
              <p>显示执行步骤、读取页数、订单数量及结果，支持自动滚动和复制。关闭只隐藏面板，重新打开可查看本次运行的最近记录。</p>
            </div>
            <div class="log-settings-group">
              <div class="logging-row"><div><h3 id="logging-label">问题排查日志</h3><p id="logging-description">{{state?.logging.enabled?'已开启 · 正在记录运行过程':'已关闭 · 需要排查问题时开启'}}，重启后保留选择。</p></div><button role="switch" aria-labelledby="logging-label" aria-describedby="logging-description" :aria-checked="!!state?.logging.enabled" :disabled="busy||!state" class="log-switch" :class="{on:state?.logging.enabled}" @click="toggleLogging"><span></span></button></div>
              <p>将采集进度、导出结果和异常保存在本机，不记录账号、Cookie、收货信息及订单正文。每个日志约 5 MB，保留当前和上一份；关闭后停止新增，已有日志保留。</p>
              <p v-if="state?.logging.error" class="log-error" role="alert">{{state.logging.error}}</p>
              <div class="logging-folder"><button class="secondary" :disabled="busy" @click="action(()=>desk.openLogs())">打开日志文件夹</button><span class="path" :title="state?.logging.directory">{{state?.logging.directory}}</span></div>
            </div>
          </section>
          <section class="settings-card about-card"><h2>关于</h2><p class="about-brand">电商平台采购订单导出 <span class="by">BY 五成</span></p><div class="button-row"><button class="secondary" :disabled="busy" @click="openContact">联系我们 ↗</button><button class="secondary" :disabled="busy" @click="openWebsite">访问官网 ↗</button><button class="secondary" :disabled="busy" @click="openRepository">GitHub 仓库 ↗</button></div></section>
          <UpdatePanel v-if="state?.update" :update="state.update" :business-busy="busy||exportBusy||!!state.exporting||!!state.platformRuns?.length||!!state.proxy.running||state.tasks.some(t=>t.status==='running')" @refresh="refresh" />
          <SupportAuthor />
        </template>
        <template v-else>
          <div class="page-title"><div><div class="eyebrow">GUIDE</div><h1>使用教程</h1><p>了解这个软件能做什么，以及如何导出你的订单。</p></div></div>
          <section class="settings-card"><h2>这个软件是做什么的</h2><p>电商平台采购订单导出，是在你自己的 Windows 电脑上运行的订单导出工具。它登录各电商平台的官方页面，读取你作为<strong>买家</strong>的历史订单，整理成表格导出到本地（Excel 或 CSV，可含商品图片），方便对账、归档和留底。</p><p>支持 <strong>9 个平台</strong>：淘宝/天猫、1688、拼多多、京东、闲鱼（软件内登录官方页面），以及得物、快手、饿了么、美团（微信小程序辅助采集）。</p><p>订单和登录状态<strong>只保存在这台电脑</strong>，不会上传到任何服务器。</p></section>
          <section class="settings-card"><h2>快速上手（4 步）</h2><p>先选择左侧平台，并在官方平台页面完成登录。</p><ol class="guide-steps"><li><b>① 选择采集时间</b>——选择年份、月份或下单日期，确认后返回；可选多个不连续月份。</li><li><b>② 开始采集</b>——点击后读取订单，执行日志与采集进度显示实时状态。中断后点击“② 继续采集”从断点继续，保留已有订单；更改时间则新建任务。列表完成后按钮变为“② 重置采集”，可按所选时间新建采集任务，保留历史结果。</li><li><b>③ 提取订单详情</b>——支持的平台可补充尚未读取的官方详情。</li><li><b>④ 导出文件</b>——选择格式（Excel/CSV）和保存目录，保存当前任务全部订单。清理当前平台缓存后，第二步恢复“开始采集”。</li></ol></section>
          <section class="settings-card"><h2>小程序平台（得物 / 快手 / 饿了么 / 美团）</h2><p>这几个平台需先完成一次性的证书和代理设置（软件内有详细步骤），再在微信小程序里打开对应平台的订单列表并向下翻页，软件会自动读取。</p></section>
          <section class="settings-card"><h2>常见提示</h2><ul class="guide-tips"><li>历史订单要选对日期范围；日期内没有订单会明确提示，改日期重新采集即可。</li><li>导出文件按平台分目录并带时间戳，不会覆盖旧文件。</li><li>采集结果随时可在「导出任务」里重新打开、继续或重新导出。</li><li>软件会在后台检查更新，发现新版在顶部提示；数据保存位置见「保存与设置」。</li></ul></section>
        </template>
      </div>
      <ExtractionPlan v-model="planOpen" :from="from" :to="to" :selection="collectionTime" :allow-plan="planPlatforms.includes(selected)" :busy="busy||collectionRunning" :platform-name="platform?.name||''" @confirm="confirmTime" />
    </main>
  </div>
</template>
