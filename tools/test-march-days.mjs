import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");

const data=structuredClone(SANGUO_DATA),engine=new RuleEngine(data),id=name=>data.cities.find(city=>city.name===name).id,days=(a,b)=>engine.routeDays(engine.path(id(a),id(b)));
// 水路顺流快、逆流慢；渡口另计渡河；栈道慢于驿道。
assert.ok(engine.legInfo(id("江陵"),id("夏口")).days*2<engine.legInfo(id("夏口"),id("江陵")).days,"长江顺流应明显快于逆流");
assert.equal(engine.legInfo(id("孟津"),id("河内")).crossing,true,"孟津为渡河路段");
assert.ok(engine.legInfo(id("槐里"),id("南郑")).days>engine.legInfo(id("长安"),id("潼关")).days,"褒斜栈道慢于崤函驿道");
// 史载行程量级：洛阳至长安约二旬，司马懿自洛阳征辽东约百日，钟会自长安入蜀约三月。
for(const [from,to,min,max] of [["洛阳","长安",14,30],["洛阳","襄平",80,120],["长安","成都",60,110],["江陵","夏口",3,10]]){const value=days(from,to);assert.ok(value>=min&&value<=max,`${from}→${to} 行军 ${value} 日，超出史载量级 ${min}—${max}`)}
// 按日推进：未满本段日数不抵达，行进中记录本段进度，满日数后抵达并清除进度。
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),army=state.data.armies.find(item=>item.force==="cao"),origin=army.city,next=state.data.rules.city_graph[origin].find(target=>state.data.cities.find(city=>city.id===target)?.force==="cao")||state.data.rules.city_graph[origin][0],leg=state.engine.legInfo(origin,next);
army.route=[next];army.destination=next;army.movementMode="move";
for(let day=1;day<leg.days;day++){state.engine.advanceArmies(state,[]);assert.equal(army.city,origin,`第${day}日尚未走完 ${leg.days} 日路段`);assert.equal(army.legTo,next);assert.ok(Math.abs(army.legElapsed-day)<1e-6)}
state.engine.advanceArmies(state,[]);assert.equal(army.city,next,`走满 ${leg.days} 日后应抵达`);assert.equal(army.legElapsed,0);assert.equal(army.legTo,undefined);
console.log(`行军按日计程通过：顺逆流 / 渡河 / 栈道 / 洛阳—长安 ${days("洛阳","长安")} 日 / 洛阳—襄平 ${days("洛阳","襄平")} 日 / 长安—成都 ${days("长安","成都")} 日 / 途中进度与抵达`);
