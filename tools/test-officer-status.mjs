// 人物资料、战局身份与族谱共用的状态：日期边界、死亡优先、同名身份和资料缺失。
import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/ui/clan-ui.js");
const live=[
  {id:"child",name:"后辈",birthYear:210,debutYear:230,status:"not_appeared"},
  {id:"youth",name:"少年",birthYear:195,debutYear:215,status:"not_appeared"},
  {id:"unknownBirth",name:"生年未详",debutYear:220,status:"not_appeared"},
  {id:"hidden",name:"在野者",status:"hidden",force:"neutral"},
  {id:"serving",name:"在任者",status:"serving",force:"liu"},
  {id:"battleDead",name:"战死者",status:"dead",deathYear:250},
  {id:"wu",name:"马忠",status:"serving",force:"wu"}
];
const reference=[{id:"historicalDead",name:"先人",deathYear:190},{id:"shu",name:"马忠",deathYear:200},{id:"untraced",name:"活动有上限",availableUntilYear:200}];
const state={date:{year:208},playerForceId:"liu",data:{officers:live,officerReference:reference,forces:[{id:"liu",name:"刘备"},{id:"wu",name:"孙权"}]}};
const status=id=>ClanUI.personStatus(state,ClanUI.findPerson(state,null,id));
assert.equal(status("child"),"unborn");assert.equal(status("youth"),"not_appeared");assert.equal(status("unknownBirth"),"not_appeared");
assert.equal(status("hidden"),"hidden");assert.equal(status("serving"),"serving");assert.equal(status("battleDead"),"dead");assert.equal(status("historicalDead"),"dead");assert.equal(status("untraced"),"untraced");
assert.equal(ClanUI.personStatus(state,null),"unknown");
const before=structuredClone(state.data);
assert.match(ClanUI.personLink(state,"先人"),/data-person-status="dead"[^>]*.*<small>已故<\/small>/);
assert.match(ClanUI.personLink(state,"后辈"),/data-person-status="unborn"/);
assert.match(ClanUI.personLink(state,"在野者"),/<small>在野 · 未发现<\/small>/);
assert.match(ClanUI.personLink(state,"仅见族谱"),/<small>生卒未详<\/small>/);
assert.equal(ClanUI.findPerson(state,"马忠","shu").id,"shu");assert.equal(status("shu"),"dead");assert.equal(status("wu"),"serving");
assert.deepEqual(state.data,before,"查询与族谱渲染不改写战局身份或资料");
state.date.year=210;assert.equal(status("child"),"not_appeared","出生当年由未出生转为未登场");
state.date.year=190;assert.equal(status("historicalDead"),"archive","仅有卒年时不虚构具体死亡日");
state.data.officerReference=[...reference,{id:"added",name:"补载先人",deathYear:180}];assert.equal(status("added"),"dead","按需加载或替换资料库后更新族谱");
state.data.officers[4].status="prisoner";assert.equal(status("serving"),"prisoner","动态状态以当前战局为准");
state.data.officers[4].debutYear=230;assert.equal(status("serving"),"prisoner","战局中已有身份不被资料库登场参数覆盖");
console.log("人物状态通过：未出生/未登场/已故/在野/在任、日期边界、同名身份与资料库更新");
