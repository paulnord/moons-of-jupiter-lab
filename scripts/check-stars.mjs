import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {decodeCatalog,projectStars,fieldGeometry,createStarField} from '../dist/star-catalog.mjs';
import {DAY_MS} from '../dist/engine.mjs';
const root=new URL('../dist/',import.meta.url);
const meta=JSON.parse(await readFile(new URL('assets/stars/sources.json',root),'utf8'));
const catalog=[];
for(const f of meta.files){
  const b=await readFile(new URL('assets/stars/'+f.file,root));
  assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);
  const stars=decodeCatalog(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
  assert.equal(stars.length,f.rows);catalog.push(...stars);
}
assert.equal(catalog.length,meta.row_count);assert.ok(catalog.length>100000);
assert.equal(new Set(catalog.map(s=>s.id)).size,catalog.length);
assert.equal(catalog.filter(s=>s.missingMotion).length,meta.missing_proper_motion);
const eps=23.4392911*Math.PI/180;
for(const s of catalog){
  assert.ok(s.magnitude<=12&&s.magnitude>-5);
  assert.ok(Math.abs(Math.asin(s.vector[2]*Math.cos(eps)-s.vector[1]*Math.sin(eps))*180/Math.PI)<=5.000001);
}
// A known angular displacement and a one-arcsecond/year motion in an
// independently specified tangent frame: after 50 years both offsets are 50".
const mas=Math.PI/180/3600000,ms2000=Date.UTC(2000,0,1,12),future=ms2000+50*365.25*DAY_MS;
const geometry={los:[1,0,0],east:[0,1,0],north:[0,0,1],diameter:50*Math.PI/180/3600};
const moving={id:'motion fixture',magnitude:10,epoch:2000,vector:[1,0,0],motion:[0,1000*mas,1000*mas]};
assert.deepEqual(projectStars([moving],ms2000,32,geometry).map(s=>[s.x,s.y]),[[0,0]]);
const moved=projectStars([moving],future,32,geometry)[0];assert.ok(Math.abs(moved.x-1)<1e-12&&Math.abs(moved.y-1)<1e-12);
// Real Jupiter angular size and catalog field vary with observing date.
const start=Date.UTC(2024,0,5,20,46),geo=fieldGeometry(start);
assert.ok(geo.diameter*180/Math.PI*3600>35&&geo.diameter*180/Math.PI*3600<50);
const rows=[];let drifting=null;
for(let day=0;day<366;day+=3){
 const ms=start+day*DAY_MS,a=projectStars(catalog,ms),b=projectStars(catalog,ms+DAY_MS/2);
 rows.push({ms,stars:a});
 for(const s of a){const next=b.find(t=>t.id===s.id);if(next&&Math.abs(s.x-next.x)>.05)drifting={id:s.id,shift:next.x-s.x};}
}
assert.ok(rows.some(r=>r.stars.length>0));assert.ok(drifting,'fixed catalog stars move through the Jupiter-centered field');
// Local lazy loading must match full-catalog projection, including RA boundaries.
const requests=[],pending=[];let ready=0;
globalThis.window={fetch:url=>{requests.push(url);const p=readFile(new URL(url,root)).then(b=>({ok:true,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}));pending.push(p);return p;}};
const field=createStarField(()=>ready++);
for(const year of [1600,1900,2000,2024,2100,2200])for(let month=0;month<12;month+=2){
 const ms=Date.UTC(year,month,1);field.get(ms,32);await Promise.all(pending);await new Promise(resolve=>setImmediate(resolve));
 const actual=field.get(ms,32),expected=projectStars(catalog,ms);
 assert.deepEqual(actual.map(s=>s.id).sort(),expected.map(s=>s.id).sort(),'on-demand tiles preserve full field');
}
assert.ok(ready>0);assert.ok(requests.length<=12);delete globalThis.window;
console.log(JSON.stringify({status:'passed',stars:catalog.length,missingMotion:meta.missing_proper_motion,firstField:rows[0],maxField:rows.reduce((a,b)=>a.stars.length>b.stars.length?a:b),drifting,checks:'Source hashes, counts, ecliptic limits, proper-motion scale, Jupiter size, catalog drift, tile loading'},null,2));
