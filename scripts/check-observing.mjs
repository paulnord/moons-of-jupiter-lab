import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {positions,validateSession,DAY_MS} from '../dist/engine.mjs';
const dom=new JSDOM(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'https://example.test/'});
const {window}=dom;Object.assign(globalThis,{window,document:window.document});
let drawnMarkers=[],path=[];
const skyContext=new Proxy({
  clearRect(){drawnMarkers=[];},beginPath(){path=[];},
  moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},
  stroke(){if(this.strokeStyle==='#6dd3ec'&&path.length===8)drawnMarkers.push({x:path[0][0]+5,y:path[0][1]});}
},{get:(target,key)=>key in target?target[key]:()=>{}});
window.HTMLCanvasElement.prototype.getContext=function(){return this.id==='sky'?skyContext:new Proxy({},{get:()=>()=>{},set:()=>true});};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const {getSession}=await import('../dist/app.mjs');const $=id=>document.getElementById(id);
$('sky').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:360});
const settle=()=>new Promise(r=>setTimeout(r,0));
const event=async(id,type)=>{$(id).dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));await settle();};
const key=async(id,k,extra={})=>{$(id).dispatchEvent(new window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...extra}));await settle();};
const point=async(x,y)=>{$('sky').dispatchEvent(new window.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));await settle();};
const sky=p=>({x:500-p.x*31.25,y:180-p.y*31.25});
const marked=(x,y)=>drawnMarkers.some(p=>Math.abs(p.x-x)<1e-8&&Math.abs(p.y-y)<1e-8);
let p=positions(getSession().current).filter(p=>p.visible).sort((a,b)=>Math.abs(b.x)-Math.abs(a.x))[0],xy=sky(p);
await point(xy.x+.6,xy.y);assert.equal(getSession().measurements.length,1,'one click records');
assert.ok(marked(xy.x+.6,xy.y),'marker uses the actual clicked pixel');
let saved=getSession().measurements[0];assert.equal(saved.pixel,xy.x+.6);
const other=positions(getSession().current).find(q=>q.visible&&q.id!==p.id&&Math.abs(q.x-p.x)>1),otherXY=sky(other);
await point(otherXY.x,otherXY.y);assert.equal(drawnMarkers.length,2,'recording another moon keeps the first marker');
$('sky').dispatchEvent(new window.MouseEvent('pointermove',{clientX:10,clientY:10}));$('sky').dispatchEvent(new window.Event('pointerleave'));
assert.ok(marked(xy.x+.6,xy.y)&&marked(otherXY.x,otherXY.y),'markers remain when pointer leaves');
$('imageBrightness').value=2;await event('imageBrightness','input');assert.equal(drawnMarkers.length,2,'redrawing the image keeps all markers');
document.querySelector('[data-mag="200"]').click();assert.ok(marked(500+(xy.x+.6-500)*2,180+(xy.y-180)*2),'zoom preserves the measured location');
document.querySelector('[data-mag="100"]').click();assert.ok(marked(xy.x+.6,xy.y));
$('undoMeasurement').click();assert.equal(getSession().measurements.length,1);assert.equal(drawnMarkers.length,1,'undo removes only its moon marker');
await point(xy.x-.7,xy.y);assert.equal(getSession().measurements.length,1,'reclick replaces');assert.equal(getSession().measurements[0].id,saved.id);assert.equal(getSession().measurements[0].pixel,xy.x-.7);
assert.ok(marked(xy.x-.7,xy.y));assert.ok(!marked(xy.x+.6,xy.y),'reclick moves the marker without leaving the old one');
$('undoMeasurement').click();assert.equal(getSession().measurements[0].pixel,saved.pixel,'undo restores replaced point');
assert.ok(marked(xy.x+.6,xy.y),'undo restores the previous marker');
const t=getSession().current;await key('sky','ArrowRight');assert.equal(getSession().current,t+12*3600000);await key('sky','ArrowLeft');assert.equal(getSession().current,t);
assert.equal(drawnMarkers.length,0,'moving between observations clears the markers');
await key('measureX','ArrowRight');assert.equal(getSession().current,t,'typing does not change observations');
$('imageBrightness').value=5;await event('imageBrightness','input');$('imageContrast').value=.7;await event('imageContrast','input');
assert.deepEqual(getSession().measurements,[saved],'image controls preserve measurements');
assert.equal(validateSession(getSession()).settings.brightness,5);assert.equal(validateSession(getSession()).settings.contrast,.7);
$('resetImage').click();assert.equal(getSession().settings.brightness,0);assert.equal(getSession().settings.contrast,1);
// Find an actual pair of illuminated moons within 5 detector pixels.
let overlap;
for(let dt=0;dt<25*DAY_MS&&!overlap;dt+=600000){const ms=t+dt,ps=positions(ms).filter(p=>p.visible&&Math.abs(p.x)>.7&&Math.abs(p.x)<15);
 for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)if(Math.hypot(ps[i].x-ps[j].x,ps[i].y-ps[j].y )*31.25<5){overlap={ms,pair:[ps[i],ps[j]]};break;}}
assert.ok(overlap);
$('startTime').value=new Date(overlap.ms).toISOString().slice(0,16);$('beginSession').click();await settle();$('confirmOk').click();await settle();
const [a,b]=overlap.pair.map(sky);await point((a.x+b.x)/2,(a.y+b.y)/2);
assert.equal($('overlapPicker').hidden,false);assert.equal(getSession().measurements.length,0,'ambiguous click waits');
document.querySelector('[data-assign="all"]').click();await settle();
let both=getSession().measurements;assert.equal(both.length,2);assert.equal(both[0].pixel,both[1].pixel);assert.equal(both[0].x,both[1].x);assert.ok(both.every(p=>p.overlap.length===2));
assert.equal(drawnMarkers.length,1,'both moons can share one visible marker at the clicked position');
assert.deepEqual(validateSession(getSession()).measurements,both,'overlap assignments survive save/open');
$('undoMeasurement').click();assert.equal(getSession().measurements.length,0,'both is one undo action');
assert.equal(drawnMarkers.length,0,'undo both removes the shared marker');
await point((a.x+b.x)/2,(a.y+b.y)/2);document.querySelector(`[data-assign="${overlap.pair[0].id}"]`).click();await settle();assert.equal(getSession().measurements.length,1);
await point((a.x+b.x)/2+.2,(a.y+b.y)/2);document.querySelector('[data-assign="all"]').click();await settle();assert.equal(getSession().measurements.length,2,'both replaces one and creates the other');
$('undoMeasurement').click();assert.equal(getSession().measurements.length,1,'mixed replacement undo restores one and removes the new one');
await point((a.x+b.x)/2,(a.y+b.y)/2);await key('sky','ArrowRight');assert.equal($('overlapPicker').hidden,true,'navigation cancels pending choice');
$('settingsButton').click();$('settingRestart').checked=false;await event('settingsForm','submit');const locked=getSession().current;await key('sky','ArrowLeft');assert.equal(getSession().current,locked,'keyboard respects instructor lock');
assert.equal($('previousTime').closest('.telescope-panel')!==null,true,'navigation stays beside image');
console.log(JSON.stringify({status:'passed',checks:'single-click recording, replacement, undo, keyboard scope, image control persistence, real moon overlap, either/both, mixed undo, pending cancellation, instructor lock'}));window.close();
