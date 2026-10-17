// 汉庭长局：指定剧本各推演两年（观察者模式），朝局操作不崩，天子归属与名分合法。
// 由 test-court-longrun-a/b/c.mjs 各跑两个剧本，便于测试运行器并行。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

export async function runCourtLongrun(ids,days=730){
  globalThis.window=globalThis;globalThis.location={protocol:"http:"};
  const root=path.resolve(new URL("..",import.meta.url).pathname);
  globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
  for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js"])await import(pathToFileURL(path.join(root,file)));
  if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
  const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
  const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();
  for(const id of ids){const data=await loader.loadScenario(id),game=new GameState(structuredClone(data),{playerForceId:data.scenario.default_player_force});game.observerMode=true;const texts=[];const log=game.engine.courtLog;game.engine.courtLog=function(ev,text,extra){texts.push(text);return log.call(this,ev,text,extra)};
    for(let i=0;i<days;i++)game.endTurn();const court=game.court;assert(!court.controller||game.data.cities.some(c=>c.force===court.controller),`${id} 挟天子者仍有据点`);for(const stance of Object.values(court.stances))assert(stance.obedience>=0&&stance.obedience<=100&&stance.hanLoyalty>=0);
    const notable=texts.filter(t=>/讨伐|联军|迁都|丞相|九锡|王|禅|奉迎|衣带|称帝|出奔/.test(t));console.log(`${id} 两年：挟天子者 ${court.controller||"无"} · ${notable.slice(0,5).join("｜")||"无大事"}`)}
  console.log(`汉庭长局通过：${ids.join("、")} 各推演 ${days} 日`);
}
