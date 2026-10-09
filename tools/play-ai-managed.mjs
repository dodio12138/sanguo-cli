globalThis.window=globalThis;
if(typeof globalThis.CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");
await import("../js/core/ai-bridge.js");
await import("../js/core/ai-controller.js");

const turnArg=process.argv.indexOf("--turns"),turns=Math.max(1,Math.min(120,Number(turnArg>=0?process.argv[turnArg+1]:20)||20)),summaryOnly=process.argv.includes("--summary"),state=new GameState(structuredClone(globalThis.SANGUO_DATA),{playerForceId:"cao",difficulty:"normal"});
state.controlMode="delegate";
const bridge=new AIBridge(state),controller=new AIController(state,bridge),provider=new HttpAIProvider("http://127.0.0.1:8787");
await controller.connect(provider);
const played=[],chronicles=[],issues=[],repeatMoves=new Map();
for(let index=0;index<turns;index++){
  const plan=await controller.plan({apply:true}),commandResults=plan.results||[],queued=state.orders.map(order=>({type:order.type,name:order.commandName,text:order.text}));
  for(const item of commandResults)if(!item.queued)issues.push({turn:state.turn,kind:"command_rejected",error:item.error||item.reason||"未知原因",commandId:item.commandId||null});
  for(const order of queued.filter(order=>["move","forced_march","redeploy","assemble"].includes(order.type))){const key=`${order.type}:${order.text}`;repeatMoves.set(key,(repeatMoves.get(key)||0)+1);if(repeatMoves.get(key)>=3)issues.push({turn:state.turn,kind:"repeated_movement_order",text:order.text,count:repeatMoves.get(key)})}
  const date={...state.date},events=state.endTurn(),report=state.reports[0],battleEvents=(report.events||[]).filter(event=>["战斗","攻城","战果"].includes(event.phase)||event.battleId||event.result);
  played.push({turn:report.turn,date:report.date,advice:plan.message||"",queued,events:(report.events||[]).map(event=>({phase:event.phase||"",text:event.text||"",battleId:event.battleId||null,result:event.result||null})),battleCount:battleEvents.length});
  if((report.events||[]).some(event=>/尚未宣战|停止进入/.test(event.text||"")))issues.push({turn:report.turn,kind:"movement_blocked_by_war_prerequisite"});
  if(date.xun===2){const monthReports=state.reports.filter(item=>String(item.date||"").startsWith(`${date.year}年 ${date.month}月`)).slice(0,3),record=await controller.writeMonthlyChronicle({enabled:true,year:date.year,month:date.month,reports:monthReports});chronicles.push({year:date.year,month:date.month,status:record?.status||"skipped",text:record?.text||"",battleEventsPassed:monthReports.reduce((n,item)=>n+(item.events||[]).filter(event=>["战斗","攻城","战果"].includes(event.phase)||event.battleId||event.result).length,0)});if(record?.status==="failed")issues.push({turn:report.turn,kind:"chronicle_failed",error:record.error})}
  console.log(`T${report.turn} ${report.date} | queued=${queued.length} | battles=${battleEvents.length} | ${queued.map(order=>order.name).join("、")||"无命令"}`);
}
const battles=played.flatMap(turn=>turn.events.filter(event=>["战斗","攻城","战果"].includes(event.phase)||event.battleId||event.result).map(event=>({turn:turn.turn,phase:event.phase,text:event.text,battleId:event.battleId,result:event.result})));
const result={scenario:state.data.scenario?.name,force:state.data.forces.find(force=>force.id==="cao")?.name,turns:played.length,queuedTotal:played.reduce((n,turn)=>n+turn.queued.length,0),battleEventCount:battles.length,battles,chronicles,issues,final:{date:state.dateLabel,cities:state.data.cities.filter(city=>city.force==="cao").map(city=>city.name),gold:state.resources.gold,food:state.resources.food,armies:state.data.armies.filter(army=>army.force==="cao").map(army=>({name:army.name,city:army.city,soldiers:army.soldiers,stance:army.stance,route:army.route||[]}))}};if(summaryOnly)delete result.battles;console.log(JSON.stringify(result,null,2));
