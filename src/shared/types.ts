export type PlatformId = 'taobao' | 'alibaba' | 'pdd' | 'jd' | 'xianyu' | 'dewu' | 'kuaishou' | 'eleme' | 'meituan'
export type TaskStatus = 'running' | 'paused' | 'needs_login' | 'partial' | 'completed' | 'failed'
export interface Platform {
  id: PlatformId; name: string; icon: string; color: string; url: string; domains: string[]
  mode: 'browser' | 'proxy'; reference: string
}
export interface Item {
  id: string; title: string; spec: string; quantity: number | null; unitPriceFen: number | null; imageUrl: string; productUrl: string; extra?: Record<string,string>
}
export interface Order {
  platform: PlatformId; account: string; id: string; createdAt: string; paidAt: string; shippedAt: string; completedAt: string
  status: string; shop: string; sellerId: string; paidFen: number | null; freightFen: number | null; refundFen: number | null; refundStatus: string
  receiver: string; phone: string; address: string; logistics: string; tracking: string; remark: string; detailUrl: string
  items: Item[]; extra: Record<string, string>; missing: string[]; source: 'response' | 'page'; capturedAt: string; detailState?: 'pending' | 'complete'
}
export interface Task {
  id: string; platform: PlatformId; account: string; from: string; to: string; status: TaskStatus; createdAt: string; updatedAt: string
  count: number; pages: number; message: string; cursor: string; exportedPath: string
}
export interface StartInput { platform: PlatformId; from: string; to: string }
export interface ExportInput { taskId: string; format: 'xlsx' | 'csv'; images: boolean }
export interface LoggingState { enabled: boolean; directory: string; error: string }
export interface ExecutionEntry { id: number; time: string; level: 'info'|'success'|'warning'|'error'; message: string; platform?: PlatformId; taskId?: string }
export interface AppState { platforms: Platform[]; tasks: Task[]; outputDir: string; version: string; logging: LoggingState; showExecutionLog: boolean; proxy: { running: boolean; port: number; certificate: string } }
export interface DeskAPI {
  state(): Promise<AppState>; orders(taskId: string): Promise<Order[]>; start(input: StartInput): Promise<Task>
  login(platform: PlatformId): Promise<void>; pause(id: string): Promise<void>; resume(id: string): Promise<void>; finish(id: string): Promise<void>
  retry(id: string): Promise<void>; export(input: ExportInput): Promise<{ path: string; count: number; missing: number }>
  chooseDirectory(): Promise<string>; openOutput(): Promise<void>; openExport(id: string): Promise<void>; clear(platform: PlatformId): Promise<void>
  proxyStart(platform: PlatformId): Promise<void>; proxyStop(): Promise<void>; certificate(): Promise<void>
  hidePage(): Promise<void>; proxySettings(): Promise<void>; onChange(callback: () => void): () => void
  setLogging(enabled: boolean): Promise<void>; openLogs(): Promise<void>
  reportError(origin: 'window' | 'promise' | 'vue', error: { name: string; message: string; stack: string }): Promise<void>
  executionLogs(platform: PlatformId): Promise<ExecutionEntry[]>; setExecutionLogVisible(visible: boolean): Promise<void>
  onExecutionLog(callback: () => void): () => void
}
