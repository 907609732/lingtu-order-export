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
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','收货地址']);s.addRow([Number(order.id),'不能匹配']);expect(await readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order])).toHaveLength(0)
 const other=new ExcelJS.Workbook();other.addWorksheet('unknown').addRow(['未知表头']);await expect(readAlibabaExport(Buffer.from(await other.xlsx.writeBuffer()),[order])).rejects.toThrow()
})
it('accepts only official export download URLs',()=>{expect(alibabaExportUrl('https://trade.1688.com/tradeorder-1688/x.xlsx?signature=example')).toContain('x.xlsx');for(const u of ['http://trade.1688.com/tradeorder-1688/x.xlsx','https://evil.example/x.xlsx','https://trade.1688.com/other/x.xlsx'])expect(()=>alibabaExportUrl(u)).toThrow()})

it('falls back to landline when mobile is empty and retains both remarks',async()=>{
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('订单');s.addRow(['订单编号','联系手机','联系电话','订单备注','买家留言']);s.addRow([order.id,'','010-00000000','备注A','留言B']);const [result]=await readAlibabaExport(Buffer.from(await w.xlsx.writeBuffer()),[order]);expect(result.phone).toBe('010-00000000');expect(result.remark).toBe('备注A\n留言B')
})
