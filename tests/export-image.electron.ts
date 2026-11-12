import {app,BrowserWindow,nativeImage} from 'electron'
import assert from 'node:assert/strict'
import {exportImagePng} from '../src/main/export-image'
import {exportOrders} from '../src/core/exporter'
import type {Order,Task} from '../src/shared/types'
import ExcelJS from 'exceljs'

async function main(){
app.on('window-all-closed',()=>{})
await app.whenReady()
try{
  const source=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}})
  await source.loadURL('data:text/html,<html></html>')
  const fixtures=await source.webContents.executeJavaScript(`(()=>{
    const c=document.createElement('canvas');c.width=320;c.height=160;
    const x=c.getContext('2d');x.fillStyle='#12a8dd';x.fillRect(0,0,160,160);
    return ['image/webp','image/png','image/jpeg'].map(t=>c.toDataURL(t));
  })()`)
  source.destroy()
  for(const data of fixtures){
    const input=Buffer.from(data.split(',')[1],'base64')
    const output=await exportImagePng(input)
    assert.equal(output.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
    assert.deepEqual(nativeImage.createFromBuffer(output).getSize(),{width:160,height:80})
  }
  const task={platform:'taobao',from:'2026-01-01',to:'2026-01-01',status:'completed'} as Task
  const order={platform:'taobao',id:'synthetic-test',paidFen:1200,missing:[],extra:{},items:[{id:'test',title:'Generated image fixture',spec:'blue',quantity:1,unitPriceFen:1200,imageUrl:'https://img.alicdn.com/generated-fixture.jpg',productUrl:''}]} as unknown as Order
  const result=await exportOrders(task,[order],app.getPath('userData'),'xlsx',true,()=>exportImagePng(Buffer.from(fixtures[0].split(',')[1],'base64')))
  assert.equal(result.missing,0)
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(result.path)
  assert.equal(workbook.worksheets[0].getImages().length,1,'real exporter must embed the decoded image')
  assert.equal(workbook.worksheets[0].getCell('D2').value,'','embedded image must replace URL cell')
  await assert.rejects(exportImagePng(Buffer.from('RIFF0000WEBPbroken')))
  await assert.rejects(exportImagePng(Buffer.from('<html>not an image</html>')))
  assert.equal(BrowserWindow.getAllWindows().length,0,'decoder windows must be destroyed')
  console.log('PASS: generated WebP/PNG/JPEG -> 160px PNG; XLSX image embedded without missing entry; corrupt input rejected; decoder cleaned up')
  app.exit(0)
}catch(error){console.error(error);app.exit(1)}

}
void main()
