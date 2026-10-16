// 幕府与方面指挥：层级任免、方针执行、专项指令、协同出击、月报、拥兵自重、AI 中枢、存档与旧军团迁移、界面。
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
// 默认清掉开局史实方面，便于逐项测任免；seed 为真时保留
const fresh=(force="cao",{seed=false}={})=>{const game=new GameState(structuredClone(scenario),{playerForceId:force});if(!seed){game.forceCommand={};for(const army of game.data.armies)delete army.postId}return {game,e:game.engine}};
const named=(game,name)=>game.data.officers.find(o=>o.name===name);
const tenDays=(game,n)=>{for(let i=0;i<n*10;i++)game.endTurn()};

// 1. 任免：层级按实际隶属；下级须在上级辖区内；同级不重叠；主公不自任；一人一职
{const {game,e}=fresh(),me="cao";const a=e.createPost(game,me,{kind:"dudu",scope:{provinces:["司隶","兖州"]},holderId:named(game,"夏侯惇").id});assert(a.ok,a.error);
  const b=e.createPost(game,me,{kind:"jun",scope:{commanderies:["河南尹"]},holderId:named(game,"于禁").id,parentId:a.post.id});assert(b.ok,b.error);assert.equal(e.postDepth(game,me,b.post),1);
  assert(!e.createPost(game,me,{kind:"jun",scope:{commanderies:["汝南郡"]},holderId:named(game,"曹仁").id,parentId:a.post.id}).ok,"汝南不在司隶兖州都督辖内");
  assert(!e.createPost(game,me,{kind:"zhou",scope:{provinces:["司隶"]},holderId:named(game,"曹仁").id}).ok,"同级辖区重叠");assert(!e.createPost(game,me,{kind:"jun",scope:{commanderies:["汝南郡"]},holderId:named(game,"夏侯惇").id}).ok,"一人一职");
  assert(!e.createPost(game,me,{kind:"jun",scope:{commanderies:["汝南郡"]},holderId:named(game,"曹操").id}).ok,"主公不自任");
  const luoyang=game.data.cities.find(c=>c.id==="luoyang");assert.equal(e.postOfCity(game,me,luoyang).id,b.post.id,"城归最深一级");assert(e.postCities(a.post,me).length>e.postCities(b.post,me).length);
  // 召还：下属改隶上级，忠诚下降
  const loyal=named(game,"夏侯惇").loyalty;e.removePost(game,me,a.post.id);assert.equal(game.forceCommand.cao.posts[b.post.id].parentId,null,"下属改直属主公");assert(named(game,"夏侯惇").loyalty<loyal)}

// 2. 进取：辖内集结，兵力足即攻取目标；下令不占主公命令额度
{const {game,e}=fresh(),me="cao";game.observerMode=false;const post=e.createPost(game,me,{kind:"dudu",scope:{provinces:["司隶"]},holderId:named(game,"夏侯渊").id}).post;const target=game.data.cities.find(c=>c.id==="commandery_city_007");game.diplomacy.wars.push(target.force);e.declareWorldWar?.(game,me,target.force,[],"测试");target.garrison=500;game.data.armies=game.data.armies.filter(a=>a.force===me);// 清场：只测进取，不触发驰援
  const armies=e.postArmies(post,me);assert(armies.length,"辖内军团已划归");for(const a of armies){a.supply=100;a.morale=80}const orders=game.orders.length;e.setPostPolicy(game,me,post.id,{type:"advance",targetCityId:target.id});
  let marched=false;for(let i=0;i<60&&!marched;i++){game.endTurn();marched=e.postArmies(post,me).some(a=>a.destination===target.id||a.city===target.id)||target.force===me}assert(marched,"都督向目标进兵");assert.equal(game.orders.length,orders,"不占命令额度")}

// 3. 粮草先行与增援、战场方略、派遣人物
{const {game,e}=fresh(),me="cao";const post=e.createPost(game,me,{kind:"dudu",scope:{provinces:["豫州"]},holderId:named(game,"曹仁").id}).post,front=e.postCities(post,me).find(c=>c.id==="runan")||e.postCities(post,me)[0];
  let r=e.issueDirective(game,me,[post.id],{type:"grain",cityId:front.id,food:20000,deadlineTurn:game.turn+90});assert(r.ok,r.error);tenDays(game,3);const d=post.directives.find(x=>x.type==="grain");assert(d.shipped>0,`粮草先行已发 ${d.shipped}`);
  r=e.issueDirective(game,me,[post.id],{type:"doctrine",retreatLine:45,tactic:"cautious",carryDays:20});assert(r.ok);for(const a of e.postArmies(post,me)){assert.equal(a.retreatLine,45);assert.equal(a.tactic,"cautious")}
  const officer=named(game,"李典");r=e.issueDirective(game,me,[post.id],{type:"dispatch",officerId:officer.id,cityId:front.id});assert(r.ok,r.error);assert.equal(officer.city,front.id,"派遣到任")}

// 4. 协同出击：发动日前赴集结地，到期一齐进攻，未到者失期
{const {game,e}=fresh(),me="cao";const a=e.createPost(game,me,{kind:"dudu",scope:{provinces:["司隶"]},holderId:named(game,"夏侯渊").id}).post,b=e.createPost(game,me,{kind:"zhou",scope:{provinces:["兖州"]},holderId:named(game,"曹洪").id}).post;
  const target=game.data.cities.find(c=>c.id==="ye"),rally=game.data.cities.find(c=>c.id==="baima"||c.id==="yanjin");const r=e.issueDirective(game,me,[a.id,b.id],{type:"coordinate",targetCityId:target.id,rallyCityId:rally.id,launchTurn:game.turn+40});assert(r.ok,r.error);
  tenDays(game,5);const op=game.forceCommand.cao.operations[0];assert(op.status!=="进行","到期结算");console.log(`协同出击：${op.status}`)}

// 5. 汇报与拥兵自重：月报写入；兵权重、忠诚低、野心大者截留赋税
{const {game,e}=fresh(),me="cao";const holder=named(game,"张绣"),post=e.createPost(game,me,{kind:"dudu",scope:{provinces:["司隶","兖州","豫州"]},holderId:holder.id}).post;holder.loyalty=20;holder.ambition=5;const gold=game.resources.gold;
  tenDays(game,4);assert(post.reports.length,"月报");assert.match(post.reports[0].lines[0],/辖 \d+ 城/);assert.equal(post.status.mode,"截留",`拥兵 ${post.status.defiance}`);assert(post.status.withheld>0,"截留赋税");
  assert(game.reports.some(r=>r.events?.some(ev=>ev.phase==="方面")),"汇报进入消息")}

// 6. AI：中枢按州设方面，指定主攻方向；存档往返；旧军团迁移
{const {game,e}=fresh();game.observerMode=true;tenDays(game,4);const yuan=e.commandPosts(game,"yuan");assert(yuan.length>=2,"袁绍设州方面");assert(yuan.some(p=>p.policy.type==="advance"),"有主攻方向");assert(yuan.every(p=>e.postHolder(p)?.force==="yuan"));
  const save=JSON.parse(JSON.stringify(game.serialize())),back=new GameState(structuredClone(scenario));back.applySave(back.migrateSave(save));for(const [id,post] of Object.entries(game.forceCommand.yuan.posts))assert.deepEqual(back.forceCommand.yuan.posts[id],post,"既有方面存档往返");for(const post of Object.values(back.forceCommand.yuan.posts))if(!game.forceCommand.yuan.posts[post.id])assert(back.engine.isCivilPrefectPost(post),"仅补齐缺失的实际郡守方面");const ids=Object.keys(back.forceCommand.yuan.posts);back.engine.synchronizePrefectPosts(back);assert.deepEqual(Object.keys(back.forceCommand.yuan.posts),ids,"补齐幂等");
  const old=new GameState(structuredClone(scenario),{playerForceId:"cao"}),army=old.data.armies.find(a=>a.force==="cao");old.forceCommand={};old.corps=[{id:"c1",name:"第1军团",leaderId:named(old,"曹仁").id,armyIds:[army.id],cityIds:[army.city]}];old.engine.ensureForceCommand(old);const migrated=old.engine.commandPosts(old,"cao").filter(p=>p.kind==="dudu");assert.equal(migrated.length,1,"旧军团并入都督府");assert.equal(army.postId,migrated[0].id);assert.equal(old.corps.length,0)}

// 6b. 开局史实方面：按剧本预置（钟繇督关中、王邑隶之）；玩家军团仍归直辖；AI 方面保留并被州职位收为下级；官制图列实际管辖
{const {game,e}=fresh("cao",{seed:true}),posts=e.commandPosts(game,"cao"),post=name=>posts.find(p=>e.postHolder(p)?.name===name);assert.deepEqual(game.forceCommandSkipped,[],"开局方面无跳过项");
  assert(post("钟繇")&&post("钟繇").kind==="dudu"&&post("钟繇").title==="关中都督");assert.equal(post("王邑").parentId,post("钟繇").id,"河东太守隶关中都督");assert.equal(post("刘延").parentId,post("程昱").id);assert.equal(post("夏侯惇").title,"河南尹");assert(post("钟繇").basis);
  assert(!game.data.armies.some(a=>a.force==="cao"&&a.postId),"玩家开局军团不划归方面");assert.equal(post("钟繇").autoArmies,false);
  assert.equal(named(game,"荀攸").id,e.commandOf(game,"cao").central.advisor);
  const yuan=e.commandPosts(game,"yuan").map(p=>`${p.title}:${e.postHolder(p)?.name}`);for(const t of ["青州刺史:袁谭","幽州刺史:袁熙","并州刺史:高干"])assert(yuan.includes(t),t);
  const sun=e.commandPosts(game,"sun");assert(sun.length&&!sun.some(p=>p.kind!=="jun"&&e.postCities(p,"sun").some(c=>c.id===e.forceRulerOfficer("sun")?.city)),"辖区不含主公驻地");
  // AI 复审：保留史实方面（刘表的黄祖）；曹操为 AI 时钟繇、满宠仍在任
  e.runCentralAI(game,[]);assert(e.commandPosts(game,"liu_biao").some(p=>e.postHolder(p)?.name==="黄祖"),"复审保留黄祖");
  const {game:g2,e:e2}=fresh("liu_biao",{seed:true});e2.runCentralAI(g2,[]);const ps=e2.commandPosts(g2,"cao");for(const name of ["钟繇","满宠","程昱"])assert(ps.some(p=>e2.postHolder(p)?.name===name),`${name}仍在任`);
  for(const p of ps)if(p.parentId)assert(e2.commandOf(g2,"cao").posts[p.parentId],"上级存在");
  // 官制图只列官职架构；方面页提供辖郡及直辖管理
  await import(pathToFileURL(path.join(root,"js/ui/command-ui.js")));CommandUI.expanded=new Set(["direct",...posts.map(p=>p.id)]);const html=CommandUI.chart(game);for(const token of ["data-post-select","河东郡太守","东郡太守","主公"])assert(html.includes(token),token);assert(CommandUI.posts(game).includes("data-cmd-expand"));CommandUI.expanded=new Set()}

// 7. 界面
{const app=appSource(),ui=fs.readFileSync(path.join(root,"js/ui/command-ui.js"),"utf8"),html=fs.readFileSync(path.join(root,"index.html"),"utf8");for(const token of ["forceCommandButton","forceCommandDialog","engine/command.js","ui/command-ui.js"])assert(html.includes(token),token);for(const token of ["CommandUI.render","CommandUI.act","setCentralOffice"])assert(app.includes(token),token);for(const token of ["data-post-select","data-cmd-action=\"create\"","data-cmd-action=\"directive\"","协同出击"])assert(ui.includes(token),token)}
console.log("幕府与方面指挥通过：层级任免 / 进取不占额度 / 粮草先行、方略、派遣 / 协同出击 / 月报与截留 / AI 中枢设方面 / 开局史实方面 / 存档与旧军团迁移 / 界面");
