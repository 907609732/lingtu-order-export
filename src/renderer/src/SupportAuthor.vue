<script setup lang="ts">
import { ref } from 'vue'
import { ElImageViewer } from 'element-plus'
import 'element-plus/es/components/image-viewer/style/css'
import wechat from './assets/donate-wechat.jpg'
import alipay from './assets/donate-alipay.jpg'
const preview = ref<number | null>(null)
const methods = [{ name: '微信支付', image: wechat }, { name: '支付宝', image: alipay }]
</script>

<template>
  <section class="settings-card support-author" aria-labelledby="support-author-title">
    <h2 id="support-author-title">支持作者</h2>
    <p>如果这个工具帮你节省了时间，欢迎请作者喝杯咖啡，支持持续维护。</p>
    <div class="donation-methods">
      <button v-for="(method, index) in methods" :key="method.name" class="donation-method" type="button" :aria-label="`查看${method.name}打赏二维码大图`" @click="preview = index">
        <strong>{{ method.name }}</strong>
        <img :src="method.image" :alt="`${method.name}打赏二维码`" loading="lazy" />
        <span>点击查看大图 · 使用手机扫码</span>
      </button>
    </div>
    <p class="donation-note">打赏完全自愿，金额随心，不影响软件功能使用。感谢你的支持！</p>
    <ElImageViewer v-if="preview !== null" :url-list="methods.map(method => method.image)" :initial-index="preview" :hide-on-click-modal="true" :teleported="true" @close="preview = null" />
  </section>
</template>

<style scoped>
.donation-methods{display:flex;flex-wrap:wrap;gap:20px;margin-top:18px}
.donation-method{display:flex;flex-direction:column;align-items:center;gap:12px;width:240px;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--surface-soft)}
.donation-method:hover{border-color:var(--accent);background:var(--accent-soft)}
.donation-method strong{font-size:14px}
.donation-method img{display:block;width:200px;height:300px;object-fit:contain;background:#fff;border-radius:8px}
.donation-method span{font-size:12px;color:var(--secondary)}
.support-author .donation-note{margin-top:18px;color:var(--secondary)}
@media(max-width:700px){.donation-method{width:100%}}
</style>
