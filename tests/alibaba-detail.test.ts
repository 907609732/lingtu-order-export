import {it,expect} from 'vitest'
import ExcelJS from 'exceljs'
import {readAlibabaExport,alibabaExportUrl} from '../src/main/alibaba-detail'
import type {Order} from '../src/shared/types'
const order={platform:'alibaba',id:'123456789012345678',createdAt:'2026-10-01 09:00:00',extra:{},missing:['订单详情'],detailState:'pending',items:[]} as unknown as Order
it('matches exact text IDs, merges duplicate logistics rows and excludes unrelated orders',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','收货人姓名','收货地址','联系手机','物流公司','运单号']);s.addRow([order.id,'合成人','合成地址','13800000000','快递','A']);s.addRow([order.id,'合成人','合成地址','13800000000','快递','B']);s.addRow(['999999999999999999','其他人','其他地址','','','']);
 const rows=await readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order]);expect(rows).toHaveLength(1);expect(rows[0].tracking).toBe('A\nB');expect(rows[0].detailReadAt).toBeTruthy();expect(rows[0].missing).toContain('订单详情')
})
it('does not mark unsupported headers or imprecise numeric IDs as read',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','收货地址']);s.addRow([Number(order.id),'不能匹配']);await expect(readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order])).rejects.toMatchObject({category:'detail_report_no_match'})
 const other=new ExcelJS.Workbook();other.addWorksheet('unknown').addRow(['未知表头']);await expect(readAlibabaExport(Buffer.from(await other.xlsx.writeBuffer()),[order])).rejects.toThrow()
})
it('accepts only official export download URLs',()=>{expect(alibabaExportUrl('https://trade.1688.com/tradeorder-1688/x.xlsx?signature=example')).toContain('x.xlsx');for(const u of ['http://trade.1688.com/tradeorder-1688/x.xlsx','https://evil.example/x.xlsx','https://trade.1688.com/other/x.xlsx'])expect(()=>alibabaExportUrl(u)).toThrow()})

it('falls back to landline when mobile is empty and retains both remarks',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','联系手机','联系电话','订单备注','买家留言']);s.addRow([order.id,'','010-00000000','备注A','留言B']);const [result]=await readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order]);expect(result.phone).toBe('010-00000000');expect(result.remark).toBe('备注A\n留言B')
})
it('distinguishes unmatched task orders from matched rows without detail fields',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','收货地址']);s.addRow(['unrelated','合成地址'])
 await expect(readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order])).rejects.toMatchObject({category:'detail_report_no_match'})
 const empty=new ExcelJS.Workbook(),e=empty.addWorksheet('订单');e.addRow(['订单编号']);e.addRow([order.id])
 await expect(readAlibabaExport(Buffer.from(await empty.xlsx.writeBuffer()),[order])).rejects.toMatchObject({category:'detail_report_no_fields'})
})

async function linkedNumericReport(id: string | number, phone: number, linkCell = 'B2') {
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','联系手机']);s.addRow([id,phone])
 const {default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(await w.xlsx.writeBuffer())
 const path='xl/worksheets/sheet1.xml';const xml=await zip.file(path)!.async('string')
 zip.file(path,xml.replace('</sheetData>','</sheetData><hyperlinks><hyperlink ref="'+linkCell+'" r:id="rId1"/></hyperlinks>'))
 zip.file('xl/worksheets/_rels/sheet1.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/" TargetMode="External"/></Relationships>')
 return zip.generateAsync({type:'nodebuffer'})
}
it('reads numeric hyperlink display text without assuming ExcelJS text is a string',async()=>{
 const buffer=await linkedNumericReport(order.id,13800000000)
 const w=new ExcelJS.Workbook();await w.xlsx.load(buffer as any);expect(typeof w.worksheets[0].getCell('B2').text).toBe('number')
 const [result]=await readAlibabaExport(buffer,[order]);expect(result.phone).toBe('13800000000')
})
it('refuses numeric IDs beyond Excel precision including hyperlink display values',async()=>{
 for(const id of [1234567890123456,123456789012345680]){
  for(const linkCell of ['A2','B2']){
   const buffer=await linkedNumericReport(id,13800000000,linkCell)
   await expect(readAlibabaExport(buffer,[{...order,id:String(id)}])).rejects.toMatchObject({category:'detail_report_no_match'})
  }
 }
})
it('preserves exact text IDs and rich text, cached formulas, empty values and dates',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','收货人','联系手机','联系电话','买家留言','付款时间'])
 s.addRow([{text:order.id,hyperlink:'https://example.invalid/'},{richText:[{text:'合成'},{text:'人'}]},null,{formula:'1+1',result:13800000000},{formula:'"cached"',result:'缓存留言'},new Date('2026-10-02T01:02:03Z')])
 const [result]=await readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order]);expect(result.id).toBe(order.id);expect(result.receiver).toBe('合成人');expect(result.phone).toBe('13800000000');expect(result.remark).toBe('缓存留言');expect(result.paidAt).toBe('2026-10-02 01:02:03')
})

it('does not match an imprecise numeric cached formula ID',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','收货地址']);s.addRow([{formula:'1',result:1234567890123456},'合成地址'])
 await expect(readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[{...order,id:'1234567890123456'}])).rejects.toMatchObject({category:'detail_report_no_match'})
})
