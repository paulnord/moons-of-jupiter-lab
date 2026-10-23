// Exercise the real canvas click and fitting handlers; canvas rendering is mocked.
// This verifies measurements and controls, not rendered-browser appearance.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {MOONS,DAY_MS,positions,massFromFit,residualRms} from '../dist/engine.mjs';
const {JSDOM}=await import(process.env.JUPITER_JSDOM_MODULE || 'jsdom');
const dom=new JSDOM(await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'https://example.test/'});
const {window}=dom,document=window.document;
Object.assign(globalThis,{window,document});
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:()=>()=>{},set:()=>true});
const {getSession}=await import('../dist/app.mjs');
const $=id=>document.getElementById(id);
const settle=()=>new Promise(resolve=>setTimeout(resolve,0));
async function event(id,type){$(id).dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));await settle();}
async function click(id){$(id).click();await settle();}
async function estimate(amplitude,period,t0){
  $('fitAmplitude').value=amplitude;$('fitPeriod').value=period;$('fitT0').value=t0;
  assert.ok($('fitForm').checkValidity());await event('fitForm','submit');
}
assert.equal($('refine'),null,'students are not offered an automatic fit');
assert.equal($('targets'),null,'students must aim at the image, not select a predicted center');
assert.equal(document.querySelector('[data-target]'),null);

// Reproduce the reported bug without relying on an accurate initial estimate.
await estimate(5,17,0);
assert.match($('fitWarning').textContent,/Fewer than five/,'insufficient-data warning remains available with manual fitting');
assert.equal($('rms').textContent,'—','a curve without observations has no residual statistic');
$('amplitudeSlider').value=13.2;await event('amplitudeSlider','input');
assert.ok(Math.abs(getSession().fits.callisto.amplitude-13.2)<.001,
  'From an initial amplitude of 5, the slider must reach Callisto at 13.2 instead of stopping at 8');
await click('clearFit');

await click('settingsButton');$('settingClouds').checked=false;await event('settingsForm','submit');
$('startTime').value='2026-10-08T00:00';$('interval').value=12;await click('beginSession');
$('sky').getBoundingClientRect=()=>({left:0,top:0,width:1000,height:360});
const scale=1000/32;
// Hover identifies only illuminated, visible targets without filling a measurement.
const visible=positions(getSession().current).find(p=>p.visible&&Math.abs(p.x)<15);
const hx=500-visible.x*scale,hy=180-visible.y*scale;
$('sky').dispatchEvent(new window.MouseEvent('pointermove',{clientX:hx,clientY:hy}));
assert.equal($('moonHover').hidden,false);assert.match($('moonHover').textContent,new RegExp(visible.name));
assert.equal($('measureX').value,'','hover does not take a measurement');
$('sky').dispatchEvent(new window.Event('pointerleave'));assert.equal($('moonHover').hidden,true);

// Five weeks, every twelve hours, with deterministic subpixel aiming errors.
// Only ordinary visible targets are measured. No true positions go into fits.
for(let epoch=0;epoch<=70;epoch++){
  if(epoch)await click('nextTime');
  const current=positions(getSession().current);
  for(let i=0;i<current.length;i++){
    const p=current[i];
    if(!p.visible||Math.abs(p.x)>15.8||Math.abs(p.y)>4.3)continue;
    const x=500-p.x*scale+.8*Math.sin(epoch*1.73+i*2.41),y=180-p.y*scale;
    const before=getSession().measurements.length;
    $('sky').dispatchEvent(new window.MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
    await settle();
    // In ambiguous spots, explicitly assign the recorded click to this moon.
    if(!$('overlapPicker').hidden){const choice=document.querySelector(`[data-assign="${p.id}"]`);assert.ok(choice);choice.click();await settle();}
    if($('measureMoon').value!==p.id)continue;
    const s=getSession();assert.equal(s.measurements.length,before+1);
    const recorded=s.measurements.at(-1);
    assert.ok(Math.abs(recorded.pixel-x)<1e-9,'preserve the actual click');
    assert.ok(Math.abs(recorded.x-(500-x)/scale)<1e-12,'position is derived from the exact click');
    if(Math.abs(x-(500-p.x*scale))>.01)assert.notEqual(recorded.x,p.x,'measurement is not silently snapped to the ephemeris');
  }
}
const referencePeriods={io:1.769138,europa:3.551181,ganymede:7.154553,callisto:16.689017};
const results=[];
for(const m of MOONS){
  $('analysisMoon').value=m.id;await event('analysisMoon','change');
  const s=getSession(),points=s.measurements.filter(p=>p.moon===m.id).map(p=>({t:(p.ms-s.start)/DAY_MS,x:p.x}));
  assert.ok(points.length>=55,`${m.name}: enough recorded observations`);
  const crossings=[],oppositeCrossings=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a.x<0&&b.x>=0)crossings.push(a.t-a.x*(b.t-a.t)/(b.x-a.x));
    if(a.x>0&&b.x<=0)oppositeCrossings.push(a.t-a.x*(b.t-a.t)/(b.x-a.x));
  }
  assert.ok(crossings.length>=2);
  // Test-harness estimates use only the recorded graph: divide the elapsed time
  // between the first and last same-direction crossings by the cycle count.
  // Average both directions to reduce the error of reading a sparse graph.
  // No solver, runtime fit operation, or true orbital coordinate sets a curve.
  assert.ok(oppositeCrossings.length>=2);
  const period=((crossings.at(-1)-crossings[0])/(crossings.length-1)+(oppositeCrossings.at(-1)-oppositeCrossings[0])/(oppositeCrossings.length-1))/2;
  const phases=[...crossings,...oppositeCrossings.map(t=>t-period/2)].map(t=>t-Math.round((t-crossings[0])/period)*period);
  const t0=phases.reduce((sum,t)=>sum+t,0)/phases.length;
  const amplitude=(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))/2;
  await estimate(1,period*1.02,crossings[0]+.03);
  const initialRms=residualRms(points,getSession().fits[m.id]);
  $('amplitudeSlider').value=amplitude;await event('amplitudeSlider','input');
  assert.ok(Math.abs(getSession().fits[m.id].amplitude-amplitude)<.002,`${m.name}: reach the measured extent from a low starting guess`);
  $('periodSlider').value=period;await event('periodSlider','input');
  $('t0Slider').value=t0;await event('t0Slider','input');
  const fit=getSession().fits[m.id],mass=massFromFit(fit),rms=residualRms(points,fit);
  assert.deepEqual(fit,{amplitude,period,t0},`${m.name}: the saved fit is exactly the student's three slider choices`);
  assert.ok(rms<initialRms,`${m.name}: manual adjustments improve the plotted estimate`);
  assert.ok(Math.abs(+$('rms').textContent-rms)<.000006,`${m.name}: displayed RMS matches the manually chosen parameters`);
  assert.ok(rms<.12,`${m.name}: fit the clicked observations (RMS ${rms})`);
  assert.ok(Math.abs(fit.period/referencePeriods[m.id]-1)<.02,`${m.name}: recover the orbital period`);
  assert.ok(Math.abs(mass.kg/1.89813e27-1)<.03,`${m.name}: recover Jupiter's mass within 3%`);
  assert.ok($('fitForm').checkValidity());
  // Fine adjustment can be left at any time to restore the broad range.
  $('fineSliders').checked=true;await event('fineSliders','change');
  assert.ok(Number($('amplitudeSlider').min)<fit.amplitude&&Number($('amplitudeSlider').max)>fit.amplitude);
  $('fineSliders').checked=false;await event('fineSliders','change');
  assert.ok(Number($('amplitudeSlider').min)<=1&&Number($('amplitudeSlider').max)>=20);
  assert.deepEqual(getSession().fits[m.id],fit,'changing slider precision does not optimize any parameter');
  // Updating diagnostics, interval, and inclusion cannot silently fit the data.
  $('fitFrom').value=0;$('fitTo').value=period/2;await click('applyRange');
  assert.match($('fitWarning').textContent,/Fewer than five|less than one fitted period/);
  assert.deepEqual(getSession().fits[m.id],fit,'choosing a short interval only updates diagnostics');
  await click('clearRange');assert.deepEqual(getSession().fits[m.id],fit);
  results.push({moon:m.name,observations:points.length,amplitude:fit.amplitude,periodDays:fit.period,rms,massKg:mass.kg});
}
// Optional review fixture for a rendered-browser pass. This is synthetic QA
// data from the real click handlers, with curves set only by manual controls.
if(process.env.JUPITER_REVIEW_SESSION){
  const review=getSession();review.student='QA demonstration (simulated clicks)';review.group='QA demonstration';
  review.notes='Synthetic QA fixture, not real student data. Measurements were recorded through canvas clicks with deliberate aiming errors. The three manual fit controls were set from recorded graph extrema and zero crossings; no automatic fitting operation was used.';
  await writeFile(process.env.JUPITER_REVIEW_SESSION,JSON.stringify(review,null,2)+'\n');
}
// Clearing a chosen fit leaves observations intact and resets manual controls.
const observed=getSession().measurements;await click('clearFit');
assert.equal(getSession().fits.callisto,undefined);assert.deepEqual(getSession().measurements,observed);
assert.equal($('rms').textContent,'—');assert.equal($('clearFit').disabled,true);
for(const id of ['amplitudeSlider','periodSlider','t0Slider'])assert.equal($(id).disabled,true);
console.log(JSON.stringify({status:'passed',method:'Real canvas clicks with up to 0.8 detector pixel aiming error; 71 epochs over 35 days; manual amplitude, period, and phase controls set from recorded extrema and zero crossings, without automatic fitting',results},null,2));
window.close();
