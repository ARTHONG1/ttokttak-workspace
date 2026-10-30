import {chromium} from 'playwright-core'
import {writeFileSync,mkdirSync} from 'node:fs'
const url='https://hangul-ai-workbench-545101783843.asia-northeast3.run.app/'
const configs={
 sheets:{label:'AI Sheets',frame:'/sheets/index.html',prompt:'Sheet1의 A1 셀에 웹검증, B1 셀에 42를 입력해 줘.',placeholder:'AI에게 이 통합 문서의 분석이나 수정을 요청하세요…'},
 slides:{label:'AI Slides',frame:'/slides/index.html',prompt:'웹 AI 검증이라는 제목과 PPT 확인이라는 본문을 가진 발표 슬라이드 1장을 만들어줘.',placeholder:'만들 프레젠테이션을 설명하거나 질문하세요'},
 hwp:{label:'AI 한글',frame:'/hwp/index.html',prompt:'이 문서의 본문에 한글 AI 검증 2026이라는 글을 넣어줘.',placeholder:'이 문서에 대해 묻거나 고칠 곳을 알려 주세요…'},
 pdf:{label:'AI PDF',frame:'/pdf/index.html',prompt:'현재 문서 첫 번째 페이지에 웹 AI 검증이라는 글을 넣어 줘.',placeholder:'이 PDF에 대해 질문…'},
}
mkdirSync('/tmp/hangul-qa',{recursive:true})
const b=await chromium.launch({channel:'chrome',headless:true})
for(const key of process.argv.slice(2)){
 const z=configs[key];if(!z)continue
 const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true});await ctx.addInitScript(()=>{delete window.showSaveFilePicker;delete window.showOpenFilePicker});const p=await ctx.newPage();const errors=[]
 p.on('console',m=>{if(m.type()==='error')errors.push('console '+m.text().slice(0,300))});p.on('pageerror',e=>errors.push('pageerror '+e.message.slice(0,300)));p.on('response',r=>{if(r.status()>=400)errors.push('HTTP'+r.status()+' '+r.url().slice(0,120))});
 const record={key,started:new Date().toISOString(),samples:[],errors};try{
 await p.goto(url,{timeout:60000});const sh=p.frameLocator('iframe[src*="/shell/"]');await sh.getByText('건너뛰기').last().click({timeout:25000}).catch(()=>{});await sh.getByText(z.label,{exact:true}).first().click({timeout:15000});await p.waitForTimeout(4500)
 const ed=p.frames().filter(f=>f.url().includes(z.frame)).find(f=>f.url().includes('__proto'))
 if(!ed)throw Error('missing frame '+JSON.stringify(p.frames().map(f=>f.url())))
 await ed.locator('textarea[placeholder="'+z.placeholder+'"]').fill(z.prompt);await ed.locator('button[aria-label="'+(key==='hwp'?'전송':'보내기')+'"]').click({timeout:10000})
 for(let i=0;i<7;i++){
 await p.waitForTimeout(7000);const val=await ed.evaluate(()=>({text:document.body.innerText.slice(-2400),inputs:[...document.querySelectorAll('textarea')].map(x=>({ph:x.placeholder,disabled:x.disabled,value:x.value?.slice(0,120)})),buttons:[...document.querySelectorAll('button')].filter(x=>/취소|중지|보내기|전송/.test(x.getAttribute('aria-label')||'')).map(x=>({aria:x.getAttribute('aria-label'),disabled:x.disabled}))}));record.samples.push({sec:(i+1)*7,...val});console.log(JSON.stringify({key,sec:(i+1)*7,tail:val.text.slice(-1050),errors:errors.slice(-4)}));if(i>=3&&!(/생각하는 중|실행 중|진행 중|Stop|생성 중|전송 중/.test(val.text)))break;
 }
 await p.screenshot({path:'/tmp/hangul-qa/'+key+'-ai.png',fullPage:false})
 }catch(e){record.exception=String(e.stack||e).slice(0,750);console.log('ERROR '+key+' '+record.exception)}record.ended=new Date().toISOString();writeFileSync('/tmp/hangul-qa/'+key+'-ai.json',JSON.stringify(record,null,2));await ctx.close()
}await b.close()
