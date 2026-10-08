import assert from 'node:assert/strict';
import * as Astronomy from '../dist/vendor/astronomy.mjs';
import {positions,DAY_MS,MOONS,julianDate,cloudAt,newSession,validateSession,refineFit,massFromFit,csvText} from '../dist/engine.mjs';
// External references: NASA NSSDC Jovian Satellite Fact Sheet, JPL JUP365 mean elements.
const refs={io:{p:1.769138,a:421800},europa:{p:3.551181,a:671100},ganymede:{p:7.154553,a:1070400},callisto:{p:16.689017,a:1882700}};
assert.equal(julianDate(Date.UTC(2000,0,1,12)),2451545);
for(const ms of [Date.UTC(1610,0,7),Date.UTC(2000,0,1),Date.UTC(2026,9,7),Date.UTC(2100,0,1)]){
  const ps=positions(ms);assert.equal(ps.length,4);
  for(const p of ps){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(Math.abs(p.x)<=p.radius+1e-12);assert.ok(p.radius>2&&p.radius<14);}
}
const points=Object.fromEntries(MOONS.map(m=>[m.id,[]]));
const start=Date.UTC(2026,9,7);
// A fixed inertial projection isolates sidereal periods from Earth's changing
// viewing direction. The sky-view period is deliberately not assumed identical.
const j=Astronomy.BackdatePosition(new Date(start),Astronomy.Body.Earth,Astronomy.Body.Jupiter,false);
const p=Astronomy.RotationAxis(Astronomy.Body.Jupiter,j.t).north;
const east=[p.y*j.z-p.z*j.y,p.z*j.x-p.x*j.z,p.x*j.y-p.y*j.x],length=Math.hypot(...east);
const axis=east.map(v=>v/length);
for(const m of MOONS){
  const inertial=[];
  for(let t=0;t<60;t+=.25){const r=Astronomy.JupiterMoons(new Date(start+t*DAY_MS))[m.id];inertial.push({t,x:(r.x*axis[0]+r.y*axis[1]+r.z*axis[2])*149597870.7/142984});}
  const f=refineFit(inertial,{amplitude:5,period:refs[m.id].p*1.04,t0:1});
  assert.ok(Math.abs(f.period/refs[m.id].p-1)<.001,`${m.id} sidereal period vs independent reference`);
}
for(let i=0;i<240;i++){const t=i*.25;for(const p of positions(start+t*DAY_MS))if(p.visible)points[p.id].push({t,x:p.x});}
const summary=[];
for(const m of MOONS){const r=refs[m.id];const f=refineFit(points[m.id],{amplitude:5,period:r.p*1.04,t0:1});const mass=massFromFit(f);
  // In this observing window apparent Callisto P is 0.47% above sidereal P.
  // Fixed-axis test above rules out an orbital-model period error.
  assert.ok(Math.abs(f.period/r.p-1)<.006,`${m.id} apparent period near sidereal reference`);
  assert.ok(Math.abs(mass.radiusKm/r.a-1)<.015,`${m.id} radius vs independent reference`);
  assert.ok(Math.abs(mass.kg/1.89813e27-1)<.04,`${m.id} Jupiter mass within educational approximation`);
  summary.push({moon:m.name,points:points[m.id].length,period:f.period,radiusKm:mass.radiusKm,massKg:mass.kg});
}
const s=newSession(start);s.measurements.push({id:1,moon:'io',ms:start,x:-2.71,include:false,note:'=not a formula',pixel:580});s.fits.io={amplitude:3,period:1.8,t0:.2};s.ranges.io=[0,20];
const restored=validateSession(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored.measurements,s.measurements);assert.deepEqual(restored.ranges,s.ranges);assert.deepEqual(restored.fits,s.fits);assert.equal(restored.nextId,2);
assert.throws(()=>validateSession({...s,measurements:[{...s.measurements[0],x:Infinity}]}));
assert.throws(()=>validateSession({...s,measurements:[s.measurements[0],s.measurements[0]]}));
assert.throws(()=>refineFit([],{amplitude:1,period:2,t0:0}));
assert.ok(csvText(s).includes('"\'=not a formula"'));assert.ok(csvText(s).includes('"-2.71"'));
for(let i=0;i<100;i++){const t=start+i*DAY_MS;assert.equal(cloudAt(t,44,0),false);assert.equal(cloudAt(t,44,100),true);assert.equal(cloudAt(t,44,10),cloudAt(t,44,10));}
console.log(JSON.stringify({status:'passed',reference:'NASA NSSDC/JPL mean orbital properties',summary},null,2));
