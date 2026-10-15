<script setup lang="ts">
import { computed,nextTick,onMounted,onUnmounted,ref,watch } from 'vue'
import type { ExecutionEntry,PlatformId } from '../../shared/types'
const props=defineProps<{platform:PlatformId;compact?:boolean}>()
const collapsed=ref(!!props.compact)
const panel=ref<HTMLElement>()
defineExpose({reveal:()=>{collapsed.value=false;void nextTick(()=>panel.value?.scrollIntoView({block:'nearest',behavior:'smooth'}))}})
watch(()=>props.compact,value=>{collapsed.value=!!value})
const entries=ref<ExecutionEntry[]>([]),follow=ref(true),box=ref<HTMLElement>(),hint=ref('')
const labels={info:'进行',success:'成功',warning:'提示',error:'错误'}
const current=computed(()=>entries.value.at(-1)?.message||'等待操作…')
const time=(value:string)=>new Date(value).toLocaleTimeString('zh-CN',{hour12:false})
let off:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>|undefined,request=0,disposed=false
async function scrollToLatest(){await nextTick();if(box.value)box.value.scrollTop=box.value.scrollHeight}
async function refresh(){const id=++request,platform=props.platform;try{const result=await window.desk.executionLogs(platform);if(disposed||id!==request||platform!==props.platform)return;entries.value=result;if(follow.value)await scrollToLatest()}catch{if(!disposed)hint.value='暂时无法读取执行日志，请重新打开此页面。'}}
function changed(){if(timer)return;timer=setTimeout(()=>{timer=undefined;void refresh()},80)}
function onScroll(){if(box.value&&box.value.scrollHeight-box.value.scrollTop-box.value.clientHeight>28)follow.value=false}
async function copy(){try{await navigator.clipboard.writeText(entries.value.map(e=>`[${time(e.time)}] [${labels[e.level]}] ${e.message}`).join('\n'));hint.value='已复制当前平台的执行日志'}catch{hint.value='复制失败，请选中日志文字后复制。'}}
watch(()=>props.platform,()=>{entries.value=[];hint.value='';follow.value=true;void refresh()})
watch(follow,value=>{if(value)void scrollToLatest()})
onMounted(()=>{off=window.desk.onExecutionLog(changed);void refresh()})
onUnmounted(()=>{disposed=true;off?.();if(timer)clearTimeout(timer)})
</script>

<template>
  <section ref="panel" class="execution-panel" :class="{collapsed}" aria-label="执行日志面板">
    <div class="execution-heading"><div><h2>执行日志 <span class="execution-live">实时</span></h2><p>按时间显示执行步骤 · 最近 300 条 · 仅当前平台</p></div><div class="execution-tools"><label><input v-model="follow" type="checkbox">自动滚动</label><button class="secondary" :disabled="!entries.length" @click="copy">复制日志</button></div></div>
    <div class="execution-current"><span>当前步骤</span><strong>{{current}}</strong><button class="text-button" :aria-expanded="!collapsed" @click="collapsed=!collapsed">{{collapsed?'展开日志 ▾':'收起日志 ▴'}}</button></div>
    <div v-show="!collapsed" ref="box" class="execution-console" role="log" aria-label="实时执行日志" aria-live="polite" aria-relevant="additions text" tabindex="0" @scroll="onScroll">
      <div v-if="!entries.length" class="execution-empty">等待操作…开始采集后，这里会显示读取页数、订单数量和处理结果。</div>
      <div v-for="entry in entries" :key="entry.id" class="execution-line" :class="entry.level"><time>{{time(entry.time)}}</time><span class="execution-level">{{labels[entry.level]}}</span><span>{{entry.message}}</span></div>
    </div>
    <div v-show="!collapsed||hint" class="execution-footer"><span>{{hint||'界面日志保留本次运行的最近记录；需要留存时可复制，或在设置中开启文件日志。'}}</span><button v-if="!follow" class="text-button" @click="follow=true">回到最新 ↓</button></div>
  </section>
</template>

<style scoped>
.execution-panel{background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:12px 0;box-shadow:var(--card-shadow)}
.execution-heading{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;gap:16px}
.execution-heading h2{display:flex;align-items:center;gap:8px;margin:0;font-size:12px}
.execution-heading p{font-size:11px;color:var(--muted);margin:5px 0 0}
.execution-live{font-size:9px;font-weight:500;color:#4880bd;background:#eef5ff;padding:2px 5px;border-radius:4px}
.execution-tools{display:flex;align-items:center;gap:14px;flex-shrink:0}
.execution-tools label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--secondary)}
.execution-tools input{accent-color:var(--accent)}
.execution-tools button{font-size:11px;padding:6px 9px}
.execution-current{display:flex;align-items:center;gap:10px;padding:9px 16px;background:#f4f8fe;border-top:1px solid #e8eff8;font-size:11px;line-height:1.6}
.execution-current>span{color:#64758b;flex-shrink:0}
.execution-current strong{flex:1;min-width:0;font-weight:400;color:#3f536d}
.execution-current .text-button{padding:0;white-space:nowrap}
.execution-console{height:160px;overflow:auto;background:#fbfcfe;color:#4e596c;padding:12px 16px;font:11px/1.9 'Cascadia Mono',Consolas,'Microsoft YaHei',monospace;user-select:text;scrollbar-color:#bcc6d6 #fbfcfe}
.execution-line{display:grid;grid-template-columns:60px 30px minmax(0,1fr);gap:10px;align-items:baseline;white-space:pre-wrap;overflow-wrap:anywhere}
.execution-line time{color:#7a8598}
.execution-level{color:#4279b9}
.execution-line.success .execution-level{color:var(--success)}
.execution-line.warning,.execution-line.warning .execution-level{color:#986414}
.execution-line.error,.execution-line.error .execution-level{color:#b63836}
.execution-empty{color:var(--muted)}
.execution-footer{min-height:32px;padding:8px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted);font-size:10px;border-top:1px solid var(--line-soft)}
.execution-footer button{font-size:10px;white-space:nowrap}
.execution-panel.collapsed{display:flex;align-items:center;gap:10px;background:#f9fafc;box-shadow:none}
.collapsed .execution-heading{padding:10px 14px;gap:10px;flex-shrink:0}
.collapsed .execution-heading p,.collapsed .execution-tools,.collapsed .execution-footer{display:none}
.collapsed .execution-current{border:0;background:none;padding:10px 14px 10px 0;flex:1;min-width:0;font-size:11px}
.collapsed .execution-current>span{display:none}
.collapsed .execution-current strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1450px){.collapsed .execution-live{display:none}}
</style>
