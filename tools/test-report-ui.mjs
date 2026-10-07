import fs from "node:fs";

const app=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8"),engine=fs.readFileSync(new URL("../js/core/rule-engine.js",import.meta.url),"utf8"),css=fs.readFileSync(new URL("../css/ui-polish.css",import.meta.url),"utf8");
for(const token of ["const REPORT_PAGE_SIZE=8","state.reports.slice(0,reportVisibleCount)","data-report-more","我方相关","其他结算","data-battle-more","battleVisibleCount+=REPORT_PAGE_SIZE"]){if(!app.includes(token))throw new Error(`旬报/战报渐进归档缺少：${token}`)}
for(const token of ["battleId,siteId:site.id","phase:\"战法\",battleId,siteId:site.id","phase:\"攻城\",battleId,siteId:city.id","phase:\"人物\",battleId,siteId:site.id"]){if(!engine.includes(token))throw new Error(`战斗事件无法合并：${token}`)}
if(!css.includes(".report-history { flex: 1 1 auto; min-height: 0; max-height: calc(90vh - 44px); overflow: auto;")||!css.includes("dialog.wide-dialog[open] { display: flex; flex-direction: column; max-height: 90vh; }"))throw new Error("旬报/战报容器缺少限高与独立滚动");
console.log("战报与旬报通过：8 条分页渲染 / 相关信息优先分类折叠 / 同战斗事件合并 / 滚动容器限高");
