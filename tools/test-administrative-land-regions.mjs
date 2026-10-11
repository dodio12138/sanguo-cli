import assert from 'node:assert/strict';
globalThis.window=globalThis;
for(const file of ['core/map-grid','ui/map-editor','core/scenario-map-store'])await import(`../js/${file}.js`);

const terrain=Array(36).fill('plains');
for(let y=0;y<6;y++)terrain[y*6+5]='ocean';
terrain[4]='ocean';terrain[34]='ocean';
const commanderies=Array.from({length:36},(_,index)=>index%6<3?'甲郡':'乙郡');
commanderies[10]=null; // Newly added coast without an administrative assignment.
const fixture=()=>({
  scenario:{id:'coast'},
  map:{id:'coast',width:6,height:6,terrain:MapGrid.encode(terrain),pixel_mask:MapGrid.encode(Array(36).fill('1')),provinces:MapGrid.encode(Array(36).fill('旧州')),commanderies:MapGrid.encode(commanderies),commanderySeats:[],roads:[],waterways:[],landmarks:[]},
  administrativeDivisions:{commandery_seats_140:[{name:'甲郡',province:'甲州'},{name:'乙郡',province:'乙州'}]},
  cities:[{id:'a',name:'甲城',type:'city',force:'cao',x:1,y:1,province:'旧州',commandery:'旧郡',population:1234,garrison:200}],
  counties:[{id:'q',name:'甲县',x:1,y:1,cityId:'a',jurisdictionCityId:'a',population:321}],
  forces:[{id:'cao',name:'曹营'}],terrainDefs:{plains:{name:'平原'},ocean:{name:'海洋'}},rules:{city_graph:{a:[]}}
});
const source=fixture(),original=structuredClone(source),editor=new MapEditor(source);
assert.deepEqual(source,original,'打开编辑器不得改原战局、海陆或旧掩码');
assert.deepEqual(editor.terrain,terrain);
assert.equal(editor.exportMap().terrain,source.map.terrain,'地形编码也不能被行政适配重建');
assert.equal(editor.exportMap().pixel_mask,source.map.pixel_mask,'旧掩码不能反向覆盖新海陆');
for(let index=0;index<36;index++){
  if(terrain[index]==='ocean'){assert.equal(editor.commanderies[index],null);assert.equal(editor.provinces[index],null)}
  else{assert.ok(editor.commanderies[index]);assert.equal(editor.provinces[index],editor.commanderyProvince(editor.commanderies[index]));if(commanderies[index])assert.equal(editor.commanderies[index],commanderies[index],'原陆地郡界必须保留')}
}
assert.equal(editor.commanderyAt(4,1),'乙郡','新增沿岸陆地应就近补入邻郡');
assert.deepEqual([editor.city('a').province,editor.counties[0].province],['甲州','甲州']);
const before=editor.snapshot(),history=editor.undoStack.length;
assert.equal(editor.setProvince(1,1,'错误州'),false);
assert.equal(editor.paint('province',0,0,5,5,'错误州'),0);
assert.equal(editor.fill('province','错误州'),0);
assert.equal(editor.relabelRegion('province',1,1,'错误州'),0);
assert.equal(editor.resetLayer('province'),false);
assert.equal(editor.setCommandery(5,0,'甲郡'),false);
assert.equal(editor.relabelRegion('commandery',5,0,'甲郡'),0);
assert.equal(editor.paint('commandery',5,0,5,5,'甲郡'),0);
assert.deepEqual(editor.snapshot(),before);assert.equal(editor.undoStack.length,history);
editor.assignCommanderyProvince('甲郡','乙州');
assert.ok(editor.provinces.filter(Boolean).every(name=>name==='乙州'),'州域由所属郡的全部陆地格合成');
assert.deepEqual(editor.terrain,terrain);assert.deepEqual(editor.commanderies,before.commanderies);
assert.equal(editor.city('a').population,1234);assert.equal(editor.counties[0].population,321);
editor.undo();assert.deepEqual(editor.snapshot(),before);editor.redo();assert.equal(editor.city('a').province,'乙州');
editor.undo();editor.setCommandery(1,1,'乙郡');
assert.equal(editor.provinceAt(1,1),'乙州');assert.equal(editor.city('a').province,'乙州');assert.equal(editor.counties[0].province,'乙州');
editor.undo();assert.deepEqual(editor.snapshot(),before);
editor.cedeCommandery(2,1,2,1,{random:()=>0});assert.equal(editor.provinceAt(2,1),'乙州','右键改属邻郡也更新州界');editor.undo();
const filled=editor.fill('commandery','乙郡');assert.equal(filled,before.commanderies.filter(name=>name&&name!=='乙郡').length);
for(let index=0;index<36;index++)assert.equal(editor.commanderies[index],terrain[index]==='ocean'?null:'乙郡');editor.undo();
editor.setTerrain(1,1,'ocean');assert.equal(editor.commanderyAt(1,1),null);assert.equal(editor.provinceAt(1,1),null);
editor.undo();assert.deepEqual(editor.snapshot(),before,'用户主动画海后撤销，海陆与行政层一起恢复');
const destination=fixture();editor.applyTo(destination);const reopened=new MapEditor(destination);
assert.deepEqual(reopened.snapshot(),editor.snapshot(),'保存后重开不能漂移行政或海陆');
const imported=new MapEditor(fixture());imported.importPatch(editor.exportPatch());assert.deepEqual(imported.terrain,terrain);assert.deepEqual(imported.provinces,editor.provinces);
const beforeInvalid=imported.snapshot(),beforeInvalidHistory=imported.undoStack.length;
assert.throws(()=>imported.importPatch({map:{commandery_provinces:[]}}),/郡属州/);
assert.throws(()=>imported.importPatch({map:{commandery_provinces:{'甲郡':5}}}),/文字/);
assert.throws(()=>imported.importPatch({map:{commandery_provinces:{'甲郡':'坏*州'}}}),/名称/);
assert.deepEqual(imported.snapshot(),beforeInvalid);assert.equal(imported.undoStack.length,beforeInvalidHistory,'非法郡属州导入不能消耗撤销或改变地形');
const stale=fixture();stale.map.provinces=MapGrid.encode(Array(36).fill('冲突州'));stale.map.commandery_provinces={'甲郡':'乙州','乙郡':'甲州'};
const normalized=MapGrid.syncAdministrativeRegions(stale);assert.equal(stale.map.terrain,source.map.terrain);assert.equal(stale.cities[0].province,'乙州');assert.equal(normalized.provinces[3],'甲州','显式郡属州优先于旧州域和历史默认');
const island=fixture();const islandTerrain=Array(36).fill('ocean');islandTerrain[0]=islandTerrain[1]=islandTerrain[34]=islandTerrain[35]='plains';const islandOwners=Array(36).fill(null);islandOwners[0]='甲郡';island.map.terrain=MapGrid.encode(islandTerrain);island.map.commanderies=MapGrid.encode(islandOwners);
const islandLayers=MapGrid.layers(island.map,island.cities,island.counties,island.administrativeDivisions);assert.equal(islandLayers.commanderies[35],'甲郡');assert.equal(islandLayers.provinces[35],'甲州');assert.deepEqual(islandLayers.terrain,islandTerrain,'无种子的岛屿也只能补归属，不能填海连陆');
const legacyRecord={version:1,scenarioId:'coast',savedAt:'old',baseFingerprint:ScenarioMapStore.fingerprint(source,{legacy:true}),patch:{map:source.map,cities:source.cities,counties:source.counties,administrativeDivisions:source.administrativeDivisions,rules:source.rules}};
assert.notEqual(legacyRecord.baseFingerprint,ScenarioMapStore.fingerprint(source));
const legacy=ScenarioMapStore.prepare(source,legacyRecord);assert.equal(legacy.meta.scenarioMap.status,'saved');assert.equal(legacy.map.terrain,source.map.terrain,'旧指纹保存版应自动载入且保留手绘海陆');
const changed=fixture();changed.map.terrain=MapGrid.encode(Array(36).fill('plains'));assert.throws(()=>ScenarioMapStore.prepare(changed,legacyRecord),/原始剧本数据已变化/,'兼容旧指纹不能放过真正变更的基准');
console.log('海陆行政适配通过：海陆不变 / 海面裁郡 / 邻郡补空 / 岛屿 / 整郡州属 / 只读州域 / 节点同步 / 单步撤销重做 / 保存导入 / 旧指纹兼容');
