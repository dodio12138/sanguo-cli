import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createServer} from "node:http";
import {mkdtemp,readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

// 独立静态副本、随机端口与 Safari 窗口；不会访问本地战局存档服务。
const exec=promisify(execFile),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),directory=await mkdtemp("/private/tmp/sanguo-save-flow-");
await exec(process.execPath,[path.join(root,"tools/build-pages.mjs"),directory]);
let apiRequests=0;
const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,"http://localhost").pathname;
  if(pathname.startsWith("/api/")){apiRequests++;response.writeHead(403).end();return}
  if(pathname==="/qa-cleanup.html"){response.setHeader("content-type","text/html");response.end('<script src="js/core/map-editor-drafts.js"></script><script src="js/core/scenario-map-store.js"></script>');return}
  const file=path.resolve(directory,`.${pathname==="/"?"/index.html":pathname}`);if(!file.startsWith(directory+path.sep)){response.writeHead(403).end();return}
  try{
    let body=await readFile(file);const ext=path.extname(file);response.setHeader("content-type",{".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".json":"application/json",".svg":"image/svg+xml"}[ext]||"application/octet-stream");response.setHeader("cache-control","no-store");
    if(ext===".html")body=body.toString().replace("<head>","<head><script>window.__qaDocumentId=crypto.randomUUID();window.__qaInitialKeys=Object.keys(localStorage)</script>").replace('<script src="js/ui/app.js','<script>const bind=MapView.prototype.bind;MapView.prototype.bind=function(){window.__qaMapView=this;return bind.call(this)};const install=MapEditor.install;MapEditor.install=function(options){window.__qaEditorGetView=options.getMapView;window.__qaEditorGetData=options.getData;window.__qaInstallCount=(window.__qaInstallCount||0)+1;return install.call(this,options)}</script><script src="js/ui/app.js');
    response.end(body);
  }catch{response.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const url=`http://127.0.0.1:${server.address().port}/`,apple=async script=>(await exec("osascript",["-e",script],{maxBuffer:16*1024*1024})).stdout.trim();
let windowId=null,owned=false;
const evaluate=async script=>{const raw=await apple(`tell application "Safari" to do JavaScript ${JSON.stringify(`JSON.stringify((()=>{try{${script}}catch(error){return {__qaError:String(error)}}})())`)} in current tab of window id ${windowId}`);if(!raw)throw new Error("浏览器脚本未返回结果");const value=JSON.parse(raw);if(value?.__qaError)throw new Error(value.__qaError);return value};
const wait=async script=>{const until=Date.now()+45000;while(Date.now()<until){if(await evaluate(script).catch(()=>false))return;await new Promise(resolve=>setTimeout(resolve,200))}throw new Error(`浏览器验证超时：${script}`)};
const run=async script=>{await evaluate(`window.__qaAsync={done:false};(async()=>{${script}})().then(value=>window.__qaAsync={done:true,value},error=>window.__qaAsync={done:true,error:String(error)});return true`);await wait("return window.__qaAsync?.done");const result=await evaluate("return window.__qaAsync");if(result.error)throw new Error(result.error);return result.value};
const reload=async ready=>{const oldId=await evaluate("const id=window.__qaDocumentId;location.reload();return id");await wait(`return !!window.__qaDocumentId&&window.__qaDocumentId!==${JSON.stringify(oldId)}&&(${ready})`)};
const setup=`
  const $=id=>document.getElementById(id),canvas=$('mapEditorCanvas');
  function exported(){const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=()=>{};try{$('mapEditorExportPatch').click();return JSON.parse($('mapEditorJson').value)}finally{HTMLAnchorElement.prototype.click=click}}
  function clickCell(x,y){const rect=canvas.getBoundingClientRect(),capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};const event={bubbles:true,pointerId:7,button:0,shiftKey:true,clientX:rect.left+(x+.5)*rect.width/(canvas.width/14),clientY:rect.top+(y+.5)*rect.height/(canvas.height/14)};try{canvas.dispatchEvent(new PointerEvent('pointerdown',event));canvas.dispatchEvent(new PointerEvent('pointerup',event))}finally{canvas.setPointerCapture=capture}}
`;
const openEditor=()=>run("await document.getElementById('openMapEditor').onclick();return true");
try{
  windowId=Number(await apple(`tell application "Safari"\nmake new document with properties {URL:${JSON.stringify(url)}}\nreturn id of front window\nend tell`));
  await apple(`tell application "Safari" to set bounds of window id ${windowId} to {20, 20, 1300, 900}`);
  await wait("return !!document.getElementById('openMapEditor')?.onclick");assert.deepEqual(await evaluate("return window.__qaInitialKeys"),[],"验证源已有数据，不能覆盖");
  assert.deepEqual(await run("return await new ScenarioMapStore().list()"),[]);assert.deepEqual(await run("return await new MapEditorDraftStore().list()"),[]);owned=true;
  await openEditor();const original=await evaluate(`${setup}return exported()`);
  const edited=await evaluate(`${setup}
    $('mapEditorValue').value='forest';$('mapEditorValue').onchange();clickCell(0,0);
    const city=exported().cities.find(item=>item.id==='xuchang');$('mapEditorToolProvince').click();clickCell(city.x,city.y);$('mapEditorCommanderyProvince').value='荆州';$('mapEditorAssignProvince').click();
    $('mapEditorToolCommandery').click();$('mapEditorRegionName').value='持久郡';$('mapEditorAddRegion').click();clickCell(city.x,city.y);
    $('mapEditorToolCity').click();$('mapEditorCity').value=city.id;$('mapEditorCity').onchange();$('mapEditorCityName').value='持久城';$('mapEditorCityName').dispatchEvent(new Event('input',{bubbles:true}));$('mapEditorSaveCity').click();
    $('mapEditorToolRiver').click();$('mapEditorRiverSelect').selectedIndex=1;$('mapEditorRiverSelect').onchange();$('mapEditorRiverName').value='持久河';$('mapEditorRiverRename').click();
    $('mapEditorToolRoad').click();$('mapEditorRoadSelect').selectedIndex=1;$('mapEditorRoadSelect').onchange();$('mapEditorRoadDelete').click();return exported()
  `);
  const saveResult=await run("await document.getElementById('mapEditorApply').onclick();return document.getElementById('mapEditorOutput').textContent");assert.match(saveResult,/剧本地图已保存/);
  const record=await run("return await new ScenarioMapStore().get('200_guandu')");assert.deepEqual(record.patch,edited);
  await reload("!!document.getElementById('openMapEditor')?.onclick");await openEditor();assert.deepEqual(await evaluate(`${setup}return exported()`),edited,"刷新后保存地图应自动加载");
  await evaluate(`${setup}$('mapEditorToolLayer').click();$('mapEditorValue').value='plains';$('mapEditorValue').onchange();clickCell(0,0);return true`);
  const failed=await run("const original=ScenarioMapStore.prototype.put;ScenarioMapStore.prototype.put=async()=>{throw new DOMException('quota','QuotaExceededError')};try{await document.getElementById('mapEditorApply').onclick();return {message:document.getElementById('mapEditorOutput').textContent,status:document.getElementById('mapEditorStatus').textContent,record:await new ScenarioMapStore().get('200_guandu')}}finally{ScenarioMapStore.prototype.put=original}");
  assert.match(failed.message,/失败/);assert.match(failed.status,/未应用改动/);assert.deepEqual(failed.record.patch,edited,"保存失败不能覆盖上一份版本");
  await run("await document.getElementById('mapEditorLoadScenario').onclick();await document.getElementById('mapEditorLoadScenario').onclick();return true");assert.deepEqual(await evaluate(`${setup}return exported()`),edited);
  const resetFailed=await run("const original=ScenarioMapStore.prototype.remove;ScenarioMapStore.prototype.remove=async()=>{throw new Error('storage blocked')};try{await document.getElementById('mapEditorResetScenario').onclick();await document.getElementById('mapEditorResetScenario').onclick();return document.getElementById('mapEditorOutput').textContent}finally{ScenarioMapStore.prototype.remove=original}");
  assert.match(resetFailed,/恢复失败/);assert.deepEqual(await evaluate(`${setup}return exported()`),edited);assert.deepEqual((await run("return await new ScenarioMapStore().get('200_guandu')")).patch,edited);
  await run("await document.getElementById('mapEditorResetScenario').onclick();await document.getElementById('mapEditorResetScenario').onclick();return true");assert.equal(await run("return await new ScenarioMapStore().get('200_guandu')"),null);assert.deepEqual(await evaluate(`${setup}return exported()`),original);
  await evaluate("document.getElementById('mapEditorUndo').click();return true");assert.deepEqual(await evaluate(`${setup}return exported()`),edited);await run("await document.getElementById('mapEditorApply').onclick();return true");
  await evaluate("document.getElementById('mapEditorToolLayer').click();return true");
  await exec("screencapture",["-x","-l",String(windowId),"/private/tmp/sanguo-editor-save-flow.png"]);
  await evaluate("document.getElementById('mapEditorDialog').close();document.querySelector('[data-start-view=\"new\"]').click();document.querySelector('[data-scenario=\"200_guandu\"]').click();document.querySelector('[data-start-force=\"cao\"]').click();document.getElementById('newSaveSlotChoice').value='1';document.getElementById('startGameButton').click();return true");
  await wait("return !!window.__qaMapView&&window.__jiuzhouBootStage==='完成'");
  assert.equal(await evaluate("return window.__qaMapView.state.data.cities.find(city=>city.id==='xuchang').name"),'持久城');assert.equal(await evaluate("return window.__qaMapView.waterways[0].name"),'持久河');
  const firstSave=await evaluate("return JSON.parse(localStorage.getItem('sanguo-cli.slot.1'))");assert.equal(firstSave.world.mapEditor.map.waterways[0].name,'持久河');
  const populationUI=await evaluate("const state=window.__qaMapView.state,city=state.data.cities.find(city=>city.id==='chenliu');state.select('city',city);document.querySelector('#selectionPanel [data-detail]').click();const text=document.querySelector('.city-history-basis').textContent;document.getElementById('detailDialog').close();return {text,population:city.population,reference:city.historical.censusPopulation}");
  assert.equal(populationUI.reference,869433);assert.match(populationUI.text,/140年.*陈留郡.*869,433/);
  await openEditor();assert.equal(await evaluate("return document.getElementById('mapEditorScenarioSection').hidden"),true,JSON.stringify(await evaluate("return {stage:window.__jiuzhouBootStage,apply:document.getElementById('mapEditorApply').textContent,editorView:!!window.__qaEditorGetView?.(),installCount:window.__qaInstallCount,sameData:window.__qaEditorGetData?.()===window.__qaMapView.state.data,selection:document.getElementById('selectionPanel').textContent,open:document.getElementById('mapEditorDialog').open}")));
  await evaluate(`${setup}$('mapEditorToolRiver').click();$('mapEditorRiverSelect').selectedIndex=1;$('mapEditorRiverSelect').onchange();$('mapEditorRiverName').value='战局河';$('mapEditorRiverRename').click();return true`);
  await run("await document.getElementById('mapEditorApply').onclick();return true");assert.equal(await evaluate("return window.__qaMapView.waterways[0].name"),'战局河');assert.equal((await run("return await new ScenarioMapStore().get('200_guandu')")).patch.map.waterways[0].name,'持久河',"修改当前局不能覆盖剧本地图");
  await evaluate(`document.getElementById('mapEditorDialog').close();const second=${JSON.stringify(firstSave)};second.savedAt=new Date().toISOString();second.world.mapEditor.map.waterways=[];second.world.mapEditor.map.landmarks=[];localStorage.setItem('sanguo-cli.slot.2',JSON.stringify(second));document.getElementById('loadButton').click();document.querySelector('[data-slot-action="2"]').click();return true`);
  await wait("return window.__qaMapView.state.saveSlot==='2'");assert.deepEqual(await evaluate("return {rivers:window.__qaMapView.waterways,landmarks:window.__qaMapView.landmarks}"),{rivers:[],landmarks:[]});
  await evaluate("document.getElementById('loadButton').click();document.querySelector('[data-slot-action=\"1\"]').click();return true");await wait("return window.__qaMapView.state.saveSlot==='1'");assert.equal(await evaluate("return window.__qaMapView.waterways[0].name"),'战局河');
  await reload("!!window.__qaMapView&&window.__jiuzhouBootStage==='完成'");assert.equal(await evaluate("return window.__qaMapView.waterways[0].name"),'战局河');assert.equal(await evaluate("return window.__qaMapView.state.saveSlot"),'1');
  assert.equal(apiRequests,0,"静态验证不能访问本地战局存档 API");
  console.log(JSON.stringify({passed:["剧本地图保存","刷新自动恢复","自定义州郡及城市恢复","河流与道路恢复","保存失败保留旧版本及当前编辑","载入已保存地图","恢复原始失败保留地图","恢复原始地图与撤销重存","新开局使用保存地图","战局与剧本保存隔离","同页切换存档更新河流及地标","战局刷新恢复"],apiRequests,directory},null,2));
}finally{
  if(windowId&&owned){await apple(`tell application "Safari" to set URL of current tab of window id ${windowId} to ${JSON.stringify(url+"qa-cleanup.html")}`).catch(()=>{});await wait("return !!window.ScenarioMapStore&&!!window.MapEditorDraftStore&&!window.GameState").catch(()=>{});await run("const maps=new ScenarioMapStore(),drafts=new MapEditorDraftStore();for(const {key} of await maps.list())await maps.storage.remove(key);for(const {key} of await drafts.list())await drafts.remove(key);localStorage.clear();sessionStorage.clear();return true").catch(()=>{})}
  if(windowId)await apple(`tell application "Safari" to close window id ${windowId}`).catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
