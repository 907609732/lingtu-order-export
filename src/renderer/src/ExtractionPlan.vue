<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {ElDialog,ElDatePicker,ElConfigProvider} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/date-picker/style/css'
import type {PlanInput,Task,DateSegment} from '../../shared/types'
import {dateSegments} from '../../core/extraction-plan'
const props=defineProps<{modelValue:boolean;from:string;to:string;task?:Task;busy:boolean;platformName:string}>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean]; start:[input:{from:string;to:string;plan:PlanInput}]; pause:[]; resume:[] }>()
const granularity=ref<'month'|'day'>('month'),range=ref<[string,string]>([props.from,props.to]),selected=ref<string[]>([]),editing=ref(true)
const key=(s:DateSegment)=>s.from+':'+s.to
const candidates=computed(()=>{try{return dateSegments(range.value?.[0],range.value?.[1],granularity.value)}catch{return []}})
const rangeError=computed(()=>{try{dateSegments(range.value?.[0],range.value?.[1],granularity.value);return ''}catch(e){return e instanceof Error?e.message:'请选择日期范围'}})
const statuses={pending:'待提取',running:'提取中',completed:'列表已完成',paused:'已暂停',needs_attention:'需要处理'}
const completed=computed(()=>props.task?.plan?.segments.filter(s=>s.status==='completed').length||0)
watch(candidates,items=>{selected.value=items.map(key)})
watch(()=>props.modelValue,open=>{if(open){editing.value=!props.task?.plan;granularity.value='month';range.value=[props.from,props.to];selected.value=candidates.value.map(key)}})
function toggle(id:string){selected.value=selected.value.includes(id)?selected.value.filter(s=>s!==id):[...selected.value,id]}
function start(){if(rangeError.value||!selected.value.length)return;emit('start',{from:range.value[0],to:range.value[1],plan:{granularity:granularity.value,segments:candidates.value.filter(s=>selected.value.includes(key(s)))}})}
</script>
<template>
 <ElConfigProvider :locale="zhCn"><ElDialog :model-value="modelValue" @update:model-value="emit('update:modelValue',$event)" :title="platformName+' · 提取计划'" width="820px" class="extraction-plan-dialog" :close-on-click-modal="false" append-to-body>
  <template v-if="editing">
   <p class="plan-note">按下单日期分批提取，所有结果合并到同一张订单表。遇到平台验证会暂停，请处理后继续。</p>
   <div class="plan-granularity"><button :class="{selected:granularity==='month'}" @click="granularity='month'">按月</button><button :class="{selected:granularity==='day'}" @click="granularity='day'">按天</button></div>
   <ElDatePicker v-model="range" type="daterange" value-format="YYYY-MM-DD" format="YYYY-MM-DD" start-placeholder="开始日期" end-placeholder="结束日期" range-separator="至" :clearable="false" />
   <p v-if="rangeError" role="alert" class="plan-error">{{rangeError}}</p>
   <div class="plan-selection-head"><span>已选择 {{selected.length}} / {{candidates.length}} 个日期段</span><button class="text-button" @click="selected=candidates.map(key)">全选</button><button class="text-button" @click="selected=[]">清空选择</button></div>
   <div class="plan-segments" aria-label="选择提取日期段"><button v-for="s in candidates" :key="key(s)" :aria-pressed="selected.includes(key(s))" :class="{selected:selected.includes(key(s))}" @click="toggle(key(s))"><strong>{{granularity==='month'?s.from.slice(0,7):s.from}}</strong><small>{{s.from===s.to?s.from:s.from+' 至 '+s.to}}</small><span>{{selected.includes(key(s))?'待提取':'未选择'}}</span></button></div>
   <p class="plan-note">按月时首尾月份仍受起止日期限制；可以取消部分日期段，不读取未选日期的订单。</p>
  </template>
  <template v-else-if="task?.plan">
   <div class="plan-progress"><strong>列表进度 {{completed}} / {{task.plan.segments.length}}</strong><span>已采集 {{task.count}} 笔</span></div>
   <p class="plan-note" role="status">{{task.message}}</p>
   <div class="plan-segments" aria-label="提取计划进度"><div v-for="s in task.plan.segments" :key="s.id" :class="s.status"><strong>{{task.plan.granularity==='month'?s.from.slice(0,7):s.from}}</strong><small>{{s.from===s.to?s.from:s.from+' 至 '+s.to}}</small><span>{{statuses[s.status]}} · {{s.count}} 笔</span></div></div>
   <p class="plan-note">绿色仅表示该日期段的列表已读完，不代表全部详情字段已获取。关闭软件后保留进度，重新打开可继续。</p>
  </template>
  <template #footer><div class="plan-footer"><button class="secondary" @click="emit('update:modelValue',false)">关闭</button><template v-if="editing"><button class="primary" :disabled="busy||!!rangeError||!selected.length" @click="start">按所选日期开始</button></template><template v-else><button class="secondary" :disabled="busy||task?.status==='running'" @click="editing=true">新建计划</button><button v-if="task?.status==='running'" class="secondary" @click="emit('pause')">暂停计划</button><button v-else-if="task?.listOutcome!=='complete'" class="primary" :disabled="busy" @click="emit('resume')">继续计划</button></template></div></template>
 </ElDialog></ElConfigProvider>
</template>
<style>
.extraction-plan-dialog{max-width:calc(100vw - 40px);border-radius:14px;--el-color-primary:#0071e3}
.plan-note{font-size:12px;color:#6e6e78;line-height:1.8;margin:8px 0 14px}
.plan-granularity{display:flex;gap:5px;margin-bottom:14px}.plan-granularity button{padding:8px 20px;background:#f3f4f7;border-radius:7px}.plan-granularity .selected{background:#eaf3ff;color:#0071e3}
.plan-selection-head,.plan-progress{display:flex;align-items:center;gap:14px;margin:14px 0;font-size:12px}.plan-progress{justify-content:space-between}
.plan-segments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:330px;overflow:auto;padding:2px}
.plan-segments>button,.plan-segments>div{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px;border:1px solid #e2e4e9;border-radius:8px;background:#fafbfd;font-size:12px;text-align:left}
.plan-segments small{font-size:10px;color:#737987}.plan-segments .selected,.plan-segments .running{background:#edf5ff;border-color:#94c2f4;color:#176abb}.plan-segments .completed{background:#f0f9f2;border-color:#afd4b8;color:#28783b}.plan-segments .paused,.plan-segments .needs_attention{background:#fff7e9;border-color:#e9c994;color:#8c601c}
.plan-footer{display:flex;justify-content:flex-end;gap:8px}.plan-error{color:#b63836;font-size:12px;margin:10px 0}
</style>
