<script setup lang="ts">
import type { Order } from '../../shared/types'
import { money,absent,arrival,afterSale } from './order-view'
defineProps<{order:Order}>()
const emit=defineEmits<{copy:[value:string,label:string]}>()
</script>
<template>
  <div class="order-detail">
    <div class="detail-title"><strong>订单详情</strong><span>{{order.id}}</span><button class="text-button" @click="emit('copy',order.id,'订单号')">复制订单号</button><span class="detail-origin">{{order.extra?.['详情读取状态']||(order.detailState==='complete'?'已读取详情':'部分字段待提取详情')}}</span></div>
    <div class="detail-grid">
      <section><h3>收货信息</h3><dl><dt>收货人</dt><dd>{{order.receiver||absent(order)}}</dd><dt>收货电话</dt><dd>{{order.phone||absent(order)}} <button v-if="order.phone" class="copy-mini" @click="emit('copy',order.phone,'收货电话')">复制</button></dd><dt>收货地址</dt><dd>{{order.address||absent(order)}} <button v-if="order.address" class="copy-mini" @click="emit('copy',order.address,'收货地址')">复制</button></dd></dl></section>
      <section><h3>物流信息</h3><dl><dt>物流公司</dt><dd>{{order.logistics||absent(order)}}</dd><dt>物流单号</dt><dd>{{order.tracking||absent(order)}} <button v-if="order.tracking" class="copy-mini" @click="emit('copy',order.tracking,'物流单号')">复制</button></dd><dt>物流达签</dt><dd>{{arrival(order)||absent(order)}}</dd></dl></section>
      <section><h3>金额与状态</h3><dl><dt>实付款</dt><dd class="money-text">{{money(order.paidFen)}}</dd><dt>运费</dt><dd>{{money(order.freightFen)}}</dd><dt>退款金额</dt><dd>{{money(order.refundFen)}}</dd><dt>订单状态</dt><dd>{{order.status||'未提供'}}</dd><dt>售后状态</dt><dd>{{afterSale(order)||'未获取'}}</dd></dl></section>
      <section><h3>订单时间</h3><dl><dt>创建时间</dt><dd>{{order.createdAt||'未获取'}}</dd><dt>付款时间</dt><dd>{{order.paidAt||absent(order)}}</dd><dt>发货时间</dt><dd>{{order.shippedAt||absent(order)}}</dd><dt>完成时间</dt><dd>{{order.completedAt||absent(order)}}</dd></dl></section>
    </div>
    <div class="detail-products"><h3>商品明细 <span>{{order.items.length}} 项</span></h3><div class="sku-head"><span>商品 / 规格</span><span>数量</span><span>单价</span><span>商品实付合计</span><span>售后状态</span></div><div class="sku-row" v-for="(item,index) in order.items" :key="item.id+'-'+index"><div><strong>{{item.title||'商品名称未获取'}}</strong><p>{{item.spec||'规格未提供'}}</p><small v-for="(value,key) in item.extra" :key="key" v-show="value&&!['售后入口','售后操作','商品售后状态','商品退款状态','商品实付合计(元)'].includes(String(key))">{{key}}：{{value}}　</small></div><span>{{item.quantity??'未获取'}}</span><span>{{money(item.unitPriceFen)}}</span><span>{{item.extra?.['商品实付合计(元)']?'¥ '+item.extra['商品实付合计(元)']:'未获取'}}</span><span>{{item.extra?.['商品售后状态']||item.extra?.['商品退款状态']||'未获取'}}</span></div></div>
    <div class="detail-notes"><strong>订单备注</strong><p>{{order.remark||order.extra?.['订单备注']||absent(order)}}</p></div>
    <details class="extra-fields"><summary>更多已采集字段</summary><dl><dt>采购账号</dt><dd>{{order.account||'未提供'}}</dd><dt>卖家 ID</dt><dd>{{order.sellerId||'未获取'}}</dd><template v-for="(value,key) in order.extra" :key="key"><dt v-if="value">{{key}}</dt><dd v-if="value">{{value}}</dd></template><dt>采集时间</dt><dd>{{order.capturedAt}}</dd></dl></details>
    <p v-if="order.missing.length" class="detail-missing">待核对：{{order.missing.join('、')}}。空白项表示尚未取得，不等于没有该信息。</p>
  </div>
</template>
