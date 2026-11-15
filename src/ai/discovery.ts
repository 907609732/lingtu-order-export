import {join} from 'node:path'
import {homedir} from 'node:os'

export function defaultConnectionFile(){
  return process.env.LINGTU_ORDER_CONNECTION||join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'LingtuOrderExport','ai','connection.json')
}
