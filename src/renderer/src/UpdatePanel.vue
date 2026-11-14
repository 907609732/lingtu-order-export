<script setup lang="ts">
import {computed,ref} from 'vue'
import type {UpdateState} from '../../shared/types'
const props=defineProps<{update:UpdateState;businessBusy:boolean}>()
const emit=defineEmits<{refresh:[]}>()
const error=ref('')
const labels:Record<UpdateState['status'],string>={idle:'等待检查',checking:'正在检查',available:'发现新版本',downloading:'正在下载',downloaded:'可以安装',installing:'正在安装',upToDate:'已是最新版本',error:'更新未完成',unsupported:'需要正式安装版'}
const label=computed(()=>labels[props.update.status])
const mb=(n=0)=>(n/1024/1024).toFixed(1)
async function perform(operation:'checkUpdate'|'downloadUpdate'|'cancelUpdate'|'installUpdate'){
 error.value='';try{await window.desk[operation]()}catch(e){error.value=String(e instanceof Error?e.message:e).replace(/^Error invoking remote method '[^']+': Error: /,'')}finally{emit('refresh')}
}
</script>
<template>
 <section id="software-update" class="settings-card update-card" tabindex="-1" aria-labelledby="update-title">
  <h2 id="update-title">软件更新</h2>
  <div class="update-heading"><span>当前版本 v{{update.current}}</span><span v-if="update.latest&&update.latest!==update.current">新版 v{{update.latest}}</span><b aria-live="polite" aria-atomic="true">{{label}}</b></div>
  <p class="update-message">{{update.message}}</p>
  <template v-if="update.status==='downloading'">
   <progress aria-label="更新下载进度" :value="update.total?(update.percent||0):undefined" max="100"></progress>
   <p v-if="update.total" class="update-transfer">{{(update.percent||0).toFixed(1)}}% · {{mb(update.transferred)}} / {{mb(update.total)}} MB · {{update.bytesPerSecond?`${mb(update.bytesPerSecond)} MB/s`:'等待下载数据…'}}</p>
   <p v-else class="update-transfer">正在连接，等待下载数据…</p>
  </template>
  <p class="update-source">来源：{{update.source}} · 免费直连，下载速度取决于网络</p>
  <p v-if="update.status==='downloaded'&&businessBusy" class="update-message">请先暂停采集、等待详情读取和导出结束，并关闭辅助采集，再重启安装。</p>
  <p v-if="error" role="alert" class="update-error">{{error}}</p>
  <div class="button-row">
   <button v-if="['idle','checking','upToDate','unsupported'].includes(update.status)||update.status==='error'&&update.errorStage==='check'" class="secondary" :disabled="['checking','unsupported'].includes(update.status)" @click="perform('checkUpdate')">{{update.status==='error'?'重新检查':'检查更新'}}</button>
   <button v-if="update.status==='available'||update.status==='error'&&update.errorStage==='download'" class="primary" @click="perform('downloadUpdate')">{{update.status==='error'?'重试下载':'下载更新'}}</button>
   <button v-if="update.status==='downloading'" class="secondary" @click="perform('cancelUpdate')">取消下载</button>
   <button v-if="update.status==='downloaded'||update.status==='installing'" class="primary" :disabled="businessBusy||update.status==='installing'" @click="perform('installUpdate')">重启并安装</button>
  </div>
  <p class="update-source">下载期间可继续使用。安装前会再次检查运行中的任务；普通关闭不会自动安装。</p>
 </section>
</template>
<style scoped>
.update-card{outline:none;scroll-margin-top:20px}.update-card:focus-visible{outline:2px solid var(--accent,#6374e7)}.update-heading{display:flex;gap:18px;align-items:center;font-size:13px}.update-heading b{margin-left:auto;font-size:12px;font-weight:500;color:var(--muted,#71717a)}.update-message{font-size:13px;line-height:1.6}.update-source,.update-transfer{font-size:12px;color:var(--muted,#71717a);line-height:1.6}.update-card progress{display:block;width:100%;height:6px;margin-top:16px;accent-color:var(--accent,#6374e7)}.update-card progress::-webkit-progress-bar{background:#e9e9ef;border-radius:3px}.update-card progress::-webkit-progress-value{background:var(--accent,#6374e7);border-radius:3px}.update-error{font-size:13px;color:#b42318}
</style>
