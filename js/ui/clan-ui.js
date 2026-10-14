// 「世家」窗口：名录、单族详情（关系与倾向、交互、族谱、地产分布图）。只出标记，接线在 js/ui/app/clan-window.js。
// 人名、族名、城池都是可点击的链接：data-officer-open、data-clan-open、data-city-open 由接线模块全局代理。企划见 docs/POP_CLAN_PLAN.md。
window.ClanUI=class ClanUI{
  static view={tab:"list",clanId:null,filter:"territory",sort:"relation"};
  static esc(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char])}
  static num(value){return Math.round(value||0).toLocaleString()}
  static force(state,id){return state.data.forces.find(force=>force.id===id)||null}
  static forceTag(state,id,suffix=""){const force=ClanUI.force(state,id);return `<i class="court-force-tag" style="--force:${force?.color||"#59614d"}">${ClanUI.esc(force?.name||"无主")}${suffix?` ${ClanUI.esc(suffix)}`:""}</i>`}
  static clanLink(state,clanId){return `<button type="button" class="clan-link" data-clan-open="${ClanUI.esc(clanId)}">${ClanUI.esc(state.engine.clanFullName(clanId))}</button>`}
  // 人物链接：本方金色、他方按势力色、在野灰、已故或未登场淡出
  static personLink(state,name,officer=null){const e=ClanUI.esc,o=officer||state.data.officers.find(item=>item.name===name);if(!o)return `<span class="clan-person is-absent" title="名册无其人">${e(name)}</span>`;
    const force=ClanUI.force(state,o.force),gone=["dead","unborn"].includes(o.status),mine=o.force===state.playerForceId&&["serving","injured"].includes(o.status),tip=gone?(o.status==="dead"?"已故":"未登场"):["serving","injured"].includes(o.status)?`${force?.name||""}`:"在野";
    return `<button type="button" class="clan-person${mine?" is-mine":""}${gone?" is-gone":""}" style="--force:${force?.color||"#59614d"}" data-officer-open="${e(o.id)}" title="${e(tip)}">${e(o.name)}</button>`}
  static meter(value){const v=Math.max(0,Math.min(100,Math.round(value||0)));return `<span class="clan-meter ${v>=60?"good":v<40?"bad":""}"><i style="--w:${v}%"></i><b>${v}</b></span>`}

  static render(state){const view=ClanUI.view,e=ClanUI.esc;if(!state.clans)return `<p class="empty">本剧本没有世家数据。</p>`;if(view.tab==="detail"&&!state.engine.clanDef(view.clanId))view.tab="list";
    const tabs=[["list","名录"],["detail",view.clanId?state.engine.clanFullName(view.clanId):"世家详情"]].map(([id,label])=>`<button type="button" data-clan-tab="${id}" class="${view.tab===id?"active":""}" ${id==="detail"&&!view.clanId?"disabled":""}>${e(label)}</button>`).join("");
    return `<nav class="ui-tabs court-tabs">${tabs}</nav>${view.tab==="detail"?ClanUI.detail(state,view.clanId):ClanUI.list(state)}`}

  // —— 名录 ——
  static rows(state){const engine=state.engine,me=state.playerForceId;return (state.data.clans||[]).filter(clan=>state.clans.byId[clan.id]).map(clan=>{const dist=engine.clanDistribution(state,clan.id),members=engine.clanMembers(clan.id);
      return {clan,dist,own:dist.filter(row=>row.forceId===me).length,dependents:dist.reduce((n,row)=>n+row.dependents,0),wealth:state.clans.byId[clan.id].wealth,relation:engine.clanRelation(state,clan.id,me),serving:members.filter(o=>o.force===me&&o.status==="serving").length,seat:dist.find(row=>row.seat)}})}
  static list(state){const e=ClanUI.esc,n=ClanUI.num,view=ClanUI.view,filters=[["territory","本方境内有地产"],["serving","族人仕于本方"],["all","全部世家"]],sorts=[["relation","按关系"],["wealth","按家财"],["dependents","按依附户"],["serving","按族人"]];
    let rows=ClanUI.rows(state);if(view.filter==="territory")rows=rows.filter(row=>row.own);if(view.filter==="serving")rows=rows.filter(row=>row.serving);rows.sort((a,b)=>(b[view.sort]??0)-(a[view.sort]??0));
    const select=(field,options,value)=>`<select data-clan-field="${field}">${options.map(([id,label])=>`<option value="${id}" ${id===value?"selected":""}>${label}</option>`).join("")}</select>`;
    return `<div class="clan-toolbar">${select("filter",filters,view.filter)}${select("sort",sorts,view.sort)}<span>${rows.length} 家</span></div>
      <table class="court-table clan-table"><thead><tr><th>世家</th><th>祖居</th><th>地产</th><th>依附户</th><th>家财</th><th>与本方</th><th>仕于本方</th></tr></thead><tbody>${rows.map(row=>`<tr>
        <td>${ClanUI.clanLink(state,row.clan.id)}</td><td>${e(row.seat?.name||row.clan.seat||"—")} ${row.seat?ClanUI.forceTag(state,row.seat.forceId):""}</td><td>${row.dist.length} 处${row.own?` · 本方 ${row.own}`:""}</td><td>${n(row.dependents)}</td><td>${n(row.wealth)}</td><td>${ClanUI.meter(row.relation)}</td><td>${row.serving||"—"}</td></tr>`).join("")||`<tr><td colspan="7" class="empty">没有符合条件的世家</td></tr>`}</tbody></table>
      <p class="court-note">世家按「郡望 + 祖居县 + 姓氏」称呼。祖居县取全额地产，本郡近县与史载支脉另有份额。关系经由隐户多少、征收征兵配合度与世家县令影响地方；被围之城若大族与城主交恶、与围城者交好，可能为其内应。</p>`}

  // —— 单族详情 ——
  static detail(state,clanId){const e=ClanUI.esc,n=ClanUI.num,engine=state.engine,clan=engine.clanDef(clanId),record=state.clans.byId[clanId];if(!clan||!record)return `<p class="empty">无此世家。</p>`;
    const dist=engine.clanDistribution(state,clanId),seat=dist.find(row=>row.seat),stances=engine.clanStances(state,clanId),lean=stances[0],me=state.playerForceId,status=engine.clanActionStatus(state,clanId,me),seatNote=clan.seat_place&&seat&&seat.name.replace(/县$/,"")!==String(clan.seat).replace(/县$/,"")?`（${e(clan.seat)}不在图上，寄于${e(seat.name)}）`:"";
    const actions=[["court","结好"],["marry","联姻"],["summon","征辟子弟"],["contribute","劝输助饷"],["relocate","徙豪强"],["suppress","抑制豪强"]].map(([id,label])=>{const s=status[id]||{};return `<button type="button" class="clan-act${id==="suppress"||id==="relocate"?" danger":""}" data-clan-act="${id}" data-clan="${e(clanId)}" ${s.ok?"":"disabled"} title="${e(s.tip||"")}"><b>${label}</b><small>${e(s.ok?s.tip:s.reason)}</small></button>`}).join("");
    return `<section class="clan-hero"><div class="clan-seal">${e(engine.clanSurname(clanId))}</div><div><h2>${e(engine.clanFullName(clanId))}</h2>
        <p>郡望 ${e(engine.clanWang(clanId))} · 祖居 ${e(clan.seat||"—")}${seatNote}${seat?` · 今属 ${ClanUI.forceTag(state,seat.forceId)}`:""}</p><p class="clan-basis">${e(clan.basis||"")}</p></div>
        <div class="clan-stats"><div><span>家财</span><b>${n(record.wealth)}</b></div><div><span>才俊</span><b>${clan.talent}</b></div><div><span>地产</span><b>${dist.length} 处</b></div><div><span>依附户</span><b>${n(dist.reduce((s,row)=>s+row.dependents,0))}</b></div><div><span>倾向</span><b>${lean?ClanUI.forceTag(state,lean.forceId):"—"}</b></div></div></section>
      <section class="court-block"><h3>与诸势力</h3><div class="clan-stances">${stances.map(row=>`<div class="${row.forceId===me?"is-own":""}">${ClanUI.forceTag(state,row.forceId)}${ClanUI.meter(row.relation)}<small>族人仕官 ${row.members}</small></div>`).join("")||'<p class="empty">与诸势力无涉</p>'}</div></section>
      <section class="court-block"><h3>交互</h3><div class="clan-act-grid">${actions}</div></section>
      <section class="court-block"><h3>族谱</h3>${ClanUI.tree(state,clanId)}</section>
      <section class="court-block"><h3>地产分布 <button type="button" class="clan-focus" data-clan-focus="${e(clanId)}">在舆图上标出</button></h3><div class="clan-dist"><canvas class="clan-map" data-clan-map="${e(clanId)}" width="260" height="260"></canvas>${ClanUI.distribution(state,dist)}</div></section>`}

  // 族谱：按辈分分行，同辈中子女紧随父辈的顺序；连线标称谓。无亲属记载的族人列在下方。
  static tree(state,clanId){const e=ClanUI.esc,graph=state.engine.clanKinGraph(clanId),linked=graph.nodes.filter(node=>node.linked),loose=graph.nodes.filter(node=>!node.linked);
    let html="";if(linked.length){const rows=new Map;for(const node of linked){if(!rows.has(node.generation))rows.set(node.generation,[]);rows.get(node.generation).push(node)}const gens=[...rows.keys()].sort((a,b)=>a-b),order=new Map,W=104,H=84,pad=26;
      for(const g of gens){const list=rows.get(g);list.sort((a,b)=>ClanUI.parentRank(graph,a.name,order)-ClanUI.parentRank(graph,b.name,order));list.forEach((node,i)=>order.set(node.name,i))}
      const width=Math.max(...gens.map(g=>rows.get(g).length))*W+pad*2,height=gens.length*H+pad,pos=new Map;gens.forEach((g,row)=>{const list=rows.get(g),offset=(width-list.length*W)/2;list.forEach((node,i)=>pos.set(node.name,{x:offset+i*W+W/2,y:pad+row*H+16}))});
      // 长幼连线自上而下，标签贴在下端；同辈连线在节点上方拱起，标签在拱顶
      const lines=graph.edges.filter(edge=>pos.has(edge.a)&&pos.has(edge.b)).map(edge=>{const a=pos.get(edge.a),b=pos.get(edge.b);if(edge.step){const [top,bottom]=a.y<=b.y?[a,b]:[b,a];return `<path class="down" d="M${top.x} ${top.y+12} C${top.x} ${top.y+40} ${bottom.x} ${bottom.y-40} ${bottom.x} ${bottom.y-12}"/><text x="${bottom.x}" y="${bottom.y-17}">${e(edge.label)}</text>`}
        const lift=18+Math.min(30,Math.abs(a.x-b.x)/8),mx=(a.x+b.x)/2;return `<path class="same" d="M${a.x} ${a.y-12} Q${mx} ${a.y-12-lift*2} ${b.x} ${b.y-12}"/><text x="${mx}" y="${a.y-12-lift+3}">${e(edge.label)}</text>`}).join("");
      const nodes=linked.map(node=>{const p=pos.get(node.name);return `<div class="clan-node" style="left:${p.x-42}px;top:${p.y-13}px">${ClanUI.personLink(state,node.name,node.officer)}</div>`}).join("");
      html=`<div class="clan-tree" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}">${lines}</svg>${nodes}</div>`}
    if(loose.length)html+=`<p class="clan-loose"><span>族人</span>${loose.map(node=>ClanUI.personLink(state,node.name,node.officer)).join("")}</p>`;return `<div class="clan-tree-wrap">${html||'<p class="empty">名册中无本族人物</p>'}</div>`}
  static parentRank(graph,name,order){const parents=graph.edges.filter(edge=>edge.b===name&&edge.step>0&&order.has(edge.a)).map(edge=>order.get(edge.a));if(parents.length)return Math.min(...parents)+.5;const peers=graph.edges.filter(edge=>edge.step===0&&(edge.a===name||edge.b===name)).map(edge=>order.get(edge.a===name?edge.b:edge.a)).filter(v=>v!=null);return peers.length?Math.min(...peers)+.6:99}

  // 分布表：按州、郡分组；每处列份额、实控势力、依附户、祖居 / 支脉 / 县令标记，可点开所属城池
  static distribution(state,dist){const e=ClanUI.esc,n=ClanUI.num,groups=new Map;for(const row of dist){const key=`${row.province||"化外"}|${row.commandery||""}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
    return `<div class="clan-places">${[...groups.entries()].map(([key,rows])=>{const [province,commandery]=key.split("|");return `<div class="clan-group"><h4>${e(province)} · ${e(commandery)}</h4>${rows.map(row=>`<div class="clan-place">
      <span class="clan-place-name"><button type="button" class="clan-city" data-city-open="${e(row.cityId)}" title="查看所属据点">${e(row.name)}${row.county?"县":"城"}</button>${row.seat?'<i class="clan-badge seat">祖居</i>':""}${row.branch?'<i class="clan-badge branch">支脉</i>':""}${row.magistrate?'<i class="clan-badge">出县令</i>':""}</span>
      <span class="clan-share"><i style="width:${Math.round(row.share*100/.7)}%"></i></span><small>${Math.round(row.share*100)}% · 依附 ${n(row.dependents)}</small>${ClanUI.forceTag(state,row.forceId)}</div>`).join("")}</div>`}).join("")||'<p class="empty">已无地产</p>'}</div>`}

  // 分布图：陆地底色、各处地产按实控势力着色，圆的大小表示份额，祖居加金框
  static landCache=new WeakMap();
  static drawMap(canvas,state,clanId){if(!canvas||!window.MapGrid)return;const map=state.data.map;let land=ClanUI.landCache.get(map);if(!land){const layers=MapGrid.layers(map,state.data.cities,state.data.counties||state.data.administrativeDivisions?.county_seats||[],state.data.administrativeDivisions);land={width:layers.width,height:layers.height,sea:layers.terrain.map(t=>t==="ocean")};ClanUI.landCache.set(map,land)}
    // 视野取地产范围外扩，至少 18 格见方，便于看清分布
    const dist=state.engine.clanDistribution(state,clanId),ctx=canvas.getContext("2d"),{width,height}=land,xs=dist.map(row=>row.x),ys=dist.map(row=>row.y),span=Math.max(18,(Math.max(...xs,0)-Math.min(...xs,width))+8,(Math.max(...ys,0)-Math.min(...ys,height))+8),cx0=dist.length?(Math.max(...xs)+Math.min(...xs))/2:width/2,cy0=dist.length?(Math.max(...ys)+Math.min(...ys))/2:height/2,
      x0=Math.max(0,Math.min(width-span,Math.round(cx0-span/2))),y0=Math.max(0,Math.min(height-span,Math.round(cy0-span/2))),cell=Math.min(canvas.width,canvas.height)/Math.min(span,Math.max(width,height)),ox=-x0*cell,oy=-y0*cell;ctx.fillStyle="#070b08";ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=y0;y<Math.min(height,y0+span+1);y++)for(let x=x0;x<Math.min(width,x0+span+1);x++){ctx.fillStyle=land.sea[y*width+x]?"#0c1719":"#252b22";ctx.fillRect(ox+x*cell,oy+y*cell,cell+.3,cell+.3)}
    // 实控城池作为参照：小点按势力着色
    for(const city of state.data.cities){if(city.countyNode||city.x<x0||city.y<y0||city.x>x0+span||city.y>y0+span)continue;ctx.fillStyle=ClanUI.force(state,city.force)?.color||"#59614d";ctx.globalAlpha=.55;ctx.fillRect(ox+(city.x+.35)*cell,oy+(city.y+.35)*cell,cell*.3,cell*.3);ctx.globalAlpha=1}
    for(const row of [...dist].reverse()){const force=ClanUI.force(state,row.forceId),cx=ox+(row.x+.5)*cell,cy=oy+(row.y+.5)*cell,r=Math.max(3,Math.sqrt(row.share)*cell*2.2);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=force?.color||"#8a8a76";ctx.globalAlpha=.85;ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=row.seat?2:1;ctx.strokeStyle=row.seat?"#e0bd55":"#0b0f0c";ctx.stroke()}
    ctx.font="10px serif";ctx.textAlign="center";const named=new Set;for(const row of dist){const key=`${row.x},${row.y}`;if(named.has(key))continue;named.add(key);const tx=ox+(row.x+.5)*cell,ty=oy+(row.y+.5)*cell-Math.max(6,Math.sqrt(row.share)*cell*2.2)-3;ctx.lineWidth=3;ctx.strokeStyle="#050705";ctx.strokeText(row.name,tx,ty);ctx.fillStyle=row.seat?"#f4d36b":"#d8d0a6";ctx.fillText(row.name,tx,ty)}}
};
