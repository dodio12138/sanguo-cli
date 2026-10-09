const endpoint="http://127.0.0.1:4444";
const gameUrl=process.argv.find(arg=>arg.startsWith("--url="))?.slice(6)||"http://127.0.0.1:8080/?qa=hover";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(method,path,body){
  const response=await fetch(`${endpoint}${path}`,{method,headers:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}),payload=await response.json().catch(()=>({value:null}));
  if(!response.ok||payload.value?.error)throw new Error(`${method} ${path}: ${payload.value?.message||response.status}`);
  return payload.value;
}
const created=await request("POST","/session",{capabilities:{alwaysMatch:{browserName:"safari"}}}),sessionId=created.sessionId||created.capabilities?.sessionId;
if(!sessionId)throw new Error("Safari WebDriver 未返回 sessionId");
const exec=(script,args=[])=>request("POST",`/session/${sessionId}/execute/sync`,{script,args});
try{
  await request("POST",`/session/${sessionId}/url`,{url:gameUrl});
  for(let count=0;count<100;count++){if(await exec("return document.readyState==='complete'&&document.querySelectorAll('button').length>0"))break;await pause(100)}
  for(let count=0;count<50;count++){
    const state=await exec(`const button=document.getElementById('continueGameButton');return {started:document.body.classList.contains('game-started'),ready:Boolean(button&&!button.disabled&&typeof button.onclick==='function'&&!button.closest('[hidden]')&&!button.closest('.hidden'))}`);
    if(state.started)break;
    if(state.ready){await exec("document.getElementById('continueGameButton').click();return true");break}
    await pause(100);
  }
  for(let count=0;count<100;count++){if(await exec("return document.body.classList.contains('game-started')"))break;await pause(100)}
  const gameStarted=await exec("return document.body.classList.contains('game-started')");
  if(!gameStarted){const diagnostic=await exec(`const button=document.getElementById('continueGameButton');return {summary:document.getElementById('startSummary')?.textContent||'',buttonHidden:Boolean(button?.hidden),buttonDisabled:Boolean(button?.disabled),startHidden:document.getElementById('startScreen')?.classList.contains('hidden'),activeSession:sessionStorage.getItem('sanguo.active-session.v1')}`);throw new Error(`独立 Safari 会话未能进入游戏界面，不能用开始页冒充游戏内悬浮验证：${JSON.stringify(diagnostic)}`)}
  const buttons=await exec(`const out=[];for(const button of document.querySelectorAll('button:not(:disabled)')){const style=getComputedStyle(button),rect=button.getBoundingClientRect();if(style.display==='none'||style.visibility==='hidden'||rect.width<=0||rect.height<=0||rect.left>=innerWidth||rect.right<=0||rect.top>=innerHeight||rect.bottom<=0)continue;const left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom),x=Math.round((left+right)/2),y=Math.round((top+bottom)/2);if(document.elementFromPoint(x,y)?.closest('button')!==button)continue;out.push({label:(button.getAttribute('aria-label')||button.textContent).trim().replace(/\\s+/g,' ').slice(0,24),x,y,x2:Math.min(Math.floor(right-1),x+2)});if(out.length===24)break}return out`);
  const neutral=await exec(`for(let y=innerHeight-20;y>20;y-=40)for(let x=innerWidth-20;x>20;x-=40)if(!document.elementFromPoint(x,y)?.closest('button'))return {x,y};return {x:1,y:1}`);
  const results=[];
  for(const item of buttons){
    await request("POST",`/session/${sessionId}/actions`,{actions:[{type:"pointer",id:"mouse",parameters:{pointerType:"mouse"},actions:[{type:"pointerMove",duration:20,origin:"viewport",x:neutral.x,y:neutral.y}]}]});
    await pause(30);
    const before=await exec(`const button=document.elementFromPoint(${item.x},${item.y})?.closest('button'),style=button&&getComputedStyle(button);return {background:style?.backgroundColor||"",color:style?.color||""}`);
    await request("POST",`/session/${sessionId}/actions`,{actions:[{type:"pointer",id:"mouse",parameters:{pointerType:"mouse"},actions:[{type:"pointerMove",duration:60,origin:"viewport",x:item.x,y:item.y}]}]});
    await pause(240);
    const after=await exec(`const hit=document.elementFromPoint(${item.x},${item.y}),button=hit?.closest('button'),style=button&&getComputedStyle(button),tip=document.getElementById('uiTooltip');return {isButton:Boolean(button),hit:(button?.getAttribute('aria-label')||button?.textContent||hit?.tagName||"").trim().replace(/\\s+/g,' ').slice(0,24),hover:Boolean(button?.matches(':hover')),outline:style?.outlineStyle||"",background:style?.backgroundColor||"",color:style?.color||"",border:style?.borderTopColor||"",expectedTip:Boolean(button?.dataset.tip),tipVisible:Boolean(tip&&!tip.hidden&&tip.textContent.trim()),tip:(tip?.textContent||'').trim().slice(0,40),tipRect:tip&&!tip.hidden?tip.style.left+','+tip.style.top:""}`);
    await request("POST",`/session/${sessionId}/actions`,{actions:[{type:"pointer",id:"mouse",parameters:{pointerType:"mouse"},actions:[{type:"pointerMove",duration:20,origin:"viewport",x:item.x2,y:item.y}]}]});
    await pause(30);
    const stableTipRect=await exec(`const tip=document.getElementById('uiTooltip');return tip&&!tip.hidden?tip.style.left+','+tip.style.top:''`);
    results.push({...after,changed:before.background!==after.background||before.color!==after.color,stable:after.tipRect===stableTipRect});
  }
  const observations=results.map((result,index)=>({...buttons[index],...result})),checked=observations.filter(result=>result.isButton),skipped=observations.filter(result=>!result.isButton).map(result=>result.label),failures=checked.filter(result=>!result.hover||result.outline!=="dashed"||result.changed||result.tipVisible!==result.expectedTip||!result.stable);
  const samples=checked.slice(-4).map(({label,background,color,border,outline,changed,tip})=>({label,background,color,border,outline,changed,tip}));
  console.log(JSON.stringify({gameStarted,checked:checked.length,skipped,samples,failures},null,2));
  if(!checked.length||failures.length)process.exitCode=1;
}finally{
  await request("DELETE",`/session/${sessionId}`).catch(()=>{});
}
