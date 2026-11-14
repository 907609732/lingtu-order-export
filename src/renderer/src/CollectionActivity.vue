<script setup lang="ts">
import {computed} from 'vue'
import {Loading,WarningFilled} from '@element-plus/icons-vue'
import type {Task} from '../../shared/types'
const props=defineProps<{task:Task;pendingDetails:number;resumeGuidance?:string}>()
const official=computed(()=>props.task.mode==='official-export')
const officialPhase=computed(()=>({search:'按月份查询订单',submit:'申请官方报表',waiting:'等待官方生成报表',download:'下载官方报表',import:'导入并自动核对',complete:'官方报表处理完成'}[props.task.officialExport?.phase||'search']))
const running=computed(()=>props.task.status==='running')
const details=computed(()=>(props.task.activityPhase||props.task.operation)==='details')
const title=computed(()=>official.value?(props.task.status==='needs_login'?'需要登录 / 验证':running.value?officialPhase.value:props.task.status==='completed'?'官方报表处理完成':'官方导出已暂停'):running.value?(details.value?'正在提取订单详情':'正在采集订单'):({paused:'采集已暂停',needs_login:'需要登录 / 验证',failed:'采集遇到问题',partial:details.value?'订单详情提取未完成':'采集未完成',running:'正在采集订单',completed:'采集完成'}[props.task.status]||'采集进度'))
</script>

<template>
  <section class="collection-activity" :class="{running,attention:!running}" role="status" aria-label="采集活动" :aria-busy="running">
    <component :is="running?Loading:WarningFilled" class="activity-icon" aria-hidden="true" />
    <div class="activity-copy"><strong>{{title}}</strong><p v-if="official">{{officialPhase}}</p><p>{{task.message}}</p><p v-if="!running&&resumeGuidance">{{resumeGuidance}}</p></div>
    <div class="activity-counts"><strong>{{official?'已导入':'已采集'}} {{task.count}} 笔</strong><span v-if="official">{{task.officialExport?.phase==='complete'?'核对结果见下方':'按官方页面实际阶段更新'}}</span><span v-else-if="details">待提取详情 {{pendingDetails}} 笔</span><template v-else><span>本轮已读取 {{task.pages}} 页</span><span v-if="task.plan">计划 {{task.plan.segments.filter(s=>s.status==='completed').length}} / {{task.plan.segments.length}} 段</span></template></div>
  </section>
</template>

<style scoped>
.collection-activity{display:flex;align-items:center;gap:12px;min-height:72px;box-sizing:border-box;padding:12px 16px;margin-bottom:12px;border:1px solid #cee1fb;border-radius:10px;background:var(--accent-soft);color:var(--accent);min-width:0}
.activity-icon{width:24px;height:24px;flex:none}
.running .activity-icon{animation:collection-spin 1.2s linear infinite}
.activity-copy{flex:1;min-width:0}.activity-copy strong{font-size:14px;font-weight:600}.activity-copy p{font-size:11px;line-height:1.5;margin:4px 0 0;color:var(--secondary);overflow-wrap:anywhere}
.activity-counts{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:4px 12px;max-width:40%;font-size:11px}.activity-counts strong{font-size:12px;font-weight:600}.activity-counts>*{white-space:nowrap}.attention{color:#94621e;border-color:#eedbb6;background:#fff9ec}
@keyframes collection-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.running .activity-icon{animation:none}}
</style>

