// 世家细分到县：全称与祖居、近县与支脉、族谱与族亲称谓、联姻 / 劝输 / 徙豪强、内应、旧档补支脉、世家窗口与人物链接。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");
const fresh=(force="cao")=>{const game=new GameState(structuredClone(scenario),{playerForceId:force});return {game,e:game.engine}};
const named=(game,name)=>game.data.officers.find(o=>o.name===name);

// 1. 全称、祖居县与寄治
{const {game,e}=fresh();for(const [id,name] of [["zhong","颍川长社钟氏"],["xun","颍川颍阴荀氏"],["yuan_rn","汝南汝阳袁氏"],["sima","河内温县司马氏"],["zhuge","琅邪阳都诸葛氏"],["sun","吴郡富春孙氏"],["cao","沛国谯县曹氏"],["yang_hn","弘农华阴杨氏"],["tian_jl","钜鹿田氏"],["shi","苍梧广信士氏"]])assert.equal(e.clanFullName(id),name,id);
  assert.equal(e.clanName("zhong"),"颍川长社钟氏","事件与界面统一用全称");
  const seat=id=>e.clanDistribution(game,id).filter(row=>row.seat).map(row=>row.name);assert(seat("zhong").includes("长社"),"钟氏祖居长社县");assert(seat("yuan_rn").includes("平舆"),"汝阳不在图上，寄于平舆");assert(seat("xi_xy").length,"襄阳习氏有祖居（同处至多四家时不再被挤掉）");
  for(const clan of game.data.clans){assert(game.clans.byId[clan.id]?.seatIds?.length,`${clan.id} 有祖居定位`);if(clan.landless){assert.equal(clan.land_share,0);assert(clan.landBasis,"无田产估值的谱系须注明依据");assert.deepEqual(e.clanDistribution(game,clan.id),[],"仅谱系家族不伪造地产")}else assert(e.clanDistribution(game,clan.id).some(row=>row.seat),`${clan.id} 有祖居地产`)}
  // 地产只在祖居、近县与支脉，不再铺满全郡
  const xun=e.clanDistribution(game,"xun");assert(xun.length<=4,"荀氏地产集中在颍阴及近县");const yingyin=xun.find(row=>row.seat);assert(yingyin.placeIds.length===2&&yingyin.urban>0&&yingyin.rural>0,"颍阴城邑与乡里合为一行");
  const pingyu=e.clanDistribution(game,"yuan_rn").filter(row=>row.name==="平舆");assert.equal(pingyu.length,1,"平舆据点与归汝南管辖的平舆乡里合为一行");assert(pingyu[0].cityIds.length===2);
  for(const clan of game.data.clans){const names=e.clanDistribution(game,clan.id).map(row=>`${row.commandery}${row.name}`);assert.equal(new Set(names).size,names.length,`${clan.id} 分布无重复行`)}assert(xun.every(row=>row.commandery==="颍川郡"));
  console.log("全称与祖居通过");}

// 2. 支脉：诸葛氏在襄阳与江东、袁氏在邺与寿春、士氏兄弟各郡
{const {game,e}=fresh();const branch=id=>e.clanDistribution(game,id).filter(row=>row.branch).map(row=>row.name);
  assert(branch("zhuge").includes("襄阳")&&branch("zhuge").includes("曲阿"),"诸葛氏支脉：隆中、江东");assert(branch("yuan_rn").some(name=>/邺/.test(name))&&branch("yuan_rn").includes("寿春"),"袁氏支脉：邺、寿春");assert(branch("shi").length===3,"士氏兄弟三郡");
  const stances=e.clanStances(game,"zhuge");assert(stances.length>=2,"诸葛氏与多家势力有涉");assert(stances[0].relation>=stances.at(-1).relation,"按关系排序，首位为倾向");
  console.log("支脉与倾向通过");}

// 3. 族谱分辈与族亲称谓
{const {game,e}=fresh();const graph=e.clanKinGraph("cao"),gen=name=>graph.nodes.find(node=>node.name===name)?.generation;
  assert(gen("曹嵩")<gen("曹操")&&gen("曹操")<gen("曹丕")&&gen("曹丕")<gen("曹叡"),"曹嵩—曹操—曹丕—曹叡 逐代");assert.equal(gen("曹仁"),gen("曹操"),"从兄弟同辈");
  const kin=Object.fromEntries(e.officerKin(named(game,"曹丕")).map(k=>[k.name,k.label]));assert.equal(kin["曹操"],"父");assert.equal(kin["曹叡"],"子");
  const ren=Object.fromEntries(e.officerKin(named(game,"曹仁")).map(k=>[k.name,k.label]));assert.equal(ren["曹操"],"从兄");assert.equal(ren["曹纯"],"弟");
  const zhuge=Object.fromEntries(e.officerKin(named(game,"诸葛亮")).map(k=>[k.name,k.label]));assert.equal(zhuge["诸葛瑾"],"兄");assert.equal(zhuge["诸葛玄"],"叔父");assert.equal(zhuge["诸葛乔"],"养子");
  for(const clan of game.data.clans)for(const [a,b] of clan.kin||[])assert(clan.members.includes(a)&&clan.members.includes(b),`${clan.id} 族谱人物须在成员名单内`);
  console.log("族谱与族亲称谓通过");}

// 4. 联姻、劝输、徙豪强
{const {game,e}=fresh(),gold=()=>game.resources.gold,food=()=>game.resources.food;game.resources.gold=20000;
  const before=e.clanRelation(game,"xun","cao"),xunyu=named(game,"荀彧"),loyal=xunyu.loyalty;const marry=e.marryClan(game,"xun","cao");assert(marry.ok,marry.error);assert.equal(e.clanRelation(game,"xun","cao"),Math.min(100,before+20));assert(xunyu.loyalty>loyal||loyal>=100,"族人忠诚上升");assert(!e.marryClan(game,"xun","cao").ok,"三年一次");
  const wealth=game.clans.byId.xun.wealth,g0=gold(),f0=food(),give=e.clanContribute(game,"xun","cao");assert(give.ok,give.error);assert.equal(gold()-g0,give.gold);assert.equal(food()-f0,give.food);assert.equal(game.clans.byId.xun.wealth,wealth-give.gold);assert(!e.clanContribute(game,"xun","cao").ok,"半年一次");
  assert(!e.clanContribute(game,"yuan_rn","cao").ok,"关系不足不得劝输");
  const local=Object.entries(game.clans.byId.chen_yc.presence).filter(([id])=>e.popNode(e.popPlace(id)).force==="cao"&&e.popNode(e.popPlace(id)).id!==named(game,"曹操").city),move=e.relocateClan(game,"chen_yc","cao");assert(move.ok,move.error);for(const [id,share] of local)assert(game.clans.byId.chen_yc.presence[id]<share,"境内地产减少");assert(game.clans.byId.chen_yc.grievance.cao>=20);
  const status=e.clanActionStatus(game,"xun","cao");for(const key of ["court","marry","summon","contribute","relocate","suppress"])assert(key in status,key);assert.equal(status.marry.ok,false);assert(status.marry.reason);
  console.log("联姻、劝输、徙豪强通过");}

// 5. 内应：围城时与城主交恶、与围城者交好的大族暗通
{const {game,e}=fresh("yuan"),city=game.data.cities.find(c=>c.force==="cao"&&Object.keys(e.clanSharesAt(game,c.id)).length);const [clanId]=Object.entries(e.clanSharesAt(game,city.id)).sort((a,b)=>b[1]-a[1])[0];
  game.clans.byId[clanId].presence[city.id]=.4;e.clanChanged();game.clans.byId[clanId].grievance.cao=90;game.clans.byId[clanId].favor.yuan=60;
  const army=game.data.armies.find(a=>a.force==="yuan");army.city=(game.data.rules.city_graph[city.id]||[])[0];army.siegeTarget=city.id;game.random=()=>0;
  const before=city.defenseDamage||0,events=[];e.resolveClanIntrigue(game,events);assert(events.some(ev=>/内应/.test(ev.text)),"触发内应");assert(city.defenseDamage>before,"城防受损");
  const again=[];e.resolveClanIntrigue(game,again);assert(!again.length,"冷却期内不再触发");
  console.log("内应通过");}

// 6. 旧档：无 version 的世家状态补上支脉
{const {game,e}=fresh();const save=JSON.parse(JSON.stringify(game.serialize()));delete save.clans.version;for(const record of Object.values(save.clans.byId)){for(const id of record.branchIds||[])delete record.presence[id];delete record.branchIds}
  const restored=new GameState(structuredClone(scenario));restored.applySave(restored.migrateSave(save));assert.equal(restored.clans.version,2);assert(restored.engine.clanDistribution(restored,"zhuge").some(row=>row.branch),"旧档补上支脉");
  console.log("旧档补支脉通过");}

// 7. 界面：世家窗口、族谱与分布、人物与世家链接
{const {game}=fresh();globalThis.MapGrid=undefined;await import(pathToFileURL(path.join(root,"js/ui/clan-ui.js")));
  ClanUI.view={tab:"list",clanId:null,filter:"all",sort:"wealth"};const list=ClanUI.render(game);assert.match(list,/data-clan-open="xun"/);assert.match(list,/颍川颍阴荀氏/);
  ClanUI.view={tab:"detail",clanId:"cao",filter:"all",sort:"relation"};const detail=ClanUI.render(game);for(const token of ["族谱","地产分布","data-officer-open","data-clan-act=\"marry\"","data-clan-act=\"contribute\"","data-clan-act=\"relocate\"","data-city-open","data-clan-focus","class=\"clan-tree\""])assert(detail.includes(token),token);
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8"),app=appSource();for(const token of ["clanButton","clanDialog","js/ui/clan-ui.js","js/ui/app/clan-window.js"])assert(html.includes(token),token);
  for(const token of ["SanguoApp.define(\"clanWindow\"","[data-officer-open]","[data-clan-open]","[data-city-open]","setClanFocus","\"clanWindow\""])assert(app.includes(token),token);
  assert.match(app,/ClanUI\.clanLink\(state,state\.engine\.officerClan\(officer\)\.id\)/,"人物档案出身可点开世家");assert.match(app,/officerKin/,"人物档案列族亲");
  console.log("世家窗口与链接通过");}
console.log("世家细分到县：全称祖居 / 支脉倾向 / 族谱称谓 / 联姻劝输徙豪强 / 内应 / 旧档补支脉 / 界面链接");
