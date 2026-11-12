import {BrowserWindow,nativeImage} from 'electron'

export async function exportImagePng(buffer:Buffer):Promise<Buffer>{
  const image=nativeImage.createFromBuffer(buffer)
  if(!image.isEmpty())return image.resize({width:160}).toPNG()
  // CDN URLs may end in .jpg while returning WebP. nativeImage only guarantees
  // PNG/JPEG support; use the bundled Chromium decoder for actual WebP bytes.
  if(buffer.subarray(0,4).toString()!=='RIFF'||buffer.subarray(8,12).toString()!=='WEBP')throw new Error('图片格式无法读取')
  const decoder=new BrowserWindow({show:false,width:160,height:160,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,partition:'order-image-decoder'}})
  decoder.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  let timer:ReturnType<typeof setTimeout>|undefined
  try{
    const decode=async()=>{
      await decoder.loadURL('data:text/html,'+encodeURIComponent(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:">`))
      const src='data:image/webp;base64,'+buffer.toString('base64')
      const png:string=await decoder.webContents.executeJavaScript(`(async()=>{
        const image=new Image();image.src=${JSON.stringify(src)};await image.decode();
        if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw new Error('图片尺寸过大');
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=Math.max(1,Math.round(image.naturalHeight*160/image.naturalWidth));
        if(canvas.height>8192)throw new Error('图片尺寸过大');
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      })()`)
      const result=Buffer.from(png,'base64')
      if(nativeImage.createFromBuffer(result).isEmpty())throw new Error('图片格式无法读取')
      return result
    }
    return await Promise.race([decode(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('图片解码超时')),12000)})])
  }finally{
    if(timer)clearTimeout(timer)
    if(!decoder.isDestroyed())decoder.destroy()
  }
}
