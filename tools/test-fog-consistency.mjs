import assert from "node:assert/strict";
import fs from "node:fs";
import {appSource} from "./app-source.mjs";

// 迷雾一致性：他方数值在“未探明、仅知大概、略知内情”三级下不得给出精确值。检查各面板的取值都经过情报判定。
const app=appSource();
const between=(start,end)=>{const i=app.indexOf(start);assert(i>=0,`缺少 ${start}`);const j=app.indexOf(end,i+start.length);return app.slice(i,j<0?undefined:j)};
assert(/function fogNumber\(value,level,suffix=""\)\{[^}]*level>=3\?[^:]*:level>=1\?[^:]*MapView\.intelEstimate[^:]*:"不详"\}/.test(app),"统一的迷雾数值函数：实数、概数、不详三级");

// 行军对话框：守方战力、驻军团、城防完整度。
const planner=between('targetIntel=cityIntel(target)',"$(\"plannerSummary\")");
assert(/守方 \$\{fogNumber\(battle\.defence,targetIntel\)\}/.test(planner)&&/targetIntel>=2\?battle\.defenderArmies/.test(planner)&&/targetIntel>=2\?`\$\{battle\.defenseIntegrity\}%`/.test(planner),"行军预估按目标情报显示守方数值");
assert(!/battle\.defence\.toLocaleString\(\)/.test(app),"不得直接显示守方精确战力");

// 战争计划：守方估值与城防。
assert(/守方估值 \$\{fogNumber\(plan\.defence,/.test(app)&&!/城防 \$\{plan\.target\.defenseIntegrity\}%/.test(app),"战争计划按情报显示守方");

// 内政档案按郡汇总：只合计己方或已详查的城，其余计为未明。
const groups=between("function domesticByCommandery(cities){","\n");
assert(/known=list\.filter\(city=>cityIntel\(city\)>=3\)/.test(groups)&&/sum\(known,"garrison"\)/.test(groups)&&!/sum\(list,"garrison"\)/.test(groups),"郡汇总不合计未探明城池的守军与仓储");

// 战况窗口：他军按军团情报显示，围城按城池情报显示。
const rows=between("function battleArmyRows(","\n");
assert(/show=known\|\|level>=2/.test(rows)&&/level>=1\?MapView\.intelEstimate/.test(rows)&&/:"\?"/.test(rows),"战况窗口他军兵力分级显示");
const siege=between("function openSiegeDetail(city){","\n");
assert(/intel=defending\?3:Math\.max\(map\.intelLevel\(city\)/.test(siege),"围城窗口按情报显示守城数值");
const cityIntel=between("function cityIntel(city){","\n");
assert(/city\.force===state\.playerForceId\|\|state\.observerMode\?3:map\.intelLevel\(city\)/.test(cityIntel),"己方与观战模式给实数，他方按情报等级");
console.log("迷雾一致性通过：行军预估 / 战争计划 / 郡汇总 / 战况窗口他军 / 围城窗口 均按情报三级显示");
