import {describe,it,expect} from 'vitest'
import {createHash} from 'node:crypto'
import {CollectionError} from '../src/main/collection-errors'
import {selectAlibabaDetailReport} from '../src/main/alibaba-detail'

const requestedAt='2026-11-16T03:51:36.143Z'
const checkpoint={requestedAt,token:String(Date.parse('2026-11-16T03:51:38.048Z')),previous:[] as string[]}
const report={path:'https://trade.1688.com/tradeorder-1688/synthetic.xlsx',gmtCreate:'2026-11-16 11:51:37',exportStatus:'SUCCESS'}
describe('1688 detail report ownership',()=>{
 it('accepts a unique new report whose creation second differs from the returned request token',()=>{
  expect(selectAlibabaDetailReport([report],checkpoint)).toBe(report)
 })
 it('accepts exact-second reports and ignores old baseline reports',()=>{
  const exact={...report,gmtCreate:'2026-11-16 11:51:38'}
  expect(selectAlibabaDetailReport([exact],checkpoint)).toBe(exact)
  expect(selectAlibabaDetailReport([report],{...checkpoint,previous:[createHash('sha256').update(report.path).digest('hex')]})).toBeUndefined()
 })
 it('refuses ambiguous fresh reports even when one matches the token second exactly',()=>{
  expect(()=>selectAlibabaDetailReport([report,{...report,path:report.path+'?other=1',gmtCreate:'2026-11-16 11:51:38'}],checkpoint)).toThrow(CollectionError)
 })
 it('ignores stale, distant or still-generating reports',()=>{
  for(const record of [{...report,gmtCreate:'2026-11-16 11:51:30'},{...report,gmtCreate:'2026-11-16 11:52:10'},{...report,exportStatus:'PROCESSING'},{...report,gmtCreate:'invalid'}])expect(selectAlibabaDetailReport([record],checkpoint)).toBeUndefined()
 })
 it('does not compare platform timestamps with a fast or slow PC clock when a server token exists',()=>{
  const exact={...report,gmtCreate:'2026-11-16 11:51:38'}
  for(const requestedAt of ['2026-11-16T03:51:41.143Z','2026-11-16T03:50:36.143Z'])expect(selectAlibabaDetailReport([exact],{...checkpoint,requestedAt})).toBe(exact)
 })
 it('keeps a tight token window and rejects malformed saved token metadata',()=>{
  expect(selectAlibabaDetailReport([{...report,gmtCreate:'2026-11-16 11:51:50'}],checkpoint)).toBeUndefined()
  expect(()=>selectAlibabaDetailReport([report],{...checkpoint,token:'not-a-time'})).toThrow(CollectionError)
 })
 it('supports legacy checkpoints without a token only within the unique request window',()=>{
  expect(selectAlibabaDetailReport([report],{requestedAt,previous:[]})).toBe(report)
  expect(()=>selectAlibabaDetailReport([report,{...report,path:report.path+'?other=1'}],{requestedAt,previous:[]})).toThrow(CollectionError)
 })
})
