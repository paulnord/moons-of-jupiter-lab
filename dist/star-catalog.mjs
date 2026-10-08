import * as Astronomy from './vendor/astronomy.mjs';
import {AU_KM,JUPITER_DIAMETER_KM,julianDate} from './engine.mjs';
const RAD=Math.PI/180,MAS=RAD/3600000;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
const vector=v=>[v.x,v.y,v.z];
export function fieldGeometry(ms){
  const j=Astronomy.BackdatePosition(new Date(ms),Astronomy.Body.Earth,Astronomy.Body.Jupiter,false);
  const los=unit(vector(j)),pole=unit(vector(Astronomy.RotationAxis(Astronomy.Body.Jupiter,j.t).north));
  const east=unit(cross(pole,los)),north=unit(cross(los,east));
  return {los,east,north,ra:(Math.atan2(los[1],los[0])/RAD+360)%360,diameter:JUPITER_DIAMETER_KM/(Math.hypot(j.x,j.y,j.z)*AU_KM)};
}
export function decodeCatalog(buffer){
  if(buffer.byteLength%36)throw new Error('Invalid star catalog tile.');
  const view=new DataView(buffer),stars=[];
  for(let o=0;o<buffer.byteLength;o+=36){
    const ra=view.getFloat64(o+8,true)*RAD,dec=view.getFloat64(o+16,true)*RAD,pmra=view.getFloat32(o+24,true)*MAS,pmdec=view.getFloat32(o+28,true)*MAS;
    const cos=Math.cos(dec),sin=Math.sin(dec),ca=Math.cos(ra),sa=Math.sin(ra);
    stars.push({id:`TYC ${view.getUint16(o,true)}-${view.getUint16(o+2,true)}-${view.getUint8(o+4)}`,
      magnitude:view.getInt16(o+6,true)/1000,epoch:view.getFloat32(o+32,true),missingMotion:!!view.getUint8(o+5),
      vector:[cos*ca,cos*sa,sin],motion:[-sa*pmra-sin*ca*pmdec,ca*pmra-sin*sa*pmdec,cos*pmdec]});
  }
  return stars;
}
export function projectStars(stars,ms,span=32,geometry=fieldGeometry(ms)){
  const epoch=2000+(julianDate(ms)-2451545)/365.25,{los,east,north,diameter}=geometry,result=[];
  const limitX=span*.5+.12,limitY=span*.18+.12;
  for(const s of stars){
    const dt=epoch-s.epoch,v=s.vector.map((x,i)=>x+dt*s.motion[i]);
    const den=dot(v,los);if(den<=0)continue;
    const x=dot(v,east)/den/diameter,y=dot(v,north)/den/diameter;
    if(Math.abs(x)<limitX&&Math.abs(y)<limitY)result.push({id:s.id,x,y,magnitude:s.magnitude});
  }
  return result;
}
export function createStarField(onReady){
  const tiles=new Map(),pending=new Set(),failed=new Set();let needed=[],lastCount=0,lastKey='',cached=[];
  function load(i){
    if(tiles.has(i)||pending.has(i)||failed.has(i)||typeof window.fetch!=='function')return;
    pending.add(i);
    window.fetch(`assets/stars/tycho2-${String(i).padStart(2,'0')}.bin`).then(r=>{if(!r.ok)throw new Error('Star catalog unavailable.');return r.arrayBuffer();}).then(data=>{
      tiles.set(i,decodeCatalog(data));pending.delete(i);lastKey='';if(needed.includes(i))onReady();
    }).catch(()=>{pending.delete(i);failed.add(i);if(needed.includes(i))onReady();});
  }
  return {
    get(ms,span){
      const geo=fieldGeometry(ms),key=[ms,span,tiles.size].join(':');
      needed=[...new Set([-2,0,2].map(delta=>Math.floor(((geo.ra+delta+360)%360)/30)))];
      needed.forEach(load);
      if(lastKey!==key){cached=projectStars(needed.flatMap(i=>tiles.get(i)||[]),ms,span,geo);lastCount=cached.length;lastKey=key;}
      return cached;
    },
    status(){return needed.some(i=>failed.has(i))?'Star catalog unavailable; reload to try again.':needed.some(i=>!tiles.has(i))?'Loading Tycho-2 star field…':`Tycho-2 · ${lastCount} catalog star${lastCount===1?'':'s'} in this field · brightness reveals faint stars`;}
  };
}
