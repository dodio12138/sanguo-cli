import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/core/rule-engine.js");

const cities=[
  {id:"a",name:"甲城",force:"cao",type:"city",garrison:6000,localFood:5000,storage:10000,x:1,y:1},
  {id:"b",name:"乙城",force:"cao",type:"city",garrison:5000,localFood:5000,storage:10000,x:2,y:1}
];
const officers=[
  {id:"chief",name:"主将",force:"cao",city:"b",status:"serving",command:85,war:80,intelligence:60,stamina:100},
  {id:"deputy",name:"副将",force:"cao",city:"b",status:"serving",command:70,war:68,intelligence:65,stamina:100},
  {id:"local",name:"留守",force:"cao",city:"a",status:"serving",command:60,war:55,intelligence:72,stamina:100}
];
const army={id:"army",name:"中军",force:"cao",city:"a",commander:"主将",deputyOfficerIds:["deputy"],soldiers:3000,units:{infantry:3000,cavalry:0,archers:0},morale:70,training:60,supply:90,stance:"驻扎"};
const data={cities,officers,armies:[army],forces:[{id:"cao",name:"曹操"},{id:"neutral",name:"无主"}],rules:{city_graph:{a:["b"],b:["a"]},movement:{road_cost:8,rest_recovery:6,camp_recovery:18,isolated_cost:12}},terrainDefs:{plains:{defence:0}},unitTypes:{infantry:{attack:1}},combatDoctrines:{}};
const engine=new RuleEngine(data);
engine.playerForceId="cao";
engine.syncAllArmyOfficerLocations();

if(officers[0].city!=="a"||officers[0].armyId!=="army"||officers[0].armyRole!=="commander")throw new Error("主将没有同步到军团驻地");
if(officers[1].city!=="a"||officers[1].armyRole!=="deputy")throw new Error("副将没有同步到军团驻地");
if(engine.officersAtCity("a","cao").length!==3)throw new Error("驻城将领统计与实际名单不一致");

army.route=["b"];army.destination="b";army.movementMode="move";
const state={playerForceId:"cao",infrastructure:{supplyRoutes:[]},diplomacy:{wars:[]},resources:{gold:1000,food:1000},corps:[],random:()=>.9};
engine.advanceArmies(state,[]);
if(army.city!=="b"||officers[0].city!=="b"||officers[1].city!=="b")throw new Error("军团抵达后随军将领没有一起移动");

const transferEvents=[];
engine.resolvePersonnelAndOffice(state,{type:"transfer_officer",officerIds:["chief"]},transferEvents,cities[0]);
if(officers[0].city!=="b"||!transferEvents.some(event=>event.text.includes("须先更换军团将领")))throw new Error("随军主将仍可脱离军团单独调任");

const travelEvents=[];
engine.resolveOrganizationPolicyPersonal(state,{type:"travel",commandName:"旅行",officerIds:["deputy"],cityIds:["a"]},travelEvents);
if(officers[1].city!=="b"||!travelEvents.some(event=>event.text.includes("随军任副将")))throw new Error("随军副将仍可脱离军团旅行");

const leaderEvents=[];
engine.resolveOrder(state,{type:"set_leader",officerIds:["local"],armyIds:["army"],text:"组织/设置负责人 留守 中军"},leaderEvents);
if(army.commander!=="主将"||!leaderEvents.some(event=>event.text.includes("不在乙城")))throw new Error("异地将领仍可被直接任命为主将");

const disbandEvents=[];
engine.resolveOrder(state,{type:"disband_army",armyIds:["army"],text:"军事/解散军队 中军"},disbandEvents);
if(data.armies.length!==0||officers.some(officer=>officer.armyId||officer.armyRole))throw new Error("军团解散后将领编制标记未清除");

const realData={
  armies:JSON.parse(fs.readFileSync(new URL("../game/data/history/armies/200_guandu.json",import.meta.url))).armies,
  officers:JSON.parse(fs.readFileSync(new URL("../game/data/history/officers/200_guandu.json",import.meta.url))).officers,
  cities:JSON.parse(fs.readFileSync(new URL("../game/data/history/cities/200_guandu.json",import.meta.url))).cities,
  rules:{city_graph:{}}
};
const realEngine=new RuleEngine(realData);realEngine.syncAllArmyOfficerLocations();
for(const realArmy of realData.armies){const commander=realData.officers.find(officer=>officer.name===realArmy.commander&&officer.force===realArmy.force);if(commander&&commander.city!==realArmy.city)throw new Error(`${realArmy.name}主将仍留在${commander.city}`)}
for(const officer of realData.officers.filter(item=>item.armyId)){const assignment=realEngine.officerAssignment(officer);if(!assignment||assignment.army.city!==officer.city)throw new Error(`${officer.name}的军团与所在地不一致`)}

const conflictData={cities:[{id:"camp",force:"cao"}],officers:[{id:"alpha",name:"甲将",force:"cao",city:"camp",status:"serving",command:80},{id:"beta",name:"乙将",force:"cao",city:"camp",status:"serving",command:75}],armies:[{id:"first",name:"前军",force:"cao",city:"camp",commander:"甲将",deputyOfficerIds:["beta"]},{id:"second",name:"后军",force:"cao",city:"camp",commander:"乙将",deputyOfficerIds:[]}],rules:{city_graph:{}}};
const conflictEngine=new RuleEngine(conflictData);conflictEngine.syncAllArmyOfficerLocations();
if(conflictData.armies[1].commander!=="乙将"||conflictData.officers[1].armyId!=="second"||conflictData.armies[0].deputyOfficerIds.length)throw new Error("副将记录抢占了另一军团的主将");

const appSource=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");
if(!appSource.includes("residentOfficers=officers.length")||!appSource.includes("驻城将领 <b>${residentOfficers}"))throw new Error("据点界面没有按本城名单显示驻城人数");

console.log("将领驻地通过：旧数据校正 / 主副将随军 / 驻城统计 / 调任与旅行拦截 / 异地换将拦截 / 解散清理");
