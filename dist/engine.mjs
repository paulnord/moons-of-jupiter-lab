import * as Astronomy from './vendor/astronomy.mjs';

export const DAY_MS = 86400000;
export const AU_KM = 149597870.7;
export const JUPITER_DIAMETER_KM = 142984;
export const G = 6.67430e-11;
export const MOONS = [
  { id:'io', name:'Io', roman:'I', color:'#e8b451', symbol:'circle', radiusKm:1821.49, albedo:.62 },
  { id:'europa', name:'Europa', roman:'II', color:'#76cde2', symbol:'square', radiusKm:1560.80, albedo:.68 },
  { id:'ganymede', name:'Ganymede', roman:'III', color:'#b7a0e2', symbol:'diamond', radiusKm:2631.20, albedo:.44 },
  { id:'callisto', name:'Callisto', roman:'IV', color:'#8dccab', symbol:'triangle', radiusKm:2410.30, albedo:.19 },
];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vec=v=>[v.x,v.y,v.z];
const norm=a=>Math.hypot(...a);
const unit=a=>a.map(v=>v/norm(a));
export const julianDate=ms=>ms/DAY_MS+2440587.5;
export function dateValid(ms) { return Number.isFinite(ms) && ms>=Date.UTC(1600,0,1) && ms<=Date.UTC(2200,11,31,23,59); }

// Physical coordinates are independent of canvas size and every display preference.
// Astronomy Engine 2.1.19, jovicentric EQJ vectors at Jupiter light-departure time.
export function positions(ms) {
  if(!dateValid(ms)) throw new Error('Choose a date between 1600 and 2200.');
  const obs=new Date(ms);
  const j=Astronomy.BackdatePosition(obs,Astronomy.Body.Earth,Astronomy.Body.Jupiter,false);
  const los=unit(vec(j));
  const pole=unit(vec(Astronomy.RotationAxis(Astronomy.Body.Jupiter,j.t).north));
  const east=unit(cross(pole,los));
  const north=unit(cross(los,east));
  const towardEarth=unit(cross(pole,east));
  const h=vec(Astronomy.HelioVector(Astronomy.Body.Jupiter,j.t));
  const awaySun=unit(h);
  const sats=Astronomy.JupiterMoons(j.t);
  const scale=AU_KM/JUPITER_DIAMETER_KM;
  return MOONS.map(m=>{
    const r=vec(sats[m.id]), x=dot(r,east)*scale, y=dot(r,north)*scale, z=dot(r,los)*scale;
    const shadowDistance=dot(r,awaySun);
    const perpendicular=Math.sqrt(Math.max(0,dot(r,r)-shadowDistance**2));
    const umbraRadius=(71492-shadowDistance*(695700-71492)/norm(h))/AU_KM;
    const eclipsed=shadowDistance>0 && perpendicular<umbraRadius;
    const moonRadius=m.radiusKm/JUPITER_DIAMETER_KM, polar=.5*66854/71492;
    const onDisk=(x/(.5+moonRadius))**2+(y/(polar+moonRadius))**2<1;
    const fullyBehind=(x/(.5-moonRadius))**2+(y/(polar-moonRadius))**2<1;
    // Parallel sunlight ray from the moon to an oblate Jupiter surface.
    // Q defines an ellipsoid whose symmetry axis is Jupiter's north pole.
    const rr=r.map(v=>v*scale), a=.5, b=polar;
    const q=(u,v)=>dot(u,v)/(a*a)+dot(u,pole)*dot(v,pole)*(1/(b*b)-1/(a*a));
    const A=q(awaySun,awaySun),B=2*q(rr,awaySun),C=q(rr,rr)-1,D=B*B-4*A*C;
    let shadow=null;
    if(D>=0){const t=(-B-Math.sqrt(D))/(2*A);if(t>0){
      const hit=rr.map((v,i)=>v+t*awaySun[i]);
      const normal=hit.map((v,i)=>v/(a*a)+pole[i]*dot(hit,pole)*(1/(b*b)-1/(a*a)));
      const radius=Math.max(0,moonRadius-t*(695700-m.radiusKm)/(norm(h)*AU_KM));
      if(dot(normal,los)<0&&radius>0)shadow={x:dot(hit,east),y:dot(hit,north),radius,foreshorten:Math.abs(dot(unit(normal),los)),angle:Math.atan2(dot(normal,north),dot(normal,east))};
    }}
    return {...m,x,y,z,topY:dot(r,towardEarth)*scale,radius:norm(r)*scale,
      moonRadius,shadow,occulted:fullyBehind&&z>0,transit:onDisk&&z<0,eclipsed,visible:!(eclipsed||(fullyBehind&&z>0))};
  });
}
export function cloudAt(ms,seed,percent) {
  if(percent<=0)return false;
  if(percent>=100)return true;
  let n=(Math.floor(ms/60000)^seed)>>>0;
  n=Math.imul(n^(n>>>16),0x45d9f3b); n=Math.imul(n^(n>>>16),0x45d9f3b);n=(n^(n>>>16))>>>0;
  return n/4294967296<percent/100;
}
export function sine(t,fit) {return fit.amplitude*Math.sin(2*Math.PI*(t-fit.t0)/fit.period);}
export function validateFit(f) {return f&&Number.isFinite(f.amplitude)&&f.amplitude>0&&f.amplitude<=30&&Number.isFinite(f.period)&&f.period>=.1&&f.period<=100&&Number.isFinite(f.t0)&&Math.abs(f.t0)<=10000;}
export function residualRms(points,fit) {
  return points.length?Math.sqrt(points.reduce((s,p)=>s+(p.x-sine(p.t,fit))**2,0)/points.length):null;
}
// Least squares at one trial period, with no vertical offset: the origin is Jupiter.
function atPeriod(points,period) {
  let ss=0,cc=0,sc=0,sy=0,cy=0;
  for(const p of points){const a=2*Math.PI*p.t/period,s=Math.sin(a),c=Math.cos(a);ss+=s*s;cc+=c*c;sc+=s*c;sy+=s*p.x;cy+=c*p.x;}
  const det=ss*cc-sc*sc;if(Math.abs(det)<1e-12)return null;
  const b=(sy*cc-cy*sc)/det,c=(cy*ss-sy*sc)/det;
  const f={amplitude:Math.hypot(b,c),period,t0:((Math.atan2(-c,b)*period/(2*Math.PI))%period+period)%period};
  return {...f,rms:residualRms(points,f)};
}
// Deliberately local refinement around a student's initial estimate; no hidden true periods.
export function refineFit(points,initial) {
  if(points.length<5)throw new Error('Include at least five measurements to refine a fit.');
  if(!validateFit(initial))throw new Error('Enter valid amplitude, period, and zero-crossing estimates first.');
  const span=Math.max(...points.map(p=>p.t))-Math.min(...points.map(p=>p.t));
  if(span<=0)throw new Error('Measurements must span more than one observation time.');
  let lo=Math.max(.1,initial.period*.85),hi=Math.min(100,initial.period*1.15),best=null;
  for(let pass=0;pass<5;pass++){
    const step=(hi-lo)/100;
    for(let k=0;k<=100;k++){const f=atPeriod(points,lo+k*step);if(f&&(!best||f.rms<best.rms))best=f;}
    if(!best)throw new Error('The measurements do not constrain this fit.');
    lo=Math.max(.1,best.period-step*2);hi=Math.min(100,best.period+step*2);
  }
  return {amplitude:best.amplitude,period:best.period,t0:best.t0};
}
export function massFromFit(f) {
  if(!validateFit(f))throw new Error('A valid fitted amplitude and period are required.');
  const radiusKm=f.amplitude*JUPITER_DIAMETER_KM,periodSec=f.period*86400;
  const kg=4*Math.PI**2*(radiusKm*1000)**3/(G*periodSec**2);
  return {radiusKm,radiusAU:radiusKm/AU_KM,periodYears:f.period/365.25,kg,solar:kg/1.98847e30,earth:kg/5.9722e24};
}
export function newSession(start=Date.UTC(2024,0,5,20,46)) {
  return {format:'jupiter-lab',version:1,start,current:start,interval:12,seed:Math.floor(Math.random()*2**30),
    student:'',group:'',notes:'',measurements:[],cloudLog:[],fits:{},ranges:{},nextId:1,
    settings:{identify:true,distances:true,clouds:true,percentCloudy:10,restart:true,colors:true,viewMode:'space',seeing:2,brightness:0,contrast:1,instructions:'',pinHash:''}};
}
export function validateSession(raw) {
  if(!raw||raw.format!=='jupiter-lab'||raw.version!==1)throw new Error('This is not a supported Jupiter Lab session.');
  if(!dateValid(raw.start)||!dateValid(raw.current)||!(raw.interval>=.05&&raw.interval<=168)||!Number.isInteger(raw.seed))throw new Error('Session date or interval is invalid.');
  if(!Array.isArray(raw.measurements)||raw.measurements.length>20000||!Array.isArray(raw.cloudLog)||raw.cloudLog.length>20000)throw new Error('Session measurement data is invalid.');
  const clean=newSession(raw.start);clean.current=raw.current;clean.interval=raw.interval;clean.seed=raw.seed;
  for(const key of ['student','group','notes']){if(typeof raw[key]!=='string'||raw[key].length>20000)throw new Error('Session text is invalid.');clean[key]=raw[key];}
  const ids=new Set();
  clean.measurements=raw.measurements.map(p=>{
    if(!MOONS.some(m=>m.id===p.moon)||!dateValid(p.ms)||!Number.isFinite(p.x)||Math.abs(p.x)>30||!Number.isInteger(p.id)||ids.has(p.id))throw new Error('Session contains an invalid measurement.');
    ids.add(p.id);const result={id:p.id,moon:p.moon,ms:p.ms,x:p.x,include:p.include!==false,note:String(p.note||'').slice(0,1000),pixel:Number.isFinite(p.pixel)?p.pixel:null};
    if(p.overlap!==undefined){if(!Array.isArray(p.overlap)||p.overlap.length>4||p.overlap.some(id=>!MOONS.some(m=>m.id===id)))throw new Error('Invalid overlap assignment.');result.overlap=[...new Set(p.overlap)];}
    return result;
  });
  clean.cloudLog=raw.cloudLog.filter(dateValid);
  const o=raw.settings;if(!o||typeof o!=='object')throw new Error('Session settings are missing.');
  if(o.viewMode!==undefined&&!['space','ground'].includes(o.viewMode))throw new Error('Invalid telescope mode.');
  if(o.seeing!==undefined&&(!Number.isFinite(o.seeing)||o.seeing<.5||o.seeing>4))throw new Error('Invalid seeing.');
  // Existing sessions had clouds enabled and represent ground observations.
  clean.settings.viewMode=o.viewMode??'ground';clean.settings.seeing=o.seeing??2;
  for(const [key,lo,hi] of [['brightness',-2,8],['contrast',.5,2]]){
    if(o[key]!==undefined&&(!Number.isFinite(o[key])||o[key]<lo||o[key]>hi))throw new Error('Invalid image display setting.');
    clean.settings[key]=o[key]??(key==='brightness'?0:1);
  }
  for(const key of ['identify','distances','clouds','restart','colors']){if(typeof o[key]!=='boolean')throw new Error('Session settings are invalid.');clean.settings[key]=o[key];}
  if(!Number.isFinite(o.percentCloudy)||o.percentCloudy<0||o.percentCloudy>100)throw new Error('Cloud percentage is invalid.');
  clean.settings.percentCloudy=o.percentCloudy;clean.settings.instructions=String(o.instructions||'').slice(0,5000);clean.settings.pinHash=/^[a-f0-9]{64}$/.test(o.pinHash||'')?o.pinHash:'';
  for(const m of MOONS){const f=raw.fits?.[m.id];if(f){if(!validateFit(f))throw new Error('Session fit is invalid.');clean.fits[m.id]={amplitude:f.amplitude,period:f.period,t0:f.t0};}}
  for(const m of MOONS){const r=raw.ranges?.[m.id];if(r){if(!Array.isArray(r)||r.length!==2||r.some(v=>v!==null&&!Number.isFinite(v))||(r[0]!==null&&r[1]!==null&&r[0]>=r[1]))throw new Error('Session fit range is invalid.');clean.ranges[m.id]=[...r];}}
  clean.nextId=Math.max(0,...ids)+1;return clean;
}
export function csvText(session) {
  const q=s=>'"'+(typeof s==='string'&&/^[=+\-@]/.test(s)?"'":'')+String(s).replaceAll('"','""')+'"';
  // A common X column and four Y columns import directly into Data Tool.
  // Keep original observations, even when excluded; carry decisions as metadata.
  const rows=[['Elapsed time (day)',...MOONS.map(m=>`${m.name} east-positive (Jupiter diameters)`),'UTC observation','Julian date',...MOONS.flatMap(m=>[`${m.name} include in fit`,`${m.name} notes`,`${m.name} overlap assignment`])]];
  const epochs=new Map();
  for(const p of session.measurements){if(!epochs.has(p.ms))epochs.set(p.ms,new Map());epochs.get(p.ms).set(p.moon,p);}
  for(const [ms,observations] of [...epochs].sort((a,b)=>a[0]-b[0])){
    rows.push([(ms-session.start)/DAY_MS,...MOONS.map(m=>observations.get(m.id)?.x??''),new Date(ms).toISOString(),julianDate(ms),...MOONS.flatMap(m=>{
      const p=observations.get(m.id);return p?[p.include?1:0,p.note,(p.overlap||[]).join('+')]:['','',''];
    })]);
  }
  return rows.map(r=>r.map(q).join(',')).join('\r\n')+'\r\n';
}
