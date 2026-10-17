import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
if(typeof CustomEvent==='undefined')globalThis.CustomEvent=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
await import('../js/data/offline-data.generated.js');
for(const file of ['data-loader','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${file}.js`);
const base=await new DataLoader(SANGUO_DATA).load({useSavedMap:false}),state=new GameState(structuredClone(base),{playerForceId:'cao'}),city=state.data.cities.find(c=>c.force==='cao');
const rows={food:{turn:273,gross:266201,resource:'food',cost:40,inefficiencyLoss:85657,corruptionLoss:6276,localUse:21988,retained:22765,remitted:129515,pending:0,transportLoss:0,expected:129515},gold:{turn:30,gross:0,resource:'gold',cost:0},extension:{turn:1,gross:3,customSource:'保留扩展字段'}};
city.fiscal.lastCollection=structuredClone(rows);const save=JSON.parse(JSON.stringify(state.serialize())),packed=save.world.cities.find(c=>c.id===city.id).fiscal.lastCollection;
assert(Array.isArray(packed.food));assert(packed.extension.customSource);assert.deepEqual(city.fiscal.lastCollection,rows,'保存不修改运行时明细');assert(JSON.stringify(packed).length<JSON.stringify(rows).length);
for(const legacy of [false,true]){
 const input=structuredClone(save);if(legacy)input.world.cities.find(c=>c.id===city.id).fiscal.lastCollection=structuredClone(rows);
 const before=JSON.stringify(input),restored=new GameState(structuredClone(base),{initializeGrain:false});restored.applySave(restored.migrateSave(input));
 assert.deepEqual(restored.data.cities.find(c=>c.id===city.id).fiscal.lastCollection,rows,'新旧明细格式均完整还原');assert.equal(JSON.stringify(input),before,'读取不改写传入存档');
 assert.deepEqual(restored.serialize().world.cities.find(c=>c.id===city.id).fiscal.lastCollection,packed,'再次保存格式稳定');
}
console.log('征收明细压缩：零值、缺失字段、扩展字段、新旧档还原与重复保存通过');
