import {chromium} from 'playwright-core'
import {writeFileSync} from 'node:fs'
const url=process.env.AUDIT_URL||'https://hangul-ai-workbench-545101783843.asia-northeast3.run.app/'
const file=process.env.HWPX_FILE||'/Users/hongchanu/Desktop/한글/program/apps/hwp/tests/fixtures/memo.hwpx'
const b=await chromium.launch({channel:'chrome',headless:true})
const c=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true})
await c.addInitScript(()=>{delete window.showSaveFilePicker;delete window.showOpenFilePicker;window.__wsev=[];const Old=window.WebSocket;window.WebSocket=function(...a){const s=new Old(...a);s.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(['file-written','dialog'].includes(m.t))window.__wsev.push({t:m.t,kind:m.kind,name:m.name,options:m.options})}catch{}});return s};window.WebSocket.prototype=Old.prototype})
const p=await c.newPage();const rec={downloads:[],errors:[],events:[]}
p.on('console',e=>{if(['error','warning'].includes(e.type()))rec.errors.push(e.type()+' '+e.text().slice(0,300))})
p.on('download',async d=>{const dest='/tmp/hangul-qa/hwpx-save-'+d.suggestedFilename();await d.saveAs(dest);rec.downloads.push(dest)})
const snap=async(phase,f)=>{const s={phase,toasts:await p.locator('#toasts').allTextContents(),dialogs:await p.locator('.dlg').allTextContents(),ws:await p.evaluate(()=>window.__wsev.slice(-6)),studio:f?(await f.evaluate(()=>document.body.innerText.slice(-400))):null};rec.events.push(s);console.log(JSON.stringify(s).slice(0,900))}
try{
 await p.goto(url);const sh=p.frameLocator('iframe[src*="/shell/"]');await sh.getByText('건너뛰기').last().click({timeout:9000}).catch(()=>{})
 const chooser=p.waitForEvent('filechooser',{timeout:16000});await sh.getByText('로컬 파일 열기',{exact:false}).first().click();await (await chooser).setFiles(file);await p.waitForTimeout(15000)
 const studio=p.frames().find(f=>f.url().includes('/hwp/studio/'));await snap('opened',studio)
 const el=p.frameLocator('iframe[src*="/hwp/index.html"]').frameLocator('iframe[src*="/studio/"]').locator('canvas').first()
 const box=await el.boundingBox();if(!box)throw Error('no canvas')
 await p.mouse.click(box.x+box.width*0.5,box.y+Math.min(box.height*0.5,320));await p.keyboard.press('Control+End');await p.keyboard.type(' HWPX_MANUAL_SAVE');await p.waitForTimeout(1500)
 await p.keyboard.press('Control+s');await p.waitForTimeout(6000);await snap('after-ctrl-s',studio)
 const dl=p.locator('#toasts button:has-text("내려받기")');if(await dl.count()){await dl.last().click();await p.waitForTimeout(2500)}
 await snap('end',studio);await p.screenshot({path:'/tmp/hangul-qa/hwpx-save.png'})
}catch(e){rec.exception=String(e.stack||e).slice(0,800);console.log('FAIL',rec.exception)}finally{writeFileSync('/tmp/hangul-qa/hwpx-save.json',JSON.stringify(rec,null,2));await b.close()}
