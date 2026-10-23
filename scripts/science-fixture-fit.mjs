// TEST ONLY: recover reference periods from generated scientific fixtures.
// This numerical oracle is not part of dist and must never be imported by the app.
// Student-facing fitting is manual; UI tests use only the visible manual controls.
import {residualRms,validateFit} from '../dist/engine.mjs';

function atPeriod(points,period) {
  let ss=0,cc=0,sc=0,sy=0,cy=0;
  for(const p of points){const a=2*Math.PI*p.t/period,s=Math.sin(a),c=Math.cos(a);ss+=s*s;cc+=c*c;sc+=s*c;sy+=s*p.x;cy+=c*p.x;}
  const det=ss*cc-sc*sc;if(Math.abs(det)<1e-12)return null;
  const b=(sy*cc-cy*sc)/det,c=(cy*ss-sy*sc)/det;
  const f={amplitude:Math.hypot(b,c),period,t0:((Math.atan2(-c,b)*period/(2*Math.PI))%period+period)%period};
  return {...f,rms:residualRms(points,f)};
}

export function fitScienceFixture(points,initial) {
  if(points.length<5)throw new Error('A scientific fixture requires at least five points.');
  if(!validateFit(initial))throw new Error('Invalid initial fixture parameters.');
  const span=Math.max(...points.map(p=>p.t))-Math.min(...points.map(p=>p.t));
  if(span<=0)throw new Error('A scientific fixture must span more than one time.');
  let lo=Math.max(.1,initial.period*.85),hi=Math.min(100,initial.period*1.15),best=null;
  for(let pass=0;pass<5;pass++){
    const step=(hi-lo)/100;
    for(let k=0;k<=100;k++){const f=atPeriod(points,lo+k*step);if(f&&(!best||f.rms<best.rms))best=f;}
    if(!best)throw new Error('The scientific fixture does not constrain a curve.');
    lo=Math.max(.1,best.period-step*2);hi=Math.min(100,best.period+step*2);
  }
  return {amplitude:best.amplitude,period:best.period,t0:best.t0};
}
