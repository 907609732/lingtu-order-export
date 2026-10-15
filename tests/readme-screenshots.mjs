// 生成 README 与文档展示用的软件界面截图。
// 使用隔离的测试数据目录（ORDERDESK_TEST_DATA，位于系统临时目录）和合成订单，不读取真实账号数据；
// 与 tests/desktop-smoke.mjs 同一驱动模式。运行：node tests/readme-screenshots.mjs
// 01-export.png 为整页捕获（包含采集结果表），未做裁剪；如需更紧凑可裁掉底部备注区。
import { _electron as electron } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'

// 测试数据放在系统临时目录；截图不展示真实路径，保存目录使用中性演示路径。
const root = join(tmpdir(), 'lingtu-readme-shots')
const shots = resolve('docs/screenshots')
await mkdir(root, { recursive: true })
await mkdir(shots, { recursive: true })

const now = new Date().toISOString()
const task = (id, platform, from, to, count, status, message) =>
  ({ id, platform, account: '演示账号', from, to, status, createdAt: now, updatedAt: now, count, pages: count, message, cursor: '', exportedPath: '' })
const item = (id, title, spec, quantity, unitPriceFen) =>
  ({ id, title, spec, quantity, unitPriceFen, imageUrl: '', productUrl: '' })
const order = (platform, id, createdAt, paidAt, status, shop, paidFen, items) =>
  ({ platform, account: '演示账号', id, createdAt, paidAt, shippedAt: '', completedAt: '', status, shop, sellerId: '', paidFen, freightFen: 0, refundFen: null, refundStatus: '', receiver: '', phone: '', address: '', logistics: '', tracking: '', remark: '', detailUrl: '', items, extra: {}, missing: [], source: 'response', capturedAt: now, detailState: 'complete' })

// 与 src/core/store.ts 建表语句保持一致
const db = new DatabaseSync(join(root, 'orders.sqlite'))
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, platform TEXT NOT NULL, payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS task_orders(task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, order_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(task_id,order_id));
  CREATE TABLE IF NOT EXISTS launches(date TEXT NOT NULL, version TEXT NOT NULL, ts TEXT NOT NULL);`)

const jdTask = task('demo-jd-202607', 'jd', '2026-07-01', '2026-07-31', 1, 'partial', '京东所选年份列表已读取，订单详情和平台完整范围仍需核对')
const pddTask = task('demo-pdd-202608', 'pdd', '2026-08-01', '2026-08-31', 2, 'completed', '拼多多列表和详情已处理；可导出结果及缺项清单')
// 淘宝任务最后插入（rowid 最大），启动后默认打开带结果的这个任务
const taobaoTask = task('demo-taobao-202609', 'taobao', '2026-09-01', '2026-09-30', 3, 'partial', '淘宝所选月份列表已读取；订单详情仍需补全，已有结果可以导出')

const jdOrders = [
  order('jd', '303918827482913', '2026-07-18 09:12:33', '2026-07-18 09:13:01', '已完成', '京东自营旗舰店', 459900, [item('100067123456', '索尼 WH-1000XM5 头戴式降噪耳机', ' platinum 银 / 标准版', 1, 459900)]),
]
const pddOrders = [
  order('pdd', '260808-771043958213', '2026-08-08 20:31:07', '2026-08-08 20:31:44', '已签收', '果优生鲜专营店', 8990, [item('48219033', '四川攀枝花凯特芒 净重 4.5 斤', '中大果 / 单果 300g+', 1, 8990)]),
  order('pdd', '260801-338291740665', '2026-08-01 12:02:19', '2026-08-01 12:03:10', '待发货', '洁卫士日用旗舰店', 2590, [item('29104771', '抽取式棉柔洗脸巾 80 抽*6 包', '珍珠纹 / 加厚款', 1, 2590)]),
]
const taobaoOrders = [
  order('taobao', '2894716502378811', '2026-09-12 10:23:41', '2026-09-12 10:24:03', '交易成功', '星辰数码专营店', 129900, [item('712345678901', 'Redmi Book Pro 14 英寸笔记本电脑', '星辰银 / 16GB / 512GB', 1, 129900)]),
  order('taobao', '2894633119288827', '2026-09-08 21:07:12', '2026-09-08 21:07:40', '卖家已发货', '优家家居旗舰店', 15980, [item('689001122334', '日式陶瓷餐具套装 18 件', '釉下彩 / 4-6 人份', 1, 8990), item('689001122335', '竹木厨房多层置物架', '原木色 / 加高款', 1, 6990)]),
  order('taobao', '2894510077265543', '2026-09-03 14:45:36', '2026-09-03 14:46:02', '交易成功', '悦读图书专营店', 9800, [item('554009988776', '《Node.js 设计模式》第三版', '平装 / 中文版', 1, 9800)]),
]

for (const t of [jdTask, pddTask, taobaoTask]) db.prepare('INSERT OR REPLACE INTO tasks VALUES(?,?,?)').run(t.id, t.platform, JSON.stringify(t))
for (const o of [...jdOrders, ...pddOrders, ...taobaoOrders]) db.prepare('INSERT OR REPLACE INTO task_orders VALUES(?,?,?)').run(o.platform === 'jd' ? jdTask.id : o.platform === 'pdd' ? pddTask.id : taobaoTask.id, o.id, JSON.stringify(o))
db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('outputDir', 'D:\\订单导出')
db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('showExecutionLog', 'true')
db.close()

const env = { ...process.env, ORDERDESK_TEST_DATA: root }
delete env.ELECTRON_RUN_AS_NODE
delete env.ORDERDESK_SCREENSHOT

let app
try {
  app = await electron.launch({ executablePath: resolve('node_modules/electron/dist/electron.exe'), args: ['.'], env, timeout: 45000 })
  const page = await app.firstWindow()
  await page.getByRole('heading', { name: '淘宝 / 天猫订单导出' }).waitFor()
  await page.getByText('Redmi Book Pro 14 英寸笔记本电脑').waitFor()
  // 整页捕获：包含日期范围、执行日志和采集结果表；提交前按 README 展示需要裁掉超长部分。
  await page.screenshot({ path: join(shots, '01-export.png'), fullPage: true, animations: 'disabled' })

  await page.locator('.side-bottom button').filter({ hasText: '使用教程' }).click()
  await page.getByRole('heading', { name: '使用教程' }).waitFor()
  await page.screenshot({ path: join(shots, '02-guide.png'), animations: 'disabled' })

  await page.locator('.side-bottom button').filter({ hasText: '保存与设置' }).click()
  await page.getByRole('heading', { name: '保存与设置' }).waitFor()
  await page.screenshot({ path: join(shots, '03-settings.png'), animations: 'disabled' })

  await page.locator('.side-bottom button').filter({ hasText: '导出任务' }).click()
  await page.getByRole('heading', { name: '导出任务' }).waitFor()
  await page.screenshot({ path: join(shots, '04-history.png'), animations: 'disabled' })

  console.log(JSON.stringify({ passed: true, screenshots: ['01-export.png', '02-guide.png', '03-settings.png', '04-history.png'] }))
} finally {
  if (app) await app.close()
}
