import {chromium} from 'playwright-core'
import {writeFileSync} from 'node:fs'
const b=await chromium.launch({channel:'chrome',headless:true})
const c=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true})
await c.addInitScript(()=>{delete window.showSaveFilePicker;delete window.showOpenFilePicker;window.__wsev=[];const Old=window.WebSocket;window.WebSocket=function(...args){const x=new Old(...args);x.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(['file-written','dialog'].includes(m.t))window.__wsev.push({t:m.t,kind:m.kind,name:m.name,path:m.path})}catch{}});return x};window.WebSocket.prototype=Old.prototype})
const p=await c.newPage();const rec={time:new Date().toISOString(),events:[],downloads:[],errors:[]}
p.on('download',async d=>{const target='/tmp/hangul-qa/import-'+d.suggestedFilename();await d.saveAs(target);rec.downloads.push(target)})
p.on('pageerror',e=>rec.errors.push(e.message))
p.on('console',e=>{if(e.type()==='error')rec.errors.push(e.text().slice(0,250))})
function shell(){return p.frames().find(x=>x.url().includes('/shell/out/renderer/index.html'))}
function info(phase){return Promise.all([p.locator('.dlg').allTextContents(),p.locator('#toasts').allTextContents(),p.evaluate(()=>window.__wsev.slice(-15))]).then(async ([dlg,toasts,ws])=>{const data={phase,frames:p.frames().map(x=>x.url().slice(-95)),shellBody:await shell()?.evaluate(()=>document.body.innerText.slice(0,2000)),modal:dlg,toasts,ws};rec.events.push(data);console.log(JSON.stringify(data).slice(0,2000))})}
try{
await p.goto('https://hangul-ai-workbench-545101783843.asia-northeast3.run.app/');await p.waitForTimeout(5500);await info('start')
const sh=p.frameLocator('iframe[src*="/shell/"]');await sh.getByText('건너뛰기').last().click({timeout:9000}).catch(()=>{});await p.waitForTimeout(1200);await info('skip')
const buttons=await shell()?.evaluate(()=>[...document.querySelectorAll('button')].map(b=>({text:(b.innerText||'').slice(0,45),title:b.title,aria:b.getAttribute('aria-label')})).filter(b=>b.text||b.title||b.aria));rec.events.push({phase:'buttons',buttons:buttons?.slice(0,85)});console.log('BUTTONS',JSON.stringify(buttons).slice(0,4500))
const open=sh.getByText('로컬 파일 열기',{exact:false}).first();if(await open.count()){const chooser=p.waitForEvent('filechooser',{timeout:10000}).catch(()=>null);await open.click();const fc=await chooser;if(fc){await fc.setFiles('/tmp/webtest/안내서.pdf');await p.waitForTimeout(9500);await info('pdf-upload')}else{await info('no-filechooser')}}
}catch(e){rec.exception=e.stack?.slice(0,900)||String(e);console.log('FAIL',rec.exception)}finally{writeFileSync('/tmp/hangul-qa/import-inspection.json',JSON.stringify(rec,null,2));await b.close()}
