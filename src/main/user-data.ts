import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
export function chooseUserData(appData:string):string {
  const names=['灵兔 AI 电商平台买家订单导出工具','灵兔电商平台买家订单导出工具','五成电商订单导出助手','买家订单导出台']
  const paths=names.map(name=>join(appData,name))
  // Reuse the populated profile as a whole, including its own login partition.
  // A previously launched empty renamed profile must not hide the old orders.
  // Never merge, delete, or copy credentials between profiles.
  for(const path of paths){const file=join(path,'orders.sqlite');if(!existsSync(file))continue;let db:DatabaseSync|undefined;try{db=new DatabaseSync(file,{readOnly:true});if(Number((db.prepare('SELECT COUNT(*) AS n FROM tasks').get() as {n:number}).n)>0)return path}catch{/* Continue to an intact legacy profile. */}finally{db?.close()}}
  return paths[0]
}
