import {chromium} from 'playwright-core'
import {writeFileSync} from 'node:fs'
const tests={
 pdf:{file:'/tmp/webtest/안내서.pdf',path:'/pdf/index.html',prompt:'첫 페이지에 IMPORTED_PDF_AI_20261029 라는 글자를 추가해줘.',ph:'이 PDF에 대해 질문',send:'보내기'},
 docs:{file:'/tmp/webtest/report.docx',path:'/docs/index.html',prompt:'문서 끝에 IMPORTED_DOCX_AI_20261029 추가해줘.',ph:'편집·작성 요청',send:'보내기'},
 sheets:{file:'/tmp/webtest/표.xlsx',path:'/sheets/index.html',prompt:'A1 셀에 IMPORTED_XLSX_AI_20261029 입력해줘.',ph:'AI에게',send:'보내기'},
 slides:{file:'/tmp/webtest/사업계획.pptx',path:'/slides/index.html',prompt:'첫 슬라이드 제목을 IMPORTED_PPTX_AI_20261029 로 바꿔줘.',ph:'만들 프레젠테이션',send:'보내기'},
 hwp:{file:'/tmp/webtest/신청서.hwp',path:'/hwp/index.html',prompt:'마지막 문단에 IMPORTED_HWP_AI_20261029 추가해줘.',ph:'이 문서에 대해',send:'전송'},
 hwpx:{file:'/Users/hongchanu/Desktop/한글/program/apps/hwp/tests/fixtures/memo.hwpx',path:'/hwp/index.html',prompt:'마지막 문단에 IMPORTED_HWPX_AI_20261029 추가해줘.',ph:'이 문서에 대해',send:'전송'},
}
const b=await chromium.launch({channel:'chrome',headless:true})
for(const key of process.argv.slice(2)){
 const v=tests[key];if(!v)continue
 const c=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});await c.addInitScript(()=>{delete window.showSaveFilePicker;delete window.showOpenFilePicker;window.__wsev=[];const Old=window.WebSocket;window.WebSocket=function(...a){const s=new Old(...a);s.addEventListener('message',e=>{try{const m=JSON.parse(e.data);if(['file-written','dialog','session-ended'].includes(m.t))window.__wsev.push({t:m.t,kind:m.kind,name:m.name,path:m.path})}catch{}});return s};window.WebSocket.prototype=Old.prototype})
 const p=await c.newPage();const rec={key,file:v.file,created:new Date().toISOString(),events:[],downloads:[],errors:[]};p.on('pageerror',e=>rec.errors.push(e.message));p.on('console',e=>{if(e.type()==='error')rec.errors.push(e.text().slice(0,300))});p.on('response',r=>{if(r.status()>=400)rec.errors.push('HTTP '+r.status()+' '+r.url().slice(0,120))});p.on('download',async d=>{const dest='/tmp/hangul-qa/import-e2e-'+key+'-'+d.suggestedFilename();await d.saveAs(dest);rec.downloads.push(dest)})
 const snapshot=async (phase,f)=>{const data={phase,editor:f?await f.evaluate(()=>document.body.innerText.slice(-1050)):null,modals:await p.locator('.dlg').allTextContents(),toasts:await p.locator('#toasts').allTextContents(),ws:await p.evaluate(()=>window.__wsev.slice(-8)),frames:p.frames().map(f=>f.url().slice(-80))};rec.events.push(data);console.log(key,phase,JSON.stringify(data).slice(0,1250))}
 try{
  await p.goto(process.env.AUDIT_URL||'https://hangul-ai-workbench-545101783843.asia-northeast3.run.app/');const sh=p.frameLocator('iframe[src*="/shell/"]');await sh.getByText('건너뛰기').last().click({timeout:9000}).catch(()=>{});const chooser=p.waitForEvent('filechooser',{timeout:16000});await sh.getByText('로컬 파일 열기',{exact:false}).first().click();await (await chooser).setFiles(v.file);await p.waitForTimeout(key==='hwp'?16000:9000)
  const f=p.frames().find(x=>x.url().includes(v.path));if(!f)throw Error('No frame '+v.path);if(key==='sheets')await f.locator('textarea[placeholder*="AI에게"]').waitFor({state:'visible',timeout:75000});await snapshot('opened',f)
  let ai=f.locator('textarea[placeholder*="'+v.ph+'"]');if(!await ai.count()&&key==='slides')ai=f.locator('textarea[placeholder*="수정 요청을 설명"]');if(!await ai.count())throw Error('no AI input '+JSON.stringify(await f.locator('textarea').evaluateAll(xs=>xs.map(x=>x.placeholder))));await ai.fill(v.prompt);await f.locator('button[aria-label="'+v.send+'"]').last().click();
  const delayMs=key==='hwpx'?Number(process.env.HWPX_WAIT_MS||200000):key==='pdf'?200000:key==='slides'?125000:key==='sheets'?145000:45000;const deadline=Date.now()+delayMs;let lastTail='';while(Date.now()<deadline){await p.waitForTimeout(4000);const s=await f.evaluate(()=>document.body.innerText);const tail=s.slice(-160).replace(/\s+/g,' ');if(tail!==lastTail){lastTail=tail;console.log('[panel] '+new Date().toISOString().slice(11,19)+' '+tail)}if(key==='sheets'){if(s.includes('변경 1건 적용됨')&&!s.includes('AI가 생각하는 중'))break}else if(key==='pdf'){if(s.includes('IMPORTED_PDF_AI_20261029')&&!s.includes('생각 중')&&!s.includes('Esc 중지'))break}else if(key==='hwpx'){if((s.includes('문서 1곳을 고쳤습니다')||s.includes('변경 1건 적용됨'))&&!s.includes('생각 중'))break}else if(s.includes('완료 ·') || s.includes('AI 요청을 처리하지 못') || s.includes('오류가 발생'))break}await snapshot('after-ai',f)
  const save=f.locator('button[aria-label="저장(⌘S)"],button[aria-label="저장 (⌘S)"],button[aria-label="저장"]');if(await save.count()&&await save.first().isEnabled())await save.first().click({timeout:9000});else await p.keyboard.press('Control+s');await p.waitForTimeout(1800);await snapshot('save-attempt',f)
  const dlg=p.locator('.dlg');if(await dlg.count()){const input=dlg.locator('input.dlg-input');if(await input.count())await input.fill('import-test-'+key+'.'+({pdf:'pdf',docs:'docx',sheets:'xlsx',slides:'pptx',hwp:'hwp',hwpx:'hwpx'}[key]));await dlg.locator('button.primary').first().click()};await p.waitForTimeout(6000);await snapshot('post-save',f)
  const down=p.locator('#toasts button:has-text("내려받기")');if(await down.count()){await down.last().click();await p.waitForTimeout(2500);await snapshot('downloaded',f)}
  await p.screenshot({path:'/tmp/hangul-qa/import-e2e-'+key+'.png'})
 }catch(e){rec.exception=String(e.stack||e).slice(0,950);console.log('FAIL',key,rec.exception.slice(0,250))}finally{rec.ended=new Date().toISOString();writeFileSync('/tmp/hangul-qa/import-e2e-'+key+'.json',JSON.stringify(rec,null,2));await c.close()}
}
await b.close()
