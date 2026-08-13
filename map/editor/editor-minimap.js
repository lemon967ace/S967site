import { MAP_MAX_X, MAP_MAX_Y, MAP_MIN_X, MAP_MIN_Y } from "./editor-model.js";
import { DEFAULT_TILE_HEIGHT, DEFAULT_TILE_WIDTH, gridToScene, sceneToGrid } from "./editor-coordinates.js";
import { screenToScene } from "./editor-renderer.js";

export const MINIMAP_LAYER_ORDER = Object.freeze(["fixedRanges", "userRanges", "fixedBuildings", "userBuildings", "viewport"]);
export const MINIMAP_BIN_COUNT = 192;
const MAP_CORNER_CELLS=[[MAP_MIN_X,MAP_MIN_Y],[MAP_MAX_X-1,MAP_MIN_Y],[MAP_MAX_X,MAP_MAX_Y],[MAP_MIN_X+1,MAP_MAX_Y]];
export function minimapMapPolygon(){return MAP_CORNER_CELLS.map(point=>gridToScene(...point))}

export function minimapSceneBounds() {
  const points=minimapMapPolygon();
  return {minX:Math.min(...points.map(p=>p[0]))-DEFAULT_TILE_WIDTH/2,maxX:Math.max(...points.map(p=>p[0]))+DEFAULT_TILE_WIDTH/2,minY:Math.min(...points.map(p=>p[1]))-DEFAULT_TILE_HEIGHT/2,maxY:Math.max(...points.map(p=>p[1]))+DEFAULT_TILE_HEIGHT/2};
}

export function createMinimapProjection(width,height,padding=8){const bounds=minimapSceneBounds(),scale=Math.min((width-padding*2)/(bounds.maxX-bounds.minX),(height-padding*2)/(bounds.maxY-bounds.minY));const offsetX=(width-(bounds.maxX-bounds.minX)*scale)/2-bounds.minX*scale,offsetY=(height-(bounds.maxY-bounds.minY)*scale)/2-bounds.minY*scale;return {width,height,padding,scale,offsetX,offsetY,bounds,sceneToMini(x,y){return[x*scale+offsetX,y*scale+offsetY]},miniToScene(x,y){return[(x-offsetX)/scale,(y-offsetY)/scale]}}}

export function viewportScenePolygon(viewport){return [[0,0],[viewport.width,0],[viewport.width,viewport.height],[0,viewport.height]].map(point=>screenToScene(...point,viewport))}
export function projectViewport(viewport,projection){return viewportScenePolygon(viewport).map(point=>projection.sceneToMini(...point))}
export function minimapPointToGrid(x,y,projection){return sceneToGrid(...projection.miniToScene(x,y))}

export function buildMinimapData(document,{bins=MINIMAP_BIN_COUNT}={}){
  const bounds=minimapSceneBounds(),rangeMarks=new Map();
  const addRanges=(ranges,fixed)=>{for(const range of ranges)for(const cell of range.cells){const [sx,sy]=gridToScene(...cell),bx=Math.max(0,Math.min(bins-1,Math.floor((sx-bounds.minX)/(bounds.maxX-bounds.minX)*bins))),by=Math.max(0,Math.min(bins-1,Math.floor((sy-bounds.minY)/(bounds.maxY-bounds.minY)*bins))),key=`${fixed?"f":"u"}|${range.kind}|${range.color}|${bx}|${by}`;if(!rangeMarks.has(key))rangeMarks.set(key,{fixed,kind:range.kind,color:range.color,bx,by})}};
  addRanges(document.fixedRanges,true);addRanges(document.ranges,false);
  const building=(item,fixed)=>{const [sceneX,sceneY]=gridToScene(item.x,item.y);return{fixed,sceneX,sceneY,width:item.width,height:item.height,typeId:item.typeId}};
  return {bins,rangeMarks:[...rangeMarks.values()],fixedBuildings:document.fixedBuildings.map(item=>building(item,true)),userBuildings:document.buildings.map(item=>building(item,false)),sourceCounts:{rangeCells:document.fixedRanges.concat(document.ranges).reduce((n,r)=>n+r.cells.length,0),rangeMarks:rangeMarks.size,buildings:document.fixedBuildings.length+document.buildings.length}};
}

export function createMinimap({host,renderer,getDocument,collapsed=false,onCollapseChange=()=>{}}){
  const dataCanvas=document.createElement("canvas"),overlayCanvas=document.createElement("canvas");dataCanvas.id="minimapCanvas";overlayCanvas.className="minimap-viewport-canvas";dataCanvas.setAttribute("aria-label","Map overview");overlayCanvas.setAttribute("aria-label","Current viewport; click or drag to navigate");overlayCanvas.tabIndex=0;host.append(dataCanvas,overlayCanvas);let data=buildMinimapData(getDocument()),projection=null,viewport=renderer.getState(),isCollapsed=collapsed,drag=null,frame=0;
  const resizeObserver=new ResizeObserver(resize),themeObserver=new MutationObserver(()=>invalidate(true));resizeObserver.observe(host);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme","class","style"]});
  function resize(){const rect=host.getBoundingClientRect(),dpr=Math.max(1,globalThis.devicePixelRatio||1);for(const canvas of [dataCanvas,overlayCanvas]){canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`;canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr))}projection=createMinimapProjection(rect.width,rect.height);invalidate(true)}
  function invalidate(dataDirty=false){if(dataDirty)dataCanvas.dataset.dirty="1";if(frame)return;frame=requestAnimationFrame(draw)}
  function context(canvas){const ctx=canvas.getContext("2d"),dpr=Math.max(1,globalThis.devicePixelRatio||1);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);return ctx}
  function draw(){frame=0;if(isCollapsed||!projection)return;if(dataCanvas.dataset.dirty==="1"){drawData();delete dataCanvas.dataset.dirty}drawViewport()}
  function drawData(){const ctx=context(dataCanvas),dark=document.documentElement.dataset.theme==="dark";ctx.fillStyle=dark?"#171a20":"#f3f5f8";ctx.fillRect(0,0,projection.width,projection.height);const corners=minimapMapPolygon().map(p=>projection.sceneToMini(...p));path(ctx,corners);ctx.fillStyle=dark?"#202631":"#fff";ctx.fill();ctx.strokeStyle=dark?"#7b8798":"#65758b";ctx.stroke();for(const mark of data.rangeMarks){const sx=projection.bounds.minX+(mark.bx+.5)/data.bins*(projection.bounds.maxX-projection.bounds.minX),sy=projection.bounds.minY+(mark.by+.5)/data.bins*(projection.bounds.maxY-projection.bounds.minY),[x,y]=projection.sceneToMini(sx,sy);ctx.globalAlpha=mark.fixed?.9:.62;ctx.fillStyle=mark.kind==="blocked"?"#dc2626":mark.color;ctx.fillRect(x-1.2,y-1.2,2.4,2.4)}ctx.globalAlpha=1;for(const item of [...data.fixedBuildings,...data.userBuildings]){const[x,y]=projection.sceneToMini(item.sceneX,item.sceneY);ctx.fillStyle=item.fixed?"#f59e0b":"#2563eb";const size=item.width===2?3.4:2.2;ctx.fillRect(x-size/2,y-size/2,size,size)}}
  function drawViewport(){const ctx=context(overlayCanvas),points=projectViewport(viewport,projection);path(ctx,points);ctx.fillStyle="rgba(124,58,237,.10)";ctx.fill();ctx.strokeStyle="#7c3aed";ctx.lineWidth=2;ctx.stroke()}
  function navigate(event){const rect=overlayCanvas.getBoundingClientRect(),grid=minimapPointToGrid(event.clientX-rect.left,event.clientY-rect.top,projection);if(grid)renderer.centerAtGrid(...grid)}
  function down(event){if(event.button!==0&&event.pointerType!=="touch")return;drag=event.pointerId;overlayCanvas.setPointerCapture(event.pointerId);navigate(event);event.preventDefault()}
  function move(event){if(drag===event.pointerId)navigate(event)}function up(event){if(drag===event.pointerId){drag=null;if(overlayCanvas.hasPointerCapture(event.pointerId))overlayCanvas.releasePointerCapture(event.pointerId)}}
  overlayCanvas.addEventListener("pointerdown",down);overlayCanvas.addEventListener("pointermove",move);overlayCanvas.addEventListener("pointerup",up);overlayCanvas.addEventListener("pointercancel",up);
  const api={setDocument(doc){data=buildMinimapData(doc);invalidate(true)},setViewport(next){viewport={...next};invalidate(false)},setCollapsed(value){isCollapsed=Boolean(value);host.hidden=isCollapsed;onCollapseChange(isCollapsed);if(!isCollapsed){resize();invalidate(true)}},isCollapsed:()=>isCollapsed,getData:()=>data,destroy(){if(frame)cancelAnimationFrame(frame);resizeObserver.disconnect();themeObserver.disconnect();dataCanvas.remove();overlayCanvas.remove()}};resize();return api;
}
function path(ctx,points){ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(...point):ctx.moveTo(...point));ctx.closePath()}
