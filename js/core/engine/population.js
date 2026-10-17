// RuleEngine 分模块：人口（POP）。每处据点、每个县记录有若干 POP，每个 POP 是一群职业、阶层、依附相同的人：
// [职业, 阶层, 依附世家, 儿童, 成年男, 成年女, 老人, 户数, 登记率, 健康]。人口只由出生、死亡、迁徙、征发改变；
// 税基取登记劳力，征兵取健康成年男减去户内保留劳力。place.population 只是真实总人口的缓存。企划见 docs/POP_CLAN_PLAN.md。
(()=>{
const OCC=0,CLS=1,CLAN=2,CH=3,AM=4,AF=5,EL=6,HH=7,RR=8,HP=9;
const FARM=0,TRADE=1,SCHOLAR=2,FREE=0,DEP=1,DRIFT=2;
const total=p=>p[CH]+p[AM]+p[AF]+p[EL];
const keyOf=p=>`${p[OCC]}|${p[CLS]}|${p[CLAN]}`;
const r2=x=>Math.round(x*100)/100;

Object.assign(window.RuleEngine.prototype,{
  popRules(){return this._popRules??=this.buildPopRules()},
  buildPopRules(){const base={age:{children:.35,adult_male:.27,adult_female:.27,elderly:.11},household_size:[5.2,6.5,8],registered:[.92,.5,.1],scholar_registered:.95,health:.85,
      urban_mix:{trade:.28,scholar:.04},county_mix:{trade:.06,scholar:.02},refugee_start:{default:.03,"190_coalition":.05,"194_puyang":.06},
      fertility:.18,mortality:{children:.045,adult:.012,elderly:.07},famine_mortality:.08,war_mortality:.04,
      household_ratio:.72,marriage_rate:.08,dissolve_base:.003,dissolve_war:.02,dissolve_famine:.02,
      dependency:{base:.004,famine:.03,tax:.01,war:.01,max_share:.9},flight:{war:.03,famine:.03},
      refugee:{migrate:.25,loss:.03,settle:.1,neighbors:8,levy:.5},min_pop:50,max_pops:10,
      levy_floor:{normal:.75,accelerated:.55,forced:.25},tax_weights:[1,.8,.3],female_labor:.6,
      registration:{drift:.03,free_base:.84,free_per_score:.0013,free_max:.98,dependent_base:.5},estimate:{base:.1,per_year:.05,max:.4}};
    const custom=this.data.rules?.population||{};return {...base,...custom,refugee:{...base.refugee,...custom.refugee},dependency:{...base.dependency,...custom.dependency},registration:{...base.registration,...custom.registration}}},

  // —— 处所 ——
  popPlaces(){return [...this.data.cities,...(this.data.counties||[])]},
  popPlace(id){if(!this._popPlaceIndex||this._popPlaceIndexSize!==this.data.cities.length+(this.data.counties||[]).length){this._popPlaceIndex=new Map(this.popPlaces().map(place=>[place.id,place]));this._popPlaceIndexSize=this._popPlaceIndex.size}return this._popPlaceIndex.get(id)||null},
  // 县记录的位置与粮仓看本县县治节点；没有县治节点的看所属郡治。
  popNode(place){if(!place.jurisdictionCityId)return place;return this.data.cities.find(city=>city.id===place.cityId)||this.data.cities.find(city=>city.id===place.jurisdictionCityId)||place},
  popConditions(state,place){const node=this.popNode(place),besieged=this.isCityBesieged?.(node),recent=(node.lastBattleTurn&&state.turn-node.lastBattleTurn<=30)||(node.occupiedUntil&&node.occupiedUntil>=state.turn);
    const food=besieged?.35:(node.localFood||0)<=0&&node.force!=="neutral"?.6:1;return {food,war:besieged||recent?1:0,node}},

  // —— 拆分与合并 ——
  popAdd(place,occ,cls,clan,buckets,households,registered,health){place.pops??=[];const amount=buckets.reduce((n,v)=>n+v,0);if(amount<=0&&households<=0)return null;
    let pop=place.pops.find(p=>p[OCC]===occ&&p[CLS]===cls&&p[CLAN]===clan);
    if(!pop){pop=[occ,cls,clan,0,0,0,0,0,registered,health];place.pops.push(pop)}
    const before=total(pop),after=before+amount;if(after>0){pop[RR]=r2((pop[RR]*before+registered*amount)/after);pop[HP]=r2((pop[HP]*before+health*amount)/after)}
    for(let i=0;i<4;i++)pop[CH+i]+=buckets[i];pop[HH]+=Math.round(households);return pop},
  // 从一个 POP 拆出一部分（按比例，取整后精确扣减），返回迁徙包 {buckets, households, registered, health}。
  popSplit(pop,fraction,householdFactor=1){fraction=Math.max(0,Math.min(1,fraction));const buckets=[0,1,2,3].map(i=>Math.floor(pop[CH+i]*fraction));for(let i=0;i<4;i++)pop[CH+i]-=buckets[i];
    const households=Math.min(pop[HH],Math.round(pop[HH]*fraction*householdFactor));pop[HH]-=households;return {buckets,households,registered:pop[RR],health:pop[HP]}},
  popMove(place,pop,fraction,occ,cls,clan,{householdFactor=1,registered=null,loss=0}={}){const packet=this.popSplit(pop,fraction,householdFactor);let lost=0;if(loss>0)packet.buckets=packet.buckets.map(v=>{const gone=Math.floor(v*loss);lost+=gone;return v-gone});
    this.popAdd(place,occ,cls,clan,packet.buckets,packet.households,registered??packet.registered,packet.health);return {moved:packet.buckets.reduce((n,v)=>n+v,0),lost}},
  // 清理：去空、小 POP 并入同处编户农民、超出软上限时把最小的并入同阶层最大者。
  popCompact(place){const rules=this.popRules();if(!place.pops)return;place.pops=place.pops.filter(p=>total(p)>0||p[HH]>0);
    const absorb=(small,into)=>{if(small===into)return;const before=total(into),amount=total(small),after=before+amount;if(after>0){into[RR]=r2((into[RR]*before+small[RR]*amount)/after);into[HP]=r2((into[HP]*before+small[HP]*amount)/after)}for(let i=0;i<4;i++)into[CH+i]+=small[CH+i];into[HH]+=small[HH];place.pops.splice(place.pops.indexOf(small),1)};
    const protectedPop=p=>String(p[CLAN]).startsWith("household:"),anchor=()=>place.pops.find(p=>!protectedPop(p)&&p[OCC]===FARM&&p[CLS]===FREE)||place.pops.filter(p=>!protectedPop(p)).sort((a,b)=>total(b)-total(a))[0];
    for(const pop of place.pops.slice())if(!protectedPop(pop)&&total(pop)<rules.min_pop&&place.pops.length>1){const into=anchor();if(into&&into!==pop)absorb(pop,into)}
    while(place.pops.length>rules.max_pops){const sorted=place.pops.filter(p=>!protectedPop(p)).sort((a,b)=>total(a)-total(b));if(sorted.length<2)break;const small=sorted[0],into=sorted.slice(1).reverse().find(p=>p[CLS]===small[CLS])||sorted.at(-1);absorb(small,into)}},
  popRescale(place,target){const current=place.pops.reduce((n,p)=>n+total(p),0);target=Math.max(0,Math.round(target));if(current===target||!place.pops.length)return;if(!current){place.pops=[];place.population=target;delete place.pops;return}const factor=target/current;
    for(const p of place.pops){for(let i=0;i<4;i++)p[CH+i]=Math.floor(p[CH+i]*factor);p[HH]=Math.round(p[HH]*factor)}const diff=target-place.pops.reduce((n,p)=>n+total(p),0);place.pops[0][AM]+=diff;this.popSync(place)},
  popSync(place){if(!place.pops)return;let all=0,registered=0,households=0,regHouseholds=0;for(const p of place.pops){const n=total(p);all+=n;registered+=n*p[RR];households+=p[HH];regHouseholds+=p[HH]*p[RR]}
    place.population=Math.round(all);place.registeredPopulation=Math.round(registered);place.households=Math.round(households);place.registeredHouseholds=Math.round(regHouseholds)},

  // —— 开局生成 ——
  initPopulation(state){const rules=this.popRules();if(!state.clans?.byId)this.initClans(state);const refugeeShare=rules.refugee_start[this.data.scenario?.id]??rules.refugee_start.default;
    for(const place of this.popPlaces()){if(place.pops)continue;this.popSeed(state,place,rules,refugeeShare)}
    const raw=this.popPlaces().reduce((n,place)=>n+this.rawTaxBase(place),0),population=this.popPlaces().reduce((n,place)=>n+(place.population||0),0);state.popScale??=raw>0?Math.round(population/raw*1e4)/1e4:1;
    state.popStats??={births:0,deaths:0,lost:0,levied:0,returned:0}},
  // 读档：缺 POP 的处所按人口补生成；存档人口与 POP 合计不符（旧档或外部改动）时以存档人口为准，按原构成缩放。
  ensurePopulation(state){for(const place of this.popPlaces())if(place.pops&&Number.isFinite(place.population))this.popRescale(place,place.population);if(state.clans?.byId&&((state.clans.version||1)<2||(this.data.clans||[]).some(clan=>!state.clans.byId[clan.id])))this.initClans(state);if(!state.clans||this.popPlaces().some(place=>!place.pops))this.initPopulation(state);else{for(const place of this.popPlaces())this.popSync(place)}state.popStats??={births:0,deaths:0,lost:0,levied:0,returned:0}},
  popSeed(state,place,rules,refugeeShare){const amount=Math.max(0,Math.round(place.population||0)),age=rules.age,mix=place.jurisdictionCityId||place.countyNode?rules.county_mix:rules.urban_mix;place.pops=[];if(!amount){this.popSync(place);return}
    const split=n=>{const ch=Math.round(n*age.children),am=Math.round(n*age.adult_male),af=Math.round(n*age.adult_female);return [ch,am,af,Math.max(0,n-ch-am-af)]};
    const trade=Math.round(amount*mix.trade),scholar=Math.round(amount*mix.scholar),refugees=Math.round(amount*refugeeShare),farmers=amount-trade-scholar-refugees;
    const shares=this.clanSharesAt(state,place.id),dependentTotal=Math.round(farmers*Math.min(rules.dependency.max_share,Object.values(shares).reduce((n,v)=>n+v,0)));let freeFarmers=farmers-dependentTotal;
    const add=(occ,cls,clan,n,size,registered)=>{if(n>0)this.popAdd(place,occ,cls,clan,split(n),n/size,registered,rules.health)};
    add(FARM,FREE,"",freeFarmers,rules.household_size[FREE],rules.registered[FREE]);add(TRADE,FREE,"",trade,rules.household_size[FREE],rules.registered[FREE]);add(SCHOLAR,FREE,"",scholar,rules.household_size[FREE],rules.scholar_registered);
    const shareSum=Object.values(shares).reduce((n,v)=>n+v,0);for(const [clanId,share] of Object.entries(shares))add(FARM,DEP,clanId,Math.round(dependentTotal*share/Math.max(1e-9,shareSum)),rules.household_size[DEP],rules.registered[DEP]);
    add(FARM,DRIFT,"",refugees,rules.household_size[DRIFT],rules.registered[DRIFT]);
    // 取整误差补回编户农民，保证开局真实人口与原数一致
    const diff=amount-place.pops.reduce((n,p)=>n+total(p),0);if(diff&&place.pops[0])place.pops[0][AM]=Math.max(0,place.pops[0][AM]+diff);this.popSync(place)},

  // —— 派生量 ——
  rawTaxBase(place){if(!place.pops)return place.population||0;const rules=this.popRules();return place.pops.reduce((n,p)=>n+(p[AM]+p[AF]*rules.female_labor)*p[HP]*p[RR]*(rules.tax_weights[p[OCC]]??1),0)},
  // 登记税基：折算成与改造前「编户人口」同一量纲，供财政公式使用。
  taxBase(state,place){if(!place.pops)return place.population||0;return this.rawTaxBase(place)*(state?.popScale||1)},
  registeredPopulation(place){return place.pops?(place.registeredPopulation??Math.round(place.pops.reduce((n,p)=>n+total(p)*p[RR],0))):(place.population||0)},
  levyModeOf(forceId){return this.data.forces.find(force=>force.id===forceId)?.levyMode||"normal"},
  // 每处可征丁：健康成年男减去户内保留劳力，乘登记率与配合度；流民不受户约束，取其半数。
  recruitableAt(state,place,mode=null){if(!place.pops)return Math.max(0,(place.population||0)-(place.jurisdictionCityId?500:1000));const rules=this.popRules(),node=this.popNode(place),floor=rules.levy_floor[mode||this.levyModeOf(node.force)]??rules.levy_floor.normal,comply=state?this.clanCompliance(state,place,node.force):1;
    return Math.floor(place.pops.reduce((n,p)=>n+this.popRecruitable(p,floor,comply,rules),0))},
  popRecruitable(p,floor,comply,rules){if(p[CLS]===DRIFT)return p[AM]*rules.refugee.levy;return Math.max(0,p[AM]*p[HP]-p[HH]*floor)*p[RR]*comply},
  // 征发：先流民、次编户、再依附户，按各 POP 可征数扣成年男；返回实征人数。
  levyFromPlace(state,place,amount,origins=null){const rules=this.popRules(),node=this.popNode(place),floor=rules.levy_floor[this.levyModeOf(node.force)]??rules.levy_floor.normal,comply=state?this.clanCompliance(state,place,node.force):1;let remaining=Math.max(0,Math.round(amount)),taken=0;
    for(const cls of [DRIFT,FREE,DEP])for(const p of place.pops.filter(pop=>pop[CLS]===cls)){if(!remaining)break;const take=Math.min(remaining,Math.floor(this.popRecruitable(p,floor,comply,rules)),p[AM]);if(take<=0)continue;p[AM]-=take;remaining-=take;taken+=take}
    if(taken){origins?.push(place.jurisdictionCityId?{countyId:place.id,people:taken}:{cityId:place.id,people:taken});this.popSync(place);if(state?.popStats)state.popStats.levied+=taken}return taken},
  // 徭役遣散、伤兵还乡：回到本处编户农民的成年男。
  returnPeople(state,place,people){people=Math.max(0,Math.round(people));if(!people)return;if(!place.pops){place.population=(place.population||0)+people;return}const rules=this.popRules();this.popAdd(place,FARM,FREE,"",[0,people,0,0],0,rules.registered[FREE],rules.health);this.popSync(place);if(state?.popStats)state.popStats.returned+=people},
  // 战乱冲击：一部分死亡，一部分逃散为流民（之后自行迁往邻近安定处）。
  popShock(state,place,{death=0,flee=0}={}){if(!place.pops){place.population=Math.max(500,Math.round((place.population||0)*(1-death-flee)));return}const rules=this.popRules();let dead=0;
    for(const p of place.pops.slice()){for(let i=0;i<4;i++){const gone=Math.floor(p[CH+i]*death);p[CH+i]-=gone;dead+=gone}if(flee>0&&p[CLS]!==DRIFT)this.popMove(place,p,flee,FARM,DRIFT,"",{householdFactor:.5,registered:rules.registered[DRIFT]})}
    if(state?.popStats)state.popStats.lost+=dead;this.popCompact(place);this.popSync(place);return dead},
  // 事件「人口 +N」：从邻近据点迁来（先流民后编户），迁不来的就没有，不凭空生人。
  popImmigrate(state,place,amount){if(!place.pops){place.population=(place.population||0)+Math.max(0,amount);return amount}let remaining=Math.max(0,Math.round(amount));const rules=this.popRules();
    for(const source of this.popNeighbors(place).map(id=>this.popPlace(id)).filter(Boolean)){if(!remaining)break;for(const p of (source.pops||[]).filter(pop=>pop[CLS]===DRIFT).concat((source.pops||[]).filter(pop=>pop[CLS]===FREE&&pop[OCC]===FARM))){if(!remaining)break;const size=total(p);if(size<=0)continue;const fraction=Math.min(.5,remaining/size),moved=this.popMove(place,p,fraction,FARM,DRIFT,"",{registered:rules.registered[DRIFT]}).moved;remaining-=moved}this.popCompact(source);this.popSync(source)}
    this.popCompact(place);this.popSync(place);return Math.max(0,Math.round(amount))-remaining},
  popNeighbors(place){const node=this.popNode(place),graph=this.data.rules.city_graph||{},ids=[];for(const id of graph[node.id]||[]){const county=(this.data.counties||[]).find(c=>c.cityId===id);ids.push(county?.id||id)}if(place!==node)ids.unshift(node.id);return ids.filter(id=>id!==place.id).slice(0,this.popRules().refugee.neighbors)},

  // —— 每月结算 ——
  resolvePopulation(state,events){if(!GameClock.isMonthEnd(state))return;if(!state.clans)this.ensurePopulation(state);const rules=this.popRules(),month=state.date.month,quarter=month%3===0,newYear=month===12;this.resolveClans?.(state,events);
    const places=this.popPlaces(),rounding=(seed,value)=>{const whole=Math.floor(value),frac=value-whole;return whole+(((seed*2654435761)>>>0)%1000/1000<frac?1:0)};let seed=state.turn*31;
    for(const place of places){if(!place.pops?.length)continue;const {food,war,node}=this.popConditions(state,place),registrationTarget=this.registrationTargets(state,place,node);
      for(const p of place.pops){seed++;const mort=rules.mortality,extra=rules.famine_mortality*(1-food)+rules.war_mortality*war;
        const births=rounding(seed,p[AF]*rules.fertility/12*food*p[HP]);p[CH]+=births;state.popStats.births+=births;
        for(const [i,base] of [[CH,mort.children],[AM,mort.adult],[AF,mort.adult],[EL,mort.elderly]]){const deaths=Math.min(p[i],rounding(seed+i,p[i]*(base+extra)/12));p[i]-=deaths;state.popStats.deaths+=deaths}
        p[HP]=r2(p[HP]+((.15+.75*food-war*.1)-p[HP])*.15);
        const target=p[CLS]===DRIFT?rules.registered[DRIFT]:p[CLS]===DEP?registrationTarget.dependent(p[CLAN]):p[OCC]===SCHOLAR?Math.max(registrationTarget.free,rules.scholar_registered):registrationTarget.free;p[RR]=r2(p[RR]+(target-p[RR])*rules.registration.drift*3)}
      if(newYear)for(const p of place.pops){const grown=Math.floor(p[CH]/15),toMale=Math.floor(grown/2);p[CH]-=grown;p[AM]+=toMale;p[AF]+=grown-toMale;const oldM=Math.floor(p[AM]/35),oldF=Math.floor(p[AF]/35);p[AM]-=oldM;p[AF]-=oldF;p[EL]+=oldM+oldF}
      if(quarter)for(const p of place.pops){const couples=Math.min(p[AM],p[AF])*rules.household_ratio,formed=Math.max(0,couples-p[HH])*rules.marriage_rate*food,dissolved=p[HH]*(rules.dissolve_base+rules.dissolve_war*war+rules.dissolve_famine*(1-food)),excess=Math.max(0,p[HH]-(couples*1.3+p[EL]*.3))*.25;p[HH]=Math.max(0,Math.round(p[HH]+formed-dissolved-excess))}
      // 逃散：战乱、饥荒使编户与依附户流为流民
      const fleeRate=rules.flight.war*war+rules.flight.famine*(1-food);if(fleeRate>0)for(const p of place.pops.filter(pop=>pop[CLS]!==DRIFT&&pop[OCC]===FARM))this.popMove(place,p,fleeRate,FARM,DRIFT,"",{householdFactor:.5,registered:rules.registered[DRIFT]});
      // 依附：有世家处，编户农民按季依附份额最大的世家
      if(quarter){const shares=this.clanSharesAt(state,place.id),top=Object.entries(shares).sort((a,b)=>b[1]-a[1])[0];if(top){const shareSum=Object.values(shares).reduce((n,v)=>n+v,0),free=place.pops.find(p=>p[OCC]===FARM&&p[CLS]===FREE),dependents=place.pops.filter(p=>p[CLS]===DEP).reduce((n,p)=>n+total(p),0),farmers=dependents+(free?total(free):0),room=farmers*Math.min(rules.dependency.max_share,shareSum*1.5)-dependents;
        const burden=Math.max(0,((FiscalSystem.account?.(state,node.force)?.landRate)??10)-10)/10,rate=(rules.dependency.base+rules.dependency.famine*(1-food)+rules.dependency.tax*burden+rules.dependency.war*war)*Math.min(1,shareSum*2);
        if(free&&room>0&&rate>0)this.popMove(place,free,Math.min(rate,room/Math.max(1,total(free))),FARM,DEP,top[0],{registered:registrationTarget.dependent(top[0])})}}
      // 流民：不安定处迁往邻近较好处；安定处逐月定居
      for(const p of place.pops.filter(pop=>pop[CLS]===DRIFT)){if(total(p)<=0)continue;const settled=!war&&food>=.9;
        if(settled){const shares=this.clanSharesAt(state,place.id),top=Object.entries(shares).sort((a,b)=>b[1]-a[1])[0],toClan=top&&top[1]>=.15?.5:0,amount=rules.refugee.settle;
          if(toClan)this.popMove(place,p,amount*toClan,FARM,DEP,top[0],{householdFactor:1.6,registered:registrationTarget.dependent(top[0])});this.popMove(place,p,amount*(1-toClan)/(1-amount*toClan),FARM,FREE,"",{householdFactor:1.6,registered:.6});continue}
        const dest=this.popMigrationTarget(state,place);if(!dest)continue;const packet=this.popSplit(p,rules.refugee.migrate);let lost=0;packet.buckets=packet.buckets.map(v=>{const gone=Math.floor(v*rules.refugee.loss);lost+=gone;return v-gone});state.popStats.lost+=lost;this.popAdd(dest,FARM,DRIFT,"",packet.buckets,packet.households,rules.registered[DRIFT],packet.health);this.popCompact(dest);this.popSync(dest)}
      this.popCompact(place);this.popSync(place)}
    this.runClanAI?.(state,events);this.resolveFamiliesMonthly?.(state,events)},
  popMigrationTarget(state,place){let best=null;for(const id of this.popNeighbors(place)){const dest=this.popPlace(id);if(!dest?.pops)continue;const {food,war,node}=this.popConditions(state,dest),crowd=dest.pops.filter(p=>p[CLS]===DRIFT).reduce((n,p)=>n+total(p),0)/Math.max(1,dest.population||1),score=food*2+(node.order||50)/100-war*2-crowd*3;if(score>1.6&&(!best||score>best.score))best={dest,score}}return best?.dest||null},
  // 登记率目标：编户看户曹（或世家县令）能力，依附户看世家与据点主的关系。
  registrationTargets(state,place,node){const rules=this.popRules().registration,magistrate=this.countyMagistrate?.(state,place),score=magistrate?magistrate.ability:(this.affairScore?.(node,"registry")?.score??45),free=Math.min(rules.free_max,rules.free_base+score*rules.free_per_score);
    return {free,dependent:clanId=>Math.max(.2,Math.min(.8,rules.dependent_base*this.clanRelation(state,clanId,node.force)/60))}},

  // 对外共用县报：历史分配记录只作为底层账目，界面按县合计，不消费随机数或写 POP。
  countyPopulationPlaces(city){return [...new Map([city,...this.countiesForCity(city.id)].map(place=>[place.id,place])).values()]},
  countyPopulationReport(state,city){const places=this.countyPopulationPlaces(city),reports=places.map(p=>this.popReport(state,p)),sum=key=>reports.reduce((n,r)=>n+(r[key]||0),0);return {places,registered:sum("registered"),registeredHouseholds:sum("registeredHouseholds"),estimate:sum("estimate"),refugees:sum("refugees"),recruitable:sum("recruitable"),error:reports.length?Math.max(...reports.map(r=>r.error)):0}},

  // —— 县报：本方看登记数为准，真实人口只有估计 ——
  popReport(state,place){const rules=this.popRules().estimate,node=this.popNode(place),inspected=state.clans?.inspections?.[node.id],years=inspected==null?3:Math.max(0,(state.turn-inspected)/360),error=Math.min(rules.max,rules.base+years*rules.per_year);
    const seed=[...place.id].reduce((n,c)=>n+c.charCodeAt(0),0)+Math.floor(state.turn/90),bias=((seed*9301+49297)%233280)/233280*2-1,truth=place.population||0;
    const drift=(place.pops||[]).filter(p=>p[CLS]===DRIFT).reduce((n,p)=>n+total(p),0);
    return {registered:this.registeredPopulation(place),registeredHouseholds:place.registeredHouseholds??place.households??0,estimate:Math.max(this.registeredPopulation(place),Math.round(truth*(1+bias*error)/100)*100),error,refugees:Math.round(drift*(1+bias*error)/100)*100,recruitable:this.recruitableAt(state,place)}},
  popComposition(place){const rows=new Map();for(const p of place.pops||[]){const label=p[CLS]===DRIFT?"流民":p[CLS]===DEP?`${this.clanName?.(p[CLAN])||"世家"}依附户`:["农户","工商","士吏"][p[OCC]];const row=rows.get(label)||{label,clanId:p[CLS]===DEP?p[CLAN]:null,people:0,registered:0,households:0,adultMales:0};row.people+=total(p);row.registered+=total(p)*p[RR];row.households+=p[HH]*p[RR];row.adultMales+=p[AM];rows.set(label,row)}// 先合计后取整，并按小数余数分配尾差；分类合计与县报一致，不改实际 POP。
    const result=[...rows.values()];for(const key of ["registered","households"]){const target=Math.round(result.reduce((n,r)=>n+r[key],0)),ranked=result.map((row,index)=>({row,index,remainder:row[key]-Math.floor(row[key])})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);for(const row of result)row[key]=Math.floor(row[key]);const extra=target-result.reduce((n,r)=>n+r[key],0);for(let i=0;i<extra;i++)ranked[i].row[key]++}return result}
});
window.RuleEngine.POP={OCC,CLS,CLAN,CH,AM,AF,EL,HH,RR,HP,FARM,TRADE,SCHOLAR,FREE,DEP,DRIFT,total};
})();
