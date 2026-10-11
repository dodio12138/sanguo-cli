import {execFile} from "node:child_process";
import {promisify} from "node:util";
import assert from "node:assert/strict";

// 独立 Safari 窗口和验证端口，避免刷新用户正在游玩的页面。
const exec=promisify(execFile),url=process.argv.find(arg=>arg.startsWith("--url="))?.slice(6)||"http://127.0.0.1:8091/?qa=map-editor";
const apple=async script=>(await exec("osascript",["-e",script],{maxBuffer:8*1024*1024})).stdout.trim();
const id=Number(await apple(`tell application "Safari"\nmake new document with properties {URL:${JSON.stringify(url)}}\nreturn id of front window\nend tell`));
await apple(`tell application "Safari" to set bounds of window id ${id} to {20, 20, 1300, 900}`);
const evaluate=async script=>{const raw=await apple(`tell application "Safari" to do JavaScript ${JSON.stringify(`JSON.stringify((()=>{${script}})())`)} in current tab of window id ${id}`);if(!raw)throw new Error("浏览器检查脚本未返回结果");return JSON.parse(raw)};
const wait=async script=>{const start=Date.now();while(Date.now()-start<45000){if(await evaluate(script).catch(()=>false))return;await new Promise(resolve=>setTimeout(resolve,200))}throw new Error("浏览器等待超时")};
const evaluateAsync=async script=>{await evaluate(`window.__editorQaAsync={done:false};(async()=>{${script}})().then(value=>window.__editorQaAsync={done:true,value},error=>window.__editorQaAsync={done:true,error:String(error)});return true`);await wait("return window.__editorQaAsync?.done");const result=await evaluate("return window.__editorQaAsync");if(result.error)throw new Error(result.error);return result.value};
let storageBackup=null,indexedBackup=null;
try{
  await wait("return !!document.getElementById('openMapEditor')?.onclick");
  storageBackup=await evaluate("const keys=Object.keys(localStorage).filter(key=>key.startsWith('sanguo.map-editor.draft.'));const backup=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));for(const key of keys)localStorage.removeItem(key);return backup");
  indexedBackup=await evaluateAsync("const store=new MapEditorDraftStore(),records=await store.list();for(const {key} of records)await store.remove(key);return records");
  await evaluate("document.getElementById('openMapEditor').click();return true");
  await new Promise(resolve=>setTimeout(resolve,350));
  const setup=`
    const $=id=>document.getElementById(id),canvas=$('mapEditorCanvas'),viewport=canvas.closest('.map-editor-viewport');
    function exported(){const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=()=>{};try{$('mapEditorExportPatch').click();return JSON.parse($('mapEditorJson').value)}finally{HTMLAnchorElement.prototype.click=click}}
    function point(x,y){const rect=canvas.getBoundingClientRect(),map=window.__editorQaOriginal.map;return {clientX:rect.left+(x+.5)*rect.width/map.width,clientY:rect.top+(y+.5)*rect.height/map.height}}
    function pointer(type,x,y,extra={}){canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:7,button:0,...point(x,y),...extra}))}
    function clickCell(x,y){const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};try{pointer('pointerdown',x,y);pointer('pointerup',x,y)}finally{canvas.setPointerCapture=capture}}
  `;
  await evaluate(`${setup}window.__editorQaOriginal=exported();return true`);
  const stroke=await evaluate(`${setup}
    const original=window.__editorQaOriginal;$('mapEditorValue').value='forest';$('mapEditorValue').onchange();
    const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
    try{pointer('pointerdown',0,0);pointer('pointermove',7,0);pointer('pointerup',7,0)}finally{canvas.setPointerCapture=capture}
    const painted=exported();$('mapEditorUndo').click();const undone=exported();$('mapEditorRedo').click();const redone=exported();
    return {painted:painted.map.terrain,original:original.map.terrain,undone:undone.map.terrain,redone:redone.map.terrain,fit:{canvas:[canvas.getBoundingClientRect().width,canvas.getBoundingClientRect().height],viewport:[viewport.clientWidth,viewport.clientHeight]}}
  `);
  assert.notEqual(stroke.painted,stroke.original);assert.equal(stroke.undone,stroke.original,"一次撤销应还原整笔");assert.equal(stroke.redone,stroke.painted);
  assert.ok(stroke.fit.canvas[0]<=stroke.fit.viewport[0]+1&&stroke.fit.canvas[1]<=stroke.fit.viewport[1]+1,"适配需同时满足视口宽高");
  const imports=await evaluate(`${setup}
    $('mapEditorJson').value=JSON.stringify({map:{terrain:'plains*3600',provinces:'错误*2'}});$('mapEditorImport').click();const failure=$('mapEditorOutput').textContent;
    return {failure,terrain:exported().map.terrain}
  `);
  assert.match(imports.failure,/导入失败/);assert.equal(imports.terrain,stroke.painted,"失败导入必须无残留");
  const keyboardQa=await evaluate(`${setup}
    $('mapEditorJson').focus();clickCell(0,0);const focusReturned=document.activeElement===canvas;
    canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}));const undone=exported().map.terrain;
    canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}));const redone=exported().map.terrain;
    return {focusReturned,undone,redone}
  `);
  assert.equal(keyboardQa.focusReturned,true,"点击舆图后焦点不能停留在文本框");assert.equal(keyboardQa.undone,stroke.original);assert.equal(keyboardQa.redone,stroke.painted);
  const cityQa=await evaluate(`${setup}
    $('mapEditorToolCity').click();const city=exported().cities.find(item=>item.id===$('mapEditorCity').value);
    const original=exported(),occupied=new Set([...original.cities,...original.counties].map(item=>item.x+','+item.y));
    const grid=MapGrid.decodeLayer(original.map,'terrain',original.map.width,original.map.height);
    const index=grid.findIndex((terrain,i)=>terrain!=='ocean'&&!occupied.has((i%original.map.width)+','+Math.floor(i/original.map.width)));
    const x=index%original.map.width,y=Math.floor(index/original.map.width);clickCell(x,y);
    const unchanged=exported().cities.find(item=>item.id===city.id);$('mapEditorMoveCity').click();clickCell(x,y);
    const moved=exported().cities.find(item=>item.id===city.id);$('mapEditorUndo').click();const restored=exported().cities.find(item=>item.id===city.id);
    $('mapEditorCityName').value='未保存名称';$('mapEditorCityName').dispatchEvent(new Event('input',{bubbles:true}));
    $('mapEditorExportPatch').click();const formGuard=$('mapEditorOutput').textContent;$('mapEditorDiscardCityForm').click();
    return {city,unchanged,moved,restored,x,y,formGuard}
  `);
  assert.deepEqual(cityQa.unchanged,cityQa.city,"点击空格不能直接移动城市");
  assert.equal(cityQa.moved.x,cityQa.x);assert.equal(cityQa.moved.y,cityQa.y);assert.deepEqual(cityQa.restored,cityQa.city);
  assert.match(cityQa.formGuard,/请先保存据点表单/);
  const roadQa=await evaluate(`${setup}
    $('mapEditorToolRoad').click();const cities=exported().cities;
    $('mapEditorRoadFrom').value=cities[0].id;$('mapEditorRoadFrom').onchange();$('mapEditorRoadTo').value=cities[1].id;$('mapEditorRoadTo').onchange();$('mapEditorRoadDraw').click();
    $('mapEditorToolCity').click();$('mapEditorMoveCity').click();const moveGuard=$('mapEditorOutput').textContent;
    $('mapEditorToolRoad').click();$('mapEditorRoadTo').value=cities[2].id;$('mapEditorRoadTo').onchange();
    return {moveGuard,finishDisabled:$('mapEditorRoadFinish').disabled,cancelDisabled:$('mapEditorRoadCancel').disabled,message:$('mapEditorOutput').textContent}
  `);
  assert.match(roadQa.moveGuard,/请先完成并保存或取消/);assert.equal(roadQa.finishDisabled,true);assert.equal(roadQa.cancelDisabled,true);assert.match(roadQa.message,/端点已更改/);
  const regionQa=await evaluate(`${setup}
    const before=exported(),city=before.cities[0];$('mapEditorToolProvince').click();
    clickCell(city.x,city.y);$('mapEditorCommanderyProvince').value='荆州';$('mapEditorAssignProvince').click();const province=exported();
    $('mapEditorToolCommandery').click();$('mapEditorRegionName').value='验证郡';$('mapEditorAddRegion').click();const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};try{pointer('pointerdown',city.x,city.y,{shiftKey:true});pointer('pointerup',city.x,city.y)}finally{canvas.setPointerCapture=capture}const commandery=exported();
    $('mapEditorToolCity').click();const form={province:$('mapEditorCityProvince').value,commandery:$('mapEditorCityCommandery').value,readonly:$('mapEditorCityProvince').readOnly&&$('mapEditorCityCommandery').readOnly};
    $('mapEditorUndo').click();$('mapEditorUndo').click();const restored=exported();
    return {before:{terrain:before.map.terrain,commanderies:before.map.commanderies,provinces:before.map.provinces},province:{terrain:province.map.terrain,commanderies:province.map.commanderies,provinces:province.map.provinces,city:province.cities[0]},commandery:{terrain:commandery.map.terrain,provinces:commandery.map.provinces,city:commandery.cities[0]},form,restored:{terrain:restored.map.terrain,commanderies:restored.map.commanderies,provinces:restored.map.provinces}}
  `);
  assert.equal(regionQa.province.terrain,regionQa.before.terrain);assert.equal(regionQa.province.commanderies,regionQa.before.commanderies);assert.equal(regionQa.province.city.province,'荆州');
  assert.equal(regionQa.commandery.provinces,regionQa.province.provinces);assert.equal(regionQa.commandery.city.commandery,'验证郡');assert.deepEqual(regionQa.form,{province:'荆州',commandery:'验证郡',readonly:true});assert.deepEqual(regionQa.restored,regionQa.before);
  const riverQa=await evaluate(`${setup}
    $('mapEditorToolRiver').click();const original=exported(),river=original.map.waterways[0];$('mapEditorRiverSelect').value=river.id;$('mapEditorRiverSelect').onchange();$('mapEditorRiverAdjust').click();
    const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
    try{pointer('pointerdown',...river.points[1]);pointer('pointermove',river.points[1][0],river.points[1][1]+1);pointer('pointerup',river.points[1][0],river.points[1][1]+1)}finally{canvas.setPointerCapture=capture}
    const edited=exported();$('mapEditorUndo').click();const reverted=exported();
    $('mapEditorRiverSelect').value='';$('mapEditorRiverSelect').onchange();$('mapEditorRiverName').value='验证新河';$('mapEditorRiverDraw').click();
    clickCell(1,1);clickCell(5,2);clickCell(6,3);$('mapEditorRiverFinish').click();const added=exported();
    $('mapEditorRiverDelete').click();const removed=exported();$('mapEditorUndo').click();const undoRemoval=exported();$('mapEditorRedo').click();const redoRemoval=exported();
    return {original:original.map.waterways,edited:edited.map.waterways,reverted:reverted.map.waterways,terrainUnchanged:edited.map.terrain===original.map.terrain,added:added.map.waterways,removed:removed.map.waterways,undoRemoval:undoRemoval.map.waterways,redoRemoval:redoRemoval.map.waterways}
  `);
  assert.equal(riverQa.edited[0].points[1][1],riverQa.original[0].points[1][1]+1);assert.deepEqual(riverQa.reverted,riverQa.original);assert.equal(riverQa.terrainUnchanged,true);
  assert.equal(riverQa.added.length,riverQa.original.length+1);assert.equal(riverQa.added.at(-1).name,'验证新河');assert.deepEqual(riverQa.removed,riverQa.original);assert.deepEqual(riverQa.undoRemoval,riverQa.added);assert.deepEqual(riverQa.redoRemoval,riverQa.original);
  const roadDeletionQa=await evaluate(`${setup}
    $('mapEditorToolRoad').click();const original=exported(),road=original.map.roads.find(route=>route.kind==='main');$('mapEditorRoadSelect').value=road.id;$('mapEditorRoadSelect').onchange();$('mapEditorRoadDelete').click();const removed=exported();$('mapEditorUndo').click();const restored=exported();
    return {id:road.id,originalCount:original.map.roads.length,remainingCount:removed.map.roads.length,linkedAfterDelete:(removed.rules.city_graph[road.from]||[]).includes(road.to),restored:restored.map.roads,original:original.map.roads}
  `);
  assert.equal(roadDeletionQa.remainingCount,roadDeletionQa.originalCount-1);assert.equal(roadDeletionQa.linkedAfterDelete,false);assert.deepEqual(roadDeletionQa.restored,roadDeletionQa.original);
  const roadAdjustQa=await evaluate(`${setup}
    const original=exported(),terrain=MapGrid.decodeLayer(original.map,'terrain',original.map.width,original.map.height);
    const road=original.map.roads.find(route=>{const points=MapGrid.decodeRoadPath(route),i=Math.floor(points.length/2),p=points[i];return points.length>4&&p[1]+1<original.map.height&&terrain[(p[1]+1)*original.map.width+p[0]]!=='ocean'});
    const points=MapGrid.decodeRoadPath(road),index=Math.floor(points.length/2),p=points[index];$('mapEditorRoadSelect').value=road.id;$('mapEditorRoadSelect').onchange();$('mapEditorRoadAdjust').click();
    const capture=canvas.setPointerCapture;canvas.setPointerCapture=()=>{};
    try{pointer('pointerdown',...p);pointer('pointermove',p[0],p[1]+1);pointer('pointerup',p[0],p[1]+1)}finally{canvas.setPointerCapture=capture}
    const edited=exported();$('mapEditorUndo').click();const reverted=exported();
    return {original:original.map.roads,edited:edited.map.roads,reverted:reverted.map.roads,message:$('mapEditorOutput').textContent}
  `);
  assert.notDeepEqual(roadAdjustQa.edited,roadAdjustQa.original);assert.deepEqual(roadAdjustQa.reverted,roadAdjustQa.original);
  await evaluate("document.getElementById('mapEditorToolLayer').click();return true");
  await new Promise(resolve=>setTimeout(resolve,450));
  const saved=await evaluateAsync("return (await new MapEditorDraftStore().list()).map(record=>record.value)");
  assert.equal(saved.length,1);assert.equal(saved[0].patch.map.terrain,stroke.painted);
  await evaluate("location.reload();return true");
  await new Promise(resolve=>setTimeout(resolve,700));await wait("return !!document.getElementById('openMapEditor')?.onclick");
  await evaluate("document.getElementById('openMapEditor').click();return true");
  await new Promise(resolve=>setTimeout(resolve,350));
  assert.equal(await evaluate(`${setup}window.__editorQaOriginal=exported();return window.__editorQaOriginal.map.terrain`),stroke.painted,"刷新后需恢复未应用草稿");
  await evaluate(`${setup}$('mapEditorToolRiver').click();$('mapEditorRiverSelect').value='';$('mapEditorRiverSelect').onchange();$('mapEditorRiverName').value='待完成河流';$('mapEditorRiverDraw').click();clickCell(2,2);clickCell(4,3);return true`);
  await new Promise(resolve=>setTimeout(resolve,450));
  const riverDraft=await evaluateAsync("return (await new MapEditorDraftStore().list())[0].value.riverDraft");assert.deepEqual(riverDraft.points,[[2,2],[4,3]]);
  await evaluate("location.reload();return true");await new Promise(resolve=>setTimeout(resolve,700));await wait("return !!document.getElementById('openMapEditor')?.onclick");
  await evaluate("document.getElementById('openMapEditor').click();return true");await new Promise(resolve=>setTimeout(resolve,350));
  const draftRestored=await evaluate("return {active:document.getElementById('mapEditorToolRiver').classList.contains('active'),name:document.getElementById('mapEditorRiverName').value,status:document.getElementById('mapEditorStatus').textContent}");
  assert.equal(draftRestored.active,true);assert.equal(draftRestored.name,'待完成河流');assert.match(draftRestored.status,/河流绘制中/);
  await evaluate("document.getElementById('mapEditorRiverCancel').click();document.getElementById('mapEditorToolLayer').click();return true");
  const geometry=await evaluate(`${setup}
    const r=selector=>{const box=document.querySelector(selector).getBoundingClientRect();return {left:box.left,top:box.top,right:box.right,bottom:box.bottom,width:box.width,height:box.height}};
    const before=r('#mapEditorHover');for(let i=0;i<12;i++)$('mapEditorZoomIn').click();viewport.scrollTop=80;viewport.scrollLeft=60;const after=r('#mapEditorHover');
    const wide={dialog:r('#mapEditorDialog'),board:r('.map-editor-board'),side:r('.map-editor-side'),footer:r('.map-editor-footer')};
    $('mapEditorZoomFit').click();return {before,after,wide}
  `);
  if(Math.abs(geometry.wide.board.bottom-geometry.wide.side.bottom)>=2)console.error(JSON.stringify(geometry));
  assert.equal(geometry.before.top,geometry.after.top,"地图滚动不能带动提示条");assert.ok(Math.abs(geometry.wide.board.bottom-geometry.wide.side.bottom)<2,"左右栏底边应对齐");
  await exec("screencapture",["-x","-l",String(id),"/private/tmp/sanguo-editor-wide.png"]);
  await evaluate("document.getElementById('mapEditorToolProvince').click();return true");await exec("screencapture",["-x","-l",String(id),"/private/tmp/sanguo-editor-province.png"]);
  await evaluate("const $=id=>document.getElementById(id);$('mapEditorToolRiver').click();$('mapEditorRiverSelect').selectedIndex=1;$('mapEditorRiverSelect').onchange();$('mapEditorRiverAdjust').click();const scroll=document.querySelector('.map-editor-side-scroll'),panel=$('mapEditorPanelRiver');scroll.scrollTop+=panel.getBoundingClientRect().top-scroll.getBoundingClientRect().top;return true");
  await exec("screencapture",["-x","-l",String(id),"/private/tmp/sanguo-editor-river.png"]);
  await evaluate("document.getElementById('mapEditorToolLayer').click();document.querySelector('.map-editor-side-scroll').scrollTop=0;return true");
  await evaluate("const dialog=document.getElementById('mapEditorDialog');dialog.classList.remove('os-dialog-maximized');dialog.style.width='640px';dialog.style.height='640px';return true");
  await new Promise(resolve=>setTimeout(resolve,450));
  const narrow=await evaluate("const r=selector=>{const b=document.querySelector(selector).getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height}};return {dialog:r('#mapEditorDialog'),board:r('.map-editor-board'),side:r('.map-editor-side'),footer:r('.map-editor-footer'),viewport:r('.map-editor-viewport')}");
  assert.ok(narrow.side.top>=narrow.board.bottom,"窄窗口应改为上下布局");assert.ok(narrow.footer.bottom<=narrow.dialog.bottom+1,"窄窗口应用按钮必须留在窗口内");assert.ok(narrow.viewport.height>60);
  await exec("screencapture",["-x","-l",String(id),"/private/tmp/sanguo-editor-narrow.png"]);
  console.log(JSON.stringify({passed:["整笔绘制与撤销重做","失败导入原子性","文本输入后地图焦点与撤销快捷键","据点选择、显式移动及撤销","未保存表单拦截","道路草稿与移动冲突拦截","道路端点切换取消旧草稿","独立州郡图层与坐标自动归属","河流绘制与控制点拖动","河流删除及撤销重做","道路删除与通行同步","道路节点拖动及整次撤销","浏览器草稿保存和刷新恢复","未完成河流草稿刷新恢复","真实适配尺寸","提示栏固定","左右栏对齐","窄窗口布局"],geometry,narrow,screenshots:["/private/tmp/sanguo-editor-wide.png","/private/tmp/sanguo-editor-narrow.png","/private/tmp/sanguo-editor-province.png","/private/tmp/sanguo-editor-river.png"]},null,2));
}finally{
  if(storageBackup)await evaluate(`for(const key of Object.keys(localStorage))if(key.startsWith('sanguo.map-editor.draft.'))localStorage.removeItem(key);for(const [key,value] of Object.entries(${JSON.stringify(storageBackup)}))localStorage.setItem(key,value);return true`).catch(()=>{});
  if(indexedBackup)await evaluateAsync(`const store=new MapEditorDraftStore();for(const {key} of await store.list())await store.remove(key);for(const {key,value} of ${JSON.stringify(indexedBackup)})await store.put(key,value);return true`).catch(()=>{});
  await apple(`tell application "Safari" to close window id ${id}`).catch(()=>{});
}
