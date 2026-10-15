import {describe,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {chooseUserData} from '../src/main/user-data'
describe('品牌升级的数据目录选择',()=>{
 it('新目录为空时继续使用有任务的旧目录，不搬动或覆盖文件',()=>{const root=mkdtempSync(resolve('.test-output/profile-'));for(const [name,count] of [['灵兔 AI 电商平台买家订单导出工具',0],['买家订单导出台',1]] as const){const dir=join(root,name);mkdirSync(dir);const db=new DatabaseSync(join(dir,'orders.sqlite'));db.exec('CREATE TABLE tasks(id TEXT)');if(count)db.exec("INSERT INTO tasks VALUES('test')");db.close()}expect(chooseUserData(root)).toBe(join(root,'买家订单导出台'));expect(existsSync(join(root,'灵兔 AI 电商平台买家订单导出工具','orders.sqlite'))).toBe(true)})
 it('新目录已有任务时优先保留新目录，多个账号数据不合并',()=>{const root=mkdtempSync(resolve('.test-output/profile-'));for(const name of ['灵兔 AI 电商平台买家订单导出工具','买家订单导出台']){const dir=join(root,name);mkdirSync(dir);const db=new DatabaseSync(join(dir,'orders.sqlite'));db.exec("CREATE TABLE tasks(id TEXT);INSERT INTO tasks VALUES('test')");db.close()}expect(chooseUserData(root)).toBe(join(root,'灵兔 AI 电商平台买家订单导出工具'))})
})
