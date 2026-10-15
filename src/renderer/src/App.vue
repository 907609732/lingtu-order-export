<script setup lang="ts">
import { computed,nextTick,onMounted,onUnmounted,ref } from 'vue'
import type { AppState,Order,PlatformId,Task } from '../../shared/types'
import ExecutionLog from './ExecutionLog.vue'
import OrderTable from './OrderTable.vue'
import {Clock,QuestionFilled,Setting,Lock} from '@element-plus/icons-vue'
import logoUrl from './assets/logo-icon.png'
const desk = window.desk
const executionPanel=ref<InstanceType<typeof ExecutionLog>>()
const state=ref<AppState|null>(null), selected=ref<PlatformId>('taobao'), taskId=ref(''), records=ref<Order[]>([])
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const from=ref(today.slice(0,7)+'-01'),to=ref(today),format=ref<'xlsx'|'csv'>('xlsx'),images=ref(true),busy=ref(false),pageOpen=ref(false),section=ref<'export'|'history'|'settings'|'help'>('export'),query=ref(''),page=ref(1),notice=ref(''),error=ref(false)
const platform=computed(()=>state.value?.platforms.find(p=>p.id===selected.value))
const tasks=computed(()=>state.value?.tasks.filter(t=>t.platform===selected.value)||[])
const task=computed(()=>state.value?.tasks.find(t=>t.id===taskId.value))
const emptyResult=computed(()=>task.value?.status==='completed'&&task.value.count===0)
const filtered=computed(()=>records.value.filter(o=>(o.id+' '+o.shop+' '+o.items.map(i=>i.title).join(' ')).includes(query.value)))
const shown=computed(()=>filtered.value.slice((page.value-1)*30,page.value*30))
const missing=computed(()=>records.value.filter(o=>o.missing.length).length)
const labels:Record<string,string>={running:'正在采集',paused:'已暂停',needs_login:'需要登录 / 验证',partial:'已有结果 · 待核对',completed:'读取完成',failed:'需要处理'}
let off:(()=>void)|undefined;let offUpdate:(()=>void)|undefined;let refreshPending=false
async function refresh(){state.value=await desk.state();if(taskId.value)records.value=await desk.orders(taskId.value)}
async function action(fn:()=>Promise<unknown>,message=''){busy.value=true;notice.value='';error.value=false;try{await fn();if(message)notice.value=message;await refresh()}catch(e){notice.value=String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,'');error.value=true}finally{busy.value=false}}
async function selectPlatform(id:PlatformId){if(state.value?.tasks.some(t=>t.status==='running'&&t.platform!==id)){notice.value='请先暂停当前平台的采集任务，再切换平台';error.value=true;return}await desk.hidePage();pageOpen.value=false;selected.value=id;section.value='export';const latest=state.value?.tasks.find(t=>t.platform===id);taskId.value=latest?.id||'';if(latest){from.value=latest.from;to.value=latest.to}query.value='';page.value=1;records.value=taskId.value?await desk.orders(taskId.value):[]}
async function clearPlatform(){const id=selected.value,name=platform.value?.name;await action(async()=>{if(await desk.clear(id)){if(selected.value===id){taskId.value='';records.value=[];query.value='';page.value=1}notice.value=`已清理 ${name} 的本机采集缓存，已导出的文件保留。`}})}
async function openPage(){await action(async()=>{await desk.login(selected.value);pageOpen.value=true})}
async function hidePage(){await desk.hidePage();pageOpen.value=false}
async function start(){await action(async()=>{const t=await desk.start({platform:selected.value,from:from.value,to:to.value});taskId.value=t.id;page.value=1;await nextTick();executionPanel.value?.reveal()})}
async function enrich(){await action(async()=>{await desk.enrichDetails(taskId.value);await nextTick();executionPanel.value?.reveal()})}
async function openOrder(orderId:string){await action(async()=>{await desk.openOrder(taskId.value,orderId);pageOpen.value=true})}
async function chooseTask(event:Event){const id=(event.target as HTMLSelectElement).value,t=tasks.value.find(t=>t.id===id);if(t)await openTask(t)}
async function exportFile(){await action(async()=>{if(!state.value?.outputDir){await hidePage();await desk.chooseDirectory()};await nextTick();executionPanel.value?.reveal();const r=await desk.export({taskId:taskId.value,format:format.value,images:images.value});notice.value=`已导出 ${r.count} 笔订单${r.missing?`，附 ${r.missing} 项核对说明`:''}。文件已保存到所选目录。`})}
async function choose(){await hidePage();await action(()=>desk.chooseDirectory())}
async function toggleLogging(){const enabled=!state.value?.logging.enabled;await action(()=>desk.setLogging(enabled),enabled?'问题排查日志已开启，复现问题后可打开日志文件夹查看。':'问题排查日志已关闭，已有日志仍保留在本机。')}
async function toggleExecutionLog(){const visible=!state.value?.showExecutionLog;await action(()=>desk.setExecutionLogVisible(visible),visible?'执行日志已显示，回到采集页面即可查看。':'执行日志面板已隐藏，重启后保留选择。')}
async function navigate(s:'export'|'history'|'settings'|'help'){await hidePage();section.value=s}
async function openTask(t:Task){selected.value=t.platform;taskId.value=t.id;from.value=t.from;to.value=t.to;section.value='export';page.value=1;await refresh()}
async function checkUpdate(){await action(async()=>{const info=await desk.checkUpdate();notice.value=info?`发现新版本 v${info.latest}，可前往下载。`:'当前已是最新版本。'})}
function openUpdate(){void desk.openUpdate()}
function openWebsite(){void desk.openWebsite()}
onMounted(async()=>{await action(async()=>{await refresh();const latest=tasks.value[0];if(latest)await openTask(latest)});off=desk.onChange(()=>{if(refreshPending)return;refreshPending=true;setTimeout(()=>{refreshPending=false;void refresh()},250)});offUpdate=desk.onUpdate(()=>{void refresh()})})
onUnmounted(()=>{off?.();offUpdate?.()})
</script>

<template>
  <div class="app-shell" :class="{'data-workspace':section==='export'}">
    <aside class="sidebar">
      <div class="brand"><img class="brand-logo" :src="logoUrl" alt="灵兔 Logo" /><div><strong>灵兔 <span>AI</span></strong><small>电商订单工作台</small></div></div>
      <div class="nav-label">购物平台 <span>{{ state?.platforms.length || 9 }}</span></div>
      <nav><button v-for="p in state?.platforms" :key="p.id" class="platform" :class="{ selected:p.id===selected && section==='export' }" @click="selectPlatform(p.id)"><i :style="{color:p.color,background:p.color+'13'}">{{p.icon}}</i><span>{{p.name}}</span><b v-if="p.id===selected && section==='export'">›</b></button></nav>
      <div class="side-bottom"><button :class="{active:section==='history'}" @click="navigate('history')"><Clock aria-hidden="true"/><span>导出任务</span><small>{{state?.tasks.length||0}}</small></button><button :class="{active:section==='help'}" @click="navigate('help')"><QuestionFilled aria-hidden="true"/><span>使用教程</span></button><button :class="{active:section==='settings'}" @click="navigate('settings')"><Setting aria-hidden="true"/><span>保存与设置</span></button><div class="local-badge"><Lock aria-hidden="true"/> 数据保存在这台电脑</div></div>
    </aside>
    <main>
      <header class="topbar"><div class="breadcrumb">个人工作台 <span>/</span> {{section==='history'?'导出任务':section==='settings'?'保存与设置':section==='help'?'使用教程':platform?.name}}</div><div class="version">本机版 <span>v{{state?.version||'0.1.0'}}</span><a v-if="state?.update" class="update-link" href="#" @click.prevent="openUpdate">新版本 v{{state.update.latest}} ↗</a></div></header>
      <div class="content" :class="section">
        <div v-if="notice" class="notice" :class="{error}">{{notice}}<button @click="notice=''">×</button></div>
        <template v-if="section==='export'">
          <div class="page-title"><div><div class="eyebrow">ORDER EXPORT</div><h1>{{platform?.name}}订单导出</h1><p>选择日期，读取买家订单，再保存到你的电脑。</p></div><div class="button-row"><button v-if="!pageOpen" class="secondary danger" :disabled="busy||!state||state.tasks.some(t=>t.status==='running')" :title="`清理 ${platform?.name} 的本机任务和订单记录，不删除已导出文件`" @click="clearPlatform">清理当前平台缓存</button><button class="secondary" @click="pageOpen?hidePage():openPage()" :disabled="busy">{{pageOpen?'返回导出台':platform?.mode==='proxy'?'打开平台页面':'登录 / 查看平台页'}}</button></div></div>
          <div v-if="pageOpen" class="browser-placeholder"><p>请在下方的官方平台页面完成登录。完成后点击右上角“返回导出台”。</p></div>
          <template v-else>
            <section v-if="platform?.mode==='proxy'" class="proxy-guide">
              <div><strong>微信小程序辅助采集</strong><span class="tag">{{state?.proxy.running?'监听已开启':'需要首次设置'}}</span><p>沿用综合版的本机采集方式。开启后在微信中打开对应平台的买家订单列表，已读取的订单会出现在这里。</p></div>
              <div class="button-row"><button class="secondary" :disabled="busy" @click="action(()=>desk.proxyStart(selected),'本机监听已开启，地址 127.0.0.1:17869。请完成下方证书与代理设置。')">开启辅助采集</button><button class="text-button" :disabled="!state?.proxy.running" @click="action(()=>desk.certificate())">打开本机证书</button><button class="text-button" @click="action(()=>desk.proxySettings())">打开代理设置</button></div>
              <details><summary>首次设置步骤与停止方式</summary><ol><li>开启辅助采集后，打开证书，在 Windows 中手动将其导入当前用户的受信任根证书。仅用于本机采集。</li><li>记下原来的代理设置，将手动代理临时设为 <code>127.0.0.1:17869</code>。当前程序尚不自动改动系统设置。</li><li>点击下方“开始采集”，再打开对应微信小程序的订单列表并向下翻页。</li><li>结束后先恢复原来的系统代理设置，再停止辅助采集或退出软件。</li></ol><button class="text-button" @click="action(()=>desk.proxyStop(),'本机监听已停止，请确认系统代理已恢复。')">停止辅助采集</button></details>
            </section>
            <section class="config-card compact-controls" aria-label="采集与导出操作">
              <div class="form-row"><label>开始日期<input v-model="from" type="date" :max="to"></label><span class="range-dash">—</span><label>结束日期<input v-model="to" type="date" :min="from"></label><div class="quick-date"><button @click="from=today.slice(0,7)+'-01';to=today">本月</button><button @click="from=today.slice(0,4)+'-01-01';to=today">今年</button></div><div class="collection-actions"><button v-if="task?.status!=='running'" class="primary start" :disabled="busy" @click="start">开始采集</button><button class="secondary" v-if="task && task.status==='running'" @click="action(()=>desk.pause(taskId))">暂停</button><button class="secondary" v-if="task && ['paused','needs_login','failed'].includes(task.status)" @click="action(()=>desk.resume(taskId))">继续采集</button><button class="text-button" v-if="task && task.status==='partial'" :disabled="busy" @click="action(()=>desk.retry(taskId))">重试采集</button><button v-if="selected==='taobao'" class="secondary" :disabled="!records.length||busy||task?.status==='running'" @click="enrich">提取订单详情</button><button class="primary" :disabled="!records.length||busy||task?.status==='running'" title="导出本任务全部订单，表格筛选不改变导出范围" @click="exportFile">{{busy?'处理中…':'导出文件'}} ↓</button><button v-if="task?.status==='running'" class="text-button" @click="action(()=>desk.finish(taskId))">结束读取</button><details class="export-options"><summary>导出设置 ▾</summary><div class="export-options-panel"><label class="inline-label">文件格式<select v-model="format"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select></label><label class="checkbox"><input v-model="images" type="checkbox" :disabled="format==='csv'">嵌入商品图片</label><button class="text-button" @click="choose">{{state?.outputDir?'更改保存目录':'选择保存目录'}} ↗</button><p :title="state?.outputDir">{{state?.outputDir||'首次导出时选择保存目录'}}</p></div></details></div></div>
            </section>
            <section class="results-card compact-results">
              <div v-if="!records.length" class="results-header"><h2>采集结果 <span class="count">{{records.length}}</span></h2><select v-if="tasks.length" :value="taskId" aria-label="查看历史采集任务" :disabled="busy||task?.status==='running'" @change="chooseTask"><option v-for="t in tasks" :key="t.id" :value="t.id">{{t.from}} 至 {{t.to}} · {{t.count}} 笔 · {{labels[t.status]}}</option></select></div>
              <div v-if="task && ['failed','needs_login'].includes(task.status)" class="task-strip" :class="task.status"><span class="dot"></span><strong>{{labels[task.status]}}</strong><span>{{task.message}}</span></div>
              <div v-if="!records.length" class="empty-state"><div class="empty-icon"><svg viewBox="0 0 72 72" fill="none"><rect x="15" y="10" width="42" height="52" rx="8" stroke="currentColor" stroke-width="2"/><path d="M26 26h20M26 36h20M26 46h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div><h3>{{emptyResult?'该日期范围内没有订单':task?.status==='running'?'正在读取订单':'还没有采集订单'}}</h3><p>{{emptyResult?`${task?.from} 至 ${task?.to} 已查询完毕，请选择订单实际的下单日期后重新采集。`:task?.status==='running'?'正在按所选日期查询，请留意上方执行日志。':task?.status==='needs_login'?'请在平台页完成登录或验证，再继续采集。':task?.status==='failed'?task.message:'选择订单下单日期后点击“开始采集”。'}}</p><div class="empty-note">每个平台独立登录 · 原软件数据保持原样</div></div>
              <OrderTable v-else :orders="records" :platform="selected" :task-id="taskId" :busy="busy||task?.status==='running'" @open-order="openOrder"><template #toolbar><div class="results-heading"><select :value="taskId" :title="task?.message" aria-label="查看历史采集任务" :disabled="busy||task?.status==='running'" @change="chooseTask"><option v-for="t in tasks" :key="t.id" :value="t.id">{{t.from}} 至 {{t.to}} · {{t.count}} 笔 · {{labels[t.status]}}</option></select></div></template></OrderTable>
            </section>
            <ExecutionLog v-if="state?.showExecutionLog" ref="executionPanel" :platform="selected" :compact="task?.status!=='running'" />
            <div class="bottom-note">采集结果仅保存在本机，可随时重新导出。平台尚需逐一完成真实订单验收。</div>
          </template>
        </template>
        <template v-else-if="section==='history'"><div class="page-title"><div><div class="eyebrow">EXPORT HISTORY</div><h1>导出任务</h1><p>保留每次采集的结果，方便继续读取和重新导出。</p></div></div><section class="results-card"><div v-if="!state?.tasks.length" class="empty-state"><h3>暂无导出任务</h3><p>选择左侧平台开始第一次采集。</p></div><button v-for="t in state?.tasks" :key="t.id" class="history-row" @click="openTask(t)"><div><strong>{{state?.platforms.find(p=>p.id===t.platform)?.name}}</strong><span>{{t.from}} 至 {{t.to}}</span></div><span>{{t.count}} 笔</span><span class="tag">{{labels[t.status]}}</span><b>查看 →</b></button></section></template>
        <template v-else-if="section==='settings'">
          <div class="page-title"><div><div class="eyebrow">PREFERENCES</div><h1>保存与设置</h1><p>简单设置，方便下次继续使用。</p></div></div>
          <section class="settings-card">
            <div class="logging-row"><div><h2 id="execution-log-label">显示执行日志</h2><p>{{state?.showExecutionLog?'已显示 · 在采集界面实时查看执行过程':'已隐藏 · 采集界面不显示日志面板'}}，重启后保留选择。</p></div><button role="switch" aria-labelledby="execution-log-label" :aria-checked="!!state?.showExecutionLog" :disabled="busy||!state" class="log-switch" :class="{on:state?.showExecutionLog}" @click="toggleExecutionLog"><span></span></button></div>
            <p>显示正在执行的步骤、读取页数、订单数量及成功或失败提示。支持自动滚动和复制日志。</p>
            <p>关闭只隐藏面板；重新打开可查看本次运行的最近记录。需要将日志保存到文件时，开启下方的问题排查日志。</p>
          </section>
          <section class="settings-card">
            <div class="logging-row"><div><h2 id="logging-label">问题排查日志</h2><p id="logging-description">{{state?.logging.enabled?'已开启 · 正在记录运行过程':'已关闭 · 需要排查问题时开启'}}，重启后保留选择。</p></div><button role="switch" aria-labelledby="logging-label" aria-describedby="logging-description" :aria-checked="!!state?.logging.enabled" :disabled="busy||!state" class="log-switch" :class="{on:state?.logging.enabled}" @click="toggleLogging"><span></span></button></div>
            <p>记录采集进度、导出结果和异常。日志仅存本机，不记录账号、Cookie、收货信息及订单正文。</p>
            <p>每个日志约 5 MB，自动保留当前和上一份。关闭后停止新增，已有日志保留。</p>
            <p v-if="state?.logging.error" class="log-error" role="alert">{{state.logging.error}}</p>
            <div class="logging-folder"><button class="secondary" :disabled="busy" @click="action(()=>desk.openLogs())">打开日志文件夹</button><span class="path" :title="state?.logging.directory">{{state?.logging.directory}}</span></div>
          </section>
          <section class="settings-card"><h2>导出文件夹</h2><p class="path">{{state?.outputDir||'还未选择，首次导出前设置即可'}}</p><div class="button-row"><button class="primary" @click="choose">选择文件夹</button><button class="secondary" :disabled="!state?.outputDir" @click="action(()=>desk.openOutput())">打开文件夹</button></div></section>
          <section class="settings-card"><h2>当前验证状态</h2><p>开发验证版。程序安装、样例解析和文件生成，与真实平台采集验收分别记录。请先使用短日期范围核对订单。</p></section>
          <section class="settings-card about-card"><h2>关于</h2><p class="about-brand">灵兔 AI 电商平台买家订单导出工具 <span class="by">BY 五成</span></p><div class="button-row"><button class="secondary" :disabled="busy" @click="openWebsite">访问官网 ↗</button><button class="secondary" :disabled="busy" @click="checkUpdate">检查更新</button></div><p v-if="state?.update" class="update-tip">发现新版本 v{{state.update.latest}}，<a href="#" @click.prevent="openUpdate">前往下载</a></p></section>
        </template>
        <template v-else>
          <div class="page-title"><div><div class="eyebrow">GUIDE</div><h1>使用教程</h1><p>了解这个软件能做什么，以及如何导出你的订单。</p></div></div>
          <section class="settings-card"><h2>这个软件是做什么的</h2><p>灵兔 AI 电商平台买家订单导出工具，是在你自己的 Windows 电脑上运行的订单导出工具。它登录各电商平台的官方页面，读取你作为<strong>买家</strong>的历史订单，整理成表格导出到本地（Excel 或 CSV，可含商品图片），方便对账、归档和留底。</p><p>支持 <strong>9 个平台</strong>：淘宝/天猫、1688、拼多多、京东、闲鱼（软件内登录官方页面），以及得物、快手、饿了么、美团（微信小程序辅助采集）。</p><p>订单和登录状态<strong>只保存在这台电脑</strong>，不会上传到任何服务器。</p></section>
          <section class="settings-card"><h2>快速上手（4 步）</h2><ol class="guide-steps"><li><b>选择平台并登录</b>——点左侧平台，再点右上角「登录 / 查看平台页」，在官方页面完成登录后返回。</li><li><b>选择日期范围</b>——按订单的下单时间设置起止日期，或用「本月」「今年」快捷按钮。</li><li><b>开始采集</b>——点「开始采集」，软件按页读取订单，下方「执行日志」显示实时进度。</li><li><b>导出文件</b>——采集完成后点「导出文件」，选择格式（Excel/CSV）和保存目录即可。</li></ol></section>
          <section class="settings-card"><h2>小程序平台（得物 / 快手 / 饿了么 / 美团）</h2><p>这几个平台需先完成一次性的证书和代理设置（软件内有详细步骤），再在微信小程序里打开对应平台的订单列表并向下翻页，软件会自动读取。</p></section>
          <section class="settings-card"><h2>常见提示</h2><ul class="guide-tips"><li>历史订单要选对日期范围；日期内没有订单会明确提示，改日期重新采集即可。</li><li>导出文件按平台分目录并带时间戳，不会覆盖旧文件。</li><li>采集结果随时可在「导出任务」里重新打开、继续或重新导出。</li><li>软件会在后台检查更新，发现新版在顶部提示；数据保存位置见「保存与设置」。</li></ul></section>
        </template>
      </div>
    </main>
  </div>
</template>
