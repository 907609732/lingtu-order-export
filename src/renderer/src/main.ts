import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
function report(origin:'window'|'promise'|'vue',value:unknown){
  const error=value instanceof Error?value:new Error(typeof value==='string'?value:'界面异常')
  void window.desk.reportError(origin,{name:error.name,message:error.message.slice(0,4000),stack:(error.stack||'').slice(0,12000)}).catch(()=>{})
}
window.addEventListener('error',event=>report('window',event.error))
window.addEventListener('unhandledrejection',event=>report('promise',event.reason))
const app=createApp(App)
app.config.errorHandler=error=>report('vue',error)
app.mount('#app')
