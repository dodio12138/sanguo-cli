// 后期剧本：史实时序、驻地与朝廷/方面、地方势力可玩性、推演及存档隔离。
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
globalThis.fetch=async url=>{try{return {ok:true,status:200,json:async()=>read(String(url).replace(/^\//,''))}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==='undefined')globalThis.CustomEvent=class extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const file of ['data-loader','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${file}.js`);
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../js/data/offline-data.generated.js',import.meta.url),'utf8'),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load({useSavedMap:false});
const ids=['249_gaopingling','253_hefei','263_jiange','279_jianye'];
const person=(g,n)=>g.data.officers.find(o=>o.name===n),at=(g,n,f,c)=>{const o=person(g,n);assert(o,`${n} 已载入`);assert.equal(o.status,'serving',n);assert.equal(o.force,f,n);if(c)assert.equal(o.city,c,n)};
for(const id of ids){
 const data=await loader.loadScenario(id,{useSavedMap:false}),diag=loader.diagnose(data);assert(diag.ok,JSON.stringify(diag));assert(!(diag.warnings||[]).some(w=>w.includes("持有者不存在")),`${id} 宝物不引用缺失的早期人物`);
 assert.deepEqual(data.meta.officerPostings.skipped,[],`${id} 驻地全数套用`);
 assert.equal(new Set(data.officers.map(o=>o.name)).size,data.officers.length,`${id} 不重复建立同名人物`);
 assert.equal(data.officers.length,data.scenario.patch.roster_names.length,`${id} 审校名册完整加载`);
 for(const force of data.forces)assert.equal(force.cities,data.cities.filter(c=>c.force===force.id&&(c.type||'city')==='city').length,`${id} ${force.id} 据点数排除港口和关隘`);
 const g=new GameState(structuredClone(data),{playerForceId:data.scenario.default_player_force});
 assert.deepEqual(g.court.skipped,[],`${id} 朝廷任官全数落地`);assert.deepEqual(g.forceCommandSkipped,[],`${id} 方面全数落地`);
 for(const o of g.data.officers.filter(o=>o.status==='serving')){assert(!o.deathYear||o.deathYear>=g.date.year,`${id} ${o.name} 不能死而复任`);assert(!o.birthYear||o.birthYear<=g.date.year,`${id} ${o.name} 不能未出生任官`);assert.equal(g.data.cities.find(c=>c.id===o.city)?.force,o.force,`${id} ${o.name} 不驻敌城`)}
 for(const army of g.data.armies){const officer=person(g,army.commander);assert(officer&&officer.status==='serving'&&officer.force===army.force,`${id} ${army.name} 将领有效`);assert.equal(Object.values(army.units).reduce((a,b)=>a+b,0),army.soldiers)}
 if(id.startsWith('249')){at(g,'曹芳','cao','luoyang');at(g,'曹爽','cao','luoyang');at(g,'司马懿','cao','luoyang');at(g,'孙权','sun');assert(!person(g,'文鸯')||person(g,'文鸯').status!=='serving');assert.equal(g.court.emperor.era,'正始');assert.match(GameClock.era(g.date),/正始/);assert.match(GameClock.era({year:249,month:4}),/嘉平/)}
 if(id.startsWith('253')){at(g,'孙亮','sun');at(g,'诸葛恪','sun');at(g,'张特','cao','hefei');assert.equal(person(g,'费祎').status,'dead');assert(g.court.offices.some(o=>o.office==='taiwei'&&o.officerId===person(g,'司马孚').id))}
 if(id.startsWith('263')){at(g,'曹奂','cao');at(g,'姜维','liu');at(g,'吕兴','lv_xing','jiaozhi');assert.equal(person(g,'孙谞').status,'dead');assert(!person(g,'嵇康')||person(g,'嵇康').status!=='serving');assert(!g.court.offices.some(o=>o.office==='situ'&&o.officerId===person(g,'司马孚').id));assert.equal(g.data.cities.find(c=>c.id==='shangyong').force,'cao')}
 if(id.startsWith('279')){assert.equal(g.court.dynasty,'晋');at(g,'司马炎','cao');at(g,'王濬','cao','chengdu');at(g,'杜预','cao','xiangyang');at(g,'孙皓','sun');at(g,'陶璜','sun','jiaozhi');at(g,'郭马','guo_ma','panyu');at(g,'秃发树机能','tufa_shujineng','xiliang');at(g,'孙楷','cao');assert(!g.data.forces.some(f=>f.id==='liu'));for(const n of ['曹操','刘备','诸葛亮','陆抗','羊祜'])assert(!person(g,n)||person(g,n).status==='dead',`${n} 不可复活`);assert.equal(g.data.armies.find(a=>a.commander==='马隆').soldiers,3500);assert(g.court.offices.some(o=>o.office==='situ'&&o.officerId===person(g,'何植').id));assert.equal(person(g,'闾丰')?.force,'sun');assert(!person(g,'吕丰'))}
 for(const force of data.scenario.playable_forces){const local=new GameState(structuredClone(data),{playerForceId:force});assert.equal(local.selected.value.force,force);local.endTurn();assert.equal(local.turn,2)}
 g.observerMode=true;for(let day=0;day<10;day++)g.endTurn();
 const save=JSON.parse(JSON.stringify(g.serialize())),restored=new GameState(structuredClone(data));restored.applySave(restored.migrateSave(save));
 assert.equal(restored.turn,g.turn);assert.deepEqual(restored.date,g.date);assert.equal(restored.court.dynasty,g.court.dynasty);assert.deepEqual(restored.data.forces.map(f=>f.id),g.data.forces.map(f=>f.id));assert.equal(restored.data.officers.length,g.data.officers.length);
 console.log(`${id}: ${data.officers.length} 人物 / ${data.officers.filter(o=>o.status==='serving').length} 在任 / ${data.armies.length} 军团 / 全势力开局、十日推演和存档往返通过`);
}
const old=await loader.loadScenario('200_guandu',{useSavedMap:false});assert(!old.officers.some(o=>o.expansionBatch==='late-scenarios-20261016'),'本批后期专属人物不能注入旧剧本');assert(!old.clans.some(c=>c.id==='late_tao'),'后期家系不能在旧剧本提前开家');
console.log('后期剧本时序、分驻、朝廷与方面、独立势力及旧剧本隔离通过');
