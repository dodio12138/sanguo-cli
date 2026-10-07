globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"observer",observerMode:true,observerDelay:1000});
if(!state.observerMode||state.playerForceId!=="observer")throw new Error("观察者开局状态未建立");
const before=state.turn;
state.endTurn();
if(state.turn!==before+1||state.policies.pendingEvent)throw new Error("观察者自动旬推进被事件阻塞");
const living=state.data.forces.filter(f=>f.id!=="neutral");
for(const city of state.data.cities)city.force=living[0].id;
state.engine.evaluateGameOver(state,[]);
if(state.gameOver?.result!=="observer"||state.gameOver.winnerForceId!==living[0].id)throw new Error("观察统一结算不正确");
const saved=state.serialize();
if(saved.version!==16||saved.observerMode!==true||saved.observerDelay!==1000)throw new Error("观察者存档字段缺失");
console.log("观察模式通过：自动旬推进 / 无事件阻塞 / 统一结算 / v16 存档");
