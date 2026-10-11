window.MapEditor = class MapEditor {
  static checkpointLimit=40;
  static seats(source={}){return Array.isArray(source.counties)?source.counties:source.administrativeDivisions?.county_seats||[]}
  static editableRoads(routes=[]){return routes.map(route=>{const {path,points,...metadata}=route;return {...structuredClone(metadata),points:structuredClone(MapGrid.decodeRoadPath(route))}})}
  static editableWaterways(rivers=[]){return rivers.map((river,index)=>({...structuredClone(river),id:river.id||`waterway:${index+1}`}))}
  constructor(source={}){this.load(source)}
  load(source={}){
    this._roadNetwork=null;
    this.source=source;this.map=structuredClone(source.map||{});this.divisions=structuredClone(source.administrativeDivisions||{});this._edit=null;
    const {width,height}=MapGrid.dimensions(this.map);
    this.width=width;this.height=height;this.terrainDefs=source.terrainDefs||{};
    this.forces=structuredClone(source.forces||[]);this.counties=structuredClone(MapEditor.seats(source));
    this.defaults={terrain:MapGrid.defaultTerrain(width,height,this.map),provinces:MapGrid.defaultProvinces(width,height,this.map),commanderies:MapGrid.defaultCommanderies(width,height,source.cities||[],MapEditor.seats(source),this.map)};
    this.terrain=structuredClone(this.defaults.terrain);
    this.provinces=structuredClone(this.defaults.provinces);
    this.commanderies=structuredClone(this.defaults.commanderies);
    this.waterways=MapEditor.editableWaterways(MapGrid.waterways(this.map));
    if(!Array.isArray(this.map.waterways))this.waterways=this.waterways.map(river=>({...river,points:river.points.filter(([x,y])=>this.inBounds(x,y))})).filter(river=>river.points.length>1);
    this.landmarks=MapGrid.landmarks(this.map);
    this.cities=structuredClone(source.cities||[]);this.graph=structuredClone(source.rules?.city_graph||{});this.customRoutes=MapEditor.editableRoads(source.map?.roads||[]);
    this.undoStack=[];this.redoStack=[];
    this.syncRegionMembership({checkpoint:false});
    this.markApplied();
    return this;
  }
  reset(){return this.load(this.source)}
  index(x,y){return y*this.width+x}
  inBounds(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<this.width&&y<this.height}
  static gridLine(x,y,tx,ty){const points=[[x,y]],nx=Math.abs(tx-x),ny=Math.abs(ty-y),sx=Math.sign(tx-x),sy=Math.sign(ty-y);let ix=0,iy=0;while(ix<nx||iy<ny){if(ix<nx&&(iy===ny||(1+2*ix)*ny<(1+2*iy)*nx)){x+=sx;ix++}else{y+=sy;iy++}points.push([x,y])}return points}
  layer(kind){return kind==="terrain"?this.terrain:kind==="province"?this.provinces:kind==="commandery"?this.commanderies:null}
  at(kind,x,y){const values=this.layer(kind);return values&&this.inBounds(x,y)?values[this.index(x,y)]:null}
  terrainAt(x,y){return this.at("terrain",x,y)}
  provinceAt(x,y){return this.at("province",x,y)}
  commanderyAt(x,y){return this.at("commandery",x,y)}
  set(kind,x,y,value){const values=this.layer(kind);if(!values||!this.inBounds(x,y))return false;const index=this.index(x,y);if(values[index]===value)return false;this.checkpoint();values[index]=value;this.syncAfterRegionEdit(kind);return true}
  syncAfterRegionEdit(kind){if(kind==="province"||kind==="commandery")this.syncRegionMembership({checkpoint:false})}
  static regionName(value){const name=String(value||"").trim();if(!name||name.length>40||/[*,\n\r]/.test(name))throw new Error("区域名称需为 1–40 个字，不能包含逗号、星号或换行");return name}
  beginEdit(){if(!this._edit)this._edit={before:this.snapshot(),changed:false}}
  endEdit(){const edit=this._edit;this._edit=null;if(edit?.changed){this.undoStack.push(edit.before);if(this.undoStack.length>MapEditor.checkpointLimit)this.undoStack.shift();this.redoStack=[]}return !!edit?.changed}
  cancelEdit(){const edit=this._edit;this._edit=null;if(edit?.changed)this.restore(edit.before);return !!edit?.changed}
  resetLayer(kind){const values=this.layer(kind),initial=this.defaults[kind==="terrain"?"terrain":kind==="province"?"provinces":"commanderies"];if(!values||JSON.stringify(values)===JSON.stringify(initial))return false;this.checkpoint();values.splice(0,values.length,...initial);this.syncAfterRegionEdit(kind);return true}
  setTerrain(x,y,value){return this.set("terrain",x,y,value)}
  setProvince(x,y,value){return this.set("province",x,y,value)}
  setCommandery(x,y,value){return this.set("commandery",x,y,value)}
  paint(kind,x0,y0,x1,y1,value){const values=this.layer(kind);if(!values)return 0;const left=Math.min(x0,x1),right=Math.max(x0,x1),top=Math.min(y0,y1),bottom=Math.max(y0,y1),targets=[];for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(this.inBounds(x,y)){const index=this.index(x,y);if(values[index]!==value)targets.push(index)}if(!targets.length)return 0;this.checkpoint();for(const index of targets)values[index]=value;this.syncAfterRegionEdit(kind);return targets.length}
  relabelRegion(kind,x,y,value){const values=this.layer(kind);if(!values||!this.inBounds(x,y))return 0;const start=this.index(x,y),source=values[start];if(source===value)return 0;const queue=[start],visited=new Set([start]),targets=[];for(let cursor=0;cursor<queue.length;cursor++){const index=queue[cursor];if(values[index]!==source)continue;targets.push(index);const px=index%this.width,py=Math.floor(index/this.width);for(const [nx,ny] of [[px-1,py],[px+1,py],[px,py-1],[px,py+1]])if(this.inBounds(nx,ny)){const next=this.index(nx,ny);if(!visited.has(next)&&values[next]===source){visited.add(next);queue.push(next)}}}if(!targets.length)return 0;this.checkpoint();for(const index of targets)values[index]=value;this.syncAfterRegionEdit(kind);return targets.length}
  fill(kind,value){const values=this.layer(kind);if(!values)return 0;const targets=values.map((current,index)=>current!==value?index:-1).filter(index=>index>=0);if(!targets.length)return 0;this.checkpoint();for(const index of targets)values[index]=value;this.syncAfterRegionEdit(kind);return targets.length}
  terrainIds(){return Object.keys(this.terrainDefs)}
  declared(kind){
    const source=kind==="province"?"province":"commandery",list=[];
    for(const place of [...this.counties,...this.cities,...MapEditor.seats(this.source),...(this.source.cities||[])])if(place&&place[source])list.push(place[source]);
    const divisions=this.divisions||{};
    list.push(...(divisions[kind==="province"?"provinces":"commanderies"]||[]));
    if(kind==="commandery")list.push(...Object.keys(divisions.commandery_counties||{}),...(divisions.commandery_seats_140||[]).map(item=>item.name));
    return list;
  }
  provinceNames(){return [...new Set([...this.provinces.filter(Boolean),...this.declared("province")])].sort()}
  commanderyNames(){return [...new Set([...this.commanderies.filter(Boolean),...this.declared("commandery")])].sort()}
  names(kind){return kind==="terrain"?[...new Set([...this.terrainIds(),...this.terrain.filter(Boolean)])].sort():kind==="province"?this.provinceNames():this.commanderyNames()}
  valueOptions(kind){return this.names(kind).map(value=>({value,label:kind==="terrain"?this.terrainDefs[value]?.name||value:value}))}
  dominant(kind){const values=this.layer(kind);if(!values)return null;const counts=new Map();for(const value of values)if(value)counts.set(value,(counts.get(value)||0)+1);const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:a[0]>b[0]?1:0));return ranked.length?ranked[0][0]:null}
  snapshot(){return {map:structuredClone(this.map),divisions:structuredClone(this.divisions),terrain:[...this.terrain],provinces:[...this.provinces],commanderies:[...this.commanderies],waterways:structuredClone(this.waterways),landmarks:structuredClone(this.landmarks),cities:structuredClone(this.cities),counties:structuredClone(this.counties),graph:structuredClone(this.graph),customRoutes:structuredClone(this.customRoutes)}}
  restore(state){const copy=structuredClone(state);for(const key of ["map","divisions","terrain","provinces","commanderies","waterways","landmarks","cities","counties","graph","customRoutes"])if(copy[key]!==undefined)this[key]=copy[key];this._roadNetwork=null}
  checkpoint(){if(this._edit){this._edit.changed=true;return}this.undoStack.push(this.snapshot());if(this.undoStack.length>MapEditor.checkpointLimit)this.undoStack.shift();this.redoStack=[];this._roadNetwork=null}
  undo(){this.endEdit();if(!this.undoStack.length)return false;this.redoStack.push(this.snapshot());this.restore(this.undoStack.pop());return true}
  redo(){this.endEdit();if(!this.redoStack.length)return false;this.undoStack.push(this.snapshot());this.restore(this.redoStack.pop());return true}
  markApplied(){this._applied=JSON.stringify(this.snapshot())}
  hasChanges(){return this._applied!==JSON.stringify(this.snapshot())}
  city(id){return this.cities.find(item=>item.id===id)||null}
  cityIds(){return new Set(this.cities.map(city=>city.id))}
  openCityCell(preferredX=Math.floor(this.width/2),preferredY=Math.floor(this.height/2)){
    const occupied=new Set(this.cities.map(city=>`${city.x},${city.y}`)),candidates=[];
    for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++)if(!occupied.has(`${x},${y}`)&&this.terrainAt(x,y)&&this.terrainAt(x,y)!=="ocean")candidates.push({x,y,distance:(x-preferredX)**2+(y-preferredY)**2});
    candidates.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x);return candidates[0]||null;
  }
  addCity(fields={}){
    let suffix=1,id=fields.id||`custom_${suffix++}`;while(!fields.id&&this.city(id))id=`custom_${suffix++}`;
    if(this.city(id))throw new Error(`据点 ID 已存在：${id}`);
    const location=this.openCityCell(fields.x??Math.floor(this.width/2),fields.y??Math.floor(this.height/2));if(!location)throw new Error("没有可放置据点的空白陆地格");
    const record={type:"city",force:this.forces.find(force=>force.id==="neutral")?.id||this.forces[0]?.id||"neutral",population:20000,garrison:0,commandery:this.commanderyAt(location.x,location.y)||"",province:this.provinceAt(location.x,location.y)||"",level:1,agriculture:35,commerce:30,order:55,governor:"—",localGold:1000,localFood:2500,storage:20000,labor:0,buildings:[],defenseDamage:0,reserveRatio:25,...fields,id,x:location.x,y:location.y};
    if(!record.name)record.name=id;
    this.assertCityPosition(record,id);this.checkpoint();this.cities.push(record);this.graph[id]=[];this.syncRegionMembership({checkpoint:false});return this.city(id);
  }
  assertCityPosition(patch,id){const x=Number(patch.x),y=Number(patch.y);if(!Number.isInteger(x)||!Number.isInteger(y)||!this.inBounds(x,y))throw new Error(`据点坐标必须在地图范围内（0–${this.width-1}, 0–${this.height-1}）`);const occupied=this.cityAt(x,y);if(occupied&&occupied.id!==id)throw new Error(`该网格已有据点：${occupied.name||occupied.id}`)}
  updateCity(id,patch={}){
    const record=this.city(id);if(!record)throw new Error(`据点不存在：${id}`);
    patch={...patch};for(const key of ["x","y"])if(key in patch)patch[key]=Number(patch[key]);
    if("name" in patch&&!String(patch.name||"").trim())throw new Error("据点名称不能为空");
    if("force" in patch&&!this.forces.some(force=>force.id===patch.force))throw new Error("所属势力无效");
    if("type" in patch&&!["city","pass","ford","port"].includes(patch.type))throw new Error("据点类型无效");
    for(const key of ["population","garrison","agriculture","commerce","order","level"])if(key in patch&&(!Number.isFinite(patch[key])||patch[key]<0||(["agriculture","commerce","order"].includes(key)&&patch[key]>100)||(key==="level"&&(!Number.isInteger(patch[key])||patch[key]<1||patch[key]>5))))throw new Error("据点数值超出允许范围");
    const next={...record,...patch,id};this.assertCityPosition(next,id);
    patch.province=this.provinceAt(next.x,next.y)||"";patch.commandery=this.commanderyAt(next.x,next.y)||"";
    if(this.counties.some(county=>county.cityId===id)&&this.counties.some(county=>county.cityId!==id&&county.x===next.x&&county.y===next.y))throw new Error("目标网格已有县治，无法同步移动关联县治");
    if(Object.keys(patch).every(key=>record[key]===patch[key]))return record;
    const moved=record.x!==next.x||record.y!==next.y;this.checkpoint();Object.assign(record,patch,{id});
    const movedIds=new Set([id]);
    for(const node of [...this.counties,...(this.map.commanderySeats||[])])if(node.cityId===id){if(moved){node.x=record.x;node.y=record.y;movedIds.add(node.id)}if(patch.province!==undefined)node.province=record.province;if(patch.commandery!==undefined){if(node.commandery!==undefined)node.commandery=record.commandery;else node.name=record.commandery}}
    if(moved)this.customRoutes=this.customRoutes.filter(route=>!movedIds.has(route.from)&&!movedIds.has(route.to));
    this.syncRegionMembership({checkpoint:false});
    return record;
  }
  syncRegionMembership({checkpoint=true}={}){
    const places=[...this.cities,...this.counties],seats=this.map.commanderySeats||[],changes=[];
    for(const place of [...places,...seats])if(this.inBounds(place.x,place.y)){
      const province=this.provinceAt(place.x,place.y)||"",commandery=this.commanderyAt(place.x,place.y)||"";
      if(place.province!==province||place.commandery!==commandery||(seats.includes(place)&&place.mapProvince!==province))changes.push({place,province,commandery});
    }
    if(!changes.length)return 0;if(checkpoint)this.checkpoint();
    for(const {place,province,commandery} of changes){place.province=province;place.commandery=commandery;if(seats.includes(place))place.mapProvince=province}
    return changes.length;
  }
  removeCity(id){const index=this.cities.findIndex(item=>item.id===id);if(index<0)return false;const remaining=this.cities.filter(item=>item.id!==id);if(!remaining.length)throw new Error("至少保留一个据点");const occupiedByArmy=(this.source.armies||[]).some(army=>army.city===id||army.destination===id||army.route?.includes?.(id)),occupiedByOfficer=(this.source.officers||[]).some(officer=>officer.city===id);if(occupiedByArmy||occupiedByOfficer)throw new Error("该据点仍有关联人物或军团，请先迁出后再删除");this.checkpoint();this.cities.splice(index,1);delete this.graph[id];for(const from of Object.keys(this.graph))this.graph[from]=(this.graph[from]||[]).filter(to=>to!==id);this.customRoutes=this.customRoutes.filter(route=>route.from!==id&&route.to!==id);for(const county of this.counties){if(county.cityId===id)delete county.cityId;if(county.jurisdictionCityId===id){const sameCommandery=remaining.filter(city=>city.commandery===county.commandery),candidates=sameCommandery.length?sameCommandery:remaining;county.jurisdictionCityId=candidates.sort((a,b)=>Math.hypot(a.x-county.x,a.y-county.y)-Math.hypot(b.x-county.x,b.y-county.y))[0].id}}for(const seat of this.map.commanderySeats||[])if(seat.cityId===id)delete seat.cityId;return true}
  moveCity(id,x,y){return this.updateCity(id,{x:Number(x),y:Number(y)})}
  roads(){return MapGrid.roadEdges(this.graph,this.cityIds())}
  roadNetwork(){return this.customRoutes}
  forceName(id){return this.forces.find(force=>force.id===id)?.name||id||"无主"}
  cityAt(x,y){return this.cities.find(city=>city.x===x&&city.y===y)||null}
  countyAt(x,y){return this.counties.find(county=>county.x===x&&county.y===y)||null}
  roadsOf(id){return this.roads().filter(([from,to])=>from===id||to===id).length}
  cellInfo(x,y){
    if(!this.inBounds(x,y))return null;
    const terrain=this.terrainAt(x,y),province=this.provinceAt(x,y),commandery=this.commanderyAt(x,y),city=this.cityAt(x,y),county=this.countyAt(x,y);
    const around=[[-1,0],[1,0],[0,-1],[0,1]].filter(([dx,dy])=>this.inBounds(x+dx,y+dy)).map(([dx,dy])=>({province:this.provinceAt(x+dx,y+dy),commandery:this.commanderyAt(x+dx,y+dy),terrain:this.terrainAt(x+dx,y+dy)}));
    const borders=[];
    if(around.some(item=>item.province!==province))borders.push("州界");
    if(around.some(item=>item.commandery!==commandery))borders.push("郡界");
    if(around.some(item=>item.terrain==="ocean"||item.terrain==="river"))borders.push("水滨");
    const definition=this.terrainDefs[terrain]||null;
    return {x,y,terrain,terrainName:definition?.name||terrain||"—",province,commandery,city,county,borders,moveCost:definition?.move_cost??null,defence:definition?.defence??null,roads:city?this.roadsOf(city.id):0};
  }
  cellSummary(x,y){
    const info=this.cellInfo(x,y);
    if(!info)return "超出舆图范围。";
    const parts=[`(${info.x},${info.y})`,info.terrainName];
    if(info.province)parts.push(`州域 ${info.province}`);
    if(info.commandery)parts.push(`郡域 ${info.commandery}`);
    if(info.county)parts.push(`县治 ${info.county.name}`);
    if(info.moveCost!==null)parts.push(`行军 ${info.moveCost} · 防御 ${info.defence??0}`);
    if(info.city)parts.push(`据点 ${info.city.name}（${this.forceName(info.city.force)}）`,`守军 ${info.city.garrison??0} · 人口 ${info.city.population??0}`,`接路 ${info.roads} 条`);
    if(info.borders.length)parts.push(info.borders.join("/"));
    return parts.join(" · ");
  }
  neighbors(id){const ids=this.cityIds();return MapGrid.roadNeighbors(this.graph,id).filter(other=>ids.has(other))}
  connected(from,to){return (this.graph[from]||[]).includes(to)}
  route(from,to){return this.customRoutes.find(route=>route.kind==="main"&&[route.from,route.to].sort().join("|")===[from,to].sort().join("|"))||null}
  roadNodes(){return [...new Map([...(this.map.commanderySeats||[]),...this.counties,...this.cities].map(node=>[node.id,node])).values()]}
  roadNode(id){return this.roadNodes().find(node=>node.id===id)||null}
  saveRoadPath(from,to,points,{id,kind}={}){
    const a=this.roadNode(from),b=this.roadNode(to);if(!a||!b||from===to)throw new Error("请选择两个不同的有效节点");
    if(!Array.isArray(points)||points.some(point=>!Array.isArray(point)||point.length!==2))throw new Error("道路路径需为坐标对列表");
    if(points.length<2||points[0][0]!==a.x||points[0][1]!==a.y||points.at(-1)[0]!==b.x||points.at(-1)[1]!==b.y)throw new Error("道路必须从起点节点格连续画到终点节点格");
    for(let i=0;i<points.length;i++){const [x,y]=points[i];if(!this.inBounds(x,y))throw new Error("道路超出地图边界");if(this.terrainAt(x,y)==="ocean")throw new Error(`道路不能经过海面格（${x},${y}）`);if(i&&Math.abs(x-points[i-1][0])+Math.abs(y-points[i-1][1])!==1)throw new Error("道路只能逐格正交延伸，不能跳格或斜穿")}
    const existing=id?this.customRoutes.findIndex(route=>route.id===id):this.customRoutes.findIndex(route=>[route.from,route.to].sort().join("|")===[from,to].sort().join("|"));
    const previous=this.customRoutes[existing],routeKind=kind||previous?.kind||(this.city(from)&&this.city(to)?"main":"county"),key=[from,to].sort().join("|");
    if(routeKind==="main"&&(!this.city(from)||!this.city(to)))throw new Error("城市通行道路的端点必须是城市");
    const route={...previous,id:id||previous?.id||`${routeKind}:${key}`,from,to,kind:routeKind,points:structuredClone(points)};
    if(JSON.stringify(route)===JSON.stringify(previous))return previous;
    this.checkpoint();if(previous?.kind==="main"&&(previous.from!==from||previous.to!==to||routeKind!=="main"))MapGrid.setRoad(this.graph,previous.from,previous.to,false);if(routeKind==="main")MapGrid.setRoad(this.graph,from,to,true);
    if(existing>=0)this.customRoutes[existing]=route;else this.customRoutes.push(route);return route;
  }
  removeRoad(id){const route=this.customRoutes.find(item=>item.id===id);if(!route)return false;this.checkpoint();this.customRoutes=this.customRoutes.filter(item=>item.id!==id);if(route.kind==="main")MapGrid.setRoad(this.graph,route.from,route.to,false);return true}
  clearRoads(){if(!this.customRoutes.length&&!this.roads().length)return false;this.checkpoint();this.customRoutes=[];for(const id of Object.keys(this.graph))this.graph[id]=[];return true}
  reshapeRoadPoint(id,index,x,y,original=null){
    const route=this.customRoutes.find(item=>item.id===id);if(!route)throw new Error("道路不存在");const points=original||route.points;
    if(!this.inBounds(x,y))throw new Error("道路节点坐标越界");
    if(index<=0||index>=points.length-1)throw new Error("道路端点随节点位置固定，请调整中间节点");
    const before=points[index-1],after=points[index+1],target=[x,y];
    const paths=(a,b)=>{
      const axis=horizontal=>{let [px,py]=a;const list=[[px,py]],walkX=()=>{while(px!==b[0]){px+=Math.sign(b[0]-px);list.push([px,py])}},walkY=()=>{while(py!==b[1]){py+=Math.sign(b[1]-py);list.push([px,py])}};if(horizontal){walkX();walkY()}else{walkY();walkX()}return list};
      return [MapEditor.gridLine(...a,...b),MapEditor.gridLine(...b,...a).reverse(),axis(true),axis(false)];
    };
    for(const first of paths(before,target))for(const second of paths(target,after)){
      const next=[...points.slice(0,index),...first.slice(1),...second.slice(1),...points.slice(index+2)],seen=new Set();
      if(next.some(([px,py])=>{const key=`${px},${py}`;if(seen.has(key)||this.terrainAt(px,py)==="ocean")return true;seen.add(key);return false}))continue;
      return this.saveRoadPath(route.from,route.to,next,{id:route.id,kind:route.kind});
    }
    throw new Error("调整会经过海面或使道路折返，请换一个节点位置");
  }
  saveWaterway(id,name,points){
    const label=MapEditor.regionName(name);
    if(!Array.isArray(points)||points.length<2||points.some(point=>!Array.isArray(point)||point.length!==2||!this.inBounds(...point)))throw new Error("河流需至少两个地图内的整数坐标点");
    if(points.some((point,i)=>i&&point[0]===points[i-1][0]&&point[1]===points[i-1][1]))throw new Error("相邻河流节点不能重叠");
    let riverId=id;if(!riverId){let suffix=1;while(this.waterways.some(river=>river.id===`custom-waterway:${suffix}`))suffix++;riverId=`custom-waterway:${suffix}`}
    const index=this.waterways.findIndex(river=>river.id===riverId),previous=this.waterways[index],river={...previous,id:riverId,name:label,points:structuredClone(points)};
    if(JSON.stringify(previous)===JSON.stringify(river))return previous;this.checkpoint();if(index>=0)this.waterways[index]=river;else this.waterways.push(river);return river;
  }
  removeWaterway(id){if(!this.waterways.some(river=>river.id===id))return false;this.checkpoint();this.waterways=this.waterways.filter(river=>river.id!==id);return true}
  clearWaterways(){if(!this.waterways.length)return false;this.checkpoint();this.waterways=[];return true}
  setRoad(from,to,connected=true){if(!this.city(from)||!this.city(to)||from===to||this.connected(from,to)===connected)return false;this.checkpoint();MapGrid.setRoad(this.graph,from,to,connected);if(!connected)this.customRoutes=this.customRoutes.filter(route=>route.kind!=="main"||[route.from,route.to].sort().join("|")!==[from,to].sort().join("|"));return true}
  toggleRoad(from,to){return this.setRoad(from,to,!this.connected(from,to))}
  connectivity(){return MapGrid.connectivity(this.graph,[...this.cityIds()])}
  validate(){
    const graphErrors=[];
    if(!this.graph||Array.isArray(this.graph)||typeof this.graph!=="object")graphErrors.push("通行关系需为据点列表");
    else for(const [id,targets] of Object.entries(this.graph))if(!Array.isArray(targets))graphErrors.push(`据点 ${id} 的通行关系需为列表`);
    if(graphErrors.length)return {ok:false,errors:graphErrors,warnings:[]};
    const result=MapGrid.validate({width:this.width,height:this.height,terrain:this.terrain,provinces:this.provinces,commanderies:this.commanderies,cities:this.cities,counties:this.counties,graph:this.graph,terrainIds:this.terrainIds()});
    if(!this.cities.length)result.errors.push("至少保留一个据点");
    const forceIds=new Set(this.forces.map(force=>force.id)),cityIds=this.cityIds(),nodes=new Map([...this.cities,...this.counties,...(this.map.commanderySeats||[])].map(node=>[node.id,node])),routeIds=new Set();
    for(const layer of [this.provinces,this.commanderies])for(const value of new Set(layer.filter(Boolean)))try{MapEditor.regionName(value)}catch(error){result.errors.push(error.message)}
    for(const city of this.cities){
      if(!forceIds.has(city.force))result.errors.push(`据点 ${city.name||city.id} 的所属势力无效：${city.force||"空"}`);
      if(!["city","pass","ford","port"].includes(city.type))result.errors.push(`据点 ${city.name||city.id} 类型无效：${city.type||"空"}`);
      if(city.level!==undefined&&(!Number.isInteger(city.level)||city.level<1||city.level>5))result.errors.push(`据点 ${city.name||city.id} 等级须为 1–5`);
      for(const key of ["agriculture","commerce","order"])if(city[key]!==undefined&&(!Number.isFinite(city[key])||city[key]<0||city[key]>100))result.errors.push(`据点 ${city.name||city.id} 的${key}须为 0–100`);
      if((this.graph[city.id]||[]).includes(city.id))result.errors.push(`据点 ${city.name} 的通行关系不能连接自身`);
    }
    for(const item of [...(this.source.officers||[]),...(this.source.armies||[])])if(item.city&&!cityIds.has(item.city))result.errors.push(`${item.name||item.id} 所在据点被移除：${item.city}`);
    for(const route of this.customRoutes){
      if(!route||!Array.isArray(route.points)||route.points.some(point=>!Array.isArray(point)||point.length!==2)){result.errors.push("道路路径需为坐标对列表");continue}
      if(!route.id||routeIds.has(route.id))result.errors.push(`道路 ID 无效或重复：${route.id||"?"}`);
      routeIds.add(route.id);
      const from=nodes.get(route.from),to=nodes.get(route.to),points=route.points;
      if(!from||!to)result.errors.push(`道路 ${route.id||"?"} 的端点不存在`);
      if(points.length<2)result.errors.push(`道路 ${route.id||"?"} 路径少于两格`);
      if(from&&points.length&&(points[0][0]!==from.x||points[0][1]!==from.y))result.errors.push(`道路 ${route.id||"?"} 未从起点格开始`);
      if(to&&points.length&&(points.at(-1)[0]!==to.x||points.at(-1)[1]!==to.y))result.errors.push(`道路 ${route.id||"?"} 未到达终点格`);
      if(route.kind==="main"&&!this.connected(route.from,route.to))result.errors.push(`道路 ${route.id} 缺少通行关系`);
      for(let i=0;i<points.length;i++){const [x,y]=points[i];if(!this.inBounds(x,y))result.errors.push(`道路 ${route.id||"?"} 坐标越界`);if(this.terrainAt(x,y)==="ocean")result.errors.push(`道路 ${route.id||"?"} 经过海面格`);if(i&&Math.abs(x-points[i-1][0])+Math.abs(y-points[i-1][1])!==1)result.errors.push(`道路 ${route.id||"?"} 存在跳格或斜向段`)}
    }
    const riverIds=new Set();
    for(const river of this.waterways){
      if(!river||!river.id||riverIds.has(river.id))result.errors.push("河流 ID 缺失或重复");riverIds.add(river?.id);
      if(!river?.name)result.errors.push("河流缺少名称");
      if(!Array.isArray(river?.points)||river.points.length<2||river.points.some(point=>!Array.isArray(point)||point.length!==2||!this.inBounds(...point)))result.errors.push(`河流 ${river?.name||"?"} 的节点无效或越界`);
    }
    result.ok=result.errors.length===0;return result;
  }
  exportMap(){const map={...this.map,editorVersion:1,width:this.width,height:this.height,terrain:MapGrid.encode(this.terrain),provinces:MapGrid.encode(this.provinces),commanderies:MapGrid.encode(this.commanderies),waterways:structuredClone(this.waterways),landmarks:structuredClone(this.landmarks)};map.roads=MapGrid.serializeRoadNetwork(this.roadNetwork());return map}
  exportDivisions(){const divisions=structuredClone(this.divisions);if(divisions.county_seats)divisions.county_seats=structuredClone(this.counties);if(divisions.commandery_seats_140&&this.map.commanderySeats)divisions.commandery_seats_140=structuredClone(this.map.commanderySeats);return divisions}
  exportPatch(){return {map:this.exportMap(),rules:{city_graph:structuredClone(this.graph)},cities:structuredClone(this.cities),counties:structuredClone(this.counties),administrativeDivisions:this.exportDivisions()}}
  exportScenario(){return {...structuredClone(this.source),...this.exportPatch(),rules:{...structuredClone(this.source.rules||{}),city_graph:structuredClone(this.graph)}}}
  exportMod(){return {manifest:{id:"map-editor-draft",name:"舆图编辑草稿",version:"0.1.0",game_version:">=0.1.0",load_order:200,replaces:[],patches:["data.patch.json"],description:"由内置舆图编辑器导出。"},patch:this.exportPatch()}}
  importPatch(patch={}){
    const value=patch?.patch&&patch?.manifest?patch.patch:patch;
    if(!value||typeof value!=="object"||Array.isArray(value)||!["map","cities","counties","rules","administrativeDivisions"].some(key=>key in value))throw new Error("补丁格式无效");
    const candidate=new MapEditor(this.source);candidate.restore(this.snapshot());
    if(value.map){
      if(typeof value.map!=="object"||Array.isArray(value.map))throw new Error("地图数据需为对象");
      const {width,height}=MapGrid.dimensions({...this.map,...value.map,width:value.map.width??value.map.grid?.width??this.width,height:value.map.height??value.map.grid?.height??this.height});
      if(width!==this.width||height!==this.height)throw new Error(`舆图尺寸不一致：${width}×${height}`);
      for(const [key,field] of [["terrain","terrain"],["provinces","provinces"],["commanderies","commanderies"]])if(key in value.map){const decoded=MapGrid.decodeLayer(value.map,key,width,height);if(!decoded)throw new Error(`${key==="terrain"?"地形":key==="provinces"?"州域":"郡域"}分层不能为空`);candidate[field]=decoded}
      for(const key of ["waterways","landmarks","roads","commanderySeats"])if(key in value.map&&(!Array.isArray(value.map[key])||value.map[key].some(item=>!item||typeof item!=="object"||Array.isArray(item))))throw new Error("道路、治所、水道与地标需为对象列表");
      if("waterways" in value.map)candidate.waterways=MapEditor.editableWaterways(value.map.waterways);
      if("landmarks" in value.map)candidate.landmarks=structuredClone(value.map.landmarks);
      if("roads" in value.map)candidate.customRoutes=MapEditor.editableRoads(value.map.roads);
      candidate.map={...candidate.map,...structuredClone(value.map),width,height};
    }
    if(value.rules&&(typeof value.rules!=="object"||Array.isArray(value.rules)))throw new Error("规则数据需为对象");
    if(value.rules&&"city_graph" in value.rules)candidate.graph=structuredClone(value.rules.city_graph);
    for(const key of ["cities","counties"])if(key in value){if(!Array.isArray(value[key])||value[key].some(item=>!item||typeof item!=="object"||Array.isArray(item)))throw new Error("据点与县治需为对象列表");candidate[key]=structuredClone(value[key])}
    if(value.administrativeDivisions){if(typeof value.administrativeDivisions!=="object"||Array.isArray(value.administrativeDivisions))throw new Error("行政数据需为对象");candidate.divisions={...candidate.divisions,...structuredClone(value.administrativeDivisions)};if(!("counties" in value)&&Array.isArray(value.administrativeDivisions.county_seats))candidate.counties=structuredClone(value.administrativeDivisions.county_seats)}
    candidate.syncRegionMembership({checkpoint:false});
    const validation=candidate.validate();if(!validation.ok)throw new Error(`导入校验失败：${validation.errors.slice(0,5).join("；")}`);
    if(JSON.stringify(candidate.snapshot())===JSON.stringify(this.snapshot()))return this;
    this.endEdit();this.checkpoint();this.restore(candidate.snapshot());
    return this;
  }
  importText(text){return this.importPatch(typeof text==="string"?JSON.parse(text):text)}
  importScenario(value){return this.load({...this.source,...(typeof value==="string"?JSON.parse(value):value)})}
  applyTo(data){const patch=this.exportPatch();Object.assign(data.map,patch.map);data.rules=data.rules||{};data.rules.city_graph=patch.rules.city_graph;data.cities=patch.cities;data.counties=patch.counties;data.administrativeDivisions=patch.administrativeDivisions;this.map=structuredClone(data.map);this.divisions=structuredClone(data.administrativeDivisions);this.markApplied();return data}
  stats(){const terrain={};for(const value of this.terrain)terrain[value]=(terrain[value]||0)+1;const result=this.validate();return {width:this.width,height:this.height,cities:this.cities.length,counties:this.counties.length,roads:this.roads().length,terrain,errors:result.errors,warnings:result.warnings}}
};

MapEditor.install = function install({$,state,mapView,toast,downloadJson,getData,getMapView,getState,onOpen,scenarioStore,getOriginalScenario,onScenarioChanged}){
  const dialog=$("mapEditorDialog");
  if(!dialog)return null;
  const source=()=>getData?getData():(state?.data||{});
  const view=()=>{const value=getMapView?getMapView():mapView;return typeof value==="function"?value():value};
  const editor=new MapEditor(source()),canvas=$("mapEditorCanvas"),ctx=canvas?.getContext?.("2d")||null,overlay=$("mapEditorOverlay"),overlayCtx=overlay?.getContext?.("2d")||null,readout=$("mapEditorHover"),cell=14,hover={x:-1,y:-1},brushMemory={},roadPick={from:"",to:""};
  let pathDraft=null,riverDraft=null,selectedRoadId="",selectedRiverId="",adjustingLine=null,selectedRiverPoint=-1,zoom=1,fitScale=1,panMode=false,spacePan=false,panState=null,movingCity=false,gesture=null,drawFrame=null,draftKey="",pendingRecovery=null,draftTimer=null,draftSaved=false,initialized=false;
  const escaped=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  let activeTool="layer";
  const elementPresets={layer:{grid:true,cities:true,roads:false,counties:false,waterways:true,landmarks:true},province:{grid:true,cities:true,roads:false,counties:false,waterways:true,landmarks:false,provinceBorders:true},commandery:{grid:true,cities:true,roads:false,counties:true,waterways:true,landmarks:false,commanderyBorders:true},city:{grid:true,cities:true,roads:false,counties:true,waterways:false,landmarks:false},road:{grid:true,cities:true,roads:true,counties:false,waterways:false,landmarks:false},river:{grid:true,cities:true,roads:false,counties:false,waterways:true,landmarks:false}};
  const elementState=Object.fromEntries(Object.entries(elementPresets).map(([name,preset])=>[name,{...preset}]));
  const elementProfile=()=>activeTool==="layer"&&kind()!=="terrain"?kind():activeTool;
  const elementVisible=key=>elementState[elementProfile()]?.[key]===true;
  const output=text=>{const target=$("mapEditorOutput");if(target)target.textContent=text};
  const syncSelect=select=>{if(select)window.TerminalSelect?.refresh?.(select)};
  const brush=()=>($("mapEditorValue")?.value||"").trim();
  const kind=()=>$("mapEditorLayer").value;
  const tool=()=>activeTool;
  const cap=name=>name[0].toUpperCase()+name.slice(1);
  const toolHint=()=>adjustingLine?"拖动方形节点调整走向 · Esc 退出调整":({layer:kind()==="terrain"?"拖动绘制 · Alt 点击取值 · 空格拖动地图":"拖动划定区域 · 城市按坐标自动归属 · Alt 取值",city:movingCity?"点击目标空格安置据点 · Esc 取消":"点击选择据点，按「移动据点」后放置。",road:pathDraft?"拖动连续铺路 · 返回上一格撤回 · Esc 取消":"点击道路选择，或点击两个节点绘制新路。",river:riverDraft?"点击落点或拖动描线 · 完成并保存 · Esc 取消":"点击河流选择 · 绘制或拖动节点调整走向"}[activeTool]);
  const cityFields=["Name","Force","Type","Level","X","Y","Population","Garrison","Agriculture","Commerce","Order"].map(name=>`mapEditorCity${name}`);
  let cityFormDirty=false,cityEditingId="",armedAction=null,storageWarning=false,loadingDraft=false,applying=false,draftRevision=0;
  const scenarioMaps=scenarioStore||(window.ScenarioMapStore&&document.defaultView?new ScenarioMapStore():null);
  let savedScenarioRecord=null;
  const draftStore=window.MapEditorDraftStore?new window.MapEditorDraftStore():null;
  const contextKey=()=>`sanguo.map-editor.draft.v1.${source()?.scenario?.id||"scenario"}.${source()?.map?.id||"map"}.${view()?(getState?.()||state)?.saveSlot||"live":"scenario"}`;
  const fingerprint=value=>{let hash=2166136261;for(const char of value){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16)};
  async function saveDraftNow(){
    clearTimeout(draftTimer);draftTimer=null;
    if(!draftKey||pendingRecovery||editor._edit||loadingDraft||!document.defaultView)return;
    try{
      if(!draftStore)return;
      const key=draftKey,revision=draftRevision;
      if(!editor.hasChanges()&&!pathDraft&&!riverDraft&&!cityFormDirty){await draftStore.remove(key);draftSaved=false;return}
      const data={version:1,base:fingerprint(editor._applied),savedAt:new Date().toISOString(),patch:editor.exportPatch(),pathDraft,riverDraft,selectedRoadId,selectedRiverId,selectedCity:$("mapEditorCity").value,cityForm:cityFormDirty?Object.fromEntries(cityFields.map(id=>[id,$(id).value])):null};
      await draftStore.put(key,data);if(key!==draftKey||revision!==draftRevision||editor._edit)return;draftSaved=true;updateStatus(false);
    }catch{draftSaved=false;if(!storageWarning){storageWarning=true;output("浏览器未能保存草稿，请导出备份。")}}
  }
  function updateStatus(persist=true){
    const changed=editor._edit?editor._edit.changed||editor.undoStack.length>0:editor.hasChanges();
    const status=$("mapEditorStatus"),lineDraft=pathDraft||riverDraft;if(status)status.textContent=cityFormDirty?"据点表单尚未保存":lineDraft?`${pathDraft?"道路":"河流"}绘制中 · ${lineDraft.points.length} 点`:changed?`未应用改动${draftSaved?" · 草稿已保存":""}`:"没有未应用改动";
    $("mapEditorUndo").disabled=loadingDraft||applying||(lineDraft?lineDraft.points.length<(pathDraft?2:1):!editor.undoStack.length&&!editor._edit?.changed);$("mapEditorRedo").disabled=loadingDraft||applying||(lineDraft?!lineDraft.redo?.length:!editor.redoStack.length);$("mapEditorApply").disabled=loadingDraft||applying;
    $("mapEditorRoadUndoPoint").disabled=!pathDraft||pathDraft.points.length<2;$("mapEditorRoadFinish").disabled=!pathDraft||pathDraft.points.length<2;$("mapEditorRoadCancel").disabled=!pathDraft;
    $("mapEditorScenarioSection").hidden=!!view();$("mapEditorLoadScenario").disabled=applying||loadingDraft||!savedScenarioRecord;$("mapEditorResetScenario").disabled=applying||loadingDraft||!scenarioMaps;
    $("mapEditorRoadDelete").disabled=!selectedRoadId;$("mapEditorRoadAdjust").disabled=!selectedRoadId||!!lineDraft;
    $("mapEditorRiverUndoPoint").disabled=!riverDraft||!riverDraft.points.length;$("mapEditorRiverFinish").disabled=!riverDraft||riverDraft.points.length<2;$("mapEditorRiverCancel").disabled=!riverDraft;
    $("mapEditorRiverDelete").disabled=!selectedRiverId;$("mapEditorRiverAdjust").disabled=!selectedRiverId||!!lineDraft;$("mapEditorRiverRename").disabled=!selectedRiverId||!!lineDraft;
    $("mapEditorRiverDeletePoint").disabled=adjustingLine!=="river"||selectedRiverPoint<0;
    for(const line of ["road","river"]){const button=$(`mapEditor${cap(line)}Adjust`);button.classList.toggle("active",adjustingLine===line);button.setAttribute("aria-pressed",String(adjustingLine===line))}
    $("mapEditorMoveCity").classList.toggle("active",movingCity);$("mapEditorMoveCity").setAttribute("aria-pressed",String(movingCity));
    const hint=$("mapEditorToolHint");if(hint)hint.textContent=toolHint();
    syncPanCursor();
    if(persist&&!editor._edit&&!loadingDraft){draftRevision++;draftSaved=false;clearTimeout(draftTimer);draftTimer=setTimeout(saveDraftNow,250)}
  }
  function restoreDraft(record){
    editor.importPatch(record.patch);pathDraft=null;riverDraft=null;selectedRoadId=record.selectedRoadId||"";selectedRiverId=record.selectedRiverId||"";
    const draft=record.pathDraft,from=draft&&editor.roadNode(draft.from),to=draft&&editor.roadNode(draft.to);
    if(from&&to&&Array.isArray(draft.points)&&draft.points.length&&draft.points.every(point=>Array.isArray(point)&&editor.inBounds(...point))&&draft.points[0][0]===from.x&&draft.points[0][1]===from.y){pathDraft=structuredClone(draft);roadPick.from=draft.from;roadPick.to=draft.to}
    if(!pathDraft&&record.riverDraft&&Array.isArray(record.riverDraft.points)&&record.riverDraft.points.every(point=>Array.isArray(point)&&editor.inBounds(...point)))riverDraft=structuredClone(record.riverDraft);
    if(riverDraft)$("mapEditorRiverName").value=riverDraft.name;
    pendingRecovery=null;$("mapEditorDraftNotice").hidden=true;refresh();if(pathDraft)setTool("road");else if(riverDraft)setTool("river");
    if(editor.city(record.selectedCity)){$("mapEditorCity").value=record.selectedCity;syncSelect($("mapEditorCity"));syncCityForm()}
    if(record.cityForm){for(const id of cityFields)if(record.cityForm[id]!==undefined)$(id).value=record.cityForm[id];cityFormDirty=true;syncSelect($("mapEditorCityForce"));syncSelect($("mapEditorCityType"))}
    draftSaved=true;updateStatus(false);output("已恢复未应用的编辑草稿。");
  }
  async function loadDraft(){
    pendingRecovery=null;$("mapEditorDraftNotice").hidden=true;
    if(!document.defaultView||!draftStore)return;
    const key=draftKey;
    loadingDraft=true;const scroll=dialog.querySelector?.(".map-editor-side-scroll");if(scroll)scroll.inert=true;updateStatus(false);
    try{const record=await draftStore.get(key);if(key!==draftKey||!record||record.version!==1)return;pendingRecovery=record;if(record.base===fingerprint(editor._applied))restoreDraft(record);else{$("mapEditorDraftNotice").hidden=false;output("舆图数据已变化，可恢复或放弃上次的编辑草稿。")}}catch{pendingRecovery??={invalid:true};$("mapEditorDraftNotice").hidden=false;output("旧草稿无法读取，可先放弃旧草稿再保存新编辑。")}
    finally{loadingDraft=false;if(scroll)scroll.inert=false;updateStatus()}
  }
  function requestDraw(){if(drawFrame!==null)return;if(!window.requestAnimationFrame){drawCanvas();return}drawFrame=window.requestAnimationFrame(()=>{drawFrame=null;drawCanvas()})}
  function confirmAction(key,message,run){if(armedAction?.key===key&&armedAction.until>Date.now()){armedAction=null;run();return}armedAction={key,until:Date.now()+5000};output(`${message}；再次点击同一按钮确认。`)}
  function readyForTransfer(){if(loadingDraft||applying)return false;endGesture();if(pathDraft||riverDraft){output(`请先完成并保存或取消正在绘制的${pathDraft?"道路":"河流"}。`);return false}if(cityFormDirty){output("请先保存据点表单，或点击「还原表单」。");return false}return true}
  function setApplying(value){applying=value;for(const selector of [".map-editor-content",".dialog-title"]){const element=dialog.querySelector?.(selector);if(element)element.inert=value}updateStatus(false)}
  function scenarioStatus(){const meta=source()?.meta?.scenarioMap;$("mapEditorScenarioStatus").textContent=meta?.status==="unavailable"?meta.message:savedScenarioRecord?`已保存 · ${new Date(savedScenarioRecord.savedAt).toLocaleString("zh-CN")}`:"原始地图"}
  async function loadScenarioInfo(){
    savedScenarioRecord=null;if(view()||!scenarioMaps){scenarioStatus();return}
    try{savedScenarioRecord=await scenarioMaps.get(source().scenario.id);scenarioStatus()}catch(error){$("mapEditorScenarioStatus").textContent=`剧本地图无法读取：${error.message}`}
    updateStatus(false);
  }
  async function originalScenario(){if(!getOriginalScenario)throw new Error("无法读取原始剧本，请导出备份");return getOriginalScenario()}
  function replaceScenario(prepared){
    const target=source(),before=editor.snapshot(),history=[...editor.undoStack];
    for(const key of ["map","cities","counties","administrativeDivisions"])target[key]=structuredClone(prepared[key]);target.rules.city_graph=structuredClone(prepared.rules.city_graph);target.meta={...target.meta,scenarioMap:prepared.meta?.scenarioMap||{status:"original"}};
    editor.load(target);if(JSON.stringify(before)!==JSON.stringify(editor.snapshot()))history.push(before);editor.undoStack=history.slice(-MapEditor.checkpointLimit);editor.redoStack=[];
    selectedRoadId="";selectedRiverId="";adjustingLine=null;movingCity=false;refresh();onScenarioChanged?.();
  }
  async function loadSavedScenario(){
    if(view()||!readyForTransfer()||!scenarioMaps)return;setApplying(true);
    try{
      const target=source(),base=await originalScenario(),record=await scenarioMaps.get(base.scenario.id);if(!record)throw new Error("此剧本尚未保存地图");
      if((editor.hasChanges()||record.baseFingerprint!==ScenarioMapStore.fingerprint(base))&&!(armedAction?.key==="load-scenario"&&armedAction.until>Date.now())){armedAction={key:"load-scenario",until:Date.now()+5000};output("载入将替换当前编辑；再次点击「载入已保存地图」确认。");return}
      armedAction=null;const prepared=ScenarioMapStore.prepare(base,record,{allowBaseChange:true});if(view()||source()!==target)throw new Error("编辑上下文已变化，请重新打开编辑器");
      replaceScenario(prepared);savedScenarioRecord=record;scenarioStatus();await saveDraftNow();output("已载入保存的剧本地图。");
    }catch(error){output(`载入失败：${error.message}`)}finally{setApplying(false);updateStatus()}
  }
  async function resetScenario(){
    if(view()||!readyForTransfer()||!scenarioMaps)return;
    if(!(armedAction?.key==="reset-scenario"&&armedAction.until>Date.now())){armedAction={key:"reset-scenario",until:Date.now()+5000};output("恢复原始地图会移除已保存版本；再次点击同一按钮确认。");return}
    armedAction=null;setApplying(true);
    try{
      const target=source(),base=await originalScenario();if(view()||source()!==target)throw new Error("编辑上下文已变化");
      await scenarioMaps.remove(base.scenario.id);
      if(view()||source()!==target)throw new Error("已移除保存版本，编辑上下文已变化，请重新打开编辑器");
      replaceScenario(base);savedScenarioRecord=null;scenarioStatus();await saveDraftNow();output("已恢复原始地图；可撤销后重新保存。");
    }catch(error){output(`恢复失败：${error.message}`)}finally{setApplying(false);updateStatus()}
  }
  const colorFor=(layer,value)=>{
    if(layer==="terrain")return editor.terrainDefs[value]?.color||"#59614d";
    if(!value)return "#1b211b";
    const hue=[...(value||"?")].reduce((sum,char)=>sum+char.charCodeAt(0),0)%360;
    return `hsl(${hue},32%,32%)`;
  };
  function applyCanvasZoom(remeasure=false){
    if(!canvas)return;
    const viewport=canvas.closest?.(".map-editor-viewport"),wrap=canvas.closest?.(".map-editor-canvas-wrap");
    if(remeasure||!fitScale){const width=Number(viewport?.clientWidth)||canvas.width,height=Number(viewport?.clientHeight)||canvas.height;fitScale=Math.max(.05,Math.min(width/canvas.width,height/canvas.height))}
    const width=Math.max(1,Math.round(canvas.width*fitScale*zoom)),height=Math.max(1,Math.round(canvas.height*fitScale*zoom));
    for(const target of [canvas,overlay,wrap])if(target){target.style.width=`${width}px`;target.style.height=`${height}px`}
    const label=$("mapEditorZoomValue");if(label)label.textContent=zoom===1?"适配":`${Math.round(zoom*100)}%`;
  }
  function changeZoom(value,event=null,fit=false){
    if(!canvas)return;
    const viewport=canvas.closest?.(".map-editor-viewport"),before=canvas.getBoundingClientRect(),rect=viewport?.getBoundingClientRect?.()||before;
    const clientX=event?.clientX??rect.left+rect.width/2,clientY=event?.clientY??rect.top+rect.height/2;
    const pointX=Math.max(0,Math.min(1,(clientX-before.left)/(before.width||canvas.width))),pointY=Math.max(0,Math.min(1,(clientY-before.top)/(before.height||canvas.height)));
    zoom=fit?1:Math.max(.5,Math.min(4,Math.round(value*4)/4));applyCanvasZoom(fit);if(!viewport)return;
    if(fit){viewport.scrollLeft=0;viewport.scrollTop=0;return}
    const after=canvas.getBoundingClientRect();
    viewport.scrollLeft=(Number(viewport.scrollLeft)||0)+after.left+pointX*after.width-clientX;
    viewport.scrollTop=(Number(viewport.scrollTop)||0)+after.top+pointY*after.height-clientY;
  }
  function drawCanvas(){
    if(!ctx)return;
    const layer=kind(),values=editor.layer(layer);
    if(!values)return;
    const resized=canvas.width!==editor.width*cell||canvas.height!==editor.height*cell;if(resized){canvas.width=editor.width*cell;canvas.height=editor.height*cell}
    if(overlay){if(overlay.width!==canvas.width)overlay.width=canvas.width;if(overlay.height!==canvas.height)overlay.height=canvas.height}applyCanvasZoom(resized);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<editor.height;y++)for(let x=0;x<editor.width;x++){ctx.fillStyle=colorFor(layer,values[editor.index(x,y)]);ctx.fillRect(x*cell,y*cell,cell,cell)}
    if(elementVisible("grid"))drawGrid();
    if(elementVisible("commanderyBorders"))drawRegionBorders("commandery",editor.commanderies);
    if(elementVisible("provinceBorders"))drawRegionBorders("province",editor.provinces);
    if(elementVisible("waterways"))drawWaterways();
    if(elementVisible("roads"))drawRoads();
    if(tool()==="road"&&pathDraft?.points?.length>1)drawRoadDraft();
    if(tool()==="river"&&riverDraft?.points?.length>1)drawLine(riverDraft.points,"#9ce7ee",2.5,[5,4]);
    if(elementVisible("counties"))drawCounties();
    if(elementVisible("landmarks"))drawLandmarks();
    if(elementVisible("cities"))drawCities();
    if(adjustingLine){const points=selectedLine(adjustingLine)?.points||[];ctx.save();ctx.fillStyle="#0a100b";ctx.strokeStyle="#f5df94";ctx.lineWidth=1;points.forEach(([x,y],index)=>{if(adjustingLine==="road"&&(index===0||index===points.length-1))return;ctx.fillRect((x+.5)*cell-2,(y+.5)*cell-2,4,4);ctx.strokeRect((x+.5)*cell-2,(y+.5)*cell-2,4,4)});ctx.restore()}
    drawHover();updateReadout();updateStatus();
  }
  function drawGrid(){
    ctx.lineWidth=1;ctx.strokeStyle="rgba(0,0,0,.32)";
    for(let x=0;x<=editor.width;x++){ctx.beginPath();ctx.moveTo(x*cell+.5,0);ctx.lineTo(x*cell+.5,canvas.height);ctx.stroke()}
    for(let y=0;y<=editor.height;y++){ctx.beginPath();ctx.moveTo(0,y*cell+.5);ctx.lineTo(canvas.width,y*cell+.5);ctx.stroke()}
  }
  function drawRegionBorders(layer,values){ctx.save();ctx.lineWidth=layer==="province"?2.5:1.4;ctx.strokeStyle=layer==="province"?"#f0d795":"#93b3a0";ctx.setLineDash(layer==="province"?[]:[4,3]);ctx.beginPath();for(let y=0;y<editor.height;y++)for(let x=0;x<editor.width;x++){const value=values[editor.index(x,y)];if(x+1<editor.width&&value!==values[editor.index(x+1,y)]){ctx.moveTo((x+1)*cell+.5,y*cell);ctx.lineTo((x+1)*cell+.5,(y+1)*cell)}if(y+1<editor.height&&value!==values[editor.index(x,y+1)]){ctx.moveTo(x*cell,(y+1)*cell+.5);ctx.lineTo((x+1)*cell,(y+1)*cell+.5)}}ctx.stroke();ctx.restore()}
  function drawWaterways(){
    if(!editor.waterways?.length)return;
    for(const river of editor.waterways){
      const points=river?.points;
      if(!Array.isArray(points)||points.length<2)continue;
      drawLine(points,tool()==="river"&&river.id===selectedRiverId?"#9ce7ee":"#4f9bbd",tool()==="river"&&river.id===selectedRiverId?3:1.6);
    }
  }
  function drawLine(points,color,width,dashes=[]){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.setLineDash(dashes);ctx.beginPath();points.forEach(([x,y],index)=>index?ctx.lineTo((x+.5)*cell,(y+.5)*cell):ctx.moveTo((x+.5)*cell,(y+.5)*cell));ctx.stroke();ctx.restore()}
  function drawRoads(){
    for(const route of editor.roadNetwork())drawLine(route.points,tool()==="road"&&route.id===selectedRoadId?"#fff0ab":route.kind==="main"?"#e7c463":"#927c48",tool()==="road"&&route.id===selectedRoadId?3:route.kind==="main"?2:1);
  }
  function drawRoadDraft(){ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle="#f0cf7d";ctx.lineWidth=2.5;ctx.beginPath();pathDraft.points.forEach(([x,y],index)=>index?ctx.lineTo((x+.5)*cell,(y+.5)*cell):ctx.moveTo((x+.5)*cell,(y+.5)*cell));ctx.stroke();ctx.restore()}
  function drawCounties(){
    const seats=editor.counties||[];
    if(!seats.length)return;
    ctx.save();
    for(const seat of seats){
      if(!editor.inBounds(seat.x,seat.y))continue;
      const x=(seat.x+.5)*cell,y=(seat.y+.5)*cell,size=seat.rank==="commandery"?2.8:seat.rank==="major"?2.5:2.1;
      ctx.fillStyle=seat.rank==="commandery"?"#f0cf7d":seat.rank==="major"?"#d6c17e":"#9f9a7c";
      ctx.strokeStyle="#15170f";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size,y);ctx.closePath();ctx.fill();ctx.stroke();
    }
    ctx.restore();
  }
  function drawLandmarks(){
    if(!editor.landmarks?.length)return;
    ctx.save();ctx.textAlign="center";ctx.font=`${Math.max(8,Math.round(cell*.5))}px serif`;
    for(const mark of editor.landmarks){
      if(!editor.inBounds(mark.x,mark.y))continue;
      const x=(mark.x+.5)*cell,y=(mark.y+.5)*cell;
      ctx.fillStyle=mark.type==="lake"?"#78b4c6":"#b7ac8b";ctx.beginPath();ctx.arc(x,y,1.9,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#c9c19c";ctx.fillText(mark.name,x,y-4);
    }
    ctx.restore();
  }
  function drawCities(){
    ctx.textAlign="center";ctx.font="9px serif";
    for(const city of editor.cities){const selected=city.id===$("mapEditorCity").value,x=(city.x+.5)*cell,y=(city.y+.5)*cell;ctx.fillStyle=selected?"#fff6c4":"#f0cf7d";ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#2b2411";ctx.lineWidth=1;ctx.stroke();if(tool()==="road"&&(city.id===roadPick.from||city.id===roadPick.to)){ctx.strokeStyle=city.id===roadPick.from?"#8fd07a":"#d98a6a";ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.stroke()}ctx.fillStyle=selected?"#ffe9a8":"#d8d2a4";ctx.fillText(city.name||city.id,x,y-6)}
  }
  function drawHover(){
    if(!overlayCtx)return;
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    if(!editor.inBounds(hover.x,hover.y))return;
    const x=hover.x,y=hover.y,radius=activeTool==="layer"&&!(kind()!=="terrain"&&$("mapEditorRegionFill")?.checked)?Math.floor((Number($("mapEditorBrushSize")?.value)||1)/2):0,left=Math.max(0,x-radius),top=Math.max(0,y-radius),width=Math.min(editor.width-1,x+radius)-left+1,height=Math.min(editor.height-1,y+radius)-top+1;
    overlayCtx.fillStyle="rgba(244,226,160,.15)";overlayCtx.fillRect(left*cell,top*cell,width*cell,height*cell);
    overlayCtx.strokeStyle="rgba(244,226,160,.28)";overlayCtx.lineWidth=1;
    overlayCtx.beginPath();overlayCtx.moveTo(0,y*cell+.5);overlayCtx.lineTo(overlay.width,y*cell+.5);overlayCtx.moveTo(x*cell+.5,0);overlayCtx.lineTo(x*cell+.5,overlay.height);overlayCtx.stroke();
    overlayCtx.strokeStyle="#f6e6ac";overlayCtx.lineWidth=2;overlayCtx.strokeRect(left*cell+1,top*cell+1,width*cell-2,height*cell-2);
  }
  function updateReadout(){
    if(!readout)return;
    readout.textContent=editor.inBounds(hover.x,hover.y)?editor.cellSummary(hover.x,hover.y):toolHint();
  }
  function setHover(x,y){
    const changed=hover.x!==x||hover.y!==y;
    hover.x=x;hover.y=y;
    if(changed){updateReadout();drawHover()}
  }
  function syncValueOptions(){
    const select=$("mapEditorValue"),layer=kind();
    const administrative=layer==="province"||layer==="commandery",nameRow=$("mapEditorRegionNameRow"),regionActions=$("mapEditorRegionActions"),nameInput=$("mapEditorRegionName"),addRegion=$("mapEditorAddRegion");
    $("mapEditorLayerTitle").textContent={terrain:"地形图层",province:"州域图层",commandery:"郡域图层"}[layer];
    $("mapEditorRegionHint").textContent=administrative?"城市与县治按坐标自动归属 · 不改动其他图层":"按住 Alt 点击取值 · 每次拖绘可整笔撤销";
    if(nameRow)nameRow.hidden=!administrative;if(regionActions)regionActions.hidden=!administrative;if(nameInput)nameInput.placeholder=layer==="province"?"输入州名":"输入郡名";if(addRegion)addRegion.textContent=layer==="province"?"加入州域列表":"加入郡域列表";
    if(!select)return;
    const entries=editor.valueOptions(layer),preferred=brushMemory[layer]??editor.dominant(layer);if(preferred&&!entries.some(entry=>entry.value===preferred))entries.push({value:preferred,label:preferred});
    select.innerHTML=entries.map(entry=>`<option value="${escaped(entry.value)}">${escaped(entry.label)}</option>`).join("");
    const chosen=entries.some(entry=>entry.value===preferred)?preferred:entries[0]?.value;
    if(chosen!==undefined)select.value=chosen;
    syncSelect(select);
  }
  function options(select,entries,value){
    if(!select)return;
    select.innerHTML=entries.map(entry=>`<option value="${escaped(entry.id??entry)}">${escaped(entry.name??entry)}</option>`).join("");
    if(value!==undefined)select.value=value;
    syncSelect(select);
  }
  function syncCitySelects(){
    for(const id of ["mapEditorCity","mapEditorRoadFrom","mapEditorRoadTo"]){const select=$(id),previous=id==="mapEditorRoadFrom"?roadPick.from||select.value:id==="mapEditorRoadTo"?roadPick.to||select.value:select.value,nodes=id==="mapEditorCity"?editor.cities:[...editor.cities,...editor.roadNodes().filter(node=>!editor.city(node.id))];select.innerHTML=nodes.map(node=>`<option value="${escaped(node.id)}">${escaped(node.name||node.id)}${node.commandery?` · ${escaped(node.commandery)}`:""}（${node.x},${node.y}）</option>`).join("");if(previous&&nodes.some(node=>node.id===previous))select.value=previous;syncSelect(select)}
  }
  function syncRoadInfo(){
    const from=$("mapEditorRoadFrom").value,to=$("mapEditorRoadTo").value;
    if(!from||!to||from===to){$("mapEditorRoadInfo").textContent="请选择两个不同据点。";return}
    const route=selectedLine("road")||editor.route(from,to);$("mapEditorRoadInfo").textContent=`${editor.roadNode(from)?.name||from} ↔ ${editor.roadNode(to)?.name||to} · ${route?`${route.points.length} 格路径`:"尚无路径"} · 全图 ${editor.customRoutes.length} 条道路。`;
  }
  function syncCityForm(){
    cityFormDirty=false;
    const city=editor.city($("mapEditorCity").value);
    cityEditingId=city?.id||"";
    if(!city){for(const id of ["mapEditorCityName","mapEditorCityCommandery","mapEditorCityProvince","mapEditorCityX","mapEditorCityY","mapEditorCityPopulation","mapEditorCityGarrison","mapEditorCityLevel","mapEditorCityAgriculture","mapEditorCityCommerce","mapEditorCityOrder"])$(id).value="";$("mapEditorCityInfo").textContent="当前没有选中据点。";return}
    $("mapEditorCityName").value=city.name||"";
    $("mapEditorCityCommandery").value=city.commandery||"";
    $("mapEditorCityProvince").value=city.province||"";
    $("mapEditorCityType").value=city.type||"city";
    $("mapEditorCityLevel").value=city.level??1;
    $("mapEditorCityX").value=city.x;
    $("mapEditorCityY").value=city.y;
    $("mapEditorCityPopulation").value=city.population??0;
    $("mapEditorCityGarrison").value=city.garrison??0;
    $("mapEditorCityAgriculture").value=city.agriculture??0;
    $("mapEditorCityCommerce").value=city.commerce??0;
    $("mapEditorCityOrder").value=city.order??0;
    const info=$("mapEditorCityInfo");if(info)info.textContent=`${city.id}${city.commanderySeatNode?` · 郡治节点${city.commanderySeatName?`（${city.commanderySeatName}）`:""}`:""} · ${editor.roadsOf(city.id)} 条通行接边 · ${editor.customRoutes.filter(route=>route.kind==="main"&&(route.from===city.id||route.to===city.id)).length} 条绘制路径`;
    options($("mapEditorCityForce"),editor.forces.map(force=>({id:force.id,name:force.name||force.id})),city.force);
  }
  function syncCityRegionPreview(){
    const xInput=$("mapEditorCityX"),yInput=$("mapEditorCityY"),x=Number(xInput.value),y=Number(yInput.value),valid=xInput.value!==""&&yInput.value!==""&&editor.inBounds(x,y);
    $("mapEditorCityProvince").value=valid?editor.provinceAt(x,y)||"未划定":"";$("mapEditorCityCommandery").value=valid?editor.commanderyAt(x,y)||"未划定":"";
  }
  function selectedLine(type){return type==="road"?editor.customRoutes.find(route=>route.id===selectedRoadId):editor.waterways.find(river=>river.id===selectedRiverId)}
  function syncLineSelects(){
    if(!selectedLine("road")){selectedRoadId="";if(adjustingLine==="road")adjustingLine=null}
    if(!selectedLine("river")){selectedRiverId="";selectedRiverPoint=-1;if(adjustingLine==="river")adjustingLine=null}
    options($("mapEditorRoadSelect"),[{id:"",name:"新道路"},...editor.customRoutes.map(route=>({id:route.id,name:`${editor.roadNode(route.from)?.name||route.from} ↔ ${editor.roadNode(route.to)?.name||route.to} · ${route.points.length} 格`}))],selectedRoadId);
    options($("mapEditorRiverSelect"),[{id:"",name:"新河流"},...editor.waterways.map(river=>({id:river.id,name:`${river.name} · ${river.points.length} 点`}))],selectedRiverId);
    if(!riverDraft)$("mapEditorRiverName").value=selectedLine("river")?.name||"新河流";
    $("mapEditorRiverInfo").textContent=selectedLine("river")?`${selectedLine("river").name} · ${selectedLine("river").points.length} 个节点${selectedRiverPoint>=0?` · 选中第 ${selectedRiverPoint+1} 点`:""}`:"点击落点或拖动绘制；调整节点时可拖动方形控制点。";
  }
  function selectLine(type,id){
    if(pathDraft||riverDraft)return output("请先保存或取消正在绘制的路径。");
    adjustingLine=null;selectedRiverPoint=-1;
    if(type==="road"){selectedRoadId=id;const route=selectedLine("road");if(route){roadPick.from=route.from;roadPick.to=route.to;$("mapEditorRoadFrom").value=route.from;$("mapEditorRoadTo").value=route.to;syncSelect($("mapEditorRoadFrom"));syncSelect($("mapEditorRoadTo"))}}
    else selectedRiverId=id;
    syncLineSelects();syncRoadInfo();drawCanvas();
    output(id?`已选择${type==="road"?"道路":"河流"}，可重画、调整节点或删除。`:`可绘制新${type==="road"?"道路":"河流"}。`);
  }
  function lineAt(type,x,y){
    const lines=type==="road"?editor.customRoutes:editor.waterways;let nearest=null,distance=.7;
    for(const line of lines)for(let i=1;i<line.points.length;i++){
      const [ax,ay]=line.points[i-1],[bx,by]=line.points[i],dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(x-ax-t*dx,y-ay-t*dy);
      if(d<distance){distance=d;nearest=line}
    }
    return nearest;
  }
  function beginLineAdjustment(event,x,y){
    const line=selectedLine(activeTool);if(!line)return false;
    let index=-1,distance=1.1;line.points.forEach(([px,py],i)=>{const d=Math.hypot(px-x,py-y);if(d<distance){index=i;distance=d}});
    if(index<0)return false;
    if(activeTool==="road"&&(index===0||index===line.points.length-1)){output("道路端点随据点固定，请拖动中间节点。");return true}
    selectedRiverPoint=activeTool==="river"?index:-1;editor.beginEdit();gesture={pointerId:event.pointerId,kind:"vertex",lineType:activeTool,id:line.id,index,original:structuredClone(line.points)};canvas.setPointerCapture?.(event.pointerId);syncLineSelects();requestDraw();return true;
  }
  function moveLineVertex(x,y){
    const edit=gesture;if(!edit||edit.kind!=="vertex"||!editor.inBounds(x,y))return;
    try{
      if(edit.lineType==="road")editor.reshapeRoadPoint(edit.id,edit.index,x,y,edit.original);
      else{const river=editor.waterways.find(item=>item.id===edit.id),points=structuredClone(edit.original);points[edit.index]=[x,y];editor.saveWaterway(edit.id,river.name,points)}
      requestDraw();
    }catch(error){output(`节点未移动：${error.message}`)}
  }
  function toggleLineAdjustment(type){if(!readyForTransfer()||!selectedLine(type))return;adjustingLine=adjustingLine===type?null:type;selectedRiverPoint=-1;drawCanvas();output(adjustingLine?"拖动方形控制点调整走向。":"已退出节点调整。")}
  function deleteSelectedLine(type){
    if(!readyForTransfer())return;const line=selectedLine(type);if(!line)return;
    if(type==="road")editor.removeRoad(line.id);else editor.removeWaterway(line.id);
    adjustingLine=null;refresh();output(`所选${type==="road"?"道路":"河流"}已删除，可撤销。`);
  }
  function startRiverDraft(){
    if(pathDraft)return output("请先保存或取消道路草稿。");if(cityFormDirty)return output("请先保存或还原据点表单。");
    if(riverDraft?.points.length&&!(armedAction?.key==="river-restart"&&armedAction.until>Date.now())){armedAction={key:"river-restart",until:Date.now()+5000};return output("当前河流尚未保存，再次点击绘制按钮可重画。")}
    armedAction=null;adjustingLine=null;const river=selectedLine("river");riverDraft={id:river?.id||null,name:$("mapEditorRiverName").value||river?.name||"新河流",points:[],redo:[]};drawCanvas();output("点击落点或按住拖动描线，至少两个节点后完成保存。");
  }
  function appendRiverPoint(x,y){
    if(!riverDraft||!editor.inBounds(x,y))return;const last=riverDraft.points.at(-1);if(last&&last[0]===x&&last[1]===y)return;
    riverDraft.points.push([x,y]);riverDraft.redo=[];requestDraw();
  }
  function finishRiverDraft(){if(!riverDraft)return;try{const river=editor.saveWaterway(riverDraft.id,$("mapEditorRiverName").value,riverDraft.points);selectedRiverId=river.id;riverDraft=null;refresh();output("河流路径已保存。")}catch(error){output(`河流未保存：${error.message}`)}}
  function refresh(){
    syncValueOptions();syncCitySelects();if(!cityFormDirty)syncCityForm();syncLineSelects();syncRoadInfo();syncTool();
    const stats=editor.stats();
    output(`舆图 ${stats.width}×${stats.height}｜据点 ${stats.cities}｜县治 ${stats.counties}｜道路 ${stats.roads}｜校验 ${stats.errors.length?"失败":"通过"}`);
  }
  function syncTool(){
    syncPanCursor();
    for(const name of ["layer","city","road","river"]){const button=$(`mapEditorTool${cap(name)}`);button?.classList.toggle("active",name==="layer"?activeTool==="layer"&&kind()==="terrain":name===activeTool);const panel=$(`mapEditorPanel${cap(name)}`);if(panel)panel.hidden=name!==activeTool}
    for(const name of ["province","commandery"])$(`mapEditorTool${cap(name)}`).classList.toggle("active",activeTool==="layer"&&kind()===name);
    const hint=$("mapEditorToolHint");if(hint)hint.textContent=toolHint();
    syncElements();
    drawCanvas();
  }
  function syncElements(){
    const host=$("mapEditorElements");
    if(!host)return;
    for(const input of host.querySelectorAll("[data-editor-element]"))input.checked=elementState[elementProfile()]?.[input.getAttribute("data-editor-element")]===true;
  }
  function setTool(name){if(!["layer","city","road","river"].includes(name)||name===activeTool)return;endGesture();movingCity=false;adjustingLine=null;activeTool=name;if(name!=="layer"){$("mapEditorLayer").value="terrain";syncSelect($("mapEditorLayer"));syncValueOptions()}if(name==="city"){syncCitySelects();if(!cityFormDirty)syncCityForm()}syncPanCursor();syncTool()}
  function setLayer(layer){endGesture();$("mapEditorLayer").value=layer;syncSelect($("mapEditorLayer"));setTool("layer");syncValueOptions();syncTool()}
  function cityAt(x,y){return editor.cities.find(city=>city.x===x&&city.y===y)||null}
  function placeCity(x,y){
    const target=cityAt(x,y);
    if(cityFormDirty){output("请先保存或还原据点表单。");return}
    if(movingCity&&(pathDraft||riverDraft)){output("请先完成并保存或取消正在绘制的路径。");return}
    if(target){$("mapEditorCity").value=target.id;movingCity=false;syncSelect($("mapEditorCity"));syncCityForm();drawCanvas();output(`已选中据点 ${target.name||target.id}`);return}
    if(!movingCity){output("点击据点可选择；移动位置请先按「移动据点」。");return}
    const id=$("mapEditorCity").value;if(!id)return;
    try{if(editor.terrainAt(x,y)==="ocean")throw new Error("据点需放在陆地格");const hadRoutes=editor.customRoutes.some(route=>route.from===id||route.to===id);editor.moveCity(id,x,y);movingCity=false;syncPanCursor();syncCitySelects();syncCityForm();drawCanvas();output(`已将据点 ${editor.city(id)?.name||id} 移动到 (${x},${y})${hadRoutes?"；关联道路需重新绘制":""}`)}catch(error){output(`移动失败：${error.message}`)}
  }
  function pickRoad(x,y){
    const target=editor.roadNodes().find(node=>node.x===x&&node.y===y);
    if(!target){const route=lineAt("road",x,y);if(route)selectLine("road",route.id);else output("点击道路选择，或点击节点选择端点。");return}
    selectedRoadId="";adjustingLine=null;
    if(!roadPick.from||roadPick.to||target.id===roadPick.from){roadPick.from=target.id;roadPick.to=""}
    else roadPick.to=target.id;
    $("mapEditorRoadFrom").value=roadPick.from;$("mapEditorRoadTo").value=roadPick.to;
    syncLineSelects();syncRoadInfo();drawCanvas();
    output(roadPick.to?`已选择 ${editor.roadNode(roadPick.from)?.name||roadPick.from} ↔ ${editor.roadNode(roadPick.to)?.name||roadPick.to}，可绘制道路`:`起点 ${target.name||target.id}，再点击终点节点`);
  }
  function appendRoadPoint(x,y){if(!editor.inBounds(x,y)||!pathDraft)return false;const points=pathDraft.points,last=points.at(-1);if(x===last[0]&&y===last[1])return false;if(Math.abs(x-last[0])+Math.abs(y-last[1])!==1){output("道路需沿相邻格绘制，可按住拖动连续铺路。");return false}if(editor.terrainAt(x,y)==="ocean"){output("道路不能经过海面格。");return false}if(points.length>1&&points.at(-2)[0]===x&&points.at(-2)[1]===y)points.pop();else if(points.some(point=>point[0]===x&&point[1]===y)){output("道路不能在同一路径内重复绕圈。");return false}else points.push([x,y]);pathDraft.redo=[];requestDraw();const end=editor.roadNode(pathDraft.to);if(end&&x===end.x&&y===end.y)output("已到达终点格，点击「完成并保存」。");return true}
  function startRoadDraft(){
    if(riverDraft)return output("请先保存或取消河流草稿。");if(cityFormDirty)return output("请先保存或还原据点表单。");
    const from=editor.roadNode($("mapEditorRoadFrom").value),to=editor.roadNode($("mapEditorRoadTo").value);if(!from||!to||from.id===to.id){output("请先选择两个不同的节点");return}
    if(pathDraft?.points.length>1&&!(armedAction?.key==="road-restart"&&armedAction.until>Date.now())){armedAction={key:"road-restart",until:Date.now()+5000};output("当前道路尚未保存，再次点击绘制按钮可重画。");return}
    armedAction=null;adjustingLine=null;roadPick.from=from.id;roadPick.to=to.id;const route=selectedLine("road");pathDraft={from:from.id,to:to.id,id:route?.id,kind:route?.kind,points:[[from.x,from.y]]};drawCanvas();output(`开始绘制 ${from.name} → ${to.name}：拖动或逐格点击铺路，抵达终点后完成保存`);
  }
  function finishRoadDraft(){if(!pathDraft)return output("当前没有正在绘制的道路");try{const route=editor.saveRoadPath(pathDraft.from,pathDraft.to,pathDraft.points,{id:pathDraft.id,kind:pathDraft.kind});selectedRoadId=route.id;pathDraft=null;refresh();output("道路路径已保存。")}catch(error){output(`道路未保存：${error.message}`)}}
  function paintCell(x,y,value){if(!value)return false;const radius=Math.floor((Number($("mapEditorBrushSize")?.value)||1)/2),changed=editor.paint(kind(),x-radius,y-radius,x+radius,y+radius,value);if(changed)requestDraw();return !!changed}
  function applyTool(x,y){
    if(activeTool==="city")return placeCity(x,y);
    if(activeTool==="road")return pathDraft?appendRoadPoint(x,y):pickRoad(x,y);
    if(activeTool==="river"){if(riverDraft)return appendRiverPoint(x,y);const river=lineAt("river",x,y);if(river)selectLine("river",river.id);else output("点击河流可选择；新建请按「绘制／重画」。");return}
    return paintCell(x,y,brush());
  }
  $("mapEditorZoomOut").onclick=()=>changeZoom(zoom-.25);
  $("mapEditorZoomIn").onclick=()=>changeZoom(zoom+.25);
  $("mapEditorZoomFit").onclick=()=>changeZoom(1,null,true);
  const cellAt=event=>{const rect=canvas.getBoundingClientRect(),scaleX=canvas.width/(rect.width||canvas.width),scaleY=canvas.height/(rect.height||canvas.height);return {x:Math.floor((event.clientX-rect.left)*scaleX/cell),y:Math.floor((event.clientY-rect.top)*scaleY/cell)}};
  const viewport=canvas?.closest?.(".map-editor-viewport");
  const syncPanCursor=()=>{const button=$("mapEditorPanToggle"),enabled=panMode||spacePan;if(button){button.classList.toggle("active",panMode);button.setAttribute("aria-pressed",String(panMode))}if(canvas)canvas.style.cursor=panState?"grabbing":enabled?"grab":movingCity||adjustingLine?"move":activeTool==="city"||(["road","river"].includes(activeTool)&&!pathDraft&&!riverDraft)?"pointer":"crosshair"};
  const endPan=()=>{panState=null;syncPanCursor()};
  function endGesture(event){if(event?.pointerId!==undefined&&((gesture&&gesture.pointerId!==event.pointerId)||(panState&&panState.pointerId!==event.pointerId)))return;const vertexEdit=gesture?.kind==="vertex";gesture=null;editor.endEdit();if(vertexEdit){syncLineSelects();syncRoadInfo()}endPan();updateStatus();saveDraftNow()}
  $("mapEditorPanToggle").onclick=()=>{endGesture();panMode=!panMode;syncPanCursor();output(panMode?"拖动模式：按住左键移动舆图，再按一次恢复编辑":"已恢复编辑模式")};
  if(canvas){
    canvas.addEventListener("wheel",event=>{if(!event.ctrlKey)return;event.preventDefault();changeZoom(zoom+(event.deltaY<0?.25:-.25),event)},{passive:false});
    canvas.addEventListener("contextmenu",event=>event.preventDefault());
    canvas.addEventListener("pointerdown",event=>{
      if(loadingDraft||applying)return;
      const button=event.button??0;if(button!==0&&button!==1)return;
      endGesture();canvas.focus?.({preventScroll:true});event.preventDefault?.();
      if(viewport&&((button===0&&(panMode||spacePan))||button===1)){panState={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:Number(viewport.scrollLeft)||0,top:Number(viewport.scrollTop)||0};canvas.setPointerCapture?.(event.pointerId);syncPanCursor();return}
      if(button!==0)return;
      const {x,y}=cellAt(event);setHover(x,y);if(!editor.inBounds(x,y))return;
      if(adjustingLine&&beginLineAdjustment(event,x,y))return;
      if(activeTool==="layer"&&event.altKey){const value=editor.at(kind(),x,y);if(value){brushMemory[kind()]=value;syncValueOptions();output(`已取值「${$("mapEditorValue").selectedOptions?.[0]?.textContent||value}」。`)}return}
      const layer=kind();if(activeTool==="layer"&&$("mapEditorRegionFill")?.checked&&(layer==="province"||layer==="commandery")){if(!brush())return;const changed=editor.relabelRegion(layer,x,y,brush());output(changed?`已将相连的 ${changed} 格改属「${brush()}」`:"该相连区域已属于所选区域");drawCanvas();return}
      if(activeTool==="layer"){if(!brush())return;editor.beginEdit();gesture={pointerId:event.pointerId,kind:"paint",last:{x,y}}}
      else if(activeTool==="road"&&pathDraft){const last=pathDraft.points.at(-1);if(Math.abs(x-last[0])+Math.abs(y-last[1])<=1)gesture={pointerId:event.pointerId,kind:"road",last:{x,y}}}
      else if(activeTool==="river"&&riverDraft)gesture={pointerId:event.pointerId,kind:"river",last:{x,y}};
      canvas.setPointerCapture?.(event.pointerId);applyTool(x,y);
    });
    canvas.addEventListener("pointermove",event=>{
      if(panState&&panState.pointerId===event.pointerId){viewport.scrollLeft=panState.left-(event.clientX-panState.x);viewport.scrollTop=panState.top-(event.clientY-panState.y);return}
      const {x,y}=cellAt(event);setHover(x,y);if(!gesture||gesture.pointerId!==event.pointerId)return;
      if(!editor.inBounds(x,y)){gesture.last=null;return}
      if(gesture.kind==="paint"){for(const [px,py] of gesture.last?MapEditor.gridLine(gesture.last.x,gesture.last.y,x,y):[[x,y]])paintCell(px,py,brush())}
      else if(gesture.kind==="road"&&pathDraft){const last=pathDraft.points.at(-1);for(const [px,py] of MapEditor.gridLine(last[0],last[1],x,y).slice(1))if(!appendRoadPoint(px,py))break}
      else if(gesture.kind==="river")appendRiverPoint(x,y);
      else if(gesture.kind==="vertex")moveLineVertex(x,y);
      gesture.last={x,y};
    });
    for(const type of ["pointerup","pointercancel","lostpointercapture"])canvas.addEventListener(type,endGesture);
    canvas.addEventListener("pointerleave",()=>{if(!panState)setHover(-1,-1)});
  }
  const isTyping=event=>event.target?.closest?.("input,textarea,select,[contenteditable='true']");
  document.addEventListener?.("keydown",event=>{
    const focusedDialog=event.target?.closest?.("dialog")||document.querySelector?.("dialog.is-active");if(!dialog.open||loadingDraft||applying||(focusedDialog&&focusedDialog!==dialog)||isTyping(event))return;
    const key=String(event.key||"").toLowerCase(),modifier=event.ctrlKey||event.metaKey;
    if(event.code==="Space"){event.preventDefault();event.stopPropagation?.();if(gesture)endGesture();spacePan=true;syncPanCursor()}
    else if(modifier&&(key==="z"||key==="y")){event.preventDefault();event.stopPropagation?.();if(!event.repeat)(key==="y"||event.shiftKey?$("mapEditorRedo"):$("mapEditorUndo")).onclick()}
    else if((event.key==="Delete"||event.key==="Backspace")&&["road","river"].includes(activeTool)&&event.target===canvas&&!pathDraft&&!riverDraft){event.preventDefault();event.stopPropagation?.();deleteSelectedLine(activeTool)}
    else if(event.key==="Escape"&&(pathDraft||riverDraft||adjustingLine||movingCity||gesture)){event.preventDefault();event.stopPropagation?.();editor.cancelEdit();gesture=null;pathDraft=null;riverDraft=null;adjustingLine=null;selectedRiverPoint=-1;movingCity=false;endPan();refresh();output("已取消当前操作。")}
  },true);
  document.addEventListener?.("keyup",event=>{if(event.code!=="Space")return;spacePan=false;syncPanCursor()},true);
  dialog.addEventListener?.("close",()=>{endGesture();spacePan=false;panMode=false;movingCity=false;endPan();saveDraftNow()});
  dialog.addEventListener?.("cancel",event=>{if(applying)event.preventDefault()});
  window.addEventListener?.("blur",()=>{spacePan=false;endGesture()});
  window.addEventListener?.("pagehide",()=>{endGesture();saveDraftNow()});
  $("mapEditorToolLayer").onclick=()=>setLayer("terrain");
  $("mapEditorToolProvince").onclick=()=>setLayer("province");$("mapEditorToolCommandery").onclick=()=>setLayer("commandery");
  for(const input of ($("mapEditorElements")?.querySelectorAll("[data-editor-element]")||[]))input.onchange=()=>{const key=input.getAttribute("data-editor-element"),profile=elementProfile();if(!key||!elementState[profile])return;elementState[profile][key]=!!input.checked;drawCanvas()};
  $("mapEditorToolCity").onclick=()=>setTool("city");
  $("mapEditorToolRoad").onclick=()=>setTool("road");
  $("mapEditorToolRiver").onclick=()=>setTool("river");
  $("mapEditorLayer").onchange=()=>{endGesture();armedAction=null;syncValueOptions();syncTool()};
  $("mapEditorAddRegion").onclick=()=>{try{const layer=kind(),name=MapEditor.regionName($("mapEditorRegionName").value);if(!["province","commandery"].includes(layer))return;const select=$("mapEditorValue"),exists=[...select.options].some(option=>option.value===name);if(!exists){const option=document.createElement("option");option.value=name;option.textContent=name;select.append(option)}select.value=name;brushMemory[layer]=name;syncSelect(select);output(`已选中区域「${name}」。`)}catch(error){output(error.message)}};
  $("mapEditorValue").onchange=()=>{endGesture();brushMemory[kind()]=$("mapEditorValue").value;armedAction=null};
  $("mapEditorBrushSize").onchange=()=>{endGesture();drawHover()};
  $("mapEditorRegionFill").onchange=()=>{endGesture();drawHover()};
  $("mapEditorFill").onclick=()=>{if(!readyForTransfer())return;const layer=kind(),value=brush();if(!value)return toast("请先选择笔刷取值");confirmAction(`fill:${layer}:${value}`,"将覆盖当前图层的全部格子",()=>{const changed=editor.fill(layer,value);drawCanvas();output(`整层填充 ${changed} 格。`)})};
  $("mapEditorResetLayer").onclick=()=>{if(!readyForTransfer())return;confirmAction(`reset:${kind()}`,"将还原打开编辑器时的该图层",()=>{editor.resetLayer(kind());syncValueOptions();drawCanvas();output("该图层已还原，可撤销。")})};
  $("mapEditorUndo").onclick=()=>{endGesture();if(pathDraft||riverDraft){$(pathDraft?"mapEditorRoadUndoPoint":"mapEditorRiverUndoPoint").onclick();return}if(cityFormDirty)return output("请先保存或还原据点表单。");const changed=editor.undo();movingCity=false;selectedRiverPoint=-1;refresh();output(changed?"已撤销上一次编辑。":"没有可撤销的操作。")};
  $("mapEditorRedo").onclick=()=>{endGesture();const draft=pathDraft||riverDraft;if(draft){if(draft.redo?.length){draft.points.push(draft.redo.pop());drawCanvas()}return}if(cityFormDirty)return output("请先保存或还原据点表单。");const changed=editor.redo();movingCity=false;selectedRiverPoint=-1;refresh();output(changed?"已重做。":"没有可重做的操作。")};
  $("mapEditorCity").onchange=()=>{if(cityFormDirty){$("mapEditorCity").value=cityEditingId;syncSelect($("mapEditorCity"));return output("请先保存或还原据点表单。")}movingCity=false;syncCityForm();drawCanvas()};
  $("mapEditorAddCity").onclick=()=>{if(cityFormDirty)return output("请先保存或还原据点表单。");try{const city=editor.addCity({name:`新据点${editor.cities.length+1}`});syncCitySelects();$("mapEditorCity").value=city.id;syncSelect($("mapEditorCity"));syncCityForm();drawCanvas();locateCity();output(`已新增据点（${city.x},${city.y}）。`)}catch(error){output(`新增失败：${error.message}`)}};
  function locateCity(){const city=editor.city($("mapEditorCity").value);if(!city||!viewport)return;const rect=canvas.getBoundingClientRect(),width=rect.width||canvas.width,height=rect.height||canvas.height;viewport.scrollLeft=(city.x+.5)*width/editor.width-(Number(viewport.clientWidth)||0)/2;viewport.scrollTop=(city.y+.5)*height/editor.height-(Number(viewport.clientHeight)||0)/2;setHover(city.x,city.y)}
  $("mapEditorLocateCity").onclick=locateCity;
  $("mapEditorMoveCity").onclick=()=>{if(cityFormDirty)return output("请先保存或还原据点表单。");if(pathDraft||riverDraft)return output(`请先完成并保存或取消正在绘制的${pathDraft?"道路":"河流"}。`);movingCity=!movingCity;syncPanCursor();updateStatus();output(movingCity?"点击目标空格安置据点，按 Esc 取消。":"已取消据点移动。")};
  $("mapEditorDiscardCityForm").onclick=()=>{syncCityForm();updateStatus();output("已还原据点表单。")};
  for(const id of cityFields)for(const type of ["input","change"])$(id).addEventListener?.(type,()=>{cityFormDirty=true;updateStatus()});
  for(const id of ["mapEditorCityX","mapEditorCityY"])for(const type of ["input","change"])$(id).addEventListener?.(type,syncCityRegionPreview);
  const numeric=(id,label,min,max)=>{const input=$(id);if(!input.value.trim())throw new Error(`${label}不能为空`);const value=Number(input.value);if(!Number.isInteger(value)||value<min||(max!==undefined&&value>max))throw new Error(`${label}需为 ${min}${max===undefined?" 以上":`–${max}`} 的整数`);return value};
  $("mapEditorSaveCity").onclick=()=>{
    if(pathDraft||riverDraft)return output(`请先完成并保存或取消正在绘制的${pathDraft?"道路":"河流"}。`);
    const id=$("mapEditorCity").value;
    try{
      const name=$("mapEditorCityName").value.trim();if(!name)throw new Error("城市名称不能为空");
      const patch={name,force:$("mapEditorCityForce").value,type:$("mapEditorCityType").value,level:numeric("mapEditorCityLevel","等级",1,5),x:numeric("mapEditorCityX","X 坐标",0,editor.width-1),y:numeric("mapEditorCityY","Y 坐标",0,editor.height-1),population:numeric("mapEditorCityPopulation","人口",0),garrison:numeric("mapEditorCityGarrison","守军",0),agriculture:numeric("mapEditorCityAgriculture","农产",0,100),commerce:numeric("mapEditorCityCommerce","商业",0,100),order:numeric("mapEditorCityOrder","治安",0,100)};
      editor.updateCity(id,patch);const result=editor.validate();syncCitySelects();syncCityForm();drawCanvas();
      output(result.ok?`据点 ${id} 已更新`:`据点 ${id} 已保存；校验发现：${result.errors.slice(0,3).join("；")}`);
    }catch(error){output(`保存失败：${error.message}`)}
  };
  $("mapEditorRemoveCity").onclick=()=>{const id=$("mapEditorCity").value;if(!id||!readyForTransfer())return;confirmAction(`remove:${id}`,`删除据点「${editor.city(id)?.name}」及其道路`,()=>{try{editor.removeCity(id);movingCity=false;refresh();output("据点与关联道路已删除，可撤销。")}catch(error){output(`删除失败：${error.message}`)}})};
  const syncRoadPick=()=>{if(pathDraft&&(pathDraft.from!==$("mapEditorRoadFrom").value||pathDraft.to!==$("mapEditorRoadTo").value)){pathDraft=null;output("端点已更改，已取消原道路草稿。")}roadPick.from=$("mapEditorRoadFrom").value;roadPick.to=$("mapEditorRoadTo").value;const selected=selectedLine("road");if(selected&&(selected.from!==roadPick.from||selected.to!==roadPick.to)){selectedRoadId="";adjustingLine=null;syncLineSelects()}};
  $("mapEditorRoadFrom").onchange=()=>{syncRoadPick();syncRoadInfo();drawCanvas()};$("mapEditorRoadTo").onchange=()=>{syncRoadPick();syncRoadInfo();drawCanvas()};
  $("mapEditorRoadConnect").onclick=()=>{const ok=editor.setRoad($("mapEditorRoadFrom").value,$("mapEditorRoadTo").value,true);syncRoadPick();syncRoadInfo();drawCanvas();output(ok?"已建立城市间通行关系；地图路径尚未绘制":"无法建立关系，请检查城市选择或现有连接")};
  $("mapEditorRoadDisconnect").onclick=()=>{if(!readyForTransfer())return;const route=selectedLine("road")||editor.customRoutes.find(item=>[item.from,item.to].sort().join("|")===[$("mapEditorRoadFrom").value,$("mapEditorRoadTo").value].sort().join("|"));if(route)editor.removeRoad(route.id);else editor.setRoad($("mapEditorRoadFrom").value,$("mapEditorRoadTo").value,false);refresh();output("通行关系与道路已移除，可撤销。")};
  $("mapEditorRoadDraw").onclick=startRoadDraft;
  $("mapEditorRoadUndoPoint").onclick=()=>{if(pathDraft?.points.length>1){(pathDraft.redo??=[]).push(pathDraft.points.pop());drawCanvas();output("已撤销最后一个道路路径点。")}else output("道路起点不能撤销。")};
  $("mapEditorRoadFinish").onclick=finishRoadDraft;
  $("mapEditorRoadCancel").onclick=()=>{pathDraft=null;drawCanvas();output("已取消道路绘制")};
  $("mapEditorRoadSelect").onchange=()=>{if(pathDraft||riverDraft){$("mapEditorRoadSelect").value=selectedRoadId;syncSelect($("mapEditorRoadSelect"));return output("请先保存或取消正在绘制的路径。")}selectLine("road",$("mapEditorRoadSelect").value)};
  $("mapEditorRoadAdjust").onclick=()=>toggleLineAdjustment("road");$("mapEditorRoadDelete").onclick=()=>deleteSelectedLine("road");
  $("mapEditorRoadClear").onclick=()=>{if(!readyForTransfer())return;confirmAction("clear-roads","清空所有道路及城市通行关系",()=>{editor.clearRoads();adjustingLine=null;refresh();output("全部道路已清空，可撤销。")})};
  $("mapEditorRiverSelect").onchange=()=>{if(pathDraft||riverDraft){$("mapEditorRiverSelect").value=selectedRiverId;syncSelect($("mapEditorRiverSelect"));return output("请先保存或取消正在绘制的路径。")}selectLine("river",$("mapEditorRiverSelect").value)};
  $("mapEditorRiverDraw").onclick=startRiverDraft;$("mapEditorRiverFinish").onclick=finishRiverDraft;
  $("mapEditorRiverUndoPoint").onclick=()=>{if(riverDraft?.points.length){(riverDraft.redo??=[]).push(riverDraft.points.pop());drawCanvas()}};
  $("mapEditorRiverCancel").onclick=()=>{riverDraft=null;syncLineSelects();drawCanvas();output("已取消河流绘制。")};
  $("mapEditorRiverAdjust").onclick=()=>toggleLineAdjustment("river");$("mapEditorRiverDelete").onclick=()=>deleteSelectedLine("river");
  $("mapEditorRiverRename").onclick=()=>{if(!readyForTransfer())return;const river=selectedLine("river");if(!river)return;try{editor.saveWaterway(river.id,$("mapEditorRiverName").value,river.points);refresh();output("河流名称已保存。")}catch(error){output(error.message)}};
  $("mapEditorRiverName").addEventListener?.("input",()=>{if(riverDraft){riverDraft.name=$("mapEditorRiverName").value;updateStatus()}});
  $("mapEditorRiverDeletePoint").onclick=()=>{if(!readyForTransfer())return;const river=selectedLine("river");if(!river||selectedRiverPoint<0)return;if(river.points.length<=2)return output("河流至少保留两个节点；整条移除请按「删除所选河流」。");try{const points=structuredClone(river.points);points.splice(selectedRiverPoint,1);editor.saveWaterway(river.id,river.name,points);selectedRiverPoint=-1;refresh();output("节点已删除，可撤销。")}catch(error){output(error.message)}};
  $("mapEditorRiverClear").onclick=()=>{if(!readyForTransfer())return;confirmAction("clear-rivers","清空全部河流",()=>{editor.clearWaterways();adjustingLine=null;refresh();output("全部河流已清空，可撤销。")})};
  $("mapEditorValidate").onclick=()=>{const result=editor.validate();output(result.ok?`校验通过。${result.warnings.length?`警告 ${result.warnings.length} 条：${result.warnings.slice(0,3).join("；")}`:"无警告。"}`:`校验失败 ${result.errors.length} 条：${result.errors.slice(0,6).join("；")}`)};
  $("mapEditorApply").onclick=async()=>{
    if(!readyForTransfer())return;
    const previousApplied=editor._applied;let applied=false;
    setApplying(true);
    try{
      const validation=editor.validate();if(!validation.ok)throw new Error(`校验未通过：${validation.errors.slice(0,5).join("；")}`);
      const target=source(),map=view(),game=map?(getState?.()||state):null;
      const removed=new Set(target.cities.filter(city=>!editor.city(city.id)).map(city=>city.id));
      if(game?.orders?.some(order=>[...(order.cityIds||[]),...(order.targetIds||[])].some(id=>removed.has(id))))throw new Error("被删除据点仍有待执行命令，请先取消对应命令");
      if(!map){
        if(!scenarioMaps)throw new Error("剧本地图存储不可用，请导出备份");
        const base=await originalScenario(),record={version:1,scenarioId:target.scenario.id,savedAt:new Date().toISOString(),baseFingerprint:ScenarioMapStore.fingerprint(base),patch:editor.exportPatch()};
        ScenarioMapStore.prepare(base,record);await scenarioMaps.put(record.scenarioId,record);
        if(view()||source()!==target)throw new Error("剧本地图已保存，编辑上下文已变化，请重新打开编辑器");
        editor.applyTo(target);applied=true;savedScenarioRecord=record;target.meta={...target.meta,scenarioMap:{status:"saved",savedAt:record.savedAt,baseFingerprint:record.baseFingerprint}};scenarioStatus();onScenarioChanged?.();
      }else{game?.captureBaseWorld?.();editor.applyTo(target);applied=true}
      if(map){
        map.refreshSupply(true);
        if(game?.selected?.type==="city")game.select?.("city",target.cities.find(city=>city.id===game.selected.value.id)||target.cities[0]);
        else if(game?.selected?.type==="cell"&&map.cell){const selected=map.cell(game.selected.value.x,game.selected.value.y);if(selected)game.select?.("cell",selected)}
        game?.emit?.("mapEdited");
        if(game?.save){game.save("manual",game.saveSlot||"1");await game.flushPersistence?.()}
      }
      await saveDraftNow();output(map?"舆图已应用并保存到当前存档。":"剧本地图已保存，新开局自动使用。");toast(map?"舆图已应用并保存":"剧本地图已保存");
    }catch(error){if(applied)editor._applied=previousApplied;output(`${applied?"舆图已应用，存档保存失败":"应用失败"}：${error.message}`)}
    finally{setApplying(false);updateStatus()}
  };
  $("mapEditorLoadScenario").onclick=loadSavedScenario;$("mapEditorResetScenario").onclick=resetScenario;
  $("mapEditorExportPatch").onclick=()=>{if(!readyForTransfer())return;try{const patch=editor.exportPatch();$("mapEditorJson").value=JSON.stringify(patch,null,2);downloadJson?.(patch,"map-editor.patch.json");output("已导出地图补丁，包含地形、州郡、据点、县治与道路。")}catch(error){output(`导出失败：${error.message}`)}};
  $("mapEditorExportScenario").onclick=()=>{if(!readyForTransfer())return;try{const scenario=editor.exportScenario();$("mapEditorJson").value=JSON.stringify(scenario,null,2);downloadJson?.(scenario,`${source().scenario?.id||"scenario"}-map.json`);output("已导出完整剧本。")}catch(error){output(`导出失败：${error.message}`)}};
  function importText(text){if(!readyForTransfer())return;try{if(text.length>12*1024*1024)throw new Error("文件超过 12 MB");editor.importText(text);movingCity=false;refresh();output("已导入并通过校验，可撤销此次导入。")}catch(error){output(`导入失败：${error.message}`)}}
  $("mapEditorImport").onclick=()=>importText($("mapEditorJson").value);
  $("mapEditorImportFile").onclick=()=>$("mapEditorFile").click();
  $("mapEditorFile").onchange=async()=>{const file=$("mapEditorFile").files?.[0];if(!file)return;try{if(file.size>12*1024*1024)throw new Error("文件超过 12 MB");const text=await file.text();importText(text);$("mapEditorJson").value=text}catch(error){output(`文件读取失败：${error.message}`)}finally{$("mapEditorFile").value=""}};
  $("mapEditorCopyJson").onclick=async()=>{const text=$("mapEditorJson").value;if(!text)return output("先导出内容后再复制。");try{await navigator.clipboard.writeText(text);output("已复制内容。")}catch{$("mapEditorJson").focus?.();$("mapEditorJson").select?.();output("已选中内容，可按 Ctrl 或 ⌘ C 复制。")}};
  $("mapEditorRestoreDraft").onclick=()=>{if(!pendingRecovery)return;try{restoreDraft(pendingRecovery)}catch(error){output(`草稿恢复失败：${error.message}`)}};
  $("mapEditorDiscardDraft").onclick=async()=>{try{await draftStore?.remove(draftKey);pendingRecovery=null;$("mapEditorDraftNotice").hidden=true;saveDraftNow();output("旧草稿已放弃，当前编辑内容保留。")}catch(error){output(`草稿清理失败：${error.message}`)}};
  async function open(){
    onOpen?.();const current=source(),nextKey=contextKey(),changed=current&&(current!==editor.source||fingerprint(new MapEditor(current)._applied)!==fingerprint(editor._applied)),contextChanged=changed||draftKey!==nextKey;
    if(contextChanged){saveDraftNow();editor.load(current);pathDraft=null;riverDraft=null;selectedRoadId="";selectedRiverId="";adjustingLine=null;selectedRiverPoint=-1;cityFormDirty=false;movingCity=false;roadPick.from="";roadPick.to="";brushMemory.terrain=null;brushMemory.province=null;brushMemory.commandery=null;pendingRecovery=null;draftKey=nextKey;draftSaved=false}
    $("mapEditorApply").textContent=view()?"应用并保存":"保存剧本";
    $("mapEditorApply").dataset.tip=view()?"保存当前战局的地图":"保存此剧本的地图，新开局自动使用";
    if(!dialog.open)dialog.showModal();if(!initialized){dialog.classList.add("os-dialog-maximized");initialized=true}
    refresh();if(contextChanged||!dialog.dataset.editorLoaded){dialog.dataset.editorLoaded="true";await loadDraft()}await loadScenarioInfo();
    applyCanvasZoom(true);drawCanvas();
  }
  if(window.ResizeObserver&&viewport)new window.ResizeObserver(()=>{if(dialog.open&&zoom===1)applyCanvasZoom(true)}).observe(viewport);
  return {editor,open,refresh};
};
