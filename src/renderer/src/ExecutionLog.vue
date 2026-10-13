<script setup lang="ts">
import { computed,nextTick,onMounted,onUnmounted,ref,watch } from 'vue'
import type { ExecutionEntry,PlatformId } from '../../shared/types'
const props=defineProps<{platform:PlatformId}>()
const panel=ref<HTMLElement>()
defineExpose({reveal:()=>panel.value?.scrollIntoView({block:'nearest',behavior:'smooth'})})
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
  <section ref="panel" class="execution-panel" aria-label="执行日志面板">
    <div class="execution-heading"><div><h2>执行日志 <span class="execution-live">实时</span></h2><p>按时间显示执行步骤 · 最近 300 条 · 仅当前平台</p></div><div class="execution-tools"><label><input v-model="follow" type="checkbox">自动滚动</label><button class="secondary" :disabled="!entries.length" @click="copy">复制日志</button></div></div>
    <div class="execution-current"><span>当前步骤</span><strong>{{current}}</strong></div>
    <div ref="box" class="execution-console" role="log" aria-label="实时执行日志" aria-live="polite" aria-relevant="additions text" tabindex="0" @scroll="onScroll">
      <div v-if="!entries.length" class="execution-empty">等待操作…开始采集后，这里会显示读取页数、订单数量和处理结果。</div>
      <div v-for="entry in entries" :key="entry.id" class="execution-line" :class="entry.level"><time>{{time(entry.time)}}</time><span class="execution-level">{{labels[entry.level]}}</span><span>{{entry.message}}</span></div>
    </div>
    <div class="execution-footer"><span>{{hint||'界面日志保留本次运行的最近记录；需要留存时可复制，或在设置中开启文件日志。'}}</span><button v-if="!follow" class="text-button" @click="follow=true">回到最新 ↓</button></div>
  </section>
</template>

<style scoped>
.execution-panel{background:#fff;border:1px solid #dde5e2;border-radius:12px;overflow:hidden;margin:20px 0}.execution-heading{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;gap:16px}.execution-heading h2{display:flex;align-items:center;gap:10px;margin:0;font-size:15px}.execution-heading p{font-size:12px;color:#81908c;margin:6px 0 0}.execution-live{font-size:10px;font-weight:500;color:#21634f;background:#e8f3ee;padding:2px 6px;border-radius:4px}.execution-tools{display:flex;align-items:center;gap:16px;flex-shrink:0}.execution-tools label{display:flex;align-items:center;gap:6px;font-size:12px;color:#596e64}.execution-tools input{accent-color:#256650}.execution-tools button{font-size:12px;padding:8px 12px}.execution-current{display:flex;gap:12px;padding:10px 20px;background:#edf5f1;border-top:1px solid #e1eae5;font-size:12px;line-height:1.6}.execution-current>span{color:#687c72;flex-shrink:0}.execution-current strong{font-weight:500;color:#244d3d}.execution-console{height:195px;overflow:auto;background:#1e2625;color:#dce8e2;padding:14px 18px;font:12px/1.85 Consolas,'Microsoft YaHei',monospace;user-select:text;scrollbar-color:#54665f #1e2625}.execution-line{display:grid;grid-template-columns:62px 32px minmax(0,1fr);gap:10px;align-items:baseline;white-space:pre-wrap;overflow-wrap:anywhere}.execution-line time{color:#8baba0}.execution-level{color:#95bfb0}.execution-line.success .execution-level{color:#80d7ae}.execution-line.warning{color:#eacc90}.execution-line.warning .execution-level{color:#eacc90}.execution-line.error{color:#ffb4b4}.execution-line.error .execution-level{color:#ff9f9f}.execution-empty{color:#92a89f}.execution-footer{min-height:34px;padding:8px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#788b80;font-size:11px}.execution-footer button{font-size:11px;white-space:nowrap}
</style>
