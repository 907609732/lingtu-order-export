import type { Diagnostics } from './diagnostics'

// A wait message reports elapsed time, never invented progress or a guessed percentage.
export class ExecutionProgress {
  private context:Record<string,unknown>={}
  private started=Date.now()
  private timer:ReturnType<typeof setInterval>
  constructor(private diagnostics:Diagnostics,private kind:'collector'|'export',private base:Record<string,unknown>){
    this.timer=setInterval(()=>{
      const seconds=Math.floor((Date.now()-this.started)/1000)
      if(seconds>=10)this.diagnostics.event(this.kind==='collector'?'collector.wait':'export.wait',{...this.base,...this.context,seconds})
    },10000)
    this.timer.unref()
  }
  stage(context:Record<string,unknown>){this.context=context;this.started=Date.now();this.diagnostics.event(this.kind==='collector'?'collector.stage':'export.progress',{...this.base,...context})}
  close(){clearInterval(this.timer)}
}
