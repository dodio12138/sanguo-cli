import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stableSave=g=>{const s=g.serialize();delete s.savedAt;return digest(s)};
globalThis.window=globalThis;globalThis.CustomEvent??=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
for(const file of ['data/offline-data.generated','core/game-clock','core/fiscal-system','core/rule-engine','core/game-state'])await import(`../js/${file}.js`);
const fresh=(player='cao')=>{const g=new GameState(structuredClone(SANGUO_DATA),{playerForceId:player});g.engine.playerForceId=player;g.rngState=413;return {g,e:g.engine,p:g.diplomacy.politics}};
const advance=(g,n=6)=>{g.turn+=n};
const proposal=(fromId='cao',toId='liu',kind='full')=>({fromId,toId,type:kind==='vassal'?'vassalize':'demand_surrender',terms:{kind,retainOffices:true,protectFamilies:true}});
const distress=(g,e,id='liu')=>{for(let i=0;i<3;i++)e.recordPoliticalBattle(g,{battleId:`major-${i}`,winnerId:'cao',loserId:id,siteId:'test',start:15000,loss:10000});e.recordWarPressure(g,{id:'key-site',forceId:id,opponentId:'cao',kind:'site_loss',severity:1,siteId:'lost-capital'})};
const ledger=g=>{const out={gold:0,food:0,silk:0,soldiers:0,population:0};const pools=new Set;for(const f of g.data.forces){const pool=f.id===g.playerForceId?g.resources:f.resources;if(pool&&!pools.has(pool)){pools.add(pool);for(const k of ['gold','food','silk'])out[k]+=pool[k]||0}}for(const c of g.data.cities){out.gold+=c.localGold||0;out.food+=c.localFood||0;out.silk+=c.localSilk||0;out.soldiers+=(c.garrison||0)+Object.values(c.prisoners||{}).reduce((n,v)=>n+v,0);out.population+=c.population||0}for(const a of g.data.armies){for(const k of ['gold','food','silk'])out[k]+=a.stores?.[k]||0;out.soldiers+=(a.soldiers||0)+(a.wounded||0)+(a.stragglers||0)+Object.values(a.prisoners||{}).reduce((n,v)=>n+v,0)}for(const q of g.diplomacy.politics.proposals)out.gold+=q.escrow||0;return out};
{
 const {g,e,p}=fresh(),q=proposal(),base=e.evaluateSubmission(g,q);assert(base.eligible,base.reason);
 const before=stableSave(g),rng=g.rngState;for(let i=0;i<8;i++)e.evaluateSubmission(g,q);assert.equal(g.rngState,rng);assert.equal(stableSave(g),before,'预览不写状态或随机源');
 distress(g,e);const score=e.evaluateSubmission(g,q);assert(score.chance>base.chance);assert(score.chance>=.65,`重创后接受意愿应较高：${score.chance}`);
 const n=p.pressure.liu.length;e.recordPoliticalBattle(g,{battleId:'major-0',winnerId:'cao',loserId:'liu',start:15000,loss:10000});assert.equal(p.pressure.liu.length,n,'同一战役只计一次');
 const pressure=e.campaignFacts(g,'liu').recent_defeat_pressure;advance(g,181);assert(e.campaignFacts(g,'liu').recent_defeat_pressure<pressure,'旧败绩衰减过期');
}
{
 const {g,e,p}=fresh();g.random=()=>0;distress(g,e);const before=ledger(g),map=JSON.stringify(g.data.map),oldArmies=g.data.armies.filter(a=>a.force==='liu').map(a=>[a.id,a.soldiers,a.wounded||0]),oldGovernor=structuredClone(g.data.cities.find(c=>c.force==='liu'&&c.governor&&c.governor!=='—'));
 const targetCities=new Set(g.data.cities.filter(c=>c.force==='liu').map(c=>c.id));const route=[...targetCities].slice(0,2);g.policies.fiscalAccounts.shipments.push({id:'receipt-cargo',forceId:'liu',sourceCityId:route[0],targetCityId:route[1],route,status:'在途',resource:'food',amount:500,delivered:480,transportLoss:20,armyId:null});
 const offered=e.submitDiplomaticProposal(g,{...proposal(),terms:{...proposal().terms,gold:500}},'cao',[]);assert(offered.ok,offered.error);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(offered.proposal.status,'accepted');assert.equal(g.data.forces.find(f=>f.id==='liu').eliminated,true);
 assert.deepEqual(ledger(g),before,'归降前后府库、城库、兵员与人口守恒');assert.equal(JSON.stringify(g.data.map),map,'归降不改地图地形');
 for(const [id,n,w]of oldArmies){const a=g.data.armies.find(x=>x.id===id);assert.equal(a.force,'cao');assert.equal(a.soldiers,n);assert.equal(a.wounded||0,w)}
 if(oldGovernor)assert.equal(g.data.cities.find(c=>c.id===oldGovernor.id).governor,oldGovernor.governor);
 assert.equal(g.policies.fiscalAccounts.shipments.find(x=>x.id==='receipt-cargo').forceId,'cao');
 const agreement=p.agreements.find(x=>x.kind==='full'),after=ledger(g);assert(e.beginForceReception(g,agreement,[]).ok);assert.deepEqual(ledger(g),after,'重复接收不能重复发放');
 const save=JSON.parse(JSON.stringify(g.serialize())),restored=fresh().g;restored.applySave(restored.migrateSave(save));assert.deepEqual(restored.diplomacy.politics.receptions,p.receptions);assert.deepEqual(ledger(restored),after,'读档不截粮、不复活归降军队');
}
{
 const {g,e,p}=fresh();g.random=()=>.999;distress(g,e);const before=g.resources.gold;const row=e.submitDiplomaticProposal(g,{...proposal(),terms:{...proposal().terms,gold:300}},'cao',[]);assert(row.ok);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(row.proposal.status,'rejected');assert.equal(g.resources.gold,before,'拒绝归还暂存款');const rng=g.rngState;assert(!e.submitDiplomaticProposal(g,{...proposal(),terms:{...proposal().terms,gold:300}},'cao',[]).ok);assert.equal(g.rngState,rng,'重复提案不重掷');
}
{
 const {g,e}=fresh('liu');g.random=()=>0;distress(g,e);const old=g.data.cities.filter(c=>c.force==='liu').length;const row=e.submitDiplomaticProposal(g,proposal(),'cao',[]);assert(row.ok,row.error);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(row.proposal.status,'waiting');assert.equal(g.data.cities.filter(c=>c.force==='liu').length,old,'玩家未答复不自动投降');assert(!e.respondDiplomaticProposal(g,row.proposal.id,'accept','cao',[]).ok);
 assert(e.respondDiplomaticProposal(g,row.proposal.id,'vassal','liu',[]).ok);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(row.proposal.status,'accepted');assert.equal(g.diplomacy.worldVassals.liu,'cao');assert.equal(g.data.cities.filter(c=>c.force==='liu').length,old,'附庸保留领土');assert(e.worldFriendly(g,'liu','cao'));assert(!e.worldWar(g,'liu','cao'));
 g.turn+=10000;e.releaseLateVassals(g,[]);assert.equal(g.diplomacy.worldVassals.liu,'cao','后期不会无条件解除附庸');
}
{
 const {g,e,p}=fresh();g.random=()=>0;distress(g,e);let row=e.submitDiplomaticProposal(g,proposal('cao','liu','vassal'),'cao',[]);assert(row.ok,row.error);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(g.diplomacy.worldVassals.liu,'cao');
 const before=ledger(g),agreement=p.agreements[0];g.turn+=121;g.date.day=31;e.settlePoliticalVassals(g,[]);assert.deepEqual(ledger(g),before,'贡赋从附庸府库转至宗主，不凭空产出');const once=ledger(g);e.settlePoliticalVassals(g,[]);assert.deepEqual(ledger(g),once,'月度贡赋不重复结算');
 row=e.submitDiplomaticProposal(g,{fromId:'cao',toId:'liu',type:'negotiate_integration',terms:{kind:'full',retainOffices:true,protectFamilies:true}},'cao',[]);assert(row.ok,row.error);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(row.proposal.status,'accepted');assert.equal(g.data.forces.find(f=>f.id==='liu').eliminated,true);assert.equal(agreement.status,'integrated');
}
{
 const {g,e}=fresh();g.diplomacy.worldVassals.cao='liu';assert(!e.evaluateSubmission(g,proposal()).eligible,'不允许循环附庸');
 const attempted=e.submitDiplomaticProposal(g,proposal(),'liu',[]);assert(!attempted.ok,'禁止代其他势力提出协议');
}
{
 const {g,e,p}=fresh();g.random=()=>0;distress(g,e);const army=g.data.armies.find(a=>a.force==='liu'),officer=g.data.officers.find(o=>o.force==='liu'&&o.name!==g.data.forces.find(f=>f.id==='liu').name&&o.status==='serving');assert(army&&officer);army.commanderOfficerId=officer.id;army.commander=officer.name;officer.loyalty=99;officer.ambition=5;army.route=[g.data.cities.find(c=>c.force==='cao').id];army.destination=army.route[0];
 const row=e.submitDiplomaticProposal(g,proposal(),'cao',[]);assert(row.ok,row.error);advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(army.force,'liu');assert(g.data.forces.find(f=>f.id==='liu').remnant);e.evaluateGameOver(g,[]);assert(g.data.armies.includes(army),'失去城池的拒降残部不直接消失');
}
{
 const {g,e,p}=fresh();const original=g.data.cities.find(c=>c.force==='liu'),town=g.data.cities.find(c=>c.force==='liu'&&c!==original);original.commanderySeatNode=true;town.commandery=original.commandery;original.force='cao';town.garrison=100;e.schedulePoliticalPacification(g,original,'cao','liu',[]);assert(p.pacifications.some(x=>x.cityId===town.id));const row=p.pacifications.find(x=>x.cityId===town.id);g.data.armies.find(a=>a.force==='liu').city=town.id;advance(g,30);e.resolvePoliticalPacifications(g,[]);assert.equal(town.force,'liu','完整守军所在县不会自动归附');assert.equal(row.status,'resisted');
}
{
 const {g,e}=fresh();const rng=g.rngState;e.campaignCondition({all:[{fact:'x',gte:1},{not:{fact:'y',eq:1}}]},{x:2,y:0});assert.equal(g.rngState,rng);assert(e.campaignCondition({any:[{fact:'x',gt:5},{fact:'x',lte:2}]},{x:2}));assert(!e.campaignCondition({fact:'unknown',gte:0},{x:2}));
 g.policies.campaign.profile={intent_graph:{initial:'root',nodes:[{id:'root',choices:[{intent:'offer_submission',weight:1}]}]}};assert.equal(e.chooseCampaignIntent(g,'liu').intent,'offer_submission');g.policies.campaign.mode='free';assert.notEqual(e.chooseCampaignIntent(g,'liu').choice?.intent,'offer_submission','自由模式不强用剧本分支');
 const save=JSON.parse(JSON.stringify(g.serialize()));delete save.policies.campaign;delete save.diplomacy.politics;const old=fresh().g;old.applySave(old.migrateSave(save));assert(!old.engine.campaignEnabled(old),'旧档缺字段时不自动启用割地或吞并');
}
console.log('战役政治通过：压力衰减去重 / 只读预览 / 高压归降 / 完整接收守恒 / 官员军团与粮运 / 失败退款与冷却 / 玩家反提案 / 附庸贡赋整合 / 拒降残部 / 强守县 / 分支配置 / 存档兼容');
// 授权限定、附庸实际通行与供粮、阶段目标和政治统一。
{
 const {g,e}=fresh(),target=g.data.cities.find(c=>c.force==='shi_xie');const events=[];
 e.resolvePoliticalOrder(g,{type:'authorize_war',options:{targetForceId:'shi_xie',postId:'direct',commandery:target.commandery,days:20}},events);
 assert(e.warGrantAllows(g,'cao','shi_xie',{cityId:target.id}));assert(!e.warGrantAllows(g,'cao','shi_xie',{cityId:g.data.cities.find(c=>c.commandery!==target.commandery).id}));assert(!e.warGrantAllows(g,'cao','shi_xie',{postId:'unauthorized',cityId:target.id}));advance(g,21);assert(!e.warGrantAllows(g,'cao','shi_xie',{cityId:target.id}));
}
{
 const {g,e}=fresh();g.diplomacy.worldVassals.liu='cao';g.diplomacy.wars=g.diplomacy.wars.filter(id=>id!=='liu');
 const city=g.data.cities.find(c=>c.force==='liu'),a=g.data.armies.find(a=>a.force==='cao');a.city=city.id;delete a.route;delete a.fieldPosition;delete a.engagementId;delete a.siegeTarget;
 assert(e.politicalTransitAllowed('cao','liu'));assert(!e.politicalTransitAllowed('cao','sun'),'普通邻国不获得臣属借道权');assert.equal(FiscalSystem.supplyCity(g,a)?.id,city.id);
 const before=ledger(g);a.stores.food=0;const changed=ledger(g),taken=FiscalSystem.stockArmy(g,a);assert(taken>=0);assert.equal(ledger(g).food,changed.food,'臣属就仓按实际转账，不增加粮食');
 const home=g.data.cities.find(c=>c.force==='cao'&&c!==city),other=g.data.cities.find(c=>c.force==='cao'&&c!==home);const graph=g.data.rules.city_graph;g.data.rules.city_graph={[home.id]:[city.id],[city.id]:[home.id,other.id],[other.id]:[city.id]};
 assert(e.path(home.id,other.id,'cao')?.includes(city.id),'实际寻路可经过附庸县');g.diplomacy.worldVassals={};assert.equal(e.path(home.id,other.id,'cao'),null,'解除臣属后不能继续借道');g.data.rules.city_graph=graph;
}
{
 const {g,e,p}=fresh();for(const c of g.data.cities)c.force='cao';g.date={year:200,month:1,day:31};g.turn=31;e.resolveCampaignVictory(g,[]);assert(p.victoryCandidate);assert(!g.gameOver,'政治统一必须维持稳定期');advance(g,179);e.resolveCampaignVictory(g,[]);assert(!g.gameOver);advance(g,1);e.resolveCampaignVictory(g,[]);assert.equal(g.gameOver.result,'victory');
}
{
 const {g,e,p}=fresh();g.policies.campaign.victory='regional';g.date={year:200,month:1,day:31};const provinces=g.policies.campaign.profile.regional_goal.provinces;
 for(const c of g.data.cities)if(provinces.includes(c.province))c.force='cao';e.resolveCampaignVictory(g,[]);assert(p.milestones.some(m=>m.id==='regional'));assert(g.gameOver.text.includes('区域战役'));
}
{
 const {g,e,p}=fresh();g.random=()=>0;distress(g,e);const row=e.submitDiplomaticProposal(g,{...proposal(),terms:{...proposal().terms,gold:500}},'cao',[]);assert(row.ok);const before=ledger(g);g.data.forces.find(f=>f.id==='liu').eliminated=true;advance(g);e.resolvePoliticalProposals(g,[]);assert.equal(row.proposal.status,'expired');assert.equal(row.proposal.escrow,0);assert.deepEqual(ledger(g),before,'谈判期间目标灭亡也退回暂存款');
 const config=JSON.parse(JSON.stringify(g.policies.campaign.rules));g.data.rules.balance.politics.submission_base=.99;assert.deepEqual(g.policies.campaign.rules,config,'本局规则快照不受仓库新配置静默覆盖');
}
console.log('战役后续通过：限域授权 / 臣属实际借道供粮 / 政治统一稳定期 / 区域胜利 / 目标消失退款 / 配置快照');
{
 const {g,e}=fresh();g.random=()=>0;distress(g,e);g.diplomacy.worldWars.push({key:'liu:sun',a:'liu',b:'sun',startedTurn:1});const row=e.submitDiplomaticProposal(g,proposal('cao','liu','vassal'),'cao',[]);assert(row.ok,row.error);advance(g);e.resolvePoliticalProposals(g,[]);assert(e.worldWar(g,'cao','sun'),'宗主接续附庸的防卫战争');assert(e.worldWar(g,'liu','sun'));
 e.setPairTreaty(g,'cao','sun','truce',3);assert(!e.worldWar(g,'liu','sun'),'宗主停战后附庸旧战争记录不能重开战端');assert(e.worldTruce(g,'liu','sun'),'臣属的外交查询同样显示宗主停战');assert(!e.requestAIWar(g,'liu','sun',[],'旧路线'));
 assert(e.endPoliticalVassalage(g,'liu','cao',[]).ok);assert(!e.worldFriendly(g,'cao','liu'));assert(e.worldTruce(g,'cao','liu'));assert.equal(g.diplomacy.worldVassals.liu,undefined);
}
{
 const {g,e,p}=fresh();g.random=()=>0;const baseline=ledger(g),governor=g.data.officers.find(o=>o.force==='yuan'&&o.status==='serving'&&o.name!==g.data.forces.find(f=>f.id==='yuan').name),city=g.data.cities.find(c=>c.force==='yuan');
 governor.city=city.id;governor.ambition=5;governor.loyalty=20;const command=e.commandOf(g,'yuan');command.posts={qa_split:{id:'qa_split',kind:'jun',holderId:governor.id,parentId:null,scope:{provinces:[],commanderies:[city.commandery]},policy:{type:'hold'},status:{mode:'恭顺',defiance:.7},directives:[],reports:[]}};p.strategies.yuan={successionUntil:GameClock.elapsedDays(g)+120};
 const result=e.splitPoliticalSuccession(g,'yuan',[]);assert(result.ok,result.error);assert.deepEqual(ledger(g),baseline,'继承分裂按实际划分，不复制兵粮人口');assert(g.data.forces.some(f=>f.id.startsWith('succession_yuan_')));
 const save=JSON.parse(JSON.stringify(g.serialize())),restored=fresh().g;restored.applySave(restored.migrateSave(save));assert.equal(restored.data.forces.length,g.data.forces.length,'新分支势力保存恢复');
}
{
 const {g,e,p}=fresh();g.policies.campaign.victory='regional';g.date.day=31;const provinces=g.policies.campaign.profile.regional_goal.provinces;for(const c of g.data.cities)if(provinces.includes(c.province))c.force='cao';e.resolveCampaignVictory(g,[]);assert(g.gameOver);assert(e.continueCampaign(g).ok);assert.equal(g.gameOver,null);assert.equal(g.policies.campaign.victory,'military','阶段胜利后可继续征服');
}
console.log('集团与分支通过：宗主停战覆盖臣属 / 解除臣属 / 继承分裂守恒与存档 / 阶段胜利后继续');
