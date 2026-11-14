import {it,expect} from 'vitest'
import {downloadAlibabaDetailExport} from '../src/main/alibaba-detail-download'
import {readAlibabaExport} from '../src/main/alibaba-detail'
const url='https://trade.1688.com/tradeorder-1688/report.xlsx?token=secret'
const failure=(category:string)=>expect.objectContaining({category})
it('sanitizes fetch and HTTP failures with download stage categories',async()=>{
 await expect(downloadAlibabaDetailExport(url,async()=>{throw Error(url)})).rejects.toEqual(failure('detail_download_network'))
 await expect(downloadAlibabaDetailExport(url,async()=>new Response('',{status:503}))).rejects.toEqual(failure('detail_download_http'))
})
it('distinguishes interrupted, empty and oversized reports',async()=>{
 await expect(downloadAlibabaDetailExport(url,async()=>new Response(new ReadableStream({start(c){c.error(Error(url))}})))).rejects.toEqual(failure('detail_download_interrupted'))
 await expect(downloadAlibabaDetailExport(url,async()=>new Response(''))).rejects.toEqual(failure('detail_report_empty'))
 await expect(downloadAlibabaDetailExport(url,async()=>new Response('x',{headers:{'content-length':String(33*1024*1024)}}))).rejects.toEqual(failure('detail_report_too_large'))
})
it('keeps URL protections and does not expose raw network secrets',async()=>{
 let calls=0;await expect(downloadAlibabaDetailExport('https://evil.example/report.xlsx',async()=>{calls++;return new Response('x')})).rejects.toThrow();expect(calls).toBe(0)
 try{await downloadAlibabaDetailExport(url,async()=>{throw Error(url)})}catch(error){expect(String(error)).not.toContain('secret');expect(String(error)).not.toContain('https:')}
})
it('classifies only explicit verification HTML as verification',async()=>{
 await expect(readAlibabaExport(Buffer.from('<html>service unavailable</html>'),[])).rejects.toEqual(failure('detail_report_format'))
 await expect(readAlibabaExport(Buffer.from('<html>请完成滑块验证</html>'),[])).rejects.toEqual(failure('login_or_verification'))
 await expect(readAlibabaExport(Buffer.from('PK\x03\x04broken'),[])).rejects.toEqual(failure('detail_report_parse'))
})
it('rejects redirected downloads, cancels oversized streams and preserves pause',async()=>{
 const redirected=new Response('x');Object.defineProperty(redirected,'url',{value:'https://evil.example/file.xlsx'})
 await expect(downloadAlibabaDetailExport(url,async()=>redirected)).rejects.toMatchObject({category:'detail_download_source'})
 let cancelled=false
 const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(32*1024*1024));c.enqueue(new Uint8Array(1))},cancel(){cancelled=true}})
 await expect(downloadAlibabaDetailExport(url,async()=>new Response(stream))).rejects.toMatchObject({category:'detail_report_too_large'});expect(cancelled).toBe(true)
 expect(await downloadAlibabaDetailExport(url,async()=>new Response('bytes'),()=>true)).toBeUndefined()
 expect(await downloadAlibabaDetailExport(url,async()=>new Response('bytes'))).toEqual(Buffer.from('bytes'))
})
it('does not request a report after pause and classifies unsafe redirects',async()=>{
 let calls=0;expect(await downloadAlibabaDetailExport(url,async()=>{calls++;return new Response('x')},()=>true)).toBeUndefined();expect(calls).toBe(0)
 const response=new Response('x');Object.defineProperty(response,'url',{value:'https://evil.example/file.xlsx'})
 await expect(downloadAlibabaDetailExport(url,async()=>response)).rejects.toMatchObject({category:'detail_download_source'})
})
