// Optional native Canvas rendering QA, independent of a browser mock.
// JUPITER_CANVAS_MODULE points to an installed @napi-rs/canvas package.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {positions,newSession,validateSession,DAY_MS} from '../dist/engine.mjs';
import {decodeCatalog,projectStars} from '../dist/star-catalog.mjs';
import {paintTelescope,captureTelescope,displayTelescope,frameForTime,FRAMES,PHOTO_EPOCH,ROTATION_MS} from '../dist/telescope.mjs';
const {createCanvas,loadImage}=await import(process.env.JUPITER_CANVAS_MODULE||'@napi-rs/canvas');
const root=new URL('../dist/',import.meta.url),images=new Map();
const sources=JSON.parse(await readFile(new URL('assets/jupiter/sources_and_credits.json',root),'utf8'));
for(const f of FRAMES){
  const bytes=await readFile(new URL(f.url,root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sources.files.find(s=>s.index===f.id).sha256,'retain original NASA image');
  images.set(f.id,await loadImage(bytes));
  assert.ok(![4,5,6].includes(f.id));
  assert.equal(frameForTime(Date.parse(f.time)).id,f.id);
}
assert.equal(frameForTime(PHOTO_EPOCH).id,frameForTime(PHOTO_EPOCH+ROTATION_MS).id);
const session=newSession();assert.equal(session.settings.viewMode,'space');
session.settings.viewMode='ground';session.settings.seeing=3.5;
assert.deepEqual(validateSession(session).settings,session.settings);
const legacy=structuredClone(session);delete legacy.settings.viewMode;delete legacy.settings.seeing;
assert.equal(validateSession(legacy).settings.viewMode,'ground');
assert.throws(()=>validateSession({...session,settings:{...session.settings,seeing:999}}));
const found={};
for(let dt=0;dt<8*DAY_MS;dt+=600000){const ms=PHOTO_EPOCH+dt,ps=positions(ms);
  for(const [key,test] of Object.entries({occulted:p=>p.occulted&&!p.eclipsed,transit:p=>p.transit&&p.visible&&Math.abs(p.x)<.3,shadow:p=>p.shadow&&Math.abs(p.shadow.x)<.3,eclipsed:p=>p.eclipsed&&!p.occulted})){const p=ps.find(test);if(p&&!found[key])found[key]={ms,id:p.id};}
  if(Object.keys(found).length===4)break;
}
assert.equal(Object.keys(found).length,4,'exercise real occultation, transit, shadow and eclipse events');
const surface=createCanvas(4000,1440);
function render(ms,scale=125,mode='space',transform=ps=>ps,stars=[],brightness=0){
  const canvas=createCanvas(1000,360),c=canvas.getContext('2d');const frame=frameForTime(ms);
  const ps=transform(positions(ms)).map(p=>({...p,sx:500-p.x*scale,sy:180-p.y*scale}));
  paintTelescope(c,{surface,frame,image:images.get(frame.id),scale,moons:ps,stars,brightness,mode,seeing:3});
  return canvas;
}
const equal=(a,b)=>Buffer.compare(Buffer.from(a.getContext('2d').getImageData(0,0,1000,360).data),Buffer.from(b.getContext('2d').getImageData(0,0,1000,360).data))===0;
for(const name of ['occulted','eclipsed']){const e=found[name];
  assert.ok(equal(render(e.ms),render(e.ms,125,'space',ps=>ps.map(p=>p.id===e.id?{...p,eclipsed:true}:p))),name+' moon contributes no light');
}
const t=found.transit;
assert.ok(!equal(render(t.ms),render(t.ms,125,'space',ps=>ps.map(p=>p.id===t.id?{...p,eclipsed:true}:p))),'transiting disk changes image');
const sh=found.shadow;
assert.ok(!equal(render(sh.ms),render(sh.ms,125,'space',ps=>ps.map(p=>({...p,shadow:null})))),'computed shadows change image');
assert.ok(!equal(render(t.ms),render(t.ms,125,'ground')),'ground seeing changes the same optical image');
const frame=frameForTime(PHOTO_EPOCH),baseOptions={surface,frame,image:images.get(frame.id),scale:125,moons:positions(PHOTO_EPOCH),mode:'space',seeing:2};
const capture=captureTelescope(baseOptions),rawCopy=new Float32Array(capture.data);
assert.ok(capture.data instanceof Float32Array,'retain high-precision light');
const baseline=createCanvas(1000,360),bright=createCanvas(1000,360),reset=createCanvas(1000,360);
displayTelescope(baseline.getContext('2d'),capture);displayTelescope(bright.getContext('2d'),capture,{brightness:6,contrast:.8});displayTelescope(reset.getContext('2d'),capture);
assert.deepEqual(capture.data,rawCopy,'display adjustments do not mutate the capture');assert.ok(equal(baseline,reset),'reset exactly reproduces baseline pixels');assert.ok(!equal(baseline,bright));
const halo=(180*1000+580)*3;assert.ok(capture.data[halo]>0&&capture.data[halo]<.01,'faint glare exists in the original capture outside the disk');
const b=bright.getContext('2d').getImageData(0,0,1000,360).data,a=baseline.getContext('2d').getImageData(0,0,1000,360).data;
assert.ok(b[(180*1000+580)*4]>a[(180*1000+580)*4],'brightening reveals pre-existing glare');
assert.equal(b[(180*1000+500)*4],255,'Jupiter may clip white on display');
const catalog=[];
for(let i=0;i<12;i++){const b=await readFile(new URL(`assets/stars/tycho2-${String(i).padStart(2,'0')}.bin`,root));catalog.push(...decodeCatalog(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)));}
const starEpoch=Date.UTC(2024,11,12,20,46),field=projectStars(catalog,starEpoch),fieldBase=render(starEpoch,31.25,'space',ps=>ps,field),fieldBright=render(starEpoch,31.25,'space',ps=>ps,field,6);
assert.ok(field.length>=4,'render an actual catalog field containing faint stars');
assert.ok(!equal(fieldBase,render(starEpoch,31.25)),'real catalog stars contribute to the captured image');
for(const star of field){
 const x=Math.floor(500-star.x*31.25),y=Math.floor(180-star.y*31.25);
 if(x<2||x>997||y<2||y>357)continue;
 const luminance=canvas=>[...canvas.getContext('2d').getImageData(x-1,y-1,3,3).data].reduce((sum,v,i)=>sum+(i%4===3?0:v),0);
 assert.ok(luminance(fieldBright)>luminance(fieldBase),'brightness reveals catalog star '+star.id);
}
const output=process.env.JUPITER_QA_DIR;
if(output){await mkdir(output,{recursive:true});const grid=createCanvas(1000,880),c=grid.getContext('2d');c.fillStyle='#132134';c.fillRect(0,0,1000,880);
  for(const [i,[label,ms,mode,scale]] of [
    ['Space telescope · full field · 100×',PHOTO_EPOCH,'space',31.25],
    ['Space telescope · transit detail · 400×',t.ms,'space',125],
    ['Ground telescope · same transit · 3 arcsec',t.ms,'ground',125],
    ['Space telescope · calculated shadow · 400×',sh.ms,'space',125]
  ].entries()){
    const y=i*220;c.fillStyle='#cfdae9';c.font='16px sans-serif';c.fillText(label,20,y+27);
    const v=render(ms,scale,mode);
    if(i===0)c.drawImage(v,0,80,1000,200,0,y+40,1000,180);
    else c.drawImage(v,340,90,320,180,340,y+40,320,180);
  }
  await writeFile(output+'/telescope-render-check.png',grid.toBuffer('image/png'));
  const levels=createCanvas(1000,720),lc=levels.getContext('2d');lc.drawImage(baseline,0,0);lc.drawImage(bright,0,360);await writeFile(output+'/brightness-check.png',levels.toBuffer('image/png'));
  const starSheet=createCanvas(1000,720),sc=starSheet.getContext('2d');sc.drawImage(fieldBase,0,0);sc.drawImage(fieldBright,0,360);await writeFile(output+'/catalog-stars-check.png',starSheet.toBuffer('image/png'));
  await writeFile(output+'/events.json',JSON.stringify(found,null,2));
}
console.log(JSON.stringify({status:'passed',frames:FRAMES.length,checks:'Original-image hashes, rotation, mode persistence, legacy session migration, occultation, eclipse, transit, computed shadow, ground blur, reversible brightness, fixed glare, actual catalog stars',events:found},null,2));
