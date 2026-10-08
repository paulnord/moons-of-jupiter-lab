import {DAY_MS,MOONS,massFromFit,residualRms,sine} from './engine.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const utc=ms=>new Date(ms).toISOString().replace('T',' ').slice(0,19)+' UTC';
export const reportTime=ms=>new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(ms));
function wrap(text,max=104){
  const lines=[];let line='';
  for(const word of text.trim().split(/\s+/)){
    if(line.length+word.length+1>max&&line){lines.push(line);line='';}
    for(let start=0;start<word.length;start+=max){const part=word.slice(start,start+max);if(start){lines.push(line);line='';}line+=(line?' ':'')+part;}
  }
  if(line)lines.push(line);return lines;
}
function domainFor(points){
  let lo=0,hi=0;for(const p of points){lo=Math.min(lo,p.t);hi=Math.max(hi,p.t);}
  if(hi===lo)hi=lo+1;
  const pad=(hi-lo)*.04;return [lo-pad,hi+pad];
}
// A self-contained figure: only recorded positions and the observer's saved fits.
// The same SVG is used for the preview, printing, and high-resolution PNG export.
export function buildReport(session,{scope='all',moon='callisto',generatedAt=Date.now()}={}){
  const moons=scope==='current'?MOONS.filter(m=>m.id===moon):MOONS;
  if(!moons.length)throw new Error('Choose a moon for the report.');
  const points=session.measurements.filter(p=>moons.some(m=>m.id===p.moon)).map(p=>({...p,t:(p.ms-session.start)/DAY_MS}));
  const domain=domainFor(points),W=1200,pad=36,gap=24,panelW=moons.length===1?1128:552,panelH=moons.length===1?550:458;
  const names=wrap('Group members: '+(session.student.trim().replace(/\n+/g,'; ')||'Not entered'));
  const group=wrap('Lab group / table: '+(session.group.trim()||'Not specified'));
  const headerH=159+24*(names.length+group.length),rows=moons.length===1?1:2,H=headerH+rows*panelH+(rows-1)*gap+104;
  let body='';
  const text=(x,y,value,size=19,fill='#23364a',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  body+=text(pad,46,'Moons of Jupiter — Orbit report',32,'#142c45','font-weight="700"');
  body+=text(pad,78,'Report date & time: '+reportTime(generatedAt),19);
  let lineY=111;for(const line of [...names,...group]){body+=text(pad,lineY,line);lineY+=24;}
  body+=text(pad,lineY+6,'Observing epoch (day 0): '+utc(session.start),18);
  body+=text(pad,lineY+31,(moons.length===1?moons[0].name:'All four moons')+' · Full recorded interval · East positive / west negative',18,'#4b6075');
  const masses=[];
  for(const [index,m] of moons.entries()){
    const left=pad+(index%2)*(panelW+gap),top=headerH+Math.floor(index/2)*(panelH+gap),ps=points.filter(p=>p.moon===m.id),range=session.ranges?.[m.id]||[null,null];
    const used=ps.filter(p=>p.include&&(range[0]===null||p.t>=range[0])&&(range[1]===null||p.t<=range[1])),usedIds=new Set(used.map(p=>p.id)),fit=session.fits[m.id];
    const ymax=Math.max(1,fit?.amplitude*1.14||0,...ps.map(p=>Math.abs(p.x)*1.14)),L=74,R=panelW-21,T=59,B=panelH-171;
    const X=t=>L+(t-domain[0])/(domain[1]-domain[0])*(R-L),Y=v=>(T+B)/2-v/ymax*(B-T)/2;
    let panel=`<rect width="${panelW}" height="${panelH}" rx="6" fill="#fff" stroke="#c6d1dd"/>`+text(18,32,m.roman+' · '+m.name,25,'#142c45','font-weight="700"');
    for(let k=0;k<=4;k++){
      const t=domain[0]+k*(domain[1]-domain[0])/4,xx=X(t);
      panel+=`<path d="M${xx} ${T}V${B}" stroke="#cfd8e2" stroke-width="1.25"/>`+text(xx,B+25,t.toFixed(domain[1]-domain[0]<3?2:1),17,'#465c72','text-anchor="middle"');
    }
    for(let k=-2;k<=2;k++){
      const v=k*ymax/2,yy=Y(v);
      panel+=`<path d="M${L} ${yy}H${R}" stroke="${k===0?'#61778d':'#cfd8e2'}" stroke-width="1.25"/>`+text(L-10,yy+6,v.toFixed(1),17,'#465c72','text-anchor="end"');
    }
    panel+=text((L+R)/2,B+49,'Elapsed days',18,'#23364a','text-anchor="middle"');
    panel+=`<text transform="translate(22 ${(T+B)/2}) rotate(-90)" text-anchor="middle" font-size="18" fill="#23364a">Jupiter diameters</text>`;
    panel+=`<defs><clipPath id="report-${m.id}"><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}"/></clipPath></defs><g clip-path="url(#report-${m.id})">`;
    if(fit){
      const samples=Math.min(12000,Math.max(600,Math.ceil((domain[1]-domain[0])/fit.period*48)));
      let path='';for(let i=0;i<=samples;i++){const t=domain[0]+(domain[1]-domain[0])*i/samples;path+=(i?'L':'M')+X(t).toFixed(2)+','+Y(sine(t,fit)).toFixed(2);}
      panel+=`<path d="${path}" fill="none" stroke="#ad6511" stroke-width="3"/>`;
    }
    for(const p of ps)panel+=`<circle cx="${X(p.t)}" cy="${Y(p.x)}" r="4" fill="${usedIds.has(p.id)?'#235784':'white'}" stroke="${usedIds.has(p.id)?'#235784':'#788a9d'}" stroke-width="1.5"/>`;
    panel+='</g>';
    if(!ps.length)panel+=text((L+R)/2,(T+B)/2-17,'No recorded observations',20,'#536a80','text-anchor="middle"');
    const sy=panelH-103;
    if(fit){
      const mass=massFromFit(fit);masses.push(mass.kg);
      panel+=text(18,sy,`P = ${fit.period.toFixed(5)} d · A = ${fit.amplitude.toFixed(4)} Jup. diam.`,19);
      panel+=text(18,sy+26,`t0 = ${fit.t0.toFixed(4)} d · M = ${mass.kg.toExponential(4)} kg`,19);
      panel+=text(18,sy+52,`RMS = ${used.length?residualRms(used,fit).toFixed(5):'—'} Jup. diam. · ${used.length} / ${ps.length} points in fit`,18);
    }else{
      panel+=text(18,sy,'No fitted curve — enter period and amplitude estimates.',18);
      panel+=text(18,sy+26,`${used.length} included / ${ps.length} recorded observations`,18);
    }
    panel+=text(18,panelH-17,'Fit interval: '+(range.every(v=>v===null)?'all recorded days':`${range[0]??'start'} to ${range[1]??'end'} days`),17,'#4b6075');
    body+=`<g transform="translate(${left} ${top})">${panel}</g>`;
  }
  let footer=H-71;
  body+=`<circle cx="${pad+5}" cy="${footer-6}" r="4" fill="#235784"/>`+text(pad+18,footer,'In fit',17);
  body+=`<circle cx="${pad+107}" cy="${footer-6}" r="4" fill="white" stroke="#788a9d" stroke-width="1.5"/>`+text(pad+120,footer,'Excluded / outside fit interval',17);
  body+=`<path d="M${pad+411} ${footer-6}h29" stroke="#ad6511" stroke-width="3"/>`+text(pad+450,footer,'Saved sine curve',17);
  if(moons.length>1&&masses.length)body+=text(pad,footer+27,`Unweighted mean Jupiter mass (${masses.length} fitted orbit${masses.length===1?'':'s'}): ${(masses.reduce((a,b)=>a+b,0)/masses.length).toExponential(4)} kg`,19);
  body+=text(pad,H-17,'Current curve parameters; t0 is relative to day 0. Formal parameter uncertainties are not estimated.',16,'#4b6075');
  return {width:W,height:H,moonIds:moons.map(m=>m.id),filename:`jupiter-${scope==='current'?moon:'all-moons'}-report-${new Date(generatedAt).toISOString().slice(0,10)}.png`,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(moons.length===1?moons[0].name:'Four moon')} orbit report" font-family="Arial, Helvetica, sans-serif"><rect width="${W}" height="${H}" fill="white"/>${body}</svg>`};
}
export const REPORT_PNG_SCALE=4;
export async function reportPng(figure){
  const width=figure.width*REPORT_PNG_SCALE,height=figure.height*REPORT_PNG_SCALE;
  // Give the SVG image its final raster dimensions before decoding.
  const svg=figure.svg.replace(`width="${figure.width}" height="${figure.height}"`, `width="${width}" height="${height}"`);
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The report image could not be prepared.'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d');if(!c)throw new Error('PNG export is unavailable in this browser.');
    c.drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed.')),'image/png'));
  }finally{URL.revokeObjectURL(url);}
}
