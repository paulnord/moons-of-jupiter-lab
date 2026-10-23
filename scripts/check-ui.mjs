// DOM workflow simulation. This does not substitute for a rendered browser review.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {positions,DAY_MS,residualRms} from '../dist/engine.mjs';
const {JSDOM}=await import(process.env.JUPITER_JSDOM_MODULE || 'jsdom');
const dom=new JSDOM(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'https://example.test/'});
const {window}=dom,document=window.document;
Object.assign(globalThis,{window,document});
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const context=new Proxy({},{get:(_,key)=>key==='measureText'?()=>({width:50}):()=>{},set:()=>true});
window.HTMLCanvasElement.prototype.getContext=()=>context;
window.HTMLCanvasElement.prototype.toBlob=function(callback,type){assert.equal(this.width,4800);callback(new Blob([new Uint8Array([137,80,78,71])],{type}));};
globalThis.Image=class{set src(value){queueMicrotask(()=>this.onload());}};
const downloads=[];let lastBlob;
URL.createObjectURL=b=>(lastBlob=b,'blob:test');URL.revokeObjectURL=()=>{};
window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:lastBlob});};
const tools=new Map();document.modelContext={registerTool:tool=>tools.set(tool.name,tool)};
let prints=0;window.print=()=>prints++;
const {getSession}=await import('../dist/app.mjs');
const $=id=>document.getElementById(id);
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
async function waitFor(check){const deadline=Date.now()+2000;while(!check()){assert.ok(Date.now()<deadline,'asynchronous UI operation completed');await new Promise(resolve=>setTimeout(resolve,5));}}
async function click(id){$(id).click();await settle();}
async function event(id,type){$(id).dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));await settle();}
async function settings(values){await click('settingsButton');for(const [id,v]of Object.entries(values))$(id)[typeof v==='boolean'?'checked':'value']=v;await event('settingsForm','submit');await waitFor(()=>!$('settingsDialog').open);}
$('sky').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:360});
const visibleMoons=()=>positions(getSession().current).filter(p=>p.visible&&Math.abs(p.x)<15.8&&Math.abs(p.y)<4.3);
async function pointAt(p,offset=.63){
  const x=500-p.x*31.25+offset,y=180-p.y*31.25;
  $('sky').dispatchEvent(new window.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));await settle();
  if(!$('overlapPicker').hidden){const choice=document.querySelector(`[data-assign="${p.id}"]`);assert.ok(choice,'clicked moon is offered for an ambiguous actual pixel');choice.click();await settle();}
  return {x,y};
}
assert.equal($('targets'),null,'no predicted-center target selection is offered');
assert.equal(document.querySelector('.keyboard-targets,[data-target]'),null);
assert.equal($('refine'),null,'no automatic fitting control is offered');
assert.doesNotMatch(document.body.textContent,/Keyboard target selection|Refine fit|least.squares refinement/i);
assert.equal(getSession().settings.viewMode,'space');
$('seeing').value=3;await event('seeing','input');
assert.equal(getSession().settings.seeing,3);
await settings({settingClouds:false});
$('startTime').value='2026-10-07T00:00';$('interval').value=12;await click('beginSession');
assert.equal(getSession().start,Date.UTC(2026,9,7));
assert.ok(visibleMoons().length>=2);
const first=visibleMoons().sort((a,b)=>Math.abs(b.x)-Math.abs(a.x))[0],firstClick=await pointAt(first);
assert.equal($('recordMeasurement').disabled,false);assert.ok($('measureX').value);
assert.equal(getSession().measurements[0].pixel,firstClick.x,'record the clicked pixel, not a predicted moon center');
await event('measurementForm','submit');assert.equal(getSession().measurements.length,1);
await event('measurementForm','submit');assert.equal(getSession().measurements.length,1);assert.match($('status').textContent,/replaced/);
// Hidden names require identification, hidden distances require a measured scale.
await settings({settingIdentify:false,settingDistances:false});
assert.match($('skyDescription').textContent,/names are hidden/);assert.doesNotMatch($('skyDescription').textContent,/Io|Europa|Ganymede|Callisto/);
await pointAt(first);assert.equal($('measureMoon').value,'');assert.equal($('measureX').value,'');
await event('measurementForm','submit');assert.equal(getSession().measurements.length,1);
await settings({settingIdentify:true,settingDistances:true});
// Build an observing record using actual canvas click handlers, never target shortcuts.
for(let i=0;i<42;i++){
  await click('nextTime');
  for(const p of visibleMoons())await pointAt(p);
}
assert.ok(getSession().measurements.length>130);
const plotFrame=()=>({
  axes:Array.from($('plot').querySelector('svg').children).filter(el=>el.tagName==='text'||el.tagName==='path').map(el=>el.outerHTML),
  points:Array.from($('plot').querySelectorAll('circle'),el=>[el.getAttribute('cx'),el.getAttribute('cy')])
});
const measuredFrame=plotFrame();
$('fitAmplitude').value=13;$('fitPeriod').value=17;$('fitT0').value=7;
assert.equal($('fitForm').checkValidity(),true,'manual numeric estimates pass browser form constraints');
await event('fitForm','submit');assert.equal(getSession().fits.callisto.period,17);
assert.deepEqual(plotFrame(),measuredFrame,'adding a fit keeps the measured-data axes and point positions');
const fittedCurve=()=>$('plot').querySelector('path[stroke="#bf7915"]');
const initialCurve=fittedCurve().getAttribute('d');
$('amplitudeSlider').value=30;await event('amplitudeSlider','input');
assert.equal(getSession().fits.callisto.amplitude,30);
assert.deepEqual(plotFrame(),measuredFrame,'raising amplitude beyond the observations leaves the data and axes fixed');
assert.notEqual(fittedCurve().getAttribute('d'),initialCurve,'the fitted curve moves instead');
const curveYs=Array.from(fittedCurve().getAttribute('d').matchAll(/[ML][^, ]+,([^ ]+)/g),m=>Number(m[1]));
const clip=$('plot').querySelector('#clip rect'),clipTop=+clip.getAttribute('y'),clipBottom=clipTop+(+clip.getAttribute('height'));
assert.ok(Math.min(...curveYs)<clipTop&&Math.max(...curveYs)>clipBottom,'oversized curve extends above and below the data viewport');
assert.equal(fittedCurve().parentElement.getAttribute('clip-path'),'url(#clip)','oversized curve is clipped at the axes');
$('amplitudeSlider').value=13;await event('amplitudeSlider','input');
const before=+$('rms').textContent,s=getSession(),pts=s.measurements.filter(p=>p.moon==='callisto').map(p=>({t:(p.ms-s.start)/DAY_MS,x:p.x}));
const crossing=pts.findIndex((p,i)=>i>0&&pts[i-1].x<0&&p.x>=0);assert.ok(crossing>0);
const a=pts[crossing-1],b=pts[crossing],manualT0=Number((a.t-a.x*(b.t-a.t)/(b.x-a.x)).toFixed(3));
$('periodSlider').value=16.8;await event('periodSlider','input');
$('t0Slider').value=manualT0;await event('t0Slider','input');
assert.deepEqual(getSession().fits.callisto,{amplitude:13,period:16.8,t0:manualT0},'all manual choices are preserved exactly');
assert.ok(+$('rms').textContent<before,'a better manual phase/period estimate improves the diagnostic RMS');
assert.ok(Math.abs(+$('rms').textContent-residualRms(pts,getSession().fits.callisto))<.000006,'RMS describes the chosen curve');
assert.equal($('fitForm').checkValidity(),true,'manual slider values remain valid');
assert.deepEqual(plotFrame(),measuredFrame,'manual period and phase changes leave data and axes fixed');
const manualFit=getSession().fits.callisto;
assert.match($('fitWarning').textContent,/cycle count/);
assert.match($('massResults').textContent,/e\+27/);
$('showResiduals').checked=true;await event('showResiduals','change');assert.match($('plot').innerHTML,/Residuals/);
$('fitFrom').value=1;$('fitTo').value=19;await click('applyRange');assert.deepEqual(getSession().ranges.callisto,[1,19]);
$('fitFrom').value=20;$('fitTo').value=10;await click('applyRange');assert.deepEqual(getSession().ranges.callisto,[1,19]);
assert.deepEqual(getSession().fits.callisto,manualFit,'range selection never automatically adjusts the chosen parameters');
// Inclusion flags and edits must change the same notebook state used by fits.
const checkbox=document.querySelector('[data-include]');checkbox.checked=false;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(getSession().measurements.find(p=>p.id===+checkbox.dataset.include).include,false);
assert.deepEqual(getSession().fits.callisto,manualFit,'excluding a measurement never automatically adjusts the chosen parameters');
document.querySelector('[data-edit]').click();await settle();$('editX').value=-1.234;$('editNote').value='=student observation <b>literal</b>';await event('editForm','submit');
assert.equal(getSession().measurements[0].x,-1.234);assert.ok($('measurements').innerHTML.includes('&lt;b&gt;'));
$('student').value='Review team';await event('student','input');$('notes').value='Compare all four orbits.';await event('notes','input');
await click('exportCsv');const csv=await downloads.at(-1).blob.text();assert.match(csv,/"'-?=student|"'=student/);assert.ok(csv.includes('"-1.234"'));assert.ok(csv.startsWith('"Elapsed time (day)","Io east-positive (Jupiter diameters)"'));assert.equal(csv.split('\r\n').filter(Boolean).length,new Set(getSession().measurements.map(p=>p.ms)).size+1);
await click('exportPlot');assert.equal($('reportDialog').open,true);assert.equal($('reportMembers').value,'Review team');assert.equal($('reportScope').value,'all');assert.equal($('reportPreview').querySelectorAll('clipPath').length,4);
$('reportMembers').value='Review team\nSecond member';await event('reportMembers','input');assert.equal(getSession().student,'Review team\nSecond member');
await event('reportForm','submit');await waitFor(()=>downloads.at(-1).name.endsWith('.png'));assert.equal(downloads.at(-1).blob.type,'image/png');
$('reportScope').value='current';await event('reportScope','change');assert.equal($('reportPreview').querySelectorAll('clipPath').length,1);
await click('printReport');assert.equal(prints,1);assert.equal($('reportDialog').open,false);assert.match($('printedFigure').textContent,/Second member/);assert.match($('printedFigure').textContent,/Report date/);
await click('printLab');assert.equal($('reportDialog').open,true);await click('printReport');assert.equal(prints,2);
await click('saveSession');const saved=await downloads.at(-1).blob.text(),savedState=getSession();
await click('newSession');assert.equal(getSession().measurements.length,0);
const file={name:'restored.json',size:saved.length,text:async()=>saved};Object.defineProperty($('sessionFile'),'files',{value:[file],configurable:true});
await event('sessionFile','change');assert.equal($('confirmDialog').open,true);await click('confirmOk');await settle();
assert.deepEqual(getSession().measurements,savedState.measurements);assert.deepEqual(getSession().fits,savedState.fits);assert.deepEqual(getSession().ranges,savedState.ranges);assert.equal($('student').value,'Review team\nSecond member');
// Cloudy epochs become missing observations, not zero-valued measurements.
$('viewMode').value='ground';await event('viewMode','change');
await settings({settingClouds:true,settingPercent:100});const count=getSession().measurements.length,time=getSession().current;
assert.match($('skyDescription').textContent,/Clouds block/);assert.equal($('recordMeasurement').disabled,true);await pointAt(visibleMoons()[0]);assert.equal(getSession().measurements.length,count,'clouds prevent actual image clicks from recording');await click('nextTime');
$('viewMode').value='space';await event('viewMode','change');assert.doesNotMatch($('skyDescription').textContent,/Clouds block/,'space telescope cannot be clouded out');
$('viewMode').value='ground';await event('viewMode','change');
assert.ok(getSession().cloudLog.includes(time));assert.equal(getSession().measurements.length,count);
await settings({settingRestart:false});assert.equal($('previousTime').disabled,true);assert.equal($('newSession').disabled,true);assert.equal($('loadSession').disabled,true);
const lockedTime=getSession().current;await click('previousTime');assert.equal(getSession().current,lockedTime);
// Feature-detected browser tool registration: same validation and state.
assert.equal(tools.size,2);const read=tools.get('read_jupiter_lab_session'),advance=tools.get('advance_jupiter_observation');
assert.equal(read.execute({}).measurements.length,count);assert.throws(()=>read.execute({unexpected:true}));assert.throws(()=>advance.execute({unexpected:true}));
const result=advance.execute({});assert.equal(Date.parse(result.utc),lockedTime+12*3600000);assert.equal(result.cloudedOut,true);
await settings({settingPin:'2468'});await click('settingsButton');assert.equal($('pinDialog').open,true);
$('pinEntry').value='wrong';await event('pinForm','submit');await waitFor(()=>!$('pinError').hidden);assert.equal($('pinError').hidden,false);
$('pinEntry').value='2468';await event('pinForm','submit');await waitFor(()=>$('settingsDialog').open);assert.equal($('settingsDialog').open,true);
console.log(JSON.stringify({status:'passed',observations:count,checks:'manual-only controls, real image clicks, duplicate, hidden identity/distance, manual amplitude/period/phase and RMS, stable axes, range, residuals, exclude/edit, CSV/PNG report/print, save/open, clouds, restart lock, PIN, simulated WebMCP'},null,2));
window.close();
