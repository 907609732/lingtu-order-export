import { contextBridge,ipcRenderer } from 'electron'
import type { DeskAPI } from '../shared/types'
const api:DeskAPI={
  state:()=>ipcRenderer.invoke('desk:state'),orders:id=>ipcRenderer.invoke('desk:orders',id),start:input=>ipcRenderer.invoke('desk:start',input),
  login:id=>ipcRenderer.invoke('desk:login',id),hidePage:()=>ipcRenderer.invoke('desk:hidePage'),pause:id=>ipcRenderer.invoke('desk:pause',id),resume:id=>ipcRenderer.invoke('desk:resume',id),finish:id=>ipcRenderer.invoke('desk:finish',id),retry:id=>ipcRenderer.invoke('desk:retry',id),
  export:input=>ipcRenderer.invoke('desk:export',input),chooseDirectory:()=>ipcRenderer.invoke('desk:chooseDirectory'),openOutput:()=>ipcRenderer.invoke('desk:openOutput'),openExport:id=>ipcRenderer.invoke('desk:openExport',id),clear:id=>ipcRenderer.invoke('desk:clear',id),
  proxyStart:id=>ipcRenderer.invoke('desk:proxyStart',id),proxyStop:()=>ipcRenderer.invoke('desk:proxyStop'),certificate:()=>ipcRenderer.invoke('desk:certificate'),proxySettings:()=>ipcRenderer.invoke('desk:proxySettings'),
  onChange:callback=>{ipcRenderer.on('desk:changed',callback);return()=>{ipcRenderer.removeListener('desk:changed',callback)}},
  setLogging:enabled=>ipcRenderer.invoke('desk:setLogging',enabled),openLogs:()=>ipcRenderer.invoke('desk:openLogs'),
  reportError:(origin,error)=>ipcRenderer.invoke('desk:reportError',origin,error),
  executionLogs:platform=>ipcRenderer.invoke('desk:executionLogs',platform),setExecutionLogVisible:visible=>ipcRenderer.invoke('desk:setExecutionLogVisible',visible),
  onExecutionLog:callback=>{const listener=()=>callback();ipcRenderer.on('desk:executionChanged',listener);return()=>ipcRenderer.removeListener('desk:executionChanged',listener)}
}
contextBridge.exposeInMainWorld('desk',api)
