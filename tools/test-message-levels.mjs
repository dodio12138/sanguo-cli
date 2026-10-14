import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["map-grid","data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(pathToFileURL(path.join(root,`js/core/${file}.js`)));
await import(pathToFileURL(path.join(root,"js/ui/message-center.js")));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const data=await loader.loadScenario("194_puyang",{useSavedMap:false});
const state=new GameState(structuredClone(data),{playerForceId:"liu"}),before=MessageCenter.snapshot(state),own=state.data.cities.find(city=>city.id==="xiaopei"),army=state.data.armies.find(item=>item.force==="liu");

// 结算后小沛失守、相县新遭围攻：分别判为紧急。
own.force="cao";const besieged=state.data.cities.find(city=>city.id==="commandery_city_011"),enemy=state.data.armies.find(item=>item.force==="cao");enemy.siegeTarget=besieged.id;
const ctx=MessageCenter.context(state,before,[army.name]),level=event=>MessageCenter.classify(event,ctx);
assert.equal(level({phase:"战果",siteId:"xiaopei",text:"小沛及所辖 1 县归属曹操"}),3,"我方城池失守为紧急");
assert.equal(level({phase:"攻城",siteId:besieged.id,text:`1 支军团在${besieged.name}城下展开围攻`}),3,"我方城池新遭围攻为紧急");
assert.equal(level({phase:"天下外交",text:"吕布向刘备宣战（进军争地）"}),3,"向我宣战为紧急");
assert.equal(level({phase:"事件",pending:true,text:"陶谦属意：等待决策"}),3,"待决事件为紧急");
assert.equal(level({phase:"野战",armyId:army.id,text:`${army.name}溃败，退往相县`}),3,"我军溃败为紧急");
assert.equal(level({phase:"调动",text:`${army.name}已规划前往下邳`}),2,"命令反馈为重要");
assert.equal(level({phase:"天下大事",text:"蝗灾大饥：兖、豫诸郡仓廪减四成"}),2,"天下大事为重要");
assert.equal(level({phase:"天下外交",text:"袁绍向公孙瓒宣战（进军争地）"}),0,"他方交战为琐事");
assert.equal(level({phase:"内政",text:`${state.data.cities.find(city=>city.force==="liu").name}开垦完成`}),1,"我方内政为一般");

// 收件箱只收重要及紧急，未读计数在打开汇总后清零；战报事件只存一般以上的等级。
const report={turn:5,date:"194年 6月 5日",events:[{phase:"战果",siteId:"xiaopei",text:"小沛及所辖 1 县归属曹操"},{phase:"天下外交",text:"袁绍向公孙瓒宣战"},{phase:"调动",text:`${army.name}已规划前往下邳`}]};
MessageCenter.annotate(report,ctx);assert.equal(report.events[0].lv,3);assert.equal(report.events[1].lv,undefined,"琐事不存等级");
const added=MessageCenter.collect(state,report);assert.equal(added.length,2);assert.equal(MessageCenter.unread(state).length,2);MessageCenter.markRead(state);assert.equal(MessageCenter.unread(state).length,0);
for(let i=0;i<200;i++)MessageCenter.collect(state,{turn:6+i,date:"",events:[{phase:"天下大事",text:"测试",lv:2}]});assert.equal(MessageCenter.inbox(state).items.length,MessageCenter.INBOX_LIMIT,"收件箱有上限");

// 日终流程：手动结束本日照常弹出简报；自动模拟只在紧急时暂停并弹出，可在设置中关闭。
const app=appSource(),html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert(/MessageCenter\.annotate\(state\.reports\[0\],MessageCenter\.context\(state,messageBefore/.test(app)&&/else if\(urgent\.length&&userSettings\.pauseOnUrgent!==false\)\{simulation\.pause\(\);showTurnBriefing\(\)/.test(app),"紧急军情暂停模拟并弹出汇总");
assert(html.includes('id="messageCenterButton"')&&html.includes('id="messageCenterDialog"')&&html.includes('id="gamePauseOnUrgent"')&&html.includes('id="turnBriefingAlerts"'),"消息入口、汇总窗口、设置与简报要报");
assert(/data-report-level/.test(app)&&/data-battle-own/.test(app),"日报按等级筛选、战报可只看我方");
console.log("消息分级通过：失守、围城、宣战、待决、溃败为紧急 / 命令反馈与天下大事为重要 / 收件箱未读与上限 / 自动模拟紧急暂停 / 日报战报筛选");
