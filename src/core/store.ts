import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { Order, PlatformId, StartInput, Task } from '../shared/types'
import { checkRange, inRange } from './values'
import { mergeOrders } from './merge'
export class Store {
  db: DatabaseSync
  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, platform TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_orders(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, order_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(task_id,order_id));`)
    for (const t of this.tasks()) if (t.status==='running') this.update(t.id,{status:'paused',message:'上次采集已中断，可继续采集'})
  }
  setting(key: string, value?: string): string { if(value!==undefined) this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value); return String((this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any)?.value || '') }
  tasks(): Task[] { return (this.db.prepare('SELECT payload FROM tasks ORDER BY rowid DESC').all() as any[]).map(r=>JSON.parse(r.payload)) }
  get(id: string): Task { const row=this.db.prepare('SELECT payload FROM tasks WHERE id=?').get(id) as any; if(!row)throw new Error('任务不存在'); return JSON.parse(row.payload) }
  create(input: StartInput): Task { checkRange(input.from,input.to); const now=new Date().toISOString(); const t:Task={...input,id:randomUUID(),account:'当前账号',status:'running',createdAt:now,updatedAt:now,count:0,pages:0,message:'正在准备采集',cursor:'',exportedPath:''}; this.db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(t.id,t.platform,JSON.stringify(t)); return t }
  update(id: string, patch: Partial<Task>): Task { const t={...this.get(id),...patch,id,updatedAt:new Date().toISOString()}; this.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify(t),id); return t }
  add(id: string, orders: Order[]): number {
    const t=this.get(id); let accepted=0
    this.db.exec('BEGIN IMMEDIATE')
    try { const statement=this.db.prepare('INSERT INTO task_orders VALUES(?,?,?) ON CONFLICT(task_id,order_id) DO UPDATE SET payload=excluded.payload'); for(const o of orders) { if(o.platform!==t.platform || !o.id || !inRange(o.createdAt,t.from,t.to))continue; const prior=this.db.prepare('SELECT payload FROM task_orders WHERE task_id=? AND order_id=?').get(id,o.id) as any; const result=prior?mergeOrders(JSON.parse(prior.payload),o):o; statement.run(id,o.id,JSON.stringify(result)); accepted++ }; this.db.exec('COMMIT') } catch(e) { this.db.exec('ROLLBACK'); throw e }
    const count=Number((this.db.prepare('SELECT COUNT(*) n FROM task_orders WHERE task_id=?').get(id) as any).n); this.update(id,{count}); return accepted
  }
  orders(id: string): Order[] { this.get(id); return (this.db.prepare('SELECT payload FROM task_orders WHERE task_id=? ORDER BY rowid').all(id) as any[]).map(r=>JSON.parse(r.payload)) }
  clear(platform: PlatformId): void { this.db.prepare('DELETE FROM tasks WHERE platform=?').run(platform) }
  close():void { this.db.close() }
}
