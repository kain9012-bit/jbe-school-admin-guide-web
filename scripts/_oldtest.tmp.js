const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch({channel:'chromium'});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));

async function trial(label, url, sel, scrollY){
  await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(800);
  if(scrollY!=null){ await p.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),scrollY); await p.waitForTimeout(500); }
  // 대상이 화면에 보이는지 확인 (안 보이면 시나리오가 비현실적)
  const vis=await p.$eval(sel,el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;});
  const before=await p.evaluate(()=>Math.round(scrollY));
  await p.$eval(sel, el=>el.click());   // 브라우저 자동 스크롤 없이 실제 클릭
  await p.waitForTimeout(1200);
  const after=await p.evaluate(()=>Math.round(scrollY));
  console.log(`${label}: 화면에보임=${vis} ${before} -> ${after} ${Math.abs(after-before)<=2?'유지 OK':'움직임 '+(after-before)+'px'}`);
}

const c1='http://127.0.0.1:8898/index.html?chapter=01#work=official-documents';
const c3='http://127.0.0.1:8898/index.html?chapter=03#work=local-personnel';
await trial('단계 버튼(맨 위)      ', c1, '.step-button[data-step-id="step-2"]', 0);
await trial('단계 버튼(조금 내림)  ', c1, '.step-button[data-step-id="step-3"]', 300);
await trial('다음 단계 버튼        ', c1, '#next-step', 900);
await trial('이전 단계 버튼        ', c1+'&step=step-3', '#prev-step', 900);
await trial('제3편 단계 버튼       ', c3, '.step-button[data-step-id="step-6"]', 300);
await trial('제3편 다음 단계       ', c3, '#next-step', 1400);
console.log('콘솔 오류:', errs.length?errs:'없음');
await b.close();})()
