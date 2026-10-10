window.MapView = class MapView {
  constructor(canvas,frame,state){
    this.canvas=canvas;this.frame=frame;this.state=state;canvas.width=1;canvas.height=1;this.ctx=canvas.getContext("2d");if(!this.ctx)throw new Error("浏览器无法创建地图画布");this.scale=1;this.offset={x:0,y:0};this.hover=null;this.drag=null;this.plannedRoute=[];this.hiddenLegendItems=new Set();this.canvasPixelBudget=2000000;this.territoryRadius=5;
    this.seaLabels=[{name:"渤海",x:33,y:9},{name:"黄海",x:35,y:15},{name:"东海",x:35,y:21},{name:"南海",x:29,y:29}];
    this.landLabels=[{name:"河西走廊",x:4,y:9},{name:"黄土高原",x:12,y:12},{name:"幽燕",x:21,y:4},{name:"河北",x:21,y:9},{name:"关中",x:12,y:16},{name:"中原",x:21,y:16},{name:"巴蜀",x:7,y:24},{name:"荆楚",x:18,y:25},{name:"江东",x:29,y:23},{name:"岭南",x:19,y:30}];
    this.routes=Object.entries(state.data.rules.city_graph||{}).flatMap(([a,targets])=>targets.filter(b=>a<b).map(b=>[a,b]));
    this.waterways=[
      {name:"黄河",points:[[0,11],[4,11],[7,9],[10,10],[13,12],[16,12],[18,13],[20,12],[23,11],[26,10],[29,11],[30,9]]},
      {name:"长江",points:[[0,27],[5,26],[8,24],[11,24],[14,22],[17,23],[19,24],[22,23],[25,22],[28,23],[30,21]]},
      {name:"汉水",points:[[14,18],[15,20],[17,21],[19,23]]},
      {name:"淮水",points:[[20,18],[22,18],[24,19],[25,20],[27,20],[29,19]]},
      {name:"渭水",points:[[8,14],[11,14],[13,15],[16,16]]},
      {name:"辽水",points:[[29,2],[30,5],[31,7]]},
      {name:"海河",points:[[19,5],[21,7],[23,9],[24,10]]},
      {name:"湘水",points:[[18,31],[19,28],[19,26],[20,24]]},
      {name:"赣水",points:[[25,28],[25,26],[24,24],[24,23]]},
      {name:"珠江",points:[[14,31],[18,30],[22,30],[25,29]]}
    ];
    this.landmarks=[
      {name:"祁连山",x:5,y:12,type:"mountain"},{name:"太行山",x:16,y:9,type:"mountain"},{name:"泰山",x:27,y:12,type:"mountain"},
      {name:"秦岭",x:11,y:18,type:"mountain"},{name:"大巴山",x:10,y:22,type:"mountain"},{name:"洞庭湖",x:19,y:27,type:"lake"},
      {name:"鄱阳湖",x:24,y:25,type:"lake"},{name:"云梦泽",x:21,y:25,type:"lake"},{name:"巢湖",x:27,y:19,type:"lake"}
    ];
    this.cells=this.makeCells();this.bind();this.resize();
  }
  isLand(x,y){
    const spans=[[0,31],[0,34],[0,34],[0,33],[0,32],[0,31],[0,29],[0,28],[0,28],[0,28],[0,29],[0,30],[0,30],[0,29],[0,29],[0,29],[0,30],[0,30],[0,30],[0,30],[0,31],[0,31],[0,31],[0,32],[0,33],[0,32],[0,30],[0,28],[0,25],[0,24],[0,23],[0,22]];
    const mainland=y>=0&&y<spans.length&&x>=spans[y][0]&&x<=spans[y][1];
    const hainan=y>=29&&y<=30&&x>=21&&x<=23;const taiwan=y>=20&&y<=24&&x>=36&&x<=37;
    return mainland||hainan||taiwan;
  }
  isOcean(x,y){
    if(this.isLand(x,y))return false;
    const rightEdge=[31,34,34,33,32,31,29,28,28,28,29,30,30,29,29,29,30,30,30,30,31,31,31,32,33,32,30,28,25,24,23,22];
    if(y>=0&&y<rightEdge.length&&x>rightEdge[y])return true;
    if(y>=29)return x>=24;
    return false;
  }
  provinceAt(x,y){
    if(this.isOcean(x,y)){if(y<9)return"渤海";if(y<14)return"黄海";if(y<20)return"东海";return"南海"}
    if(!this.isLand(x,y))return"域外";
    if(x>=36&&y>=20&&y<=24)return"夷州";
    if(y<=7&&x>=21)return"幽州";if(y<=12&&x<17)return x<9?"凉州":"并州";if(y<=13&&x>=24)return"青州";if(y<=13&&x>=17)return"冀州";
    if(x<=12&&y<=18)return"凉州";if(x<=14&&y>=19)return"益州";if(y<=18&&x<=18)return"司隶";if(y<=15&&x>=27)return"青州";if(y<=19&&x>=27)return"徐州";if(y<=18&&x>=19&&x<=26)return x>=25?"徐州":"兖州";
    if(x>=24&&y>=18&&y<=27)return"扬州";if(y>=19&&x<=23)return"荆州";if(y>=28)return"交州";return"豫州";
  }
  terrainAt(x,y){
    if(this.isOcean(x,y))return"ocean";
    const variation=Math.sin(x*.95+y*.63)+Math.cos(y*.81-x*.29);
    if(!this.isLand(x,y)){
      if(y<7)return (x+y*2)%5===0?"mountain":"grassland";
      if(y<13)return (x+2*y)%4===0?"hills":x<5?"desert":"grassland";
      if(x<9||y>20)return (2*x+y)%4<2?"plateau":"mountain";
      return variation>1.1?"forest":"hills";
    }
    if(x<=6&&y>=6&&y<=13)return y===6||variation>1.1?"mountain":"desert";
    if(x>=4&&x<=13&&y>=8&&y<=15)return variation>.65?"hills":"grassland";
    if(x<=11&&y>=13&&y<=22)return variation>.9?"mountain":"plateau";
    if(x>=11&&x<=18&&y>=19&&y<=26)return (x===11||y===19||variation>1.35)?"mountain":"basin";
    if(x>=12&&x<=21&&y>=25)return variation>.4?"mountain":"plateau";
    if(x>=13&&x<=20&&y>=7&&y<=16)return variation>.6?"hills":"plateau";
    if(x>=26&&y<=5)return"mountain";if(y<=5)return variation>.55?"hills":"grassland";
    if((x+y*2)%13===0)return"forest";if(y>=19&&x>=23)return"marsh";return variation>1.35?"hills":"plains";
  }
  makeCells(){const {width,height}=this.state.data.map,cells=[],countySeats=this.state.data.counties||this.state.data.administrativeDivisions?.county_seats||[],adminSources=countySeats.length?countySeats:this.state.data.cities.filter(city=>city.commandery&&city.commandery!=="史籍未详"),countyByCell=new Map(countySeats.map(county=>[`${county.x},${county.y}`,county])),sources=this.state.data.cities.filter(city=>city.force===this.state.playerForceId).map(city=>({city,status:this.state.engine.citySupplyStatus(this.state,city.id)}));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const terrain=this.terrainAt(x,y),geographicProvince=this.provinceAt(x,y),nearest=sources.map(source=>({...source,distance:Math.hypot(x-source.city.x,y-source.city.y)})).sort((a,b)=>a.distance-b.distance)[0],admin=adminSources.map(seat=>({seat,distance:Math.hypot(x-seat.x,y-seat.y)})).sort((a,b)=>a.distance-b.distance||Number(b.seat.capital)-Number(a.seat.capital))[0]?.seat,county=countyByCell.get(`${x},${y}`)||null,province=terrain==="ocean"||geographicProvince==="域外"?geographicProvince:admin?.province||geographicProvince,terrainPenalty=["mountain","plateau","desert","marsh"].includes(terrain)?1:0,supply=terrain==="ocean"||province==="域外"||!nearest?0:Math.max(0,Math.min(9,nearest.status.level*2+3-Math.floor(nearest.distance/2)-terrainPenalty));cells.push({x,y,terrain,province,commandery:terrain==="ocean"||province==="域外"?null:admin?.commandery||"史籍未详",county,supply,supplySource:nearest?.city.id||null})}return cells;}
  cell(x,y){const {width,height}=this.state.data.map;return x>=0&&y>=0&&x<width&&y<height?this.cells[y*width+x]:null}
  scheduleDraw(){if(this.drawFrame)return;this.drawFrame=requestAnimationFrame(()=>{this.drawFrame=0;this.draw()})}
  refreshSupply(){this.cells=this.makeCells();this.draw()}
  bind(){
    new ResizeObserver(()=>this.resize()).observe(this.frame);
    this.bindInput();
    this.state.addEventListener("layer",()=>this.draw());this.state.addEventListener("turn",()=>this.refreshSupply());
  }
  bindInput(){
    this.disposeInput?.();this.drag=null;
    const canvas=this.canvas,listeners=[];
    const listen=(host,type,fn,options)=>{host.addEventListener(type,fn,options);listeners.push(()=>host.removeEventListener(type,fn,options))};
    canvas.style.touchAction="none";
    listen(canvas,"pointerdown",e=>{if(e.button!==0||e.isPrimary===false||this.drag)return;e.preventDefault();this.drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,ox:this.offset.x,oy:this.offset.y,moved:false};canvas.setPointerCapture(e.pointerId);this.tooltip(true)});
    listen(canvas,"pointermove",e=>this.onMove(e));
    listen(canvas,"pointerup",e=>{
      const drag=this.drag;if(!drag||drag.pointerId!==e.pointerId)return;
      const rect=canvas.getBoundingClientRect(),inside=e.clientX>=rect.left&&e.clientX<rect.right&&e.clientY>=rect.top&&e.clientY<rect.bottom;
      const hit=document.elementFromPoint(e.clientX,e.clientY),moved=drag.moved||Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>3;
      this.cancelDrag();if(e.button===0&&!moved&&inside&&hit===canvas)this.pick(e);
    });
    listen(canvas,"pointercancel",e=>{if(this.drag?.pointerId===e.pointerId)this.cancelDrag()});
    listen(canvas,"lostpointercapture",e=>{if(this.drag?.pointerId===e.pointerId)this.cancelDrag()});
    listen(canvas,"pointerleave",()=>{this.hover=null;this.tooltip(true);this.scheduleDraw()});
    listen(window,"blur",()=>this.cancelDrag());
    listen(document,"visibilitychange",()=>{if(document.hidden)this.cancelDrag()});
    listen(canvas,"wheel",e=>{e.preventDefault();this.cancelDrag();this.setZoom(this.scale+(e.deltaY<0?.15:-.15))},{passive:false});
    this.disposeInput=()=>{this.cancelDrag();listeners.forEach(remove=>remove())};
  }
  cancelDrag(){const id=this.drag?.pointerId;this.drag=null;this.hover=null;this.tooltip(true);if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);this.scheduleDraw()}
  resize(){const r=this.frame.getBoundingClientRect(),w=Math.max(1,Math.floor(r.width)),h=Math.max(1,Math.floor(r.height));if(this.size?.w===w&&this.size?.h===h)return;const ratio=Math.max(.5,Math.min(window.devicePixelRatio||1,1.5,Math.sqrt(this.canvasPixelBudget/(w*h)))),pixelW=Math.max(1,Math.floor(w*ratio)),pixelH=Math.max(1,Math.floor(h*ratio));try{this.canvas.width=1;this.canvas.height=1;this.canvas.width=pixelW;this.canvas.height=pixelH;this.ctx.setTransform(ratio,0,0,ratio,0,0)}catch(error){console.warn("地图画布已降级为低内存模式",error);this.canvas.width=1;this.canvas.height=1;this.canvas.width=w;this.canvas.height=h;this.ctx.setTransform(1,0,0,1,0,0)}this.size={w,h};this.draw();}
  metrics(){const {width,height}=this.state.data.map,base=Math.max(1,Math.min((this.size.w-30)/width,(this.size.h-30)/height)),cell=base*this.scale;return {cell,startX:(this.size.w-width*cell)/2+this.offset.x,startY:(this.size.h-height*cell)/2+this.offset.y};}
  visibleBounds(m,padding=1){const {width,height}=this.state.data.map;return {minX:Math.max(0,Math.floor(-m.startX/m.cell)-padding),maxX:Math.min(width-1,Math.ceil((this.size.w-m.startX)/m.cell)+padding),minY:Math.max(0,Math.floor(-m.startY/m.cell)-padding),maxY:Math.min(height-1,Math.ceil((this.size.h-m.startY)/m.cell)+padding)}}
  inView(item,m,padding=2){const bounds=this.visibleBounds(m,padding);return item.x>=bounds.minX&&item.x<=bounds.maxX&&item.y>=bounds.minY&&item.y<=bounds.maxY}
  terrainDef(id){return this.state.data.terrainDefs[id]||{name:`未知地形(${id})`,color:"#59614d",move_cost:99,move:99}}
  onMove(e){const r=this.canvas.getBoundingClientRect();if(this.drag){if(!(e.buttons&1)){this.cancelDrag();return}if(e.pointerId!==this.drag.pointerId)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.abs(dx)+Math.abs(dy)>3)this.drag.moved=true;if(this.drag.moved){this.offset.x=this.drag.ox+dx;this.offset.y=this.drag.oy+dy}this.tooltip(true);this.scheduleDraw();return}if(e.buttons)return;this.hover=this.cellAt(e.clientX-r.left,e.clientY-r.top);if(this.hover){document.getElementById("cursorInfo").textContent=`坐标 ${String(this.hover.x).padStart(2,"0")},${String(this.hover.y).padStart(2,"0")} · ${this.hover.province}${this.hover.commandery?` · ${this.hover.commandery}`:""}${this.hover.county?` · ${this.hover.county.name}县治`:""} · ${this.terrainDef(this.hover.terrain).name}`;this.tooltip(false,e.clientX-r.left,e.clientY-r.top)}else this.tooltip(true);this.scheduleDraw();}
  cellAt(px,py){const m=this.metrics(),x=Math.floor((px-m.startX)/m.cell),y=Math.floor((py-m.startY)/m.cell);return this.cell(x,y)}
  pick(e){const r=this.canvas.getBoundingClientRect(),cell=this.cellAt(e.clientX-r.left,e.clientY-r.top);if(!cell)return;const city=this.state.data.cities.find(c=>c.x===cell.x&&c.y===cell.y);this.state.select(city?"city":"cell",city||cell);this.draw();}
  setZoom(value){this.scale=Math.max(.65,Math.min(3.4,Math.round(value*20)/20));document.getElementById("zoomLabel").textContent=`${Math.round(this.scale*100)}%`;this.draw();}
  center(){this.offset={x:0,y:0};this.setZoom(1);}
  setPlannedRoute(cityIds=[]){this.plannedRoute=cityIds;this.draw()}
  setLegendVisibility(key,visible){if(visible)this.hiddenLegendItems.delete(key);else this.hiddenLegendItems.add(key);this.draw()}
  legendHidden(key){return this.hiddenLegendItems.has(key)}
  static intelBands=[["守军薄弱",2000,0],["守军一般",6000,.34],["守军雄厚",12000,.67],["守军重兵",Infinity,1]];
  get intelBands(){return MapView.intelBands}
  intelBand(garrison){const value=Math.max(0,garrison||0),band=this.intelBands.find(item=>value<item[1])||this.intelBands.at(-1);return {label:band[0],limit:band[1],heat:band[2]}}
  intelLevel(city){if(!city)return 0;if(city.force===this.state.playerForceId)return 3;return this.state.intelligence?.cities?.[city.id]||0}
  intelColor(heat,level,fade=1){const alpha=Math.max(.25,Math.min(1,fade)),lightness=Math.round((11+heat*24)*alpha+3);return `hsl(${Math.round(118-118*heat)}, ${level>=2?58:26}%, ${lightness}%)`}
  static intelEstimate(value,level){const count=Math.max(0,value||0);if(level<=0)return null;if(level<2)return count>=10000?`约${Math.max(1,Math.round(count/10000))}万`:`约${Math.max(1,Math.round(count/5000)*5)}千`;if(count>=10000)return `约${(count/10000).toFixed(1)}万`;return `约${Math.max(1,Math.round(count/1000))}千`}
  intelStrength(value,level){return MapView.intelEstimate(value,level)}
  color(cell){
    if(cell.terrain==="ocean")return this.legendHidden(this.terrainDef("ocean").name)?"#111b20":this.terrainDef("ocean").color;
    if(this.state.layer==="terrain")return this.legendHidden(this.terrainDef(cell.terrain).name)?"#30372f":this.terrainDef(cell.terrain).color;
    if(cell.province==="域外")return"#343c30";
    if(this.state.layer==="province"){if(this.legendHidden("州域"))return"#3b4034";const names=[...new Set(this.cells.filter(c=>c.terrain!=="ocean").map(c=>c.province))],i=names.indexOf(cell.province);return `hsl(${28+i*31}, 27%, ${28+(i%3)*4}%)`}
    if(this.state.layer==="commandery"){if(this.legendHidden("郡域"))return"#3b4034";const name=cell.commandery||"史籍未详",hue=[...name].reduce((sum,char)=>sum+char.charCodeAt(0),0)%360;return `hsl(${hue}, 30%, ${28+(hue%3)*3}%)`}
    if(this.state.layer==="supply"){const band=cell.supply>=6?"充足":cell.supply>=3?"一般":"匮乏";return this.legendHidden(band)?"#30372f":`hsl(${cell.supply*10}, 42%, ${20+cell.supply*3}%)`}
    if(this.state.layer==="intel"){const owner=this.politicalOwner(cell),level=this.intelLevel(owner.city);if(!level)return this.legendHidden("未查明")?"#0c100c":"#111711";const band=this.intelBand(owner.city.garrison);if(this.legendHidden(band.label))return "#111711";return this.intelColor(band.heat,level,1-owner.distance/(this.territoryRadius+2))}
    const owner=this.politicalOwner(cell);return owner.distance<this.territoryRadius&&!this.legendHidden(owner.force?.name)?owner.force.color:"#4c4e45";
  }
  colorWithAlpha(color,alpha){
    const match=/^#([0-9a-f]{6})$/i.exec(color||"");
    if(!match)return color;
    const value=Number.parseInt(match[1],16);
    return `rgba(${value>>16},${value>>8&255},${value&255},${alpha})`;
  }
  politicalOwner(cell){const cities=this.state.data.cities;let nearest=null,distance=Infinity;for(const city of cities){const value=Math.hypot(city.x-cell.x,city.y-cell.y);if(value<distance){distance=value;nearest=city}}return {force:this.state.data.forces.find(item=>item.id===(nearest?.force||"neutral")),distance,city:nearest};}
  lightenColor(color,amount=.42){const match=/^#([0-9a-f]{6})$/i.exec(color||"");if(!match)return color||"#ffe9a8";const value=Number.parseInt(match[1],16),mix=channel=>Math.round(channel+(255-channel)*amount);return `rgb(${mix(value>>16)},${mix(value>>8&255)},${mix(value&255)})`;}
  territoryOwner(cell,owners){const key=`${cell.x},${cell.y}`;if(!owners.has(key))owners.set(key,this.politicalOwner(cell));return owners.get(key);}
  isPlayerTerritory(cell,owners){if(!cell||cell.terrain==="ocean"||cell.province==="域外")return false;const owner=this.territoryOwner(cell,owners);return owner.force?.id===this.state.playerForceId&&owner.distance<this.territoryRadius;}
  drawPlayerTerritoryOutline(c,m,cells){
    if(this.state.observerMode)return;
    const force=this.state.data.forces.find(item=>item.id===this.state.playerForceId);if(!force||this.legendHidden(force.name))return;
    const owners=new Map(),sides=[[1,0],[0,1],[-1,0],[0,-1]],edges=[];
    for(const cell of cells){if(!this.isPlayerTerritory(cell,owners))continue;const open=sides.filter(([dx,dy])=>!this.isPlayerTerritory(this.cell(cell.x+dx,cell.y+dy),owners));if(open.length)edges.push({x:m.startX+cell.x*m.cell,y:m.startY+cell.y*m.cell,open})}
    if(!edges.length)return;
    const trace=(width,style)=>{c.strokeStyle=style;c.lineWidth=width;c.beginPath();for(const edge of edges)for(const [dx,dy] of edge.open){if(dx<0){c.moveTo(edge.x,edge.y);c.lineTo(edge.x,edge.y+m.cell)}else if(dx>0){c.moveTo(edge.x+m.cell,edge.y);c.lineTo(edge.x+m.cell,edge.y+m.cell)}else if(dy<0){c.moveTo(edge.x,edge.y);c.lineTo(edge.x+m.cell,edge.y)}else{c.moveTo(edge.x,edge.y+m.cell);c.lineTo(edge.x+m.cell,edge.y+m.cell)}}c.stroke()};
    c.save();c.lineCap="butt";c.setLineDash([Math.max(3,m.cell*.32),Math.max(2.4,m.cell*.26)]);
    trace(Math.max(1.6,m.cell*.14),"rgba(6,9,6,.85)");
    c.shadowColor=force.color;c.shadowBlur=Math.max(1.5,m.cell*.09);
    trace(Math.max(.8,m.cell*.07),this.lightenColor(force.color));
    c.restore();
  }
  draw(){
    if(!this.size)return;const c=this.ctx,m=this.metrics(),{width,height}=this.state.data.map,bounds=this.visibleBounds(m),visibleCells=this.cells.filter(cell=>cell.x>=bounds.minX&&cell.x<=bounds.maxX&&cell.y>=bounds.minY&&cell.y<=bounds.maxY);c.clearRect(0,0,this.size.w,this.size.h);c.fillStyle="#080d10";c.fillRect(0,0,this.size.w,this.size.h);
    this.cellColors=this.cells.map(cell=>this.color(cell));c.save();c.beginPath();c.rect(0,0,this.size.w,this.size.h);c.clip();for(const cell of visibleCells){const x=m.startX+cell.x*m.cell,y=m.startY+cell.y*m.cell;c.fillStyle=this.cellColors[cell.y*width+cell.x];c.fillRect(x,y,m.cell+.25,m.cell+.25);this.drawTerrainBlend(c,m,cell);this.drawAdministrativeEdges(c,m,cell);this.drawCoastEdges(c,m,cell)}this.drawColorEdges(c,m,visibleCells);
    if(!this.legendHidden("水道"))this.drawWaterways(c,m);if(!this.legendHidden("道路")){this.drawRoutes(c,m);this.drawPlannedRoute(c,m)}this.drawSupplyRoutes(c,m);if(m.cell>15)this.drawLabels(c,m);if(this.state.layer==="commandery"){this.drawCounties(c,m);this.drawCommanderyLabels(c,m)}this.drawLandmarks(c,m);this.drawPlayerTerritoryOutline(c,m,visibleCells);
    for(const city of this.state.data.cities){if(!this.inView(city,m))continue;
      const x=m.startX+(city.x+.5)*m.cell,y=m.startY+(city.y+.5)*m.cell,force=this.state.data.forces.find(f=>f.id===city.force),type=city.type||"city",markerKey=({pass:"关隘",ford:"渡口",port:"港口"})[type]||"城市",selected=this.state.selected.value===city,major=(city.level||1)>=4,size=Math.max(2.5,Math.min(major?6:(city.level||1)>=2?5:4,m.cell*(major?.38:.32)));
      if(this.legendHidden(markerKey))continue;c.fillStyle="#0b0e0b";c.strokeStyle=force?.color||"#777568";c.lineWidth=major?2.5:1.7;c.beginPath();
      if(type==="port"){c.moveTo(x,y-size);c.lineTo(x+size,y);c.lineTo(x,y+size);c.lineTo(x-size,y);c.closePath();c.fill();c.stroke()}else if(type==="pass"){c.moveTo(x-size,y-size);c.lineTo(x+size,y+size);c.moveTo(x-size,y+size);c.lineTo(x+size,y-size);c.stroke()}else if(type==="ford"){c.fillStyle="#a7d5df";c.font=`bold ${Math.max(10,Math.min(14,m.cell*.58))}px serif`;c.textAlign="center";c.fillText("≈",x,y+4)}else{c.rect(x-size,y-size,size*2,size*2);c.fill();c.stroke()}
      const nearby=this.state.data.cities.some(other=>other!==city&&Math.abs(other.x-city.x)<=2&&Math.abs(other.y-city.y)<=1),below=nearby&&(city.x+city.y)%2===0,countySeat=(this.state.data.counties||[]).find(county=>county.cityId===city.id),showLabel=this.state.layer==="commandery"?selected||this.scale>=1.65||this.scale>=1.3&&((city.level||1)>=4||countySeat?.rank==="major"):m.cell>=16||(m.cell>=9&&(city.level||1)>=3)||(city.level||1)>=4||selected;
      if(showLabel){c.fillStyle=major?"#f2e8bb":"#d9d2ad";c.font=`${major?"bold ":""}${Math.max(8,Math.min(11,m.cell*.42))}px ${getComputedStyle(document.body).fontFamily}`;c.textAlign="center";c.fillText(city.name,x,y+(below?size+10:-size-3))}if(selected){c.strokeStyle="#f0ce78";c.lineWidth=2;c.strokeRect(x-9,y-9,18,18)}
    }
    if(this.state.layer==="intel")this.drawIntel(c,m);
    this.drawSieges(c,m);this.drawBattles(c,m);this.drawArmyRoutes(c,m);this.drawArmies(c,m);
    if(this.hover){const hx=m.startX+this.hover.x*m.cell,hy=m.startY+this.hover.y*m.cell;c.strokeStyle="#fff2a8";c.lineWidth=2;c.strokeRect(hx+1,hy+1,m.cell-2,m.cell-2)}
    c.strokeStyle="#526051";c.strokeRect(m.startX,m.startY,width*m.cell,height*m.cell);c.restore();
  }
  isCoast(x,y){return this.isLand(x,y)&&[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>this.isOcean(x+dx,y+dy));}
  drawColorEdges(c,m,cells=this.cells){const {width}=this.state.data.map;c.lineWidth=Math.max(.7,m.cell*.035);for(const cell of cells){const index=cell.y*width+cell.x,x=m.startX+(cell.x+1)*m.cell,y=m.startY+(cell.y+1)*m.cell,right=this.cell(cell.x+1,cell.y),below=this.cell(cell.x,cell.y+1);c.strokeStyle="rgba(14,18,14,.58)";if(right&&this.cellColors[index]!==this.cellColors[index+1]){c.beginPath();c.moveTo(x,m.startY+cell.y*m.cell);c.lineTo(x,y);c.stroke()}if(below&&this.cellColors[index]!==this.cellColors[index+width]){c.beginPath();c.moveTo(m.startX+cell.x*m.cell,y);c.lineTo(x,y);c.stroke()}}}
  drawAdministrativeEdges(c,m,cell){const isProvince=this.state.layer==="province",isCommandery=this.state.layer==="commandery";if((!isProvince&&!isCommandery)||cell.terrain==="ocean"||this.legendHidden(isProvince?"州界":"郡界"))return;const field=isProvince?"province":"commandery",x=m.startX+cell.x*m.cell,y=m.startY+cell.y*m.cell,neighbors=[[1,0,"r"],[0,1,"b"]];c.strokeStyle=isProvince?"rgba(238,230,189,.8)":"rgba(247,221,146,.92)";c.lineWidth=isProvince?1.5:Math.max(1,m.cell*.09);for(const [dx,dy,side] of neighbors){const other=this.cell(cell.x+dx,cell.y+dy);if(other&&other.terrain!=="ocean"&&other[field]!==cell[field]){c.beginPath();if(side==="r"){c.moveTo(x+m.cell,y);c.lineTo(x+m.cell,y+m.cell)}else{c.moveTo(x,y+m.cell);c.lineTo(x+m.cell,y+m.cell)}c.stroke()}}}
  drawCommanderyLabels(c,m){if(this.legendHidden("郡名")||m.cell<8)return;const seats=this.state.data.counties||this.state.data.administrativeDivisions?.county_seats||[],grouped=new Map,occupied=[];for(const seat of seats)if(seat.capital||!grouped.has(seat.commandery))grouped.set(seat.commandery,seat);c.save();c.textAlign="center";c.textBaseline="middle";for(const [name,seat] of grouped){if(!this.inView(seat,m))continue;const label=name.replace(/[郡国]$/,"") ,x=m.startX+(seat.x+.5)*m.cell,y=m.startY+(seat.y-.35)*m.cell;c.font=`bold ${Math.max(7,Math.min(11,m.cell*.39))}px serif`;const width=c.measureText(label).width+5,rect={l:x-width/2,r:x+width/2,t:y-6,b:y+6};if(this.scale<1.25&&occupied.some(item=>!(rect.r<item.l||rect.l>item.r||rect.b<item.t||rect.t>item.b)))continue;occupied.push(rect);c.fillStyle="rgba(8,13,10,.76)";c.fillRect(rect.l,y-5,width,10);c.fillStyle="#eedb9b";c.fillText(label,x,y)}c.restore()}
  drawCounties(c,m){if(this.legendHidden("县治"))return;const seats=this.state.data.counties||this.state.data.administrativeDivisions?.county_seats||[],showAll=this.scale>=1.5,showAllNames=this.scale>=2.2;c.save();c.textAlign="center";for(const seat of seats){if(!this.inView(seat,m)||!showAll&&seat.rank==="county")continue;const x=m.startX+(seat.x+.5)*m.cell,y=m.startY+(seat.y+.5)*m.cell,size=Math.max(1.8,Math.min(3.8,m.cell*(seat.rank==="commandery"?.2:.15))),selected=this.state.selected.value?.county?.id===seat.id;if(!seat.cityId){c.fillStyle=seat.rank==="commandery"?"#f0cf7d":seat.rank==="major"?"#d6c17e":"#9f9a7c";c.strokeStyle=selected?"#fff2a8":"#15170f";c.lineWidth=selected?2:1;c.beginPath();c.moveTo(x,y-size);c.lineTo(x+size,y);c.lineTo(x,y+size);c.lineTo(x-size,y);c.closePath();c.fill();c.stroke()}const showName=showAllNames||seat.rank==="major"&&this.scale>=1.3;if(showName){c.font=`${Math.max(7,Math.min(10,m.cell*.32))}px serif`;c.fillStyle="#d8cfaa";c.fillText(seat.name,x,y+size+8)}}c.restore()}
  drawTerrainBlend(c,m,cell){if(this.state.layer!=="terrain"||cell.terrain==="ocean")return;const x=m.startX+cell.x*m.cell,y=m.startY+cell.y*m.cell,defs=this.state.data.terrainDefs;for(const [dx,dy,side] of [[1,0,"r"],[0,1,"b"]]){const other=this.cell(cell.x+dx,cell.y+dy);if(!other||other.terrain===cell.terrain||other.terrain==="ocean"||this.legendHidden(this.terrainDef(other.terrain).name))continue;try{let gradient;if(side==="r")gradient=c.createLinearGradient(x+m.cell*.65,y,x+m.cell,y);else gradient=c.createLinearGradient(x,y+m.cell*.65,x,y+m.cell);gradient.addColorStop(0,"rgba(0, 0, 0, 0)");gradient.addColorStop(1,this.colorWithAlpha(defs[other.terrain].color,.6));c.fillStyle=gradient;if(side==="r")c.fillRect(x+m.cell*.62,y,m.cell*.38,m.cell);else c.fillRect(x,y+m.cell*.62,m.cell,m.cell*.38)}catch(error){if(!this.gradientWarning){this.gradientWarning=true;console.warn("地形渐变已因浏览器兼容性停用",error)}}}}
  drawCoastEdges(c,m,cell){if(!this.isLand(cell.x,cell.y))return;const x=m.startX+cell.x*m.cell,y=m.startY+cell.y*m.cell,sides=[[0,-1,"t"],[1,0,"r"],[0,1,"b"],[-1,0,"l"]];c.strokeStyle="#070b09";c.lineWidth=2;for(const [dx,dy,side] of sides){if(!this.isOcean(cell.x+dx,cell.y+dy))continue;c.beginPath();if(side==="t"){c.moveTo(x,y);c.lineTo(x+m.cell,y)}else if(side==="r"){c.moveTo(x+m.cell,y);c.lineTo(x+m.cell,y+m.cell)}else if(side==="b"){c.moveTo(x,y+m.cell);c.lineTo(x+m.cell,y+m.cell)}else{c.moveTo(x,y);c.lineTo(x,y+m.cell)}c.stroke()}}
  traceOrthogonal(c,m,points){if(!points.length)return;const project=point=>[m.startX+(point[0]+.5)*m.cell,m.startY+(point[1]+.5)*m.cell],start=project(points[0]);c.beginPath();c.moveTo(start[0],start[1]);for(let i=1;i<points.length;i++){const [ax,ay]=points[i-1],[bx,by]=points[i];if(ax!==bx&&ay!==by){const bend=project(Math.abs(bx-ax)>=Math.abs(by-ay)?[bx,ay]:[ax,by]);c.lineTo(bend[0],bend[1])}const end=project([bx,by]);c.lineTo(end[0],end[1])}}
  traceGridEdges(c,m,points){if(!points.length)return;const px=x=>m.startX+x*m.cell,py=y=>m.startY+y*m.cell;c.beginPath();let [x,y]=points[0];c.moveTo(px(x),py(y));for(let i=1;i<points.length;i++){const [tx,ty]=points[i],dx=Math.sign(tx-x),dy=Math.sign(ty-y);while(x!==tx){x+=dx;c.lineTo(px(x),py(y))}while(y!==ty){y+=dy;c.lineTo(px(x),py(y))}}}
  roadEdges(){
    const cities=new Set(this.state.data.cities.map(city=>city.id)),graph=this.state.data.rules.city_graph||{},roads=[];
    for(const [from,targets] of Object.entries(graph))for(const to of targets)if(from<to&&cities.has(from)&&cities.has(to))roads.push([from,to]);
    return roads;
  }
  drawPlannedRoute(c,m){const route=this.plannedRoute.map(id=>this.state.data.cities.find(city=>city.id===id)).filter(Boolean);if(route.length<2)return;c.save();c.strokeStyle="#fff1a0";c.lineWidth=Math.max(2,m.cell*.18);c.setLineDash([m.cell*.3,m.cell*.15]);c.shadowColor="#d7a843";c.shadowBlur=6;this.traceOrthogonal(c,m,route.map(city=>[city.x,city.y]));c.stroke();c.restore()}
  drawRoutes(c,m){const cities=new Map(this.state.data.cities.map(city=>[city.id,city])),roads=this.roadEdges();c.setLineDash([]);for(const [aId,bId] of roads){const a=cities.get(aId),b=cities.get(bId);if(!a||!b)continue;this.traceOrthogonal(c,m,[[a.x,a.y],[b.x,b.y]]);c.strokeStyle=this.state.layer==="supply"?"rgba(134,116,62,.38)":"#47381e";c.lineWidth=Math.max(2,m.cell*.14);c.stroke();c.strokeStyle=this.state.layer==="supply"?"rgba(217,194,111,.35)":"#b89a53";c.lineWidth=Math.max(1,m.cell*.055);c.stroke()}}
  drawSupplyRoutes(c,m){if(this.state.layer!=="supply")return;for(const key of this.state.infrastructure.supplyRoutes||[]){const status=this.state.engine.assessSupplyRoute(this.state,key);if(this.legendHidden(status.active?"路线畅通":"路线中断"))continue;const route=status.path.map(id=>this.state.data.cities.find(city=>city.id===id)).filter(Boolean);if(route.length<2)continue;c.save();c.strokeStyle=status.active?"#93c86d":"#bd6658";c.lineWidth=Math.max(2,m.cell*.2);c.setLineDash(status.active?[]:[m.cell*.25,m.cell*.18]);c.shadowColor=status.active?"#93c86d":"#bd6658";c.shadowBlur=5;this.traceOrthogonal(c,m,route.map(city=>[city.x,city.y]));c.stroke();c.restore()}}
  drawWaterways(c,m){c.lineCap="round";c.lineJoin="round";for(const river of this.waterways){this.traceGridEdges(c,m,river.points);c.strokeStyle="#10222c";c.lineWidth=Math.max(3,m.cell*.24);c.stroke();c.strokeStyle="#55a7cb";c.lineWidth=Math.max(1.4,m.cell*.12);c.stroke();if(m.cell>18){const [x,y]=river.points[Math.floor(river.points.length/2)];c.fillStyle="#a8d2df";c.font=`${Math.min(9,m.cell*.35)}px serif`;c.fillText(river.name,m.startX+x*m.cell,m.startY+(y-.25)*m.cell)}}c.lineCap="butt"}
  drawLandmarks(c,m){if(m.cell<9||this.state.layer==="commandery"&&this.scale<1.25)return;c.font=`${Math.max(7,Math.min(9,m.cell*.34))}px ${getComputedStyle(document.body).fontFamily}`;c.textAlign="center";for(const site of this.landmarks){if(!this.inView(site,m))continue;const x=m.startX+(site.x+.5)*m.cell,y=m.startY+(site.y+.5)*m.cell;c.lineWidth=1;if(site.type==="mountain"){c.fillStyle="rgba(56,48,37,.72)";c.strokeStyle="#9e8b67";c.beginPath();c.moveTo(x-5,y+3);c.lineTo(x,y-5);c.lineTo(x+5,y+3);c.closePath();c.fill();c.stroke()}else if(site.type==="lake"){c.fillStyle="rgba(75,126,139,.62)";c.strokeStyle="#90bdc7";c.beginPath();c.ellipse(x,y,5,3,0,0,Math.PI*2);c.fill();c.stroke()}else if(site.type==="pass"){c.fillStyle="#201a12";c.fillRect(x-4,y-3,8,6);c.strokeStyle="#d69b52";c.strokeRect(x-4,y-3,8,6)}else if(site.type==="ford"){c.strokeStyle="#87bed1";c.beginPath();c.moveTo(x-4,y-3);c.lineTo(x+4,y+3);c.moveTo(x-4,y+3);c.lineTo(x+4,y-3);c.stroke()}else{c.fillStyle="#090b09";c.fillRect(x-2.5,y-2.5,5,5);c.strokeStyle="#ddd28a";c.strokeRect(x-3,y-3,6,6)}c.fillStyle=site.type==="lake"?"#94c4cb":site.type==="mountain"?"#b4a17a":site.type==="ford"?"#a7d5df":site.type==="pass"?"#e0ae68":"#c8c49a";c.fillText(site.name,x,y-7)}}
  drawIntel(c,m){
    c.save();c.textAlign="center";c.font=`${Math.max(7,Math.min(10,m.cell*.32))}px serif`;
    for(const city of this.state.data.cities){if(!this.inView(city,m))continue;const level=this.intelLevel(city);if(!level)continue;const text=this.intelStrength(city.garrison||0,level);if(!text)continue;const x=m.startX+(city.x+.5)*m.cell,y=m.startY+(city.y+.5)*m.cell,label=`守 ${text}`,width=c.measureText(label).width+6,top=y+m.cell*.55;
      c.fillStyle="rgba(6,10,8,.72)";c.fillRect(x-width/2,top,width,11);c.fillStyle=level>=2?"#f0e5b4":"#b9b18b";c.fillText(label,x,top+8.5)}
    for(const army of this.state.data.armies||[]){const city=this.state.data.cities.find(item=>item.id===army.city);if(!city||!this.inView(city,m))continue;const level=army.force===this.state.playerForceId?3:Math.max(this.state.intelligence?.armies?.[army.id]||0,this.intelLevel(city));if(level<1)continue;const x=m.startX+(city.x+.78)*m.cell,y=m.startY+(city.y+.7)*m.cell,text=this.intelStrength(army.soldiers,level);
      c.fillStyle=level>=3?"#ffe9a8":"#cbbd8c";c.fillText(text,x+8,y+3)}
    c.restore();
  }
  drawArmies(c,m){for(const army of this.state.data.armies||[]){const own=army.force===this.state.playerForceId,city=this.state.data.cities.find(item=>item.id===army.city);if(!city||!this.inView(city,m))continue;const intel=Math.max(this.state.intelligence.armies[army.id]||0,this.intelLevel(city));if(!own&&!intel)continue;const force=this.state.data.forces.find(item=>item.id===army.force),x=m.startX+(city.x+.78)*m.cell,y=m.startY+(city.y+.7)*m.cell;c.beginPath();c.moveTo(x,y-5);c.lineTo(x+5,y+4);c.lineTo(x-5,y+4);c.closePath();c.fillStyle=force?.color||"#ddd";c.fill();c.strokeStyle="#080b08";c.lineWidth=1;c.stroke();if(m.cell>19&&this.state.layer!=="intel"){c.fillStyle="#f0e9bc";c.font=`7px ${getComputedStyle(document.body).fontFamily}`;c.textAlign="left";c.fillText(own||intel>=1?`${Math.round(army.soldiers/1000)}K`:"?",x+6,y+3)}}}
  drawSieges(c,m){const groups=new Map;for(const army of this.state.data.armies||[]){if(!army.siegeTarget)continue;const visible=army.force===this.state.playerForceId||this.state.data.cities.find(city=>city.id===army.siegeTarget)?.force===this.state.playerForceId||(this.state.intelligence.armies[army.id]||0)>=2;if(!visible)continue;const key=`${army.force}:${army.siegeTarget}`;if(!groups.has(key))groups.set(key,army)}for(const army of groups.values()){const from=this.state.data.cities.find(city=>city.id===army.city),target=this.state.data.cities.find(city=>city.id===army.siegeTarget);if(!from||!target)continue;const x2=m.startX+(target.x+.5)*m.cell,y2=m.startY+(target.y+.5)*m.cell;c.save();c.strokeStyle="#e26b47";c.lineWidth=Math.max(1.5,m.cell*.12);c.setLineDash([Math.max(4,m.cell*.24),Math.max(2,m.cell*.15)]);this.traceOrthogonal(c,m,[[from.x,from.y],[target.x,target.y]]);c.stroke();c.setLineDash([]);c.beginPath();c.arc(x2,y2,9,0,Math.PI*2);c.stroke();c.fillStyle="#ffd08a";c.font=`bold ${Math.max(8,m.cell*.38)}px serif`;c.textAlign="center";c.fillText("围",x2,y2+3);c.restore()}}
  drawBattles(c,m){for(const city of this.state.data.cities.filter(v=>v.lastBattleTurn&&this.state.turn-v.lastBattleTurn<=1)){const visible=city.force===this.state.playerForceId||this.state.data.armies.some(a=>a.city===city.id&&a.force===this.state.playerForceId)||(this.state.intelligence.cities[city.id]||0)>=1;if(!visible)continue;const x=m.startX+(city.x+.5)*m.cell,y=m.startY+(city.y+.5)*m.cell;c.save();c.fillStyle="#ffcf75";c.strokeStyle="#5b1f18";c.lineWidth=3;c.font=`bold ${Math.max(11,m.cell*.55)}px serif`;c.textAlign="center";c.strokeText("⚔",x,y+4);c.fillText("⚔",x,y+4);c.restore()}}
  drawArmyRoutes(c,m){c.setLineDash([Math.max(3,m.cell*.24),Math.max(3,m.cell*.24)]);c.lineWidth=Math.max(1.5,m.cell*.12);for(const army of this.state.data.armies||[]){const own=army.force===this.state.playerForceId,intel=this.state.intelligence.armies[army.id]||0;if((!own&&intel<3)||!army.route?.length)continue;const route=[army.city,...army.route].map(id=>this.state.data.cities.find(city=>city.id===id)).filter(Boolean);if(route.length<2)continue;const force=this.state.data.forces.find(item=>item.id===army.force);c.strokeStyle=force?.color||"#e7d47e";this.traceOrthogonal(c,m,route.map(city=>[city.x,city.y]));c.stroke()}c.setLineDash([])}
  drawLabels(c,m){c.textAlign="center";for(const label of this.seaLabels){if(!this.inView(label,m))continue;c.fillStyle="rgba(130,169,173,.47)";c.font=`${Math.min(12,m.cell*.55)}px serif`;c.fillText(label.name,m.startX+(label.x+.5)*m.cell,m.startY+(label.y+.5)*m.cell)}if(this.state.layer!=="political")for(const label of this.landLabels){if(!this.inView(label,m))continue;c.fillStyle="rgba(216,204,164,.31)";c.font=`${Math.min(10,m.cell*.42)}px serif`;c.fillText(label.name,m.startX+(label.x+.5)*m.cell,m.startY+(label.y+.5)*m.cell)}}
  tooltip(hide,x=0,y=0){const tip=document.getElementById("mapTooltip");tip.hidden=hide;if(hide||!this.hover)return;const city=this.state.data.cities.find(c=>c.x===this.hover.x&&c.y===this.hover.y),county=this.hover.county,siege=city?.siegeTurns?`｜围城 ${city.siegeTurns*(Number.isInteger(this.state.date?.day)?10:1)}日｜城防 ${Math.max(0,100-(city.defenseDamage||0))}%`:"",battle=city?.lastBattleTurn&&this.state.turn-city.lastBattleTurn<=1?`｜${city.lastBattle}`:"",occupation=city?.occupiedUntil&&city.occupiedUntil>this.state.turn?`｜占领管制 ${city.occupiedUntil-this.state.turn}日`:"",commandery=city?.commandery||county?.commandery||this.hover.commandery,countyInfo=county?`｜编户 ${(county.population||0).toLocaleString()}｜农${county.agriculture} 商${county.commerce} 治${county.order}`:"";tip.textContent=city?`${city.name}${county?`（${county.name}县治）`:""}｜${city.province} · ${commandery||"郡属未详"}${countyInfo}${siege}${battle}${occupation}`:`${this.hover.province}${commandery?` · ${commandery}`:""}${county?` · ${county.name}县治`:""}${countyInfo}｜${this.terrainDef(this.hover.terrain).name}`;tip.style.left=`${Math.min(x+14,this.size.w-220)}px`;tip.style.top=`${Math.min(y+14,this.size.h-35)}px`;}
};
