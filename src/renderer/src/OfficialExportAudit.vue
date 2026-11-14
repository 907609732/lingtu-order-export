<script setup lang="ts">
import type {AlibabaOfficialAudit} from '../../shared/types'
defineProps<{audit:AlibabaOfficialAudit;expanded:boolean}>()
defineEmits<{toggle:[]}>()
</script>
<template>
 <section class="official-audit" aria-label="官方报表核对结果">
  <div class="audit-heading"><strong>官方报表核对</strong><span :class="['audit-scope',{verified:audit.scopeVerified}]">{{audit.scopeVerified?'范围已核实':'范围完整性未核实'}}</span><button class="text-button" :aria-expanded="expanded" @click="$emit('toggle')">{{expanded?'收起明细':'查看核对明细'}}</button></div>
  <p class="audit-summary">报表 {{audit.rows}} 行 · 唯一订单 {{audit.uniqueOrders}} 笔 · 已导入 {{audit.importedOrders}} 笔</p>
  <p v-if="!audit.scopeVerified" class="audit-note">未取得可核实的官网总数，不能确认所选月份的订单已全部导出。</p>
  <div v-if="expanded" class="audit-details">
   <dl><div><dt>范围外记录</dt><dd>{{audit.outOfRange}}</dd></div><div><dt>账号不符</dt><dd>{{audit.accountMismatch}}</dd></div><div><dt>重复记录</dt><dd>{{audit.duplicates}}</dd></div><div><dt>字段冲突</dt><dd>{{audit.conflicts.length}}</dd></div><div><dt>缺项</dt><dd>{{audit.missing}}</dd></div></dl>
   <ul v-if="audit.warnings.length"><li v-for="(warning,index) in audit.warnings" :key="index">{{warning}}</li></ul>
   <ul v-if="audit.conflicts.length"><li v-for="(conflict,index) in audit.conflicts" :key="index">订单 {{conflict.orderId}} · {{conflict.field}}：{{conflict.values.join(' / ')}}</li></ul>
   <p>核对异常保留在当前任务中，不会自动转为普通采集补采。</p>
  </div>
 </section>
</template>
<style scoped>
.official-audit{border:1px solid #e2e7ef;border-radius:10px;background:#fff;padding:12px 16px;margin-bottom:12px;font-size:12px;color:var(--secondary)}.audit-heading{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.audit-heading strong{color:var(--text);font-size:13px}.audit-heading button{margin-left:auto}.audit-scope{color:#94621e;background:#fff6e6;border-radius:4px;padding:3px 6px}.audit-scope.verified{color:#237d4f;background:#eaf8ef}.audit-summary{margin:8px 0 4px}.audit-note{margin:4px 0;color:#94621e}.audit-details{border-top:1px solid #edf0f5;margin-top:10px;padding-top:8px;overflow-wrap:anywhere}.audit-details dl{display:flex;gap:10px 24px;flex-wrap:wrap;margin:4px 0}.audit-details dl div{display:flex;gap:8px}.audit-details dd{margin:0;font-weight:600;color:var(--text)}.audit-details ul{padding-left:18px;max-height:160px;overflow:auto;line-height:1.7}.audit-details p{margin-bottom:0}
</style>
