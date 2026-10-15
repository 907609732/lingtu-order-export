// Only known post-login landing pages return to 1688. Login/verification pages stay under user control.
export function isAlibabaLoginLanding(raw:string):boolean {
 try{const u=new URL(raw);return u.protocol==='https:'&&((u.hostname==='error.taobao.com'&&u.pathname==='/tbpc/error.html')||(['www.taobao.com','www.tmall.com'].includes(u.hostname)&&['/','/index.htm','/index.html'].includes(u.pathname))||(u.hostname==='i.taobao.com'&&['/','/my_taobao.htm'].includes(u.pathname)))}catch{return false}
}
