const endpoint="http://127.0.0.1:4444",gameUrl=process.argv.find(arg=>arg.startsWith("--url="))?.slice(6)||"http://127.0.0.1:8080/?aiGatewayPort=8787&qa=1";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(method,path,body){const response=await fetch(`${endpoint}${path}`,{method,headers:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}),payload=await response.json().catch(()=>({value:null}));if(!response.ok||payload.value?.error)throw new Error(`${method} ${path}: ${payload.value?.message||response.status}`);return payload.value}
const created=await request("POST","/session",{capabilities:{alwaysMatch:{browserName:"safari",acceptInsecureCerts:true}}}),sessionId=created.sessionId||created.capabilities?.sessionId;
if(!sessionId)throw new Error("Safari WebDriver 未返回 sessionId");
const exec=(script,args=[])=>request("POST",`/session/${sessionId}/execute/sync`,{script,args});
async function waitFor(script,label,timeout=20000){const started=Date.now();while(Date.now()-started<timeout){try{if(await exec(`return Boolean(${script})`))return}catch{}await pause(200)}throw new Error(`等待超时：${label}`)}
const report={url:gameUrl,startMenu:[],coreButtons:[],ledgers:[],layers:[],commands:[],ai:{},turns:[],observer:{},errors:[]};
try{
  await request("POST",`/session/${sessionId}/url`,{url:gameUrl});
  await waitFor("document.querySelector('#startScreen') && document.querySelectorAll('[data-start-view]').length","开始界面");
  await exec("localStorage.clear();location.reload();return true");
  await waitFor("document.querySelector('#scenarioChoices button[data-scenario]')","剧本目录",30000);
  await exec("window.__qaErrors=[];window.addEventListener('error',event=>window.__qaErrors.push(String(event.error?.stack||event.message)));window.addEventListener('unhandledrejection',event=>window.__qaErrors.push(String(event.reason?.stack||event.reason)))");
  report.startMenu=await exec(`
    const map={home:"startHomeView",new:"startNewView",load:"startLoadView",settings:"startSettingsView",exit:"startExitView"},out=[];
    for(const view of Object.keys(map)){const button=document.querySelector('nav [data-start-view="'+view+'"]');if(button)button.click();const panel=document.getElementById(map[view]);out.push({view,found:Boolean(button),visible:Boolean(panel&&!panel.hidden&&button.classList.contains('selected'))})}
    document.querySelector('[data-start-view="new"]')?.click();return out;
  `);
  await waitFor("document.querySelector('#forceChoices [data-start-force]:not([disabled])')","势力列表");
  await exec("(document.querySelector('#forceChoices [data-start-force=cao]:not([disabled])')||document.querySelector('#forceChoices [data-start-force]:not([disabled]):not([data-start-force=observer])'))?.click();document.querySelector('#startGameButton')?.click();if(document.querySelector('#overwriteSaveDialog[open]'))document.querySelector('#confirmOverwrite')?.click();return true");
  await waitFor("document.body.classList.contains('game-started') && window.__jiuzhouBootStage==='完成'","进入战局",30000);
  report.observer.aiControls=await exec(`document.body.classList.add('observer-mode');const mode=document.querySelector('.control-mode'),select=document.getElementById('controlMode'),status=document.getElementById('aiConnectionState'),settings=document.getElementById('aiSettingsButton'),advisor=document.getElementById('askAdvisorButton'),result={modeVisible:getComputedStyle(mode).display!=='none',selectVisible:getComputedStyle(select).display!=='none',statusVisible:getComputedStyle(status).display!=='none',settingsVisible:getComputedStyle(settings).display!=='none',advisorHidden:getComputedStyle(advisor).display==='none'};document.body.classList.remove('observer-mode');return result`);
  report.railPanels=await exec(`const groups=[];for(const rail of document.querySelectorAll('.left-rail,.right-rail')){const results=[];for(const button of rail.querySelectorAll('[data-rail-tab]')){button.click();const visible=[...rail.querySelectorAll('[data-rail-panel]')].filter(panel=>!panel.hidden).map(panel=>panel.id);results.push({tab:button.dataset.railTab,active:button.classList.contains('active'),visible})}groups.push(results)}return groups`);
  report.chronicleSetting=await exec(`document.getElementById('gameSettingsButton').click();const option=document.getElementById('gameChronicleEnabled'),global=document.getElementById('gameGlobalHistorianEnabled');if(!option||!global)throw new Error('缺少独立史官设置');option.checked=true;option.dispatchEvent(new Event('change',{bubbles:true}));const enabled=JSON.parse(localStorage.getItem('sanguo.settings.v1')).chronicleEnabled;option.checked=false;option.dispatchEvent(new Event('change',{bubbles:true}));const disabled=JSON.parse(localStorage.getItem('sanguo.settings.v1')).chronicleEnabled===false;global.checked=true;global.dispatchEvent(new Event('change',{bubbles:true}));const globalEnabled=JSON.parse(localStorage.getItem('sanguo.settings.v1')).globalHistorianEnabled;global.checked=false;global.dispatchEvent(new Event('change',{bubbles:true}));const globalDisabled=JSON.parse(localStorage.getItem('sanguo.settings.v1')).globalHistorianEnabled===false;document.querySelector('[data-close="gameSettingsDialog"]').click();const dialog=document.getElementById('chronicleDialog');dialog.showModal();document.querySelector('[data-chronicle-scope="global"]').click();const globalTab=document.getElementById('globalChronicleHistory').hidden===false&&document.getElementById('chronicleHistory').hidden;document.querySelector('[data-chronicle-scope="personal"]').click();const personalTab=document.getElementById('chronicleHistory').hidden===false&&document.getElementById('globalChronicleHistory').hidden;dialog.close();return {enabled,disabled,globalEnabled,globalDisabled,globalTab,personalTab}`);

  report.layers=await exec(`
    const out=[];for(const button of document.querySelectorAll('[data-layer]')){button.click();const legend=document.querySelector('#mapLegend [data-legend-key]'),key=legend?.dataset.legendKey,before=legend?.getAttribute('aria-pressed');legend?.click();const updated=key&&document.querySelector('#mapLegend [data-legend-key="'+CSS.escape(key)+'"]');out.push({layer:button.dataset.layer,active:button.classList.contains('active'),legendToggled:Boolean(updated)&&updated.getAttribute('aria-pressed')!==before})}return out;
  `);
  report.coreButtons.push(await exec(`
    const out=[];for(const id of ['zoomIn','zoomOut','centerMap']){const button=document.getElementById(id),before=document.getElementById('zoomLabel')?.textContent;button?.click();out.push({id,found:Boolean(button),changed:id==='centerMap'||before!==document.getElementById('zoomLabel')?.textContent})}return out;
  `));
  report.ledgers=await exec(`
    const out=[];for(const button of document.querySelectorAll('[data-ledger]')){button.click();out.push({ledger:button.dataset.ledger,opened:document.getElementById('ledgerDialog')?.open===true,content:document.getElementById('ledgerContent')?.textContent.length||0});document.getElementById('ledgerDialog')?.close()}return out;
  `);
  report.coreButtons.push(await exec(`
    const specs=[['battleReportButton','battleReportDialog'],['reportButton','reportDialog'],['saveButton','saveManagerDialog'],['loadButton','saveManagerDialog'],['gameSettingsButton','gameSettingsDialog'],['helpButton','helpDialog'],['aiSettingsButton','aiDialog']],out=[];document.getElementById('helpButton')?.click();document.getElementById('mapHomeButton')?.click();out.push({id:'mapHomeButton',found:Boolean(document.getElementById('mapHomeButton')),opened:document.querySelector('dialog[open]')===null});
    for(const [id,dialogId] of specs){const button=document.getElementById(id);button?.click();const dialog=document.getElementById(dialogId);out.push({id,found:Boolean(button),opened:dialog?.open===true});dialog?.close()}return out;
  `));
  report.coreButtons.push(await exec(`
    const out=[];for(const selector of ['[data-detail]','[data-city-order]','[data-form-army]','[data-march-target]']){const button=document.querySelector('#selectionPanel '+selector);button?.click();const open=document.querySelector('dialog[open]');out.push({selector,found:Boolean(button),opened:open?.id||null});open?.close()}return out;
  `));

  report.commands=await exec(`
    const out=[],catalog=window.SANGUO_COMMAND_CATALOG.commands;
    for(const command of catalog){
      document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.getElementById('clearOrders')?.click();document.getElementById('commandBookButton')?.click();
      const category=document.querySelector('[data-command-category="'+command.categoryId+'"]');category?.click();const button=document.querySelector('[data-command-id="'+command.id+'"]');button?.click();
      const planner=document.getElementById('plannerDialog'),commandDialog=document.getElementById('commandDialog'),queued=Number(document.getElementById('orderCount')?.textContent||0),selects=[...document.querySelectorAll('#plannerForm select')];
      out.push({id:command.id,category:command.categoryId,categoryFound:Boolean(category),buttonFound:Boolean(button),result:planner?.open?'planner':queued?'queued':commandDialog?.open?'command-dialog':'closed',plannerFields:document.querySelectorAll('#plannerForm input,#plannerForm select').length,emptySelects:selects.filter(select=>!select.options.length).length});
      planner?.close();commandDialog?.close();document.getElementById('clearOrders')?.click();
    }return out;
  `);

  await exec("document.getElementById('aiSettingsButton').click();document.getElementById('aiConnectButton').click();return true");
  await waitFor("document.getElementById('aiHealthText').textContent.includes('连接正常')","AI 网关连接",15000);
  report.ai.connected=await exec("return document.getElementById('aiHealthText').textContent");
  await exec("document.querySelector('[data-close=aiDialog]').click();const select=document.getElementById('controlMode');select.value='assist';select.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('askAdvisorButton').click();return true");
  await waitFor("document.getElementById('aiDialog').open && !window.jiuzhouAI.status().busy","AI 普通建议",60000);
  report.ai.suggestions=await exec("return document.querySelectorAll('[data-ai-apply]').length");
  await exec("document.querySelector('[data-ai-apply]')?.click();document.getElementById('clearOrders')?.click();document.getElementById('aiInstruction').value='稳守许昌并保持至少一支机动军团';document.getElementById('aiInstructionButton').click();return true");
  await waitFor("!window.jiuzhouAI.status().busy","AI 战略意图建议",60000);
  report.ai.instructionSuggestions=await exec("return document.querySelectorAll('[data-ai-apply]').length");
  await exec("document.querySelector('[data-close=aiDialog]').click();return true");

  for(let index=0;index<4;index++){
    await exec("document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());document.getElementById('endTurn').click();return true");
    await pause(500);
    if(await exec("return document.getElementById('eventDialog').open")){await exec("document.querySelector('#eventChoices [data-event-choice]')?.click();return true");await pause(200)}
    if(await exec("return document.getElementById('turnBriefingDialog').open"))await exec("document.getElementById('ackTurnBriefing').click();return true");
    report.turns.push(await exec("return {date:document.getElementById('dateLabel').textContent,report:document.getElementById('turnReport').textContent.slice(0,160)}"));
  }
  report.turnTabPreserved=await exec(`document.querySelector('[data-rail-tab="commandsRailPanel"]').click();document.getElementById('endTurn').click();document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());return document.querySelector('[data-rail-tab="commandsRailPanel"]').classList.contains('active')`);
  await exec("document.getElementById('saveButton').click();document.querySelector('#gameSaveSlots [data-slot-action]')?.click();document.getElementById('saveManagerDialog')?.close();return true");
  report.coreButtons.push(await exec(`
    const out=[];document.getElementById('helpButton').click();document.getElementById('modToolsButton').click();for(const id of ['loadScenarioJson','validateScenarioJson','downloadScenarioJson','exportSaveJson','copyDebugReport']){const button=document.getElementById(id);button?.click();out.push({id,found:Boolean(button)})}const importButton=document.getElementById('importSaveJson'),file=document.getElementById('saveFileInput'),nativeClick=file.click;let routed=false;file.click=()=>{routed=true};importButton.click();file.click=nativeClick;out.push({id:'importSaveJson',found:Boolean(importButton),routed});document.getElementById('modToolsDialog').close();return out;
  `));

  report.errors=await exec("return window.__qaErrors||[]");
  const commandFailures=report.commands.filter(item=>!item.categoryFound||!item.buttonFound||item.emptySelects||!['planner','queued'].includes(item.result));
  const failures=[...report.startMenu.filter(item=>!item.found||!item.visible),...report.layers.filter(item=>!item.active||!item.legendToggled),...report.ledgers.filter(item=>!item.opened||!item.content),...report.coreButtons.flat().filter(item=>item.found===false||item.opened===false||item.routed===false),...report.railPanels.flat(2).filter(item=>!item.active||item.visible.length!==1),...(!report.turnTabPreserved?[{setting:'turnTabPreserved'}]:[]),...(!report.observer.aiControls?.modeVisible||!report.observer.aiControls?.selectVisible||!report.observer.aiControls?.statusVisible||!report.observer.aiControls?.settingsVisible||!report.observer.aiControls?.advisorHidden?[{setting:'observerAIControls'}]:[]),...(!report.chronicleSetting?.enabled||!report.chronicleSetting?.disabled||!report.chronicleSetting?.globalEnabled||!report.chronicleSetting?.globalDisabled||!report.chronicleSetting?.globalTab||!report.chronicleSetting?.personalTab?[{setting:'separateChronicles'}]:[]),...commandFailures];
  report.summary={commands:report.commands.length,commandFailures:commandFailures.length,buttonFailures:failures.length-commandFailures.length,runtimeErrors:report.errors.length};
  console.log(JSON.stringify(report,null,2));
  if(failures.length||report.errors.length)process.exitCode=1;
}finally{
  await request("DELETE",`/session/${sessionId}`).catch(()=>{});
}
