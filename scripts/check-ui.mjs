// DOM workflow simulation. This does not substitute for a rendered browser review.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
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
assert.equal(getSession().settings.viewMode,'space');
$('seeing').value=3;await event('seeing','input');
assert.equal(getSession().settings.seeing,3);
await settings({settingClouds:false});
$('startTime').value='2026-10-07T00:00';$('interval').value=12;await click('beginSession');
assert.equal(getSession().start,Date.UTC(2026,9,7));
assert.ok($('targets').children.length>=2);
const first=document.querySelector('[data-target]');first.click();await settle();
assert.equal($('recordMeasurement').disabled,false);assert.ok($('measureX').value);
await event('measurementForm','submit');assert.equal(getSession().measurements.length,1);
await event('measurementForm','submit');assert.equal(getSession().measurements.length,1);assert.match($('status').textContent,/replaced/);
// Hidden names require identification, hidden distances require a measured scale.
await settings({settingIdentify:false,settingDistances:false});
assert.match($('targets').textContent,/Target 1/);assert.doesNotMatch($('targets').textContent,/Io|Europa|Ganymede|Callisto/);
document.querySelector('[data-target]').click();assert.equal($('measureMoon').value,'');assert.equal($('measureX').value,'');
await event('measurementForm','submit');assert.equal(getSession().measurements.length,1);
await settings({settingIdentify:true,settingDistances:true});
// Build an actual observing record using the same accessible selections as students.
for(let i=0;i<42;i++){
  await click('nextTime');
  for(const id of Array.from(document.querySelectorAll('[data-target]'),b=>b.dataset.target)){
    document.querySelector(`[data-target="${id}"]`).click();await event('measurementForm','submit');
  }
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
const before=+$('rms').textContent;await click('refine');assert.ok(+$('rms').textContent<before);
assert.ok(Math.abs(getSession().fits.callisto.period-16.69)<.2);
assert.equal($('fitForm').checkValidity(),true,'refined numeric values remain valid');
assert.match($('massResults').textContent,/e\+27/);
$('showResiduals').checked=true;await event('showResiduals','change');assert.match($('plot').innerHTML,/Residuals/);
$('fitFrom').value=1;$('fitTo').value=19;await click('applyRange');assert.deepEqual(getSession().ranges.callisto,[1,19]);
$('fitFrom').value=20;$('fitTo').value=10;await click('applyRange');assert.deepEqual(getSession().ranges.callisto,[1,19]);
// Inclusion flags and edits must change the same notebook state used by fits.
const checkbox=document.querySelector('[data-include]');checkbox.checked=false;checkbox.dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(getSession().measurements.find(p=>p.id===+checkbox.dataset.include).include,false);
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
assert.equal($('targets').children.length,0);assert.equal($('recordMeasurement').disabled,true);await click('nextTime');
$('viewMode').value='space';await event('viewMode','change');assert.ok($('targets').children.length>0,'space telescope cannot be clouded out');
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
console.log(JSON.stringify({status:'passed',observations:count,checks:'record, duplicate, hidden identity/distance, manual/refined fits, range, residuals, exclude/edit, CSV/PNG report/print, save/open, clouds, restart lock, PIN, simulated WebMCP'},null,2));
window.close();
