import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{try{const body=fs.readFileSync(path.join(root,String(url).replace(/^\//,"")),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
await import("../js/data/offline-data.generated.js");await import("../js/core/map-grid.js");await import("../js/core/scenario-officer-store.js");await import("../js/core/data-loader.js");

// 人物修改记录：修改原有人物、加入自定义人物、删除自定义人物；无效修改跳过而不阻止开局。
const loader=new DataLoader(structuredClone(SANGUO_DATA));await loader.load({useSavedMap:false});
const base=await loader.loadScenario("200_guandu",{useSavedMap:false}),guan=base.officers.find(officer=>officer.name==="关羽"),cao=base.cities.find(city=>city.force==="cao");
const record={version:1,scenarioId:"200_guandu",savedAt:null,edits:{[guan.id]:{war:99,skill:"神将"},[base.officers[0].id]:{command:500}},added:[{id:"custom_test",name:"测试将",command:60,war:61,intelligence:62,politics:63,charm:64,skill:null,aptitude:{spear:"A",halberd:"B",crossbow:"C",cavalry:"S",siege:"C",navy:"C"},force:"cao",city:cao.id,status:"serving",loyalty:80,birthYear:170,debutYear:190,deathYear:230,discoverPlace:null},{id:"custom_bad",name:"坏数据",command:0,war:50,intelligence:50,politics:50,charm:50,aptitude:{spear:"C",halberd:"C",crossbow:"C",cavalry:"C",siege:"C",navy:"C"},force:"cao",city:cao.id,status:"serving"}],removed:[]};
const result=ScenarioOfficerStore.apply(structuredClone(base),record),applied=result.data;
assert.equal(applied.officers.find(officer=>officer.id===guan.id).war,99,"修改应套用");
assert.equal(applied.officers.find(officer=>officer.id===base.officers[0].id).command,base.officers[0].command,"越界数值应跳过");
assert.ok(applied.officers.some(officer=>officer.id==="custom_test"&&officer.custom),"自定义人物应加入");assert.ok(!applied.officers.some(officer=>officer.id==="custom_bad"),"无效自定义人物应跳过");
assert.equal(result.skipped.length,2,"两项无效修改应列入跳过");
const removed=ScenarioOfficerStore.apply(structuredClone(applied),{...record,edits:{},added:[],removed:["custom_test"]}).data;assert.ok(!removed.officers.some(officer=>officer.id==="custom_test"),"删除自定义人物");
// 校验规则
const sample={...guan};assert.deepEqual(ScenarioOfficerStore.validate(sample,base),[]);
assert.ok(ScenarioOfficerStore.validate({...sample,status:"serving",force:"cao",city:base.cities.find(city=>city.force==="yuan").id},base).some(error=>error.includes("本势力城池")),"仕官者须驻本势力城池");
assert.ok(ScenarioOfficerStore.validate({...sample,birthYear:200,deathYear:190},base).some(error=>error.includes("卒年")),"卒年不能早于生年");
// 开新局时自动套用；不套用模式保持原始数据
loader.scenarioOfficers={get:async id=>id==="200_guandu"?record:null};
const started=await loader.loadScenario("200_guandu",{useSavedMap:true});assert.equal(started.officers.find(officer=>officer.id===guan.id).war,99,"开新局套用剧本人物修改");assert.ok(loader.warnings.some(text=>text.includes("人物修改有")),"跳过项写入警告");
const pristine=await loader.loadScenario("200_guandu",{useSavedMap:false});assert.equal(pristine.officers.find(officer=>officer.id===guan.id).war,guan.war,"原始数据不受影响");
const source=fs.readFileSync(path.join(root,"js/ui/officer-editor.js"),"utf8");assert.ok(!/confirm\(|alert\(/.test(source),"编辑器不用浏览器原生弹窗");
console.log("人物编辑器通过：修改与自定义人物套用 / 越界与缺项跳过 / 驻地与生卒校验 / 开新局自动套用 / 原始数据不变");
