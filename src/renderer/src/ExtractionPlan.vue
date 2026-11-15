<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {ElDialog,ElDatePicker,ElConfigProvider} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/date-picker/style/css'
import type {StartInput,DateSegment} from '../../shared/types'
import {dateSegments,monthCandidates} from '../../core/extraction-plan'
import {checkRange} from '../../core/values'
type CollectionTime=Omit<StartInput,'platform'>
const props=defineProps<{modelValue:boolean;from:string;to:string;selection?:CollectionTime;allowPlan:boolean;busy:boolean;platformName:string}>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean]; confirm:[input:CollectionTime] }>()
const granularity=ref<'month'|'day'>('month'),range=ref<[string,string]>([props.from,props.to]),selected=ref<string[]>([])
// Cross-year selection stays opt-in so the default single-year layout and its behaviour are unchanged.
const fromYear=ref(props.to.slice(0,4)),toYear=ref(props.to.slice(0,4)),crossYear=ref(false)
const endYear=computed(()=>crossYear.value?toYear.value:fromYear.value)
const activeRange=computed<[string,string]>(()=>granularity.value==='month'?[fromYear.value+'-01-01',endYear.value+'-12-31']:range.value)
const key=(s:DateSegment)=>s.from+':'+s.to
const candidates=computed(()=>{try{return props.allowPlan?granularity.value==='month'?monthCandidates(Number(fromYear.value),Number(endYear.value)):dateSegments(activeRange.value?.[0],activeRange.value?.[1],'day'):[]}catch{return []}})
const rangeError=computed(()=>{try{
 if(!props.allowPlan)checkRange(activeRange.value?.[0],activeRange.value?.[1])
 else if(granularity.value==='month')monthCandidates(Number(fromYear.value),Number(endYear.value))
 else dateSegments(activeRange.value?.[0],activeRange.value?.[1],'day')
 return ''
}catch(e){return e instanceof Error?e.message:'请选择日期范围'}})
watch([fromYear,crossYear],()=>{if(crossYear.value&&toYear.value<fromYear.value)toYear.value=fromYear.value})
watch(candidates,items=>{selected.value=granularity.value==='month'?[]:items.map(key)},{flush:'sync'})
watch(()=>props.modelValue,open=>{if(open){
 const input=props.selection
 range.value=[input?.from||props.from,input?.to||props.to]
 granularity.value=props.allowPlan?'month':'day'
 const parts=input?.plan?.segments||[]
 if(parts.length){const years=[...new Set(parts.map(part=>Number(part.from.slice(0,4))))].sort((a,b)=>a-b);fromYear.value=String(years[0]);toYear.value=String(years.at(-1));crossYear.value=years.length>1}
 else {fromYear.value=toYear.value=(input?.to||props.to).slice(0,4);crossYear.value=false}
 selected.value=input?.plan?candidates.value.filter(s=>input.plan!.segments.some(part=>s.from>=part.from&&s.to<=part.to)).map(key):granularity.value==='day'?candidates.value.map(key):[]
}})
function toggle(id:string){selected.value=selected.value.includes(id)?selected.value.filter(s=>s!==id):[...selected.value,id]}
function confirm(){if(props.busy||rangeError.value||(props.allowPlan&&!selected.value.length))return;emit('confirm',{from:activeRange.value[0],to:activeRange.value[1],...(props.allowPlan?{plan:{granularity:granularity.value,segments:candidates.value.filter(s=>selected.value.includes(key(s)))}}:{})})}
</script>
<template>
 <ElConfigProvider :locale="zhCn"><ElDialog :model-value="modelValue" @update:model-value="emit('update:modelValue',$event)" :title="platformName+' · 选择采集时间'" width="820px" top="6vh" class="extraction-plan-dialog" :close-on-click-modal="false" append-to-body>
   <p class="plan-note">按订单下单日期选择采集时间，确认后点击第二步开始采集。</p>
   <div v-if="allowPlan" class="plan-granularity"><button :class="{selected:granularity==='month'}" @click="granularity='month'">按月</button><button :class="{selected:granularity==='day'}" @click="granularity='day'">按天</button></div>
   <div v-if="granularity==='month'" class="plan-year"><label for="plan-year">年份</label><ElDatePicker id="plan-year" v-model="fromYear" type="year" value-format="YYYY" format="YYYY 年" placeholder="选择年份" :clearable="false" /><label class="cross-year"><input v-model="crossYear" type="checkbox"> 跨年多选</label><template v-if="crossYear"><span>至</span><ElDatePicker id="plan-end-year" v-model="toYear" type="year" value-format="YYYY" format="YYYY 年" placeholder="结束年份" :clearable="false" /></template><span>{{crossYear?'请选择要采集的月份，可跨年多选':'请选择要采集的月份，可多选'}}</span></div>
   <div v-else class="plan-date-range"><label>开始日期<input v-model="range[0]" type="date" :max="range[1]"></label><span>至</span><label>结束日期<input v-model="range[1]" type="date" :min="range[0]"></label></div>
   <p v-if="rangeError" role="alert" class="plan-error">{{rangeError}}</p>
   <template v-if="allowPlan">
    <div class="plan-selection-head"><span>已选择 {{selected.length}} / {{candidates.length}} {{granularity==='month'?'个月':'个日期段'}}</span><button class="text-button" @click="selected=candidates.map(key)">全选</button><button class="text-button" @click="selected=[]">清空选择</button></div>
    <div class="plan-segments" :class="{'plan-months':granularity==='month'}" aria-label="选择采集日期段"><button v-for="s in candidates" :key="key(s)" :aria-pressed="selected.includes(key(s))" :class="{selected:selected.includes(key(s))}" @click="toggle(key(s))"><strong>{{granularity==='month'?Number(s.from.slice(5,7))+' 月':s.from}}</strong><small>{{s.from===s.to?s.from:s.from+' 至 '+s.to}}</small><span>{{selected.includes(key(s))?'已选择':'未选择'}}</span></button></div>
    <p class="plan-note">{{granularity==='month'?'按完整月份采集，仅采集已选月份的订单。':'仅采集已选日期段的订单。'}}</p>
   </template>
   <p v-else class="plan-note">辅助采集按所选连续日期范围筛选订单。</p>
  <template #footer><div class="plan-footer"><button class="secondary" @click="emit('update:modelValue',false)">取消</button><button class="primary" :disabled="busy||!!rangeError||(allowPlan&&!selected.length)" @click="confirm">确认采集时间</button></div></template>
 </ElDialog></ElConfigProvider>
</template>
<style>
.extraction-plan-dialog{max-width:calc(100vw - 40px);border-radius:14px;--el-color-primary:#0071e3}
.plan-note{font-size:12px;color:#6e6e78;line-height:1.8;margin:8px 0 14px}
.plan-granularity{display:flex;gap:5px;margin-bottom:14px}.plan-granularity button{padding:8px 20px;background:#f3f4f7;border-radius:7px}.plan-granularity .selected{background:#eaf3ff;color:#0071e3}
.plan-selection-head,.plan-progress{display:flex;align-items:center;gap:14px;margin:14px 0;font-size:12px}.plan-progress{justify-content:space-between}
.plan-segments{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:330px;overflow:auto;padding:2px}
.plan-segments>button,.plan-segments>div{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px;border:1px solid #e2e4e9;border-radius:8px;background:#fafbfd;font-size:12px;text-align:left}
.plan-year{display:flex;align-items:center;gap:12px;font-size:12px}.plan-year .el-date-editor{width:150px}.plan-year>span{color:#6e6e78}.plan-year .cross-year{display:flex;align-items:center;gap:5px;color:#6e6e78;cursor:pointer}.plan-year .cross-year input{accent-color:#0071e3}
.plan-months{grid-template-columns:repeat(4,minmax(0,1fr));max-height:none;overflow:visible}.plan-months>button{padding:10px}.plan-months strong{font-size:15px}.plan-segments>button:focus-visible{outline:2px solid #0071e3;outline-offset:2px}
.plan-segments small{font-size:10px;color:#737987}.plan-segments .selected,.plan-segments .running{background:#edf5ff;border-color:#94c2f4;color:#176abb}.plan-segments .completed{background:#f0f9f2;border-color:#afd4b8;color:#28783b}.plan-segments .paused,.plan-segments .needs_attention{background:#fff7e9;border-color:#e9c994;color:#8c601c}
.plan-footer{display:flex;justify-content:flex-end;gap:8px}.plan-error{color:#b63836;font-size:12px;margin:10px 0}
</style>
