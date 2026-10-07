import fs from "node:fs";

const app=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8"),css=fs.readFileSync(new URL("../css/ui-polish.css",import.meta.url),"utf8"),engine=fs.readFileSync(new URL("../js/core/rule-engine.js",import.meta.url),"utf8");
for(const id of ["turnBriefingDialog","turnBriefingOrders","turnBriefingFeedback","turnBriefingMilitary","ackTurnBriefing"]){if(!html.includes(`id="${id}"`))throw new Error(`缺少旬初简报界面节点：${id}`)}
for(const token of ["captureBriefingContext()","pendingTurnBriefing=buildTurnBriefing(state.reports[0],briefingContext)","if(!renderPendingEvent())showTurnBriefing()","observerMode||!briefing||state.gameOver","pendingTurnBriefing.context"]){if(!app.includes(token))throw new Error(`旬初简报流程缺少：${token}`)}
for(const token of ["phase:\"行军\",armyId:army.id","fromCityId:from?.id,toCityId:to?.id","phase:\"战法\",battleId,siteId:site.id,armyId:unit.id"]){if(!engine.includes(token))throw new Error(`军事记录缺少关联字段：${token}`)}
if(!css.includes(".turn-briefing-dialog")||!css.includes("max-height:88vh")||!css.includes("overflow:auto"))throw new Error("旬初简报未限制弹窗高度或启用内部滚动");
console.log("旬初简报通过：命令与反馈分类 / 玩家相关军情 / 事件弹窗顺序 / 观察者免打扰 / 弹窗限高");
