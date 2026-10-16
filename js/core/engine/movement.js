// RuleEngine 分模块：行军路线：路段日程、野径、通行量、接战宽度与寻路。由 rule-engine.js 在 Node 中加载，浏览器按 index.html 顺序加载。
Object.assign(window.RuleEngine.prototype,{
  // 路段耗时：按路网的里程、绕行系数与日行里数换算天数；水路分顺逆流，渡口与登船另计。缺路网时沿用旧规则每段十日。
  legInfo(from,to){
    this.legCache??=new Map();const key=`${from}>${to}`;if(this.legCache.has(key))return this.legCache.get(key);
    const network=this.data.routeNetwork,cities=this.data.cities,a=cities.find(city=>city.id===from),b=cities.find(city=>city.id===to),legacy=this.edgeType(from,to);if(network&&this.routePairSource!==network){this.routePairSource=network;this.routePairs=new Map();for(const route of network.routes){const pair=[route.a,route.b].sort().join(":");if(!this.routePairs.has(pair))this.routePairs.set(pair,[]);this.routePairs.get(pair).push(route)}}
    let best=null;
    if(network&&a&&b){const cells=Math.hypot(a.x-b.x,a.y-b.y),liPerCell=network.li_per_cell||48;
      for(const route of this.routePairs.get([from,to].sort().join(":"))||[]){const kind=network.kinds[route.kind];if(!kind)continue;
        const downstream=route.kind==="river"?route.a===from:null,speed=route.kind==="river"?(downstream?kind.speed_li_down:kind.speed_li_up):kind.speed_li,li=Math.round(cells*liPerCell*(kind.winding||1)),days=Math.max(1,Math.round(li/Math.max(1,speed)+(kind.crossing_days||0)+(kind.embark_days||0)));
        const leg={from,to,kind:route.kind,kindName:kind.name,name:route.name||"",mode:kind.mode,li,days,downstream,crossing:route.kind==="ford",capacity:kind.capacity??1,frontage:kind.frontage??1};
        if(!best||leg.days<best.days)best=leg}}
    if(!best&&a&&b&&!(this.data.rules.city_graph?.[from]||[]).includes(to)){const off=this.offroadGraph().get(from)?.get(to);if(off){const cfg=this.offroadRules(),liPerCell=network?.li_per_cell||48,li=Math.round(off.cost*liPerCell*(cfg.winding??1.1));best={from,to,kind:"offroad",kindName:"野径",name:"",mode:"land",li,days:Math.max(1,Math.round(li/Math.max(1,cfg.speed_li??20)+off.crossings*(cfg.crossing_days??1))),downstream:null,crossing:off.crossings>0,crossings:off.crossings,capacity:cfg.capacity??.5,frontage:cfg.frontage??2,points:off.points}}}
    best??={from,to,kind:legacy==="river"?"ford":"road",kindName:legacy==="river"?"渡口":"道路",name:"",mode:"land",li:0,days:10,downstream:null,crossing:legacy==="river",capacity:1,frontage:1,legacy:true};
    this.legCache.set(key,best);return best;
  },
  // 野外行军：没有官路的相邻据点之间，军队仍可循地形穿行，按地形与渡河计日，较官路慢、通行量小。只连近处据点，且两点之间若夹着更近的据点则经由该据点。
  offroadRules(){return this.data.rules.movement?.offroad||{}},
  offroadGraph(){const map=this.data.map,cities=this.data.cities;if(this.offroadSource===cities&&this.offroadMap===map&&this.offroadEdges)return this.offroadEdges;this.offroadSource=cities;this.offroadMap=map;const cfg=this.offroadRules(),graph=this.data.rules.city_graph||{},edges=new Map(cities.map(city=>[city.id,new Map()]));this.offroadEdges=edges;this.legCache?.clear();if(!window.MapGrid||!map?.terrain||cfg.enabled===false)return edges;
    const radius=cfg.max_cells??7,limit=cfg.neighbors??4,costs=cfg.terrain_cost||{},between=(a,b,c)=>{const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((c.x-a.x)*dx+(c.y-a.y)*dy)/len));return Math.hypot(a.x+dx*t-c.x,a.y+dy*t-c.y)};
    for(const a of cities){const road=new Set(graph[a.id]||[]),candidates=cities.filter(b=>b!==a&&!road.has(b.id)&&Math.hypot(a.x-b.x,a.y-b.y)<=radius).map(b=>({b,d:Math.hypot(a.x-b.x,a.y-b.y)})).sort((x,y)=>x.d-y.d);let kept=0;
      for(const {b,d} of candidates){if(kept>=limit)break;if(edges.get(a.id).has(b.id)){kept++;continue}if(cities.some(c=>c!==a&&c!==b&&Math.hypot(a.x-c.x,a.y-c.y)<d&&Math.hypot(b.x-c.x,b.y-c.y)<d&&between(a,b,c)<=1.2))continue;const path=MapGrid.landPath(map,a,b,{costs,crossing:cfg.crossing_cost??3});if(!path||path.steps>d*2.2+3)continue;const reverse={...path,points:[...path.points].reverse()};edges.get(a.id).set(b.id,path);edges.get(b.id).set(a.id,reverse);kept++}}
    return edges},
  // 道路通行量：大军成列行进，每单位通行量约容一万五千人同日通过，超出则队列拉长、后队迟至（每段另加延误，至多为本段日程一半）；栈道、山道通行量小，大军延误尤甚。
  logisticsRules(){return this.data.rules.balance?.logistics||{}},
  legDaysFor(leg,soldiers=0){const cfg=this.logisticsRules(),column=(soldiers||0)/Math.max(.1,(leg.capacity??1)*(cfg.column_men_per_capacity??15000));return column<=1?leg.days:Math.ceil(leg.days+Math.min(leg.days*(cfg.column_max_ratio??.5),(column-1)*(cfg.column_days_per_unit??.6)))},
  // 路线中断、改道或战败撤回时清除本段进度，避免下次出发凭旧进度跳段。
  clearLeg(army){army.legElapsed=0;delete army.legFrom;delete army.legTo;delete army.legDays},
  remainingMarchDays(army){if(!army?.route?.length)return 0;return Math.max(0,this.routeDays([army.city,...army.route],army.soldiers)-(army.legElapsed||0))},
  routeDays(route,soldiers=0){let days=0;for(let index=1;index<(route?.length||0);index++)days+=this.legDaysFor(this.legInfo(route[index-1],route[index]),soldiers);return days},
  armyLegDays(state,army){const leg=this.legInfo(army.city,army.route[0]);return Math.ceil(this.legDaysFor(leg,army.soldiers+this.prisonerCount(army.prisoners))*this.marchDrag(state,army))},
  armyDailyMarch(state,army){const movement=this.data.rules.movement||{},retreat=army.retreat,rules=this.battleRules();return GameClock.factor(state)*10*(retreat?(retreat.routed?rules.rout_march_factor:rules.withdraw_march_factor):army.movementMode==="forced_march"?(movement.forced_march_multiplier||1.6):1)},
  // 仅按有溃军的路段检查：同向追上或迎面截击，双方都按实际路段进度接战。
  resolveRoadPursuits(state,events){const roads=new Map();
    for(const army of this.data.armies){if(!army.route?.length||(army.retreat&&army.retreat.startedTurn===state.turn))continue;const from=army.city,to=army.route[0],key=[from,to].sort().join(":");if(!roads.has(key))roads.set(key,[]);const days=this.armyLegDays(state,army),fraction=Math.min(1,(army.legElapsed||0)/days),speed=this.armyDailyMarch(state,army)/days;roads.get(key).push({army,from,to,days,fraction,speed})}
    const engaged=new Set();
    for(const group of roads.values()){if(!group.some(p=>p.army.retreat))continue;
      for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=group[i],b=group[j];if(engaged.has(a.army)||engaged.has(b.army)||!this.data.armies.includes(a.army)||!this.data.armies.includes(b.army)||!(a.army.retreat||b.army.retreat)||!this.worldWar(state,a.army.force,b.army.force))continue;
        const same=a.from===b.from,pa=a.fraction,pb=same?b.fraction:1-b.fraction,va=a.speed,vb=same?b.speed:-b.speed,relative=va-vb;
        if(Math.abs(relative)<1e-8)continue;const time=(pb-pa)/relative,contact=pa+va*time;
        if(time<0||time>1||contact<0||contact>=1||(!same&&pb<pa))continue;
        // 同向只有后方成军追上溃军时触发，溃军超越前军不发起攻击。
        if(same&&((pa<pb&&a.army.retreat&&!b.army.retreat)||(pb<pa&&b.army.retreat&&!a.army.retreat)))continue;
        const positions=new Map();for(const p of [a,b]){const fraction=p.fraction+p.speed*time;p.army.legFrom=p.from;p.army.legTo=p.to;p.army.legDays=p.days;p.army.legElapsed=fraction*p.days;positions.set(p.army,{from:p.from,to:p.to,fraction})}
        const attacker=a.army.retreat&&!b.army.retreat?b:a,defender=attacker===a?b:a,site=this.data.cities.find(c=>c.id===attacker.from),from=this.data.cities.find(c=>c.id===attacker.to),retreatTo=new Map();
        for(const p of [a,b]){const own=this.data.cities.find(c=>c.id===(p.army.retreat?p.to:p.from));if(own)retreatTo.set(p.army,own)}
        events.push({phase:"行军",siteId:site.id,armyId:attacker.army.id,text:`${attacker.army.name}在${site.name}附近${same?"追上":"截住"}${defender.army.name}，展开野战`});
        this.resolveFieldBattle(attacker.army,[defender.army],from,site,"road",state,events,{attackers:[attacker.army],retreatTo,roadPositions:positions});
        for(const p of [a,b]){p.army.defeatedThisTurn=true;engaged.add(p.army)}
      }
    }
  },
  // 战场宽度：一个单位宽度约容八千人同时接战，其余为后队轮换，只按一定比例出力。关隘、栈道两军皆受限，以寡敌众之地在此。
  frontageRules(){return this.data.rules.balance?.frontage||{}},
  frontageFactor(total,frontage){const cfg=this.frontageRules(),capacity=Math.max(.5,frontage)*(cfg.men_per_frontage??8000);if(!total||total<=capacity)return 1;return (capacity+(total-capacity)*(cfg.reserve_share??.25))/total},
  siteFrontage(site,leg){const cfg=this.frontageRules(),kind=window.MapGrid?.nodeKind?.(site)||site?.type;return Math.min(leg?.frontage??(cfg.open_field??4),kind==="pass"?(cfg.pass??1):Infinity)},
  wallFrontage(city){const cfg=this.frontageRules().walls||{},kind=window.MapGrid?.nodeKind?.(city)||city?.type,rank=window.MapGrid?.nodeRank?.(city,this.data.administrativeDivisions);return kind==="pass"?cfg.pass??1:rank==="province"?cfg.province??4:rank==="commandery"?cfg.commandery??3:cfg.county??2},
  searchRoute(from,to,allow,{roadsOnly=false}={}){
    if(from===to)return [from];
    if(this.cityIndexSource!==this.data.cities){this.cityIndexSource=this.data.cities;this.cityIndex=new Map(this.data.cities.map(city=>[city.id,city]))}const graph=this.data.rules.city_graph||{},index=this.cityIndex,weighted=!!this.data.routeNetwork,distance=new Map([[from,0]]),previous=new Map(),done=new Set(),heap=[[0,from]],push=item=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p}},pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=i*2+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m}}return top};
    // 有路网时按行军天数求最短；无路网时以段数为主、地面距离为次，保持旧行为。
    const weight=(a,b)=>weighted?this.legInfo(a,b).days+this.groundDistance(index.get(a),index.get(b))*1e-6:1000+this.groundDistance(index.get(a),index.get(b));
    while(heap.length){const [cost,id]=pop();if(done.has(id))continue;done.add(id);if(id===to)break;
      const offroad=weighted&&this.offroadRules().enabled!==false&&!roadsOnly?this.offroadGraph().get(id):null,neighbors=offroad?.size?[...(graph[id]||[]),...offroad.keys()]:graph[id]||[];
      for(const next of neighbors){if(done.has(next))continue;if(next!==to&&!allow(index.get(next),next))continue;const value=cost+weight(id,next);if(value<(distance.get(next)??Infinity)){distance.set(next,value);previous.set(next,id);push([value,next])}}}
    if(!distance.has(to))return null;
    const route=[to];
    while(route[0]!==from){const parent=previous.get(route[0]);if(parent===undefined)return null;route.unshift(parent)}
    return route;
  },
  // 玩家行军方案：最快（官路与野径并用）、只走官路，或依次经过自定义停留节点；任何一段不通即整条不通。
  plannedRoute(from,to,forceId=null,{waypoints=[],roadsOnly=false}={}){const stops=[from,...waypoints.filter(id=>id&&id!==from&&id!==to),to],route=[from];for(let i=1;i<stops.length;i++){const part=this.path(stops[i-1],stops[i],forceId,{roadsOnly});if(!part)return null;route.push(...part.slice(1))}return route},
  path(from,to,forceId=null,options={}){return this.searchRoute(from,to,city=>!forceId||!city||[forceId,"neutral"].includes(city.force),options)},
  logisticsPath(from,to,forceId){
    const usable=id=>{const city=this.data.cities.find(item=>item.id===id);return city?.force===forceId&&!this.isCityBesieged(id)&&!this.data.armies.some(army=>army.city===id&&army.force!==forceId&&!army.siegeTarget)};
    // 转运与补给线只走官路与水路；野径仅供行军。
    if(!usable(from)||!usable(to))return null;return this.searchRoute(from,to,(city,id)=>usable(id),{roadsOnly:true});
  }
});
