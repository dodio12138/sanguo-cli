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
  await exec(`const fixture=document.createElement('div');fixture.id='qaHoverFixture';fixture.style.cssText='position:fixed;z-index:2147483647;top:4px;right:4px;display:flex;gap:4px;padding:4px;background:#080b08';for(const [label,className] of [['任务栏','os-task-button'],['窗口','os-window-button'],['关闭','os-window-button os-window-close'],['历法','os-calendar-tray']]){const button=document.createElement('button');button.type='button';button.className=className;button.textContent=label;fixture.append(button)}document.body.append(fixture);return true`);
  const buttons=await exec(`const out=[];for(const button of document.querySelectorAll('button:not(:disabled)')){const style=getComputedStyle(button),rect=button.getBoundingClientRect();if(style.display==='none'||style.visibility==='hidden'||rect.width<=0||rect.height<=0||rect.left>=innerWidth||rect.right<=0||rect.top>=innerHeight||rect.bottom<=0)continue;const left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom),x=Math.round((left+right)/2),y=Math.round((top+bottom)/2);if(document.elementFromPoint(x,y)?.closest('button')!==button)continue;out.push({label:(button.getAttribute('aria-label')||button.textContent).trim().replace(/\\s+/g,' ').slice(0,24),x,y});if(out.length===24)break}return out`);
  const results=[];
  for(const item of buttons){
    const before=await exec(`const button=document.elementFromPoint(${item.x},${item.y})?.closest('button'),style=button&&getComputedStyle(button);return {background:style?.backgroundColor||"",color:style?.color||""}`);
    await request("POST",`/session/${sessionId}/actions`,{actions:[{type:"pointer",id:"mouse",parameters:{pointerType:"mouse"},actions:[{type:"pointerMove",duration:60,origin:"viewport",x:item.x,y:item.y}]}]});
    await pause(30);
    const after=await exec(`const hit=document.elementFromPoint(${item.x},${item.y}),button=hit?.closest('button'),style=button&&getComputedStyle(button);return {isButton:Boolean(button),hit:(button?.getAttribute('aria-label')||button?.textContent||hit?.tagName||"").trim().replace(/\\s+/g,' ').slice(0,24),hover:Boolean(button?.matches(':hover')),outline:style?.outlineStyle||"",background:style?.backgroundColor||"",color:style?.color||"",border:style?.borderTopColor||""}`);
    results.push({...after,changed:before.background!==after.background||before.color!==after.color});
  }
  const observations=results.map((result,index)=>({...buttons[index],...result})),checked=observations.filter(result=>result.isButton),skipped=observations.filter(result=>!result.isButton).map(result=>result.label),failures=checked.filter(result=>!result.hover||result.outline!=="dotted"||!result.changed);
  const samples=checked.slice(-4).map(({label,background,color,border,outline,changed})=>({label,background,color,border,outline,changed}));
  console.log(JSON.stringify({checked:checked.length,skipped,samples,failures},null,2));
  if(!checked.length||failures.length)process.exitCode=1;
}finally{
  await request("DELETE",`/session/${sessionId}`).catch(()=>{});
}
