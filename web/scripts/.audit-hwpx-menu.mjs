import {chromium} from 'playwright-core'
import {writeFileSync} from 'node:fs'
const url=process.env.AUDIT_URL||'https://hangul-ai-workbench-545101783843.asia-northeast3.run.app/'
const file=process.env.HWPX_FILE||'/Users/hongchanu/Desktop/한글/program/apps/hwp/tests/fixtures/memo.hwpx'
const marker=process.env.MARKER||'HWPX_MENU_SAVE_20261029'
const b=await chromium.launch({channel:'chrome',headless:true})
const c=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true})
await c.addInitScript(()=>{delete window.showSaveFilePicker;delete window.showOpenFilePicker;window.__wsev=[];const Old=window.WebSocket;window.WebSocket=function(...a){const s=new Old(...a);s.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(['file-written','dialog'].includes(m.t))window.__wsev.push({t:m.t,kind:m.kind,name:m.name})}catch{}});return s};window.WebSocket.prototype=Old.prototype})
const p=await c.newPage();const rec={downloads:[],errors:[],events:[]}
p.on('console',e=>{if(['error','warning'].includes(e.type()))rec.errors.push(e.type()+' '+e.text().slice(0,300))})
p.on('download',async d=>{const dest='/tmp/hangul-qa/hwpx-menu-'+d.suggestedFilename();await d.saveAs(dest);rec.downloads.push(dest)})
const snap=async(phase,extra={})=>{const s={phase,t:new Date().toISOString().slice(11,19),toasts:await p.locator('#toasts').allTextContents(),dialogs:await p.locator('.dlg').allTextContents(),ws:await p.evaluate(()=>window.__wsev.slice(-6)),...extra};rec.events.push(s);console.log(JSON.stringify(s).slice(0,700))}
try{
 await p.goto(url);const sh=p.frameLocator('iframe[src*="/shell/"]');await sh.getByText('건너뛰기').last().click({timeout:9000}).catch(()=>{})
 const chooser=p.waitForEvent('filechooser',{timeout:16000});await sh.getByText('로컬 파일 열기',{exact:false}).first().click();await (await chooser).setFiles(file);await p.waitForTimeout(15000)
 const hwp=p.frames().find(f=>f.url().includes('/hwp/index.html'));const studio=p.frames().find(f=>f.url().includes('/hwp/studio/'))
 await snap('opened')
 const ai=hwp.locator('textarea').first();await ai.fill('마지막 문단에 '+marker+' 추가해줘.');await hwp.locator('button[aria-label="전송"]').last().click()
 for(let i=0;i<40;i++){await p.waitForTimeout(3000);const s=await hwp.evaluate(()=>document.body.innerText);if(s.includes('문서 1곳을 고쳤습니다')&&!s.includes('생각 중'))break;if(s.includes('시간 초과')||s.includes('전송되지 않았습니다'))break}
 await snap('after-ai',{panel:(await hwp.evaluate(()=>document.body.innerText)).slice(-200)})
 if(process.env.SAVE_MODE==='keys'){await p.waitForTimeout(3000);const cv=p.frameLocator('iframe[src*="/hwp/index.html"]').frameLocator('iframe[src*="/studio/"]').locator('canvas').first();const bx=await cv.boundingBox();if(bx)await p.mouse.click(bx.x+bx.width/2,bx.y+200);await p.keyboard.press('Control+s');await p.waitForTimeout(5000);await snap('after-ctrl-s');await p.keyboard.press('Meta+s');await p.waitForTimeout(5000);await snap('after-meta-s')}
 await studio.getByText('파일',{exact:true}).first().click();await p.waitForTimeout(800)
 const items=await studio.evaluate(()=>[...document.querySelectorAll('[role=menuitem],.menu-item,li,button')].map(x=>(x.innerText||'').trim()).filter(t=>t&&t.length<30).slice(0,80))
 await snap('file-menu',{items})
 const save=studio.getByText(/^저장(\s|$)/).first();if(await save.count()){await save.click();await p.waitForTimeout(6000)}
 await snap('after-menu-save',{studioTail:(await studio.evaluate(()=>document.body.innerText)).slice(-300)})
 const dl=p.locator('#toasts button:has-text("내려받기")');if(await dl.count()){await dl.last().click();await p.waitForTimeout(2500)}
 await snap('end');await p.screenshot({path:'/tmp/hangul-qa/hwpx-menu.png'})
}catch(e){rec.exception=String(e.stack||e).slice(0,800);console.log('FAIL',rec.exception)}finally{writeFileSync('/tmp/hangul-qa/hwpx-menu.json',JSON.stringify(rec,null,2));await b.close()}
