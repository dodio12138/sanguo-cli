import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");
await import("../js/ui/fiscal-ui.js");
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});
const source=fs.readFileSync(new URL("../js/ui/app.js",import.meta.url),"utf8");
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
const manager=fs.readFileSync(new URL("../js/ui/os-window-manager.js",import.meta.url),"utf8");
class Element {
  dataset={};style={left:"110px",top:"80px",zIndex:"1"};open=false;scrollTop=47;textContent="";nodes=[];
  classList={add(){},remove(){},toggle(){}};
  constructor(id=""){this.id=id}
  set innerHTML(value){
    this.markup=value;this.nodes=[];this.elements={};
    for(const match of value.matchAll(/<(button|tr|input|select)\b([^>]*)>/g)){
      const node=new Element();node.tag=match[1];node.attributes={};
      for(const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)){
        node.attributes[attr[1]]=attr[2]??"";
        if(attr[1].startsWith("data-"))node.dataset[attr[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attr[2]??"";
      }
      if(node.attributes.name){
        node.value=node.attributes.value??"";
        if(node.tag==="select"){
          const body=value.slice(match.index+match[0].length).split("</select>")[0];
          const options=[...body.matchAll(/<option\b([^>]*)>/g)];
          node.value=(options.find(option=>option[1].includes("selected"))||options[0])?.[1].match(/value="([^"]*)"/)?.[1]??"";
        }
        this.elements[node.attributes.name]=node;
      }
      this.nodes.push(node);
    }
  }
  get innerHTML(){return this.markup||""}
  insertAdjacentHTML(_,value){this.innerHTML=this.innerHTML+value}
  prepend(node){this.innerHTML=node.innerHTML+this.innerHTML}
  querySelectorAll(selector){const attribute=selector.match(/^\[([^\]]+)\]$/)?.[1];return this.nodes.filter(node=>attribute in node.attributes)}
  querySelector(selector){if(selector===".army-detail-page")return this;return this.querySelectorAll(selector)[0]||null}
  addEventListener(type,fn){this[`on${type}`]=fn}
  showModal(){this.open=true;this.style.zIndex=String(++z)}
  close(){this.open=false}
  setAttribute(name,value){this.attributes??={};this.attributes[name]=value}
  focus(){}
  closest(){return this}
  matches(selector){return selector===":modal"&&this.modal===true}
}
let z=10;
const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
const document={createElement:()=>new Element(),listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)||[]),fn])},querySelector:()=>null,querySelectorAll:()=>[...elements.values()].filter(element=>element.open)};
// 界面模块：载入注册表与相关模块，以桩对象充当壳的 app 上下文；壳内的关窗与迷雾判定函数原样取自 app.js
const loader={},context=vm.createContext({$,state,document,MapGrid,RuleEngine,FiscalSystem,FiscalUI,getComputedStyle:element=>element.style,loader});context.window=context;
vm.runInContext(fs.readFileSync(new URL("../js/ui/clan-ui.js",import.meta.url),"utf8"),context);
vm.runInContext(fs.readFileSync(new URL("../js/ui/command-planner.js",import.meta.url),"utf8").replace("window.CommandPlanner","globalThis.CommandPlanner"),context);
vm.runInContext(fs.readFileSync(new URL("../js/ui/population-ui.js",import.meta.url),"utf8").replace("window.PopulationUI","globalThis.PopulationUI"),context);
const shellFunction=name=>{const start=source.indexOf(`  function ${name}(`);assert(start>=0,name);const end=source.indexOf("\n  function ",start+1);return source.slice(start,end)};
vm.runInContext(["closeTopDialog","cityIntel","fogNumber"].map(shellFunction).join("\n")+"\nglobalThis.shell={closeTopDialog,cityIntel,fogNumber};",context);
context.map={setPlannedRoute(){},intelLevel:()=>3,armyIntelLevel:()=>3};
for(const file of ["registry","command-book","resources","ledgers","planners","commandery-detail","city-detail","army-detail","battle-detail","officers"])vm.runInContext(fs.readFileSync(new URL(`../js/ui/app/${file}.js`,import.meta.url),"utf8"),context);
const app={$,state,map:context.map,loader,forceBy:id=>state.data.forces.find(force=>force.id===id),esc:value=>String(value??""),toast(){},submit:()=>true,renderOrders(){},renderSelection(){},aiBridge:{audit:[]},...context.shell};
context.SanguoApp.mount(["commandBook","resources","ledgers","planners","commanderyDetail","cityDetail","armyDetail","battleDetail","officers"],app);
// 路线入口只接受仍在途的本方粮运，定位时最小化来源资料窗以让出地图，保留恢复入口。
{let hidden=0,scrolled=0;const oldMap=app.map;app.map={focusShipment:id=>id==="active-grain",canvas:{scrollIntoView(){scrolled++}}};const button={dataset:{cargoRoute:"active-grain"},closest:()=>({querySelector:()=>({click(){hidden++}})})},event={target:{closest:()=>button}};document.listeners.get("click")[0](event);assert.equal(hidden,1);assert.equal(scrolled,1);button.dataset.cargoRoute="already-delivered";document.listeners.get("click")[0](event);assert.equal(hidden,1,"失效运输不得隐藏来源窗");app.map=oldMap}
const {openLedger,openArmyDetail,openCityDetail,openOfficerDetail,openBuildingPlanner,openAdministrationPlanner,openArmyOfficePlanner,openReorganizePlanner,openTroopTransferPlanner,openCityCommands,closeTopDialog}=app;
const city=state.data.cities.find(city=>city.force==="cao"&&(city.type||"city")==="city");
const army=state.data.armies.find(army=>army.force==="cao");
const officer=state.data.officers.find(officer=>officer.force==="cao"&&officer.status==="serving");
state.data.officerBiographies={};
const retained=(id,run)=>{const window=$(id),content=$(id.replace("Dialog","Content")),before=content.innerHTML,position={...window.style},scroll=content.scrollTop;run();assert.equal(window.open,true,id);assert.equal(content.innerHTML,before,`${id} 内容被覆盖`);assert.equal(content.scrollTop,scroll);assert.deepEqual(window.style,position)};

await openLedger("military");
const row=$("ledgerContent").querySelectorAll("[data-army-detail]")[0];
assert(row,"军政档案应有可点击军团");
retained("ledgerDialog",()=>row.onclick());
assert.equal($("armyDetailDialog").open,true);
$("armyDetailDialog").close();assert.equal($("ledgerDialog").open,true);

openCityDetail(city);
const cityPages=$("detailContent").querySelectorAll("[data-city-tab]");assert.equal(cityPages.length,5,"城市资料分为五页");cityPages.find(b=>b.dataset.cityTab==="population").onclick();assert.equal(cityPages.find(b=>b.dataset.cityTab==="population").attributes["aria-selected"],"true");openCityDetail(city);assert.equal($("detailContent").querySelectorAll("[data-city-tab]").find(b=>b.dataset.cityTab==="population").attributes["aria-selected"],"true","重开及刷新保留该城所在页签");
const districtLink=$("detailContent").querySelector("[data-commandery-open]");assert(districtLink,"官署郡名可跳转");retained("detailDialog",()=>districtLink.onclick());assert.equal($("commanderyDialog").open,true);
const getAssignments=state.engine.familyCountyAssignments;let assignmentQueries=0;state.engine.familyCountyAssignments=function(...args){assignmentQueries++;return getAssignments.apply(this,args)};const district=app.commanderyOverview(city.commandery);assert.equal(assignmentQueries,1,"郡总览只查询一次本郡任官，不逐家扫描全图");state.engine.familyCountyAssignments=getAssignments;
const expectedOffices=getAssignments.call(state.engine,state).filter(a=>district.knownSites.some(c=>c.id===a.placeId));assert.deepEqual(Array.from(district.families.flatMap(f=>f.offices),a=>a.person.id).sort(),expectedOffices.map(a=>a.person.id).sort(),"按郡批量查询与原任官记录一致");assert.equal(district.registered,state.engine.popPlaces().filter(p=>p.commandery===city.commandery).reduce((n,p)=>n+state.engine.registeredPopulation(p),0),"郡人口合计城邑和乡里各一次");
assert.equal(new Set(district.rows.flatMap(r=>r.places.map(p=>p.id))).size,district.places.length,"辖县明细覆盖全部人口记录");assert.equal(district.rows.reduce((n,r)=>n+r.places.reduce((m,p)=>m+state.engine.registeredPopulation(p),0),0),district.registered,"各县明细与全郡编户合计一致");
const hiddenCity=district.sites.find(c=>c.force===state.playerForceId),oldForce=hiddenCity.force,oldIntel=context.map.intelLevel;hiddenCity.force="neutral";context.map.intelLevel=()=>0;const partial=app.commanderyOverview(city.commandery);assert.equal(partial.complete,false);assert(!partial.knownIds.has(hiddenCity.id),"未探明城市不泄露资源和人口");assert(partial.gold<district.gold);hiddenCity.force=oldForce;context.map.intelLevel=oldIntel;
const roundedPlace={id:"rounding-fixture",pops:[[0,0,"",3,0,0,0,3,.5,1],[1,0,"",3,0,0,0,3,.5,1],[2,0,"",3,0,0,0,3,.5,1]]};state.engine.popSync(roundedPlace);const originalPops=JSON.stringify(roundedPlace.pops),composition=state.engine.popComposition(roundedPlace);assert.equal(composition.reduce((n,r)=>n+r.registered,0),roundedPlace.registeredPopulation);assert.equal(composition.reduce((n,r)=>n+r.households,0),roundedPlace.registeredHouseholds);assert.equal(JSON.stringify(roundedPlace.pops),originalPops,"取整展示不能改人口或户数");
const districtCity=$("commanderyContent").querySelector("[data-commandery-city]");assert(districtCity);retained("commanderyDialog",()=>districtCity.onclick());
const ranks=new Map;for(const c of state.data.cities.filter(c=>c.force===state.playerForceId))ranks.set(MapGrid.nodeRank(c,state.data.administrativeDivisions),c);
for(const [rank,c] of ranks){openCityDetail(c);const summary=context.PopulationUI.summary(state,c);assert($("detailContent").innerHTML.includes(`<b data-pop-registered>${summary.registered.toLocaleString()}</b>`),"顶部与户口面板使用同一登记口");assert($("detailContent").innerHTML.includes(`登记 ${summary.households.toLocaleString()} 户`));assert($("detailContent").innerHTML.includes(`实有估计 ${summary.estimate.toLocaleString()} 口`));assert.equal(summary.rows.reduce((n,r)=>n+r.registered,0),summary.registered,"户籍分类登记口合计与顶部一致");assert.equal(summary.rows.reduce((n,r)=>n+r.households,0),summary.households,"户籍分类登记户合计与顶部一致");assert(!$("detailContent").innerHTML.includes("乡里"));const tabs=$("detailContent").querySelectorAll("[data-bureau-tab]").map(b=>b.dataset.bureauTab);assert.deepEqual(Array.from(tabs).filter(id=>id!=="affairs"),rank==="province"?["province","commandery","county"]:rank==="commandery"?["commandery","county"]:["county"]);assert($("detailContent").innerHTML.includes('aria-selected="true"'),"切换低等级县邑不能留在不存在的页签")}openCityDetail(city);
for(const open of [()=>openArmyDetail(army),()=>openBuildingPlanner(city),()=>openAdministrationPlanner(city),()=>openCityCommands(city)])retained("detailDialog",open);
await openOfficerDetail(officer);
assert.equal($("detailDialog").open,true);assert.equal($("armyDetailDialog").open,true);assert.equal($("ledgerDialog").open,true);
for(const open of [()=>openArmyOfficePlanner(army),()=>openReorganizePlanner(army),()=>openTroopTransferPlanner(army,"reinforce")])retained("armyDetailDialog",open);
retained("officerDetailDialog",()=>openAdministrationPlanner(city));
$("plannerForm").querySelector("[data-cancel]").onclick();
assert.equal($("plannerDialog").open,false);assert.equal($("officerDetailDialog").open,true);

const detailScroll=$("detailContent").scrollTop,frontOrder=[...elements.values()].map(node=>node.style.zIndex);state.dispatchEvent(new Event("turn"));assert.equal($("detailContent").scrollTop,detailScroll,"日更新保留县详情滚动位置");assert.deepEqual([...elements.values()].map(node=>node.style.zIndex),frontOrder,"日更新不抢其他资料窗焦点");
for(const id of ["form_army","reorganize_army","return_garrison","construct_building","agriculture"]){
  const command=state.data.commandCatalog.commands.find(command=>command.id===id);
  // 军团类命令不以城池为目标，按总命令书打开
  const affairId=state.data.commandCatalog.affairs.find(affair=>affair.commands.some(([commandId])=>commandId===id)).id;
  app.renderCommandBook(affairId,["reorganize_army","return_garrison"].includes(id)?null:city);$("commandDialog").showModal();
  const button=$("commandList").querySelectorAll("[data-command-id]").find(button=>button.dataset.commandId===id);
  assert(button,id);retained("commandDialog",()=>button.onclick());assert.equal($("plannerDialog").open,true,id);
  $("plannerDialog").close();
}

// Async biographies cannot replace a newer selection or another entity window.
delete state.data.officerBiographies;
const pending=[];loader.loadOfficerBiographies=()=>new Promise(resolve=>pending.push(resolve));
const second=state.data.officers.find(item=>item.id!==officer.id);
const firstLoad=openOfficerDetail(officer),secondLoad=openOfficerDetail(second);
pending[1]({biographies:{[second.id]:"新列传"}});await secondLoad;
const latest=$("officerDetailContent").innerHTML;
pending[0]({biographies:{[officer.id]:"旧列传"}});await firstLoad;
assert.equal($("officerDetailContent").innerHTML,latest);

$("plannerDialog").showModal();closeTopDialog();
assert.equal($("plannerDialog").open,false);assert.equal($("ledgerDialog").open,true);assert.equal($("officerDetailDialog").open,true);
$("eventDialog").modal=true;$("eventDialog").showModal();closeTopDialog();assert.equal($("eventDialog").open,true);
for(const id of ["armyDetailDialog","officerDetailDialog"]){assert(html.includes(`id="${id}"`));assert(html.includes(`data-close="${id}"`));assert(manager.includes(`"${id}"`))}
console.log("窗口导航回归通过：军政→军团 / 城市→军团或人物 / 详情→规划 / 命令簿→规划 / 独立关闭 / 异步防覆盖 / Esc只关闭顶层");
