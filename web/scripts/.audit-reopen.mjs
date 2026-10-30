import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const jobs = [
  ['docs','/tmp/hangul-qa/import-e2e-docs-report.docx','/docs/index.html','IMPORTED_DOCX_AI_20261029'],
  ['sheets','/tmp/hangul-qa/import-e2e-sheets-표.xlsx','/sheets/index.html','IMPORTED_XLSX_AI_20261029'],
  ['slides','/tmp/hangul-qa/import-e2e-slides-사업계획.pptx','/slides/index.html','IMPORTED_PPTX_AI_20261029'],
  ['hwp','/tmp/hangul-qa/import-e2e-hwp-신청서.hwp','/hwp/index.html','IMPORTED_HWP_AI_20261029'],
]
const browser = await chromium.launch({channel:'chrome',headless:true})
const results=[]
for (const [key, file, path, marker] of jobs) {
  const ctx=await browser.newContext({viewport:{width:1440,height:900}})
  await ctx.addInitScript(()=>{delete window.showOpenFilePicker})
  const p=await ctx.newPage(), rec={key,file,started:new Date().toISOString(),errors:[]}
  p.on('pageerror',x=>rec.errors.push(String(x).slice(0,500)))
  try {
    await p.goto('https://hangul-ai-workbench-545101783843.asia-northeast3.run.app/',{timeout:45000})
    const sh=p.frameLocator('iframe[src*="/shell/"]');await sh.getByText('건너뛰기').last().click({timeout:10000}).catch(()=>{})
    const chooser=p.waitForEvent('filechooser',{timeout:16000});await sh.getByText('로컬 파일 열기',{exact:false}).first().click();await (await chooser).setFiles(file)
    let frame; for(let i=0;i<22;i++){await p.waitForTimeout(1000);frame=p.frames().find(f=>f.url().includes(path));if(frame&&await frame.evaluate(()=>document.body.innerText.length>50).catch(()=>false))break}
    rec.frameFound=!!frame;rec.frameUrl=frame?.url();rec.editorBody=frame?await frame.evaluate(()=>document.body.innerText.slice(0,1600)):'';rec.markerVisibleInDOM=frame?await frame.evaluate(m=>document.body.innerText.includes(m),marker):false;rec.otherFrames=p.frames().map(f=>f.url().slice(-80));rec.dialogs=await p.locator('.dlg').allTextContents();rec.toasts=await p.locator('#toasts').allTextContents();console.log(key,JSON.stringify({frame:rec.frameFound,markerInDOM:rec.markerVisibleInDOM,editor:rec.editorBody.slice(0,200),error:rec.errors,dialogs:rec.dialogs}).slice(0,500))
    await p.screenshot({path:'/tmp/hangul-qa/reopen-'+key+'.png'})
  } catch(x){rec.exception=String(x.stack||x).slice(0,550);console.log('REOPEN FAIL',key,rec.exception.slice(0,200))}
  finally {rec.finished=new Date().toISOString();results.push(rec);await ctx.close()}
}
writeFileSync('/tmp/hangul-qa/reopen.json',JSON.stringify(results,null,2))
await browser.close()
