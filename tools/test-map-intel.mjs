import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/ui/map-view.js");

const width=12,height=6;
const cities=[{id:"xu",name:"许昌",x:1,y:1,force:"cao",garrison:9000},{id:"ye",name:"邺",x:9,y:1,force:"yuan",garrison:2124}];
const forces=[{id:"cao",name:"曹操",color:"#b89044"},{id:"yuan",name:"袁绍",color:"#776aa0"},{id:"neutral",name:"无主",color:"#777568"}];
const armies=[{id:"cao-army",name:"许昌军团",force:"cao",city:"xu",soldiers:11500},{id:"yuan-army",name:"邺军团",force:"yuan",city:"ye",soldiers:8200}];

function makeView({playerForceId="cao",layer="intel",hidden=[],intelCities={},intelArmies={}}={}){
  const view=Object.create(window.MapView.prototype),cells=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)cells.push({x,y,terrain:"plains",province:"豫州",commandery:"颍川",supply:4});
  Object.assign(view,{territoryRadius:5,size:{w:600,h:400},cells,hiddenLegendItems:new Set(hidden),metrics:()=>({cell:20,startX:0,startY:0}),state:{playerForceId,observerMode:false,layer,data:{map:{width,height},cities,forces,armies},intelligence:{cities:intelCities,armies:intelArmies}}});
  return view;
}
const cell=(view,x,y)=>view.cells[y*width+x];
function recorder(){
  const ops=[],ctx={save:()=>ops.push(["save"]),restore:()=>ops.push(["restore"]),fillRect:(x,y,w,h)=>ops.push(["fillRect",x,y,w,h]),fillText:(text,x,y)=>ops.push(["fillText",text,x,y]),measureText:text=>({width:String(text).length*6})};
  return {ctx,ops};
}

const view=makeView();
assert.equal(view.intelBand(0).label,"守军薄弱","空城守军应落在最薄弱档");
assert.equal(view.intelBand(1999).label,"守军薄弱");
assert.equal(view.intelBand(2000).label,"守军一般","档位边界应归入较强一档");
assert.equal(view.intelBand(2124).label,"守军一般");
assert.equal(view.intelBand(6000).label,"守军雄厚");
assert.equal(view.intelBand(11999).label,"守军雄厚");
assert.equal(view.intelBand(12000).label,"守军重兵");
assert.equal(view.intelBand(999999).label,"守军重兵","极大兵力必须归入最重档");
assert.equal(view.intelBand(0).heat,0);assert.equal(view.intelBand(12000).heat,1,"最重档热力应取满");

assert.equal(view.intelLevel(cities[0]),3,"本势力城市必须始终掌握兵力");
assert.equal(view.intelLevel(cities[1]),0,"未查明的城市不得显示情报");
assert.equal(makeView({intelCities:{ye:1}}).intelLevel(cities[1]),1);
assert.equal(makeView({intelCities:{ye:2}}).intelLevel(cities[1]),2);
assert.equal(view.intelLevel(null),0);

assert.equal(view.intelStrength(2124,0),null,"等级为 0 不得输出兵力");
assert.equal(view.intelStrength(2124,1),"约1千","仅查明位置时应给出五千米粒度的概数");
assert.equal(view.intelStrength(9500,1),"约10千","一级情报概数应取五千米粒度");
assert.equal(view.intelStrength(2124,2),"约2千");
assert.equal(view.intelStrength(9500,2),"约10千","万以下应折算为千");
assert.equal(view.intelStrength(10000,2),"约1.0万","万以上应折算为万");
assert.equal(view.intelStrength(11500,3),"约1.1万");

assert.equal(view.color(cell(view,9,1)),"#111711","未查明的城主色调应为暗色");
assert.equal(makeView({hidden:["未查明"]}).color(cell(view,9,1)),"#0c100c","隐藏未查明图例应改用备用暗色");
const known=makeView({intelCities:{ye:1}});
assert.equal(known.color(cell(known,9,1)),known.intelColor(known.intelBand(2124).heat,1,1));
assert.equal(known.color(cell(known,9,1)),"hsl(78, 26%, 22%)","仅查明位置的情报应使用低饱和配色");
const strong=makeView({intelCities:{ye:2}});
assert.equal(strong.color(cell(strong,9,1)),"hsl(78, 58%, 22%)","查明兵力后应提高饱和度");
assert.equal(strong.color(cell(strong,9,1)),strong.intelColor(strong.intelBand(2124).heat,2,1));
assert.notEqual(view.color(cell(view,9,1)),strong.color(cell(strong,9,1)),"查明与未查明的配色必须可区分");
const far=makeView();
assert.equal(far.color(cell(far,5,5)),far.intelColor(far.intelBand(9000).heat,3,1-Math.hypot(4,4)/(far.territoryRadius+2)),"边远疆域应随距离淡出但仍保留本势力情报");
assert.equal(far.intelColor(1,2,0),"hsl(0, 58%, 12%)","淡出必须有下限，不得完全透明");
assert.equal(far.intelColor(1,2,1),"hsl(0, 58%, 38%)");
assert.equal(makeView({intelCities:{ye:2},hidden:["守军一般"]}).color(cell(view,9,1)),"#111711","隐藏守军档位后应回落为暗色");
const political=makeView({layer:"political"});
assert.equal(political.color(cell(political,9,1)),forces[1].color,"情报配色不得影响其他图层");
assert.equal(political.color(cell(political,5,5)),"#4c4e45");

const {ctx,ops}=recorder();
makeView().drawIntel(ctx,{cell:20,startX:0,startY:0});
const texts=ops.filter(op=>op[0]==="fillText").map(op=>op[1]);
assert.deepEqual(texts,["守 约9千","约1.1万"],"默认只应显示我方城市守军与我方军团兵力");
assert(!texts.some(text=>text.includes("2千")),"未查明的敌城不得显示兵力");
const unseen=recorder();makeView({intelCities:{ye:1},intelArmies:{"yuan-army":1}}).drawIntel(unseen.ctx,{cell:20,startX:0,startY:0});
const seenTexts=unseen.ops.filter(op=>op[0]==="fillText").map(op=>op[1]);
assert(seenTexts.includes("守 约1千"),"仅查明位置时应显示五千米粒度概数");
assert(seenTexts.some(text=>text.includes("约10千")),"接壤已知的敌军应显示兵力概数");
assert(!seenTexts.some(text=>text.includes("8.2千")||text.includes("0.8万")),"仅查明位置的敌军不得显示兵力");
const full=recorder();makeView({intelCities:{ye:2},intelArmies:{"yuan-army":2}}).drawIntel(full.ctx,{cell:20,startX:0,startY:0});
const fullTexts=full.ops.filter(op=>op[0]==="fillText").map(op=>op[1]);
assert(fullTexts.includes("守 约2千"),"查明后应显示敌城守军兵力");
assert(fullTexts.includes("约8千"),"查明后应显示敌军兵力");
assert.deepEqual([full.ops[0][0],full.ops.at(-1)[0]],["save","restore"],"情报绘制必须成对保存与恢复画布状态");

await import("../js/core/rule-engine.js");
const scouted={playerForceId:"cao",observerMode:false,intelligence:{cities:{}}};
const engine=new window.RuleEngine({cities:[{id:"xu",name:"许昌",force:"cao"},{id:"ye",name:"邺",force:"yuan"},{id:"luo",name:"洛阳",force:"yuan"}],rules:{city_graph:{xu:["ye"],ye:["xu","luo"],luo:["ye"]}}});
const scoutEvents=[];engine.runBorderScouting(scouted,scoutEvents);
assert.equal(scouted.intelligence.cities.ye,1,"与本方城市接壤的敌方据点应自动获得一级边境情报");
assert.equal(scouted.intelligence.cities.luo,undefined,"隔一城的敌方据点不得自动获得情报");
assert.equal(scoutEvents.length,1,"边境探马应回报一次");
engine.runBorderScouting(scouted,scoutEvents);
assert.equal(scoutEvents.length,1,"已探明据点不应重复回报");
const deeper={playerForceId:"cao",observerMode:false,intelligence:{cities:{ye:3}}};
engine.runBorderScouting(deeper,[]);
assert.equal(deeper.intelligence.cities.ye,3,"既有更高情报等级不得被边境探马降级");
assert.ok(scouted.intelligence.cities.ye>=1,"存于情报账本的边境等级应可被舆图直接读取");

const source=fs.readFileSync(new URL("../js/ui/map-view.js",import.meta.url),"utf8");
for(const feature of ["this.state.layer===\"intel\"","intelBand","intelLevel","intelColor","intelStrength","drawIntel(c,m)","static intelBands=[","state.intelligence?.cities"])if(!source.includes(feature))throw new Error(`舆图缺少情报图层：${feature}`);
const intelCall=source.indexOf("if(this.state.layer===\"intel\")this.drawIntel(c,m);"),siegeCall=source.indexOf("this.drawSieges(c,m);"),hoverCall=source.indexOf("strokeRect(hx+1,hy+1");
if(!(intelCall>=0&&siegeCall>intelCall))throw new Error("情报图层应在据点标记之后、军事叠加之前绘制");
if(!(hoverCall>siegeCall))throw new Error("悬停光标框必须在情报与军事叠加之后绘制，避免被覆写");
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
if(!html.includes('<button data-layer="intel">情报</button>'))throw new Error("舆图图层按钮缺少情报入口");
if(!html.includes("F1～F6"))throw new Error("帮助文本未更新为六个图层");
const app=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");
if(!app.includes('intel:{label:"情报"'))throw new Error("图层图例缺少情报说明");
if(!/"terrain","political","province","commandery","supply","intel"/.test(app))throw new Error("快捷键未包含情报图层");
if(!app.includes("openEnemyCityDetail"))throw new Error("敌城档案缺少情报遮蔽视图");
if(!/intelLevel<3\)\{openEnemyCityDetail/.test(app))throw new Error("敌城档案未按情报等级分流");
if(!app.includes("MapView.intelEstimate"))throw new Error("敌城概数应复用舆图情报估算");
if(!app.includes("未探明驻扎军团"))throw new Error("未探明的敌城不得列出驻扎军团");
const engineSource=fs.readFileSync(new URL("../js/core/rule-engine.js",import.meta.url),"utf8");
if(!engineSource.includes("runBorderScouting(state,events)"))throw new Error("引擎缺少边境探马情报例行");
const shortcuts=fs.readFileSync(new URL("../js/ui/keyboard-shortcuts.js",import.meta.url),"utf8");
if(!shortcuts.includes("/^F([1-6])$/"))throw new Error("F 键未扩展到六个图层");
console.log("舆图情报图层通过：守军分档 / 查明等级与兵力遮蔽 / 未查明暗色与淡出 / 图例隐藏 / 非情报图层不受影响 / 敌我军团标签 / 快捷键与图例接线 / 边境探马 / 敌城档案情报遮蔽");
