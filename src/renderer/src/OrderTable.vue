<script setup lang="ts">
import {computed,nextTick,ref,watch} from 'vue'
import {ElTable,ElTableColumn} from 'element-plus'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import type {Order,PlatformId} from '../../shared/types'
import {orderColumns,defaultColumnKeys,filterOrders,money,absent,arrival,mark,afterSale,safeImage} from './order-view'
import OrderDetail from './OrderDetail.vue'
const props=defineProps<{orders:Order[];platform:PlatformId;taskId:string;busy:boolean}>()
const emit=defineEmits<{openOrder:[orderId:string]}>()
const query=ref(''),status=ref(''),shop=ref(''),detail=ref(''),page=ref(1),pageSize=ref(50),jump=ref(1),sortKey=ref('createdAt'),descending=ref(true),columnMenu=ref(false),focused=ref(false),showImages=ref(false),hint=ref('')
const visibleKeys=ref<string[]>([...defaultColumnKeys]),table=ref<{doLayout():void;toggleRowExpansion(order:Order):void;setScrollTop(value:number):void}>()
const visibleColumns=computed(()=>orderColumns.filter(c=>visibleKeys.value.includes(c.key)))
const filtered=computed(()=>filterOrders(props.orders,{query:query.value,status:status.value,shop:shop.value,detail:detail.value,sortKey:sortKey.value,descending:descending.value}))
const pageCount=computed(()=>Math.max(1,Math.ceil(filtered.value.length/pageSize.value)))
const shown=computed(()=>filtered.value.slice((page.value-1)*pageSize.value,page.value*pageSize.value))
const total=computed(()=>filtered.value.reduce((sum,o)=>sum+(o.paidFen??0),0))
const unknownAmounts=computed(()=>filtered.value.filter(o=>o.paidFen===null).length)
const statuses=computed(()=>[...new Set(props.orders.map(o=>o.status).filter(Boolean))].sort())
const shops=computed(()=>[...new Set(props.orders.map(o=>o.shop).filter(Boolean))].sort())
const hasFilter=computed(()=>!!(query.value||status.value||shop.value||detail.value))
function reset(){query.value='';status.value='';shop.value='';detail.value=''}
function loadPreferences(){try{const saved=JSON.parse(localStorage.getItem('order-table:'+props.platform)||'null');visibleKeys.value=Array.isArray(saved?.columns)?saved.columns.filter((key:string)=>orderColumns.some(c=>c.key===key)):[...defaultColumnKeys];showImages.value=saved?.images===true;pageSize.value=[20,50,100,200].includes(saved?.pageSize)?saved.pageSize:50}catch{visibleKeys.value=[...defaultColumnKeys]}}
function savePreferences(){try{localStorage.setItem('order-table:'+props.platform,JSON.stringify({columns:visibleKeys.value,images:showImages.value,pageSize:pageSize.value}))}catch{hint.value='列设置暂时无法保存，下次打开会恢复默认。'}}
function toggleColumn(key:string){visibleKeys.value=visibleKeys.value.includes(key)?visibleKeys.value.filter(k=>k!==key):[...visibleKeys.value,key];savePreferences();void nextTick(()=>table.value?.doLayout())}
function restoreColumns(){visibleKeys.value=[...defaultColumnKeys];savePreferences()}
function sort({prop,order}:{prop:string|null;order:string|null}){sortKey.value=order&&prop?prop:'createdAt';descending.value=order?order==='descending':true;page.value=1}
function go(value:number){page.value=Math.min(pageCount.value,Math.max(1,Math.floor(Number(value)||1)));jump.value=page.value;table.value?.setScrollTop(0)}
async function copy(value:string,label:string){try{await navigator.clipboard.writeText(value);hint.value=`已复制${label}`}catch{hint.value='复制失败，可选中文字后复制。'}}
function expand(order:Order){table.value?.toggleRowExpansion(order)}
watch([query,status,shop,detail,pageSize],()=>go(1))
watch(pageCount,()=>{if(page.value>pageCount.value)go(pageCount.value)})
watch(()=>props.taskId,()=>{reset();go(1);hint.value='';columnMenu.value=false;focused.value=false})
watch(()=>props.platform,loadPreferences,{immediate:true})
</script>
<template>
  <section class="order-browser" :class="{'table-focused':focused}" aria-label="订单数据表">
    <div class="order-toolbar"><slot v-if="!focused" name="toolbar" />
      <div class="order-search"><span>⌕</span><input v-model="query" aria-label="搜索订单数据" placeholder="搜索订单、商品、规格、收货人、电话或物流单号"><button v-if="query" aria-label="清除搜索" @click="query=''">×</button></div>
      <select v-model="status" aria-label="订单状态筛选"><option value="">全部状态</option><option v-for="s in statuses" :key="s">{{s}}</option></select>
      <select v-model="shop" aria-label="商家筛选"><option value="">全部商家</option><option v-for="s in shops" :key="s">{{s}}</option></select>
      <select v-model="detail" aria-label="详情筛选"><option value="">全部记录</option><option value="missing">有待补全字段</option><option value="complete">无已知缺项</option><option value="refund">有售后记录</option></select>
      <button v-if="hasFilter" class="text-button" @click="reset">清空筛选</button>
      <div class="browser-view-tools"><label><input v-model="showImages" type="checkbox" @change="savePreferences">商品图片</label><div class="column-picker"><button class="secondary" :aria-expanded="columnMenu" @click="columnMenu=!columnMenu">显示列 <span>{{visibleColumns.length+1}}</span> ▾</button><div v-if="columnMenu" class="column-menu"><div class="column-menu-head"><strong>列表显示字段</strong><button @click="columnMenu=false" aria-label="关闭列设置">×</button></div><label><input type="checkbox" checked disabled>订单号（固定）</label><label v-for="c in orderColumns" :key="c.key"><input type="checkbox" :checked="visibleKeys.includes(c.key)" @change="toggleColumn(c.key)">{{c.label}}</label><button class="text-button" @click="restoreColumns">恢复默认列</button></div></div><button class="secondary" @click="focused=!focused">{{focused?'退出大表':'专注看表'}}</button></div>
    </div>

    <ElTable ref="table" :data="shown" row-key="id" stripe :height="focused?'calc(100vh - 204px)':'max(240px, calc(100vh - 390px - var(--workspace-extra-height, 0px)))'" :default-sort="{prop:'createdAt',order:'descending'}" :show-overflow-tooltip="true" @sort-change="sort" class="orders-grid" empty-text="没有符合筛选条件的订单，可清空筛选后重试。">
      <!-- @vue-generic {Order} -->
      <ElTableColumn type="expand" width="38" fixed="left"><template #default="scope"><OrderDetail :order="scope.row" @copy="copy" /></template></ElTableColumn>
      <ElTableColumn type="index" label="#" width="50" fixed="left" :index="(index:number)=>(page-1)*pageSize+index+1" />
      <!-- @vue-generic {Order} -->
      <ElTableColumn prop="id" label="订单号" width="230" fixed="left"><template #default="{row}"><button class="order-id" :title="'展开订单 '+row.id" @click="expand(row)">{{row.id}}</button><div class="order-row-actions"><button @click="copy(row.id,'订单号')">复制</button><button v-if="row.detailUrl" :disabled="busy" @click="emit('openOrder',row.id)">平台详情 ↗</button></div></template></ElTableColumn>
      <!-- @vue-generic {Order} -->
      <ElTableColumn v-for="c in visibleColumns" :key="c.key" :prop="c.key" :label="c.label" :width="Math.round(c.width*1.15)" :sortable="'sort' in c&&c.sort?'custom':false" :align="['paidFen','freightFen','refundFen'].includes(c.key)?'right':'left'">
        <template #default="{row}">
          <div v-if="c.key==='items'" class="order-items"><div v-for="(item,index) in row.items" :key="item.id+'-'+index" class="order-item"><img v-if="showImages&&safeImage(item.imageUrl)" :src="safeImage(item.imageUrl)" alt="商品图" loading="lazy" referrerpolicy="no-referrer" @error="($event.target as HTMLImageElement).style.visibility='hidden'"><div class="item-copy"><div class="item-title" :title="item.title"><span>{{item.title||'商品信息待补全'}}</span><b>× {{item.quantity??'?'}}</b></div><div class="item-spec" :title="item.spec">{{item.spec||'规格未提供'}}</div><span v-if="item.extra?.['商品售后状态']||item.extra?.['商品退款状态']" class="item-refund">{{item.extra['商品售后状态']||item.extra['商品退款状态']}}</span></div></div></div>
          <div v-else-if="c.key==='paidFen'" class="payment-cell"><strong>{{money(row.paidFen)}}</strong><span class="state-chip" :class="/关闭|退款|取消/.test(row.status)?'muted':/成功|完成/.test(row.status)?'success':'pending'">{{row.status||'未获取状态'}}</span></div>
          <div v-else-if="c.key==='address'" class="address-cell"><strong v-if="row.receiver">{{row.receiver}}</strong><span :class="{'missing-value':!row.address}">{{row.address||absent(row)}}</span></div>
          <div v-else-if="c.key==='logistics'" class="logistics-cell"><span>{{row.logistics||absent(row)}}</span><button v-if="row.tracking" class="tracking-number" :title="'点击复制物流单号：'+row.tracking" @click="copy(row.tracking,'物流单号')">{{row.tracking}}</button></div>
          <span v-else-if="c.key==='arrival'" :class="{'missing-value':!arrival(row)}">{{arrival(row)||absent(row)}}</span>
          <span v-else-if="c.key==='mark'" :class="{'missing-value':!mark(row)}">{{mark(row)||(row.extra?.['存在买家备注']==='是'?'有备注，待提取内容':absent(row))}}</span>
          <span v-else-if="c.key==='refundStatus'" :class="{'missing-value':!afterSale(row)}">{{afterSale(row)||'未获取'}}</span>
          <span v-else-if="c.key==='freightFen'||c.key==='refundFen'">{{money(row[c.key])}}</span>
          <span v-else :class="{'missing-value':!row[c.key]}">{{row[c.key]||absent(row)}}</span>
        </template>
      </ElTableColumn>
    </ElTable>
    <div class="order-summary"><span>显示 <strong>{{filtered.length}}</strong> / {{orders.length}} 笔<span v-if="hasFilter" class="filter-note"> · 筛选仅影响浏览，导出仍包含本任务全部订单</span></span><span>实付款合计 <b>{{money(total)}}</b><small v-if="unknownAmounts">（另有 {{unknownAmounts}} 笔金额未获取）</small><span v-if="hint" class="copy-hint" role="status">{{hint}}</span></span></div>
    <div class="order-pagination"><span>共 {{filtered.length}} 笔 <select v-model.number="pageSize" aria-label="每页条数" @change="savePreferences"><option :value="20">20 条/页</option><option :value="50">50 条/页</option><option :value="100">100 条/页</option><option :value="200">200 条/页</option></select></span><div><button class="secondary" :disabled="page===1" @click="go(page-1)">上一页</button><strong>{{page}} / {{pageCount}}</strong><button class="secondary" :disabled="page===pageCount" @click="go(page+1)">下一页</button><label>前往 <input v-model.number="jump" type="number" aria-label="跳转页码" min="1" :max="pageCount" @keydown.enter="go(jump)"> 页</label><button class="text-button" @click="go(jump)">跳转</button></div><span class="table-help">点击订单号展开 · 拖动表头边界调整列宽 · 底部横向滚动查看更多</span></div>
  </section>
</template>
