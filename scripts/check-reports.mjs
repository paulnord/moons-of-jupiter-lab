import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {buildReport,REPORT_PNG_SCALE} from '../dist/report.mjs';
import {newSession,validateSession,DAY_MS,MOONS,sine,massFromFit} from '../dist/engine.mjs';
const {JSDOM}=await import(process.env.JUPITER_JSDOM_MODULE || 'jsdom');
const s=newSession();s.student='Ada Rivera\nLin Chen\nMorgan Smith';s.group='Table 4';
const fits=[{amplitude:2.95,period:1.77,t0:.4},{amplitude:4.69,period:3.55,t0:.8},{amplitude:7.49,period:7.16,t0:1.1},{amplitude:13.17,period:16.8,t0:2.3}];
for(const [i,m] of MOONS.entries()){
 const f=fits[i];s.fits[m.id]=f;
 for(let j=0;j<43;j++){const t=j/2;s.measurements.push({id:s.nextId++,moon:m.id,ms:s.start+t*DAY_MS,x:sine(t,f)+.08*Math.sin(j*3+i),include:j!==7,note:''});}
}
s.ranges.io=[1,19];assert.equal(validateSession(s).student,s.student);
const now=Date.UTC(2026,9,8,17,20,34),all=buildReport(s,{generatedAt:now});
assert.deepEqual(all.moonIds,MOONS.map(m=>m.id));assert.ok(all.filename.endsWith('.png'));
for(const f of fits){assert.ok(all.svg.includes(f.period.toFixed(5)));assert.ok(all.svg.includes(f.amplitude.toFixed(4)));assert.ok(all.svg.includes(massFromFit(f).kg.toExponential(4)));}
assert.match(all.svg,/36 \/ 43 points in fit/);assert.match(all.svg,/Fit interval: 1 to 19 days/);
assert.match(all.svg,/Ada Rivera; Lin Chen; Morgan Smith/);assert.match(all.svg,/2026/);assert.match(all.svg,/2024-01-05 20:46:00 UTC/);
const single=buildReport(s,{scope:'current',moon:'europa',generatedAt:now});assert.deepEqual(single.moonIds,['europa']);assert.doesNotMatch(single.svg,/III · Ganymede|IV · Callisto/);
// Both report layouts must keep the measured-data frame when a fit exceeds it.
const oversized=structuredClone(s);for(const fit of Object.values(oversized.fits))fit.amplitude=30;
for(const options of [{},{scope:'current',moon:'europa'}]){
 const original=new JSDOM(buildReport(s,{...options,generatedAt:now}).svg,{contentType:'image/svg+xml'}).window.document;
 const expanded=new JSDOM(buildReport(oversized,{...options,generatedAt:now}).svg,{contentType:'image/svg+xml'}).window.document;
 const frame=doc=>({axes:Array.from(doc.querySelectorAll('text[text-anchor]'),el=>el.outerHTML),points:Array.from(doc.querySelectorAll('circle'),el=>[el.getAttribute('cx'),el.getAttribute('cy')])});
 assert.deepEqual(frame(expanded),frame(original),'report axes and observations stay fixed as amplitude changes');
 for(const [i,curve] of Array.from(expanded.querySelectorAll('g[clip-path] > path[stroke="#ad6511"]')).entries()){
  assert.notEqual(curve.getAttribute('d'),original.querySelectorAll('g[clip-path] > path[stroke="#ad6511"]')[i].getAttribute('d'));
  const clipId=curve.parentElement.getAttribute('clip-path').slice(5,-1),clip=expanded.getElementById(clipId).firstElementChild;
  const ys=Array.from(curve.getAttribute('d').matchAll(/[ML][^, ]+,([^ML ]+)/g),m=>Number(m[1])),top=+clip.getAttribute('y'),bottom=top+(+clip.getAttribute('height'));
  assert.ok(Math.min(...ys)<top&&Math.max(...ys)>bottom,'report clips an oversized curve to the data viewport');
 }
}
const noFit=newSession();noFit.student='<script>alert("x")</script>';const empty=buildReport(noFit,{generatedAt:now});assert.ok(empty.svg.includes('&lt;script&gt;'));assert.ok(!empty.svg.includes('<script>'));assert.equal((empty.svg.match(/No fitted curve/g)||[]).length,4);assert.doesNotMatch(empty.svg,/M =/);
if(process.env.JUPITER_CANVAS_MODULE){
 const {createCanvas,loadImage}=await import(process.env.JUPITER_CANVAS_MODULE);
 for(const [name,figure] of [['four-moon-report',all],['single-moon-report',single],['empty-report',empty]]){
  const canvas=createCanvas(figure.width*REPORT_PNG_SCALE,figure.height*REPORT_PNG_SCALE),image=await loadImage(Buffer.from(figure.svg));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const png=canvas.toBuffer('image/png');assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),figure.width*REPORT_PNG_SCALE);
  if(process.env.JUPITER_QA_DIR){await mkdir(process.env.JUPITER_QA_DIR,{recursive:true});await writeFile(process.env.JUPITER_QA_DIR+'/'+name+'.png',png);}
 }
}
console.log('Passed: four/single figures, data-anchored axes and clipped oversized fits, saved fit parameters and masses, fit inclusion/ranges, member-name round trip, report vs observation dates, empty fits, escaped names, optional native PNG raster.');
