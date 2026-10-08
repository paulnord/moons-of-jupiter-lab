import {DAY_MS,MOONS,positions,cloudAt,julianDate,dateValid,newSession,validateSession,csvText,sine,validateFit,residualRms,refineFit,massFromFit} from './engine.mjs';
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {PHOTO_EPOCH,createTelescopeRenderer,opticalSigma} from './telescope.mjs';
import {createStarField} from './star-catalog.mjs';
import {buildReport,reportPng,reportTime} from './report.mjs';
const midnight=PHOTO_EPOCH;
let session=newSession(midnight),dirty=false,mag=100,overhead=false,playing=null,selected=null,ruler=null,skyPositions=[],skyStars=[],moon='callisto',plotView=null,plotMeta=null,range=[null,null],confirmResolver=null,hovered=null,pendingPick=null,undoStack=[];
// Keep each measured click visible throughout this observation, independently of selection.
const measurementMarkers=new Map();let markerEpoch=session.current;
const num=v=>Number.isFinite(v)?v.toFixed(3):'—';
const elapsed=ms=>(ms-session.start)/DAY_MS;
const utc=ms=>new Date(ms).toISOString().slice(0,16).replace('T',' ');
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);$('captureFeedback').textContent=message;$('captureFeedback').classList.toggle('error',error);};
const changed=()=>{dirty=true;$('saveState').textContent='Unsaved changes · save a session file to keep your work.';};
const weatherNow=()=>session.settings.viewMode==='ground'&&session.settings.clouds&&cloudAt(session.current,session.seed,session.settings.percentCloudy);
const locked=()=>!session.settings.restart&&(session.measurements.length>0||session.cloudLog.length>0);
const moonData=()=>session.measurements.filter(p=>p.moon===moon).map(p=>({...p,t:elapsed(p.ms)}));
const fitPoints=()=>moonData().filter(p=>p.include&&(range[0]===null||p.t>=range[0])&&(range[1]===null||p.t<=range[1]));
function run(fn){return async e=>{try{await fn(e);}catch(err){status(err.message||String(err),true);}};}
function announceMissing(p){return p.occulted?'behind Jupiter':p.eclipsed?'in Jupiter’s shadow':'outside this field';}
function stop(){if(playing){clearInterval(playing);playing=null;$('animate').textContent='Play motion';renderScene();}}
function resetSelection(){closePick();selected=null;hovered=null;$('moonHover').hidden=true;ruler=null;$('rulerButton').textContent='Measure scale';$('measureMoon').value='';$('measureX').value='';$('measureNote').value='';}
function syncControls(){
  $('startTime').value=new Date(session.start).toISOString().slice(0,16);$('interval').value=session.interval;
  $('student').value=session.student;$('group').value=session.group;$('notes').value=session.notes;
  $('colorMoons').checked=session.settings.colors;$('colorMoons').disabled=!session.settings.identify||!overhead;
  $('viewMode').value=session.settings.viewMode;$('seeing').value=session.settings.seeing;$('seeingControl').hidden=session.settings.viewMode!=='ground';$('seeingValue').textContent=session.settings.seeing.toFixed(1)+'″';
  $('customInstructions').hidden=!session.settings.instructions;$('customInstructions').textContent=session.settings.instructions;
  for(const id of ['beginSession','startTime','newSession','loadSession'])$(id).disabled=locked();
  $('previousTime').disabled=locked();$('interval').disabled=locked();$('undoMeasurement').disabled=!undoStack.length;
  $('imageBrightness').value=session.settings.brightness;$('brightnessValue').textContent=(2**session.settings.brightness).toFixed(1)+'×';$('imageContrast').value=session.settings.contrast;$('contrastValue').textContent=session.settings.contrast.toFixed(2);
  if(!session.settings.identify||!session.settings.distances)$('manualMeasurement').open=true;
}
function renderAll(){syncControls();renderScene();renderPlot();renderNotebook();renderMass();}
function shape(c,p,x,y,r){c.beginPath();if(p.symbol==='square')c.rect(x-r,y-r,2*r,2*r);else if(p.symbol==='diamond'){c.moveTo(x,y-r*1.4);c.lineTo(x+r*1.4,y);c.lineTo(x,y+r*1.4);c.lineTo(x-r*1.4,y);c.closePath();}else if(p.symbol==='triangle'){c.moveTo(x,y-r*1.4);c.lineTo(x+r*1.3,y+r);c.lineTo(x-r*1.3,y+r);c.closePath();}else c.arc(x,y,r,0,Math.PI*2);c.fill();}
const drawTelescope=createTelescopeRenderer(()=>renderScene());
const starField=createStarField(()=>renderScene());
function renderScene(){
  if(markerEpoch!==session.current){measurementMarkers.clear();markerEpoch=session.current;}
  skyPositions=positions(session.current);skyStars=[];const cloudy=weatherNow()&&!playing&&!overhead;
  $('dateReadout').textContent=utc(session.current)+' UTC';$('jdReadout').textContent='Julian date '+julianDate(session.current).toFixed(5);
  $('weather').textContent=playing?'Exploring motion':overhead?'Overhead · exploration only':cloudy?'Clouded out · no measurements':session.settings.viewMode==='space'?'Space telescope · above the atmosphere':'Ground telescope · clear';
  $('recordMeasurement').disabled=cloudy||overhead||!!playing||!selected;
  $('viewHint').textContent=overhead?'View from above Jupiter’s north pole. Return to Telescope to measure.':playing?'Pause the motion to make an observation.':cloudy?'No usable data at this time. Advance to the next observation.':'Click to record; click again to replace. Left/right arrow keys change observations. Overlaps can be assigned to either moon or both.';
  const canvas=$('sky'),c=canvas.getContext('2d');if(!c)return;
  const scale=1000/(32*100/mag),topScale=Math.min(scale,10.7),visible=[];
  c.clearRect(0,0,1000,360);c.fillStyle=overhead?'#0d1c30':'#000';c.fillRect(0,0,1000,360);
  for(const p of skyPositions){p.sx=500-p.x*(overhead?topScale:scale);p.sy=180-(overhead?-p.topY*topScale:p.y*scale);
    if(p.sx>=5&&p.sx<=995&&p.sy>=40&&p.sy<=316&&(overhead||p.visible))visible.push(p);
  }
  if(overhead){
    for(const p of skyPositions){c.beginPath();c.strokeStyle='#2b4056';c.arc(500,180,p.radius*topScale,0,Math.PI*2);c.stroke();}
    c.fillStyle='#ddc59a';c.beginPath();c.arc(500,180,topScale*.5,0,Math.PI*2);c.fill();
    for(const p of visible){c.fillStyle=session.settings.identify&&session.settings.colors?p.color:'#e8eff7';shape(c,session.settings.identify?p:{symbol:'circle'},p.sx,p.sy,5);
      if(session.settings.identify){c.font='14px system-ui';c.fillStyle='#c9d7e7';c.textAlign='center';c.fillText(p.roman+' '+p.name,p.sx,p.sy-18);}
    }
    c.fillStyle='#91a9c1';c.font='14px system-ui';c.textAlign='center';c.fillText('Earth viewing direction',500,346);
  }else if(!cloudy){
    const stars=starField.get(session.current,32*100/mag);
    skyStars=stars.map(s=>({...s,sx:500-s.x*scale,sy:180-s.y*scale})).filter(s=>
      s.sx>=0&&s.sx<=1000&&s.sy>=0&&s.sy<=360&&
      (s.x/.5)**2+(s.y/(.5*66854/71492))**2>1&&
      !skyPositions.some(p=>p.visible&&Math.hypot(s.x-p.x,s.y-p.y)<p.moonRadius));
    const photo=drawTelescope(c,{scale,moons:skyPositions,stars,ms:session.current,mode:session.settings.viewMode,seeing:session.settings.seeing,brightness:session.settings.brightness,contrast:session.settings.contrast});
    $('starStatus').textContent=starField.status();
    $('photoStatus').textContent=photo.ready?'Jupiter imagery: Hubble · January 2024':photo.failed?'Jupiter image unavailable. Reload to try again.':'Loading Jupiter image…';
    if(!photo.ready){c.fillStyle='#b9c8d8';c.textAlign='center';c.font='14px system-ui';c.fillText(photo.failed?'Jupiter image unavailable':'Loading Jupiter image…',500,240);}
  }
  c.fillStyle='#9bafc6';c.font='14px system-ui';c.textAlign='left';c.fillText(overhead?'JUPITER EQUATORIAL PLANE':'EAST (+)',16,24);c.textAlign='right';c.fillText(overhead?'Earth below':'WEST (−)',984,24);
  if(ruler!==null&&!overhead){
    c.strokeStyle='#526477';c.lineWidth=1;c.textAlign='center';
    for(let x=0;x<=1000;x+=100){c.beginPath();c.moveTo(x,328);c.lineTo(x,333);c.stroke();c.fillText(String(x),Math.max(14,Math.min(986,x)),350);}
    c.strokeStyle='#6dd3ec';for(const x of ruler){c.beginPath();c.moveTo(x,42);c.lineTo(x,315);c.stroke();}
  }
  if(!cloudy&&!overhead){
    // Mark the measured pixel, never silently snap it to an ephemeris position.
    const marks=new Map();
    for(const [id,mark] of measurementMarkers){
      const observation=session.measurements.find(p=>p.id===id);
      if(!observation){measurementMarkers.delete(id);continue;}
      if(selected?.id===observation.moon)continue;
      const ratio=mag/mark.mag,xPixel=500+(mark.xPixel-500)*ratio,yPixel=180+(mark.yPixel-180)*ratio;
      marks.set(xPixel.toFixed(4)+','+yPixel.toFixed(4),{xPixel,yPixel});
    }
    if(selected?.ms===session.current)marks.set(selected.xPixel.toFixed(4)+','+selected.yPixel.toFixed(4),selected);
    for(const mark of marks.values()){
      c.strokeStyle='#6dd3ec';c.lineWidth=1;c.beginPath();
      for(const sign of [-1,1]){c.moveTo(mark.xPixel+sign*5,mark.yPixel);c.lineTo(mark.xPixel+sign*11,mark.yPixel);c.moveTo(mark.xPixel,mark.yPixel+sign*5);c.lineTo(mark.xPixel,mark.yPixel+sign*11);}c.stroke();
    }
  }
  if(cloudy){c.fillStyle='#17202b';c.fillRect(0,0,1000,360);c.fillStyle='#ccd8e5';c.font='25px system-ui';c.textAlign='center';c.fillText('Clouded out',500,170);c.font='16px system-ui';c.fillText('Advance to the next observation.',500,204);}
  $('moonHover').hidden=true;hovered=null;
  const targets=$('targets');targets.replaceChildren();
  if(!cloudy&&!overhead&&!playing){visible.sort((a,b)=>a.sx-b.sx).forEach((p,i)=>{
    const b=document.createElement('button');b.type='button';b.dataset.target=p.id;b.setAttribute('aria-pressed',String(selected?.id===p.id));
    b.textContent=session.settings.identify?p.roman+' · '+p.name:'Target '+(i+1);b.addEventListener('click',()=>selectTarget(p,Math.round(p.sx),Math.round(p.sy)));targets.append(b);
  });}
  $('epochCount').textContent=session.measurements.filter(p=>p.ms===session.current).length+' / 4 moons recorded';
  $('skyDescription').textContent=cloudy?'Clouds block the telescope field.':visible.length+' visible moon targets. '+(session.settings.identify?visible.map(p=>p.name).join(', '):'Moon names are hidden by the instructor.');
  if(!visible.length&&!cloudy&&!overhead)targets.textContent='No moons in this field. Try a lower magnification or a later time.';
}
function candidatesAt(x,y,width){
  const scale=1000/(32*100/mag),onPlanet=((x-500)/(scale*.5))**2+((y-180)/(scale*.5*66854/71492))**2<1;
  const hits=skyPositions.filter(p=>p.visible&&p.sx>=5&&p.sx<=995&&p.sy>=40&&p.sy<=316&&!(p.z>0&&onPlanet))
    .map(p=>({p,d:Math.hypot(p.sx-x,p.sy-y)})).filter(v=>v.d<=Math.max(12,14*1000/width)).sort((a,b)=>a.d-b.d);
  if(!hits.length)return [];
  const first=hits[0],sigma=opticalSigma(scale,session.settings.viewMode,session.settings.seeing);
  return hits.filter(v=>v===first||Math.hypot(v.p.sx-first.p.sx,v.p.sy-first.p.sy)<=Math.max(5,4*sigma+(first.p.moonRadius+v.p.moonRadius)*scale)||v.d-first.d<2).map(v=>v.p);
}
function starAt(x,y,width,nearestMoon){
  const scale=1000/(32*100/mag);
  if(((x-500)/(scale*.5))**2+((y-180)/(scale*.5*66854/71492))**2<=1)return null;
  let nearest=null,distance=Math.min(9*1000/width,nearestMoon?Math.hypot(x-nearestMoon.sx,y-nearestMoon.sy):Infinity);
  for(const s of skyStars){const d=Math.hypot(x-s.sx,y-s.sy);if(d<distance){nearest=s;distance=d;}}
  return nearest;
}
function positionHover(tip,target,bounds){
  const half=tip.offsetWidth/2,px=target.sx/1000*bounds.width,py=target.sy/360*bounds.height;
  tip.style.left=Math.max(half+8,Math.min(bounds.width-half-8,px))+'px';
  tip.style.top=(py-tip.offsetHeight-12>=0?py-12:py+tip.offsetHeight+12)+'px';
}
function closePick(){pendingPick=null;$('overlapPicker').hidden=true;}
function showPick(candidates,x,y){
  pendingPick={ids:candidates.map(p=>p.id),x,y,ms:session.current};$('moonHover').hidden=true;
  const box=$('overlapPicker');box.hidden=false;
  box.style.left=`clamp(8px, ${x/10}%, calc(100% - 282px))`;
  box.style.top=Math.max(4,Math.min(62,y/360*100-8))+'%';
  $('overlapTitle').textContent='Assign this position';
  $('overlapHint').textContent='Nearby or overlapping moons. You decide which measurements to keep.';
  const buttons=$('overlapChoices');buttons.replaceChildren();
  for(const p of candidates){const b=document.createElement('button');b.type='button';b.dataset.assign=p.id;b.textContent=p.name;b.addEventListener('click',()=>choosePick([p.id]));buttons.append(b);}
  const both=document.createElement('button');both.type='button';both.dataset.assign='all';both.textContent=candidates.length===2?'Both':'All '+candidates.length;both.addEventListener('click',()=>choosePick(pendingPick.ids));buttons.append(both);
  buttons.firstElementChild?.focus({preventScroll:true});
}
function choosePick(ids){
  const pick=pendingPick;if(!pick||pick.ms!==session.current)return;
  closePick();prepareSelection(ids[0],pick.x,pick.y);saveMeasurements(ids,pick.x,pick.y,{overlap:pick.ids});$('sky').focus({preventScroll:true});
}
function prepareSelection(id,x,y){
  selected={id,xPixel:x,yPixel:y,ms:session.current};
  $('measureMoon').value=session.settings.identify?id:'';
  const measured=(500-x)/(1000/(32*100/mag));$('measureX').value=session.settings.distances?measured.toFixed(3):'';
  const existing=session.measurements.find(p=>p.moon===id&&p.ms===session.current);$('measureNote').value=existing?.note||'';
  $('cursorReadout').textContent=`x = ${x.toFixed(1)} px · y = ${y.toFixed(1)} px`+(session.settings.distances?` · ${measured.toFixed(3)} Jup. diam.`:'');
}
function selectTarget(p,x,y){
  if(overhead||playing||weatherNow())return;
  closePick();prepareSelection(p.id,x,y);
  if(session.settings.identify&&session.settings.distances)saveMeasurements([p.id],x,y);
  else{$('manualMeasurement').open=true;renderScene();status('Position selected. Complete the moon assignment and scaled distance below the image.');}
}
function saveMeasurements(ids,xPixel,yPixel,{position,note,overlap=[]}={}){
  if(overhead||playing||weatherNow())throw new Error('Record in a clear, paused telescope view.');
  const x=position??(500-xPixel)/(1000/(32*100/mag));
  if(!ids.length||ids.some(id=>!MOONS.some(m=>m.id===id))||!Number.isFinite(x)||Math.abs(x)>30)throw new Error('Choose a moon and a valid position.');
  const before=ids.map(id=>{const p=session.measurements.find(p=>p.ms===session.current&&p.moon===id);return {moon:id,prior:p?structuredClone(p):null,marker:p?measurementMarkers.get(p.id):null};});
  for(const id of ids){let p=session.measurements.find(p=>p.ms===session.current&&p.moon===id);
    if(!p){p={id:session.nextId++,moon:id,ms:session.current,include:true,note:''};session.measurements.push(p);}
    p.x=x;p.pixel=xPixel;if(note!==undefined)p.note=note;
    measurementMarkers.set(p.id,{xPixel,yPixel,mag});
    if(overlap.length>1)p.overlap=[...overlap];else delete p.overlap;
  }
  undoStack.push({ms:session.current,before});if(undoStack.length>30)undoStack.shift();
  changed();renderAll();
  const names=ids.map(id=>MOONS.find(m=>m.id===id).name).join(' + '),replaced=before.filter(p=>p.prior).length;
  status(`${names}: ${x.toFixed(3)} Jupiter diameters ${replaced===ids.length?'replaced':'recorded'}${ids.length>1?' at the same clicked position':''}.`);
}
function undoMeasurement(){
  if(!undoStack.length)return;const action=undoStack.pop();
  for(const {moon,prior,marker} of action.before){
    const current=session.measurements.find(p=>p.ms===action.ms&&p.moon===moon);if(current)measurementMarkers.delete(current.id);
    session.measurements=session.measurements.filter(p=>!(p.ms===action.ms&&p.moon===moon));if(prior)session.measurements.push(prior);
    if(prior&&marker&&action.ms===session.current)measurementMarkers.set(prior.id,marker);
  }
  resetSelection();changed();renderAll();status('Last recording undone'+(action.ms===session.current?'.':' ('+utc(action.ms)+' UTC).'));
}
function invalidateUndo(){undoStack=[];$('undoMeasurement').disabled=true;}
function recordMeasurement(){
  if(!selected||selected.ms!==session.current||playing||overhead||weatherNow())throw new Error('Select a visible moon in a clear, paused telescope view.');
  const id=$('measureMoon').value,raw=$('measureX').value;
  if(!raw.trim())throw new Error('Enter your measured position.');
  saveMeasurements([id],selected.xPixel,selected.yPixel,{position:Number(raw),note:$('measureNote').value});
}
function stepTime(direction=1){
  if(direction<0&&locked())throw new Error('The instructor has disabled returning to earlier observations.');
  if(weatherNow()&&!playing&&!overhead&&!session.cloudLog.includes(session.current)){session.cloudLog.push(session.current);changed();}
  const next=session.current+direction*session.interval*3600000;if(!dateValid(next))throw new Error('The supported observing dates run from 1600 through 2200.');
  session.current=next;resetSelection();changed();renderAll();status('Observation: '+utc(session.current)+' UTC. Click a moon to record.');
}
function plotDomain(){const pts=moonData();if(plotView)return plotView;const ts=pts.map(p=>p.t);const lo=pts.length?Math.min(0,...ts):0,hi=pts.length?Math.max(1,...ts):10;const pad=(hi-lo)*.055;return [lo-pad,hi+pad];}
function renderPlot(){
  const pts=moonData(),fp=fitPoints(),f=session.fits[moon],domain=plotDomain(),residuals=$('showResiduals').checked;
  const W=1000,H=430,L=80,R=975,T=25,B=residuals?270:365,rb=365,rt=307;
  // Recorded positions anchor the axes; fitting moves only the curve.
  const ymax=Math.max(1,...pts.map(p=>Math.abs(p.x)*1.15)),x=t=>L+(t-domain[0])/(domain[1]-domain[0])*(R-L),y=v=>(T+B)/2-v/ymax*(B-T)/2;
  plotMeta={L,R,T,B,W,H,domain,ymax};
  let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${MOONS.find(m=>m.id===moon).name}: position versus elapsed days"><rect width="1000" height="430" fill="white"/><defs><clipPath id="clip"><rect x="${L}" y="${T}" width="${R-L}" height="${B-T}"/></clipPath></defs>`;
  for(let k=0;k<=6;k++){const t=domain[0]+k*(domain[1]-domain[0])/6,xx=x(t);out+=`<path d="M${xx} ${T}V${residuals?rb:B}" stroke="#e6edf3"/><text x="${xx}" y="390" font-size="14" text-anchor="middle" fill="#536d87">${t.toFixed((domain[1]-domain[0])<3?2:1)}</text>`;}
  for(let k=-2;k<=2;k++){const v=k*ymax/2,yy=y(v);out+=`<path d="M${L} ${yy}H${R}" stroke="${k===0?'#879db3':'#e6edf3'}"/><text x="${L-12}" y="${yy+5}" text-anchor="end" font-size="14" fill="#536d87">${v.toFixed(1)}</text>`;}
  out+=`<text x="${(L+R)/2}" y="420" font-size="15" fill="#435f7c" text-anchor="middle">Elapsed days from ${new Date(session.start).toISOString().slice(0,10)} UTC</text><text transform="translate(20 ${(B+T)/2}) rotate(-90)" font-size="15" fill="#435f7c" text-anchor="middle">East (+) / west (−), Jupiter diameters</text>`;
  out+='<g clip-path="url(#clip)">';
  if($('connectPoints').checked&&pts.length>1){out+=`<path d="${[...pts].sort((a,b)=>a.t-b.t).map((p,i)=>(i?'L':'M')+x(p.t)+','+y(p.x)).join(' ')}" fill="none" stroke="#a2b6c9"/>`;}
  if(f){const path=Array.from({length:601},(_,i)=>{const t=domain[0]+(domain[1]-domain[0])*i/600;return (i?'L':'M')+x(t)+','+y(sine(t,f));}).join(' ');out+=`<path d="${path}" fill="none" stroke="#bf7915" stroke-width="2.5"/>`;}
  for(const p of pts){const used=fp.some(v=>v.id===p.id);out+=`<circle cx="${x(p.t)}" cy="${y(p.x)}" r="4.5" fill="${used?'#235784':'white'}" stroke="${used?'#235784':'#8194a7'}" stroke-width="1.5"><title>${esc('Day '+p.t.toFixed(4)+', '+p.x.toFixed(3)+' Jup. diam.'+(used?'':' (outside fit)'))}</title></circle>`;}
  out+='</g>';
  if(!pts.length)out+=`<text x="525" y="${(T+B)/2-24}" font-size="19" fill="#72869a" text-anchor="middle">Record observations to build this graph</text>`;
  if(residuals){out+=`<path d="M${L} ${(rt+rb)/2}H${R}" stroke="#9ab0c5"/><text x="${L-10}" y="${(rt+rb)/2+5}" font-size="13" text-anchor="end" fill="#536d87">0</text><text x="${L}" y="${rt-7}" font-size="13" fill="#536d87">Residuals (Jup. diam.)</text>`;if(f){const max=Math.max(.01,...fp.map(p=>Math.abs(p.x-sine(p.t,f))));for(const p of fp){if(p.t<domain[0]||p.t>domain[1])continue;out+=`<circle cx="${x(p.t)}" cy="${(rt+rb)/2-(p.x-sine(p.t,f))/max*(rb-rt)*.43}" r="3" fill="#315f85"/>`;}out+=`<text x="${R}" y="${rt-7}" text-anchor="end" font-size="13" fill="#536d87">range ±${max.toFixed(4)}</text>`;}}
  out+='</svg>';$('plot').innerHTML=out;
  $('pointCount').textContent=fp.length+' included / '+pts.length+' observations';
  $('rms').textContent=f&&fp.length?residualRms(fp,f).toFixed(5):'—';
  const span=fp.length>1?Math.max(...fp.map(p=>p.t))-Math.min(...fp.map(p=>p.t)):0;
  $('fitWarning').textContent=f?(fp.length<5?'Fewer than five included points. These parameters are not well constrained.':span<f.period?'The observations cover less than one fitted period. Consider a longer observing span.':'A small residual does not rule out a different cycle count. Inspect the observations and your period estimate.'):'Manual estimates come first; refinement becomes available after a curve is plotted.';
  $('refine').disabled=!f||fp.length<5;$('clearFit').disabled=!f;
}
function loadFitControls(){const f=session.fits[moon];$('fitAmplitude').value=f?f.amplitude.toFixed(5):'';$('fitPeriod').value=f?f.period.toFixed(6):'';$('fitT0').value=f?f.t0.toFixed(6):'';range=session.ranges?.[moon]||[null,null];$('fitFrom').value=range[0]??'';$('fitTo').value=range[1]??'';setupSliders();}
function setupSliders(){const f=session.fits[moon],fine=$('fineSliders').checked;
  for(const [id,key] of [['amplitudeSlider','amplitude'],['periodSlider','period'],['t0Slider','t0']]){
    const el=$(id);el.disabled=!f;if(!f)continue;
    const v=f[key],width=fine?(key==='t0'?f.period*.03:Math.max(.01,v*.03)):(key==='t0'?f.period:Math.max(1,v*.6));
    // A low first guess must not prevent reaching the observed orbital extent.
    // Fine mode remains local; leaving it restores the full amplitude range.
    if(key==='amplitude'&&!fine){el.min=$('fitAmplitude').min;el.max=$('fitAmplitude').max;}
    else{el.min=key==='t0'?v-width:Math.max(key==='period'?.1:.001,v-width);el.max=key==='t0'?v+width:Math.min(key==='period'?100:30,v+width);}
    el.step='any';el.value=v;
  }
}
function setFit(f){if(!validateFit(f))throw new Error('Enter an amplitude above zero, a period from 0.1 to 100 days, and a valid zero crossing.');session.fits[moon]=f;changed();renderPlot();renderMass();}
function renderNotebook(){
  const rows=[...session.measurements].sort((a,b)=>a.ms-b.ms||MOONS.findIndex(m=>m.id===a.moon)-MOONS.findIndex(m=>m.id===b.moon));
  $('measurements').innerHTML=rows.map(p=>`<tr class="${p.include?'':'excluded'}"><td><input type="checkbox" data-include="${p.id}" ${p.include?'checked':''} aria-label="Include ${esc(p.moon)} observation at ${utc(p.ms)} in fit"></td><td>${utc(p.ms)}</td><td>${elapsed(p.ms).toFixed(3)}</td><td>${MOONS.find(m=>m.id===p.moon).name}</td><td>${p.x.toFixed(3)}</td><td>${esc(p.note)}${p.overlap?.length?' <span class="overlap-note">Overlap assignment</span>':''}</td><td><button data-edit="${p.id}">Edit</button> <button data-delete="${p.id}" aria-label="Delete ${esc(p.moon)} observation at ${utc(p.ms)}">Delete</button></td></tr>`).join('')+session.cloudLog.map(ms=>`<tr class="cloud-row"><td>—</td><td>${utc(ms)}</td><td>${elapsed(ms).toFixed(3)}</td><td colspan="4">Clouded out · no measurement</td></tr>`).join('');
  $('emptyNotebook').hidden=rows.length+session.cloudLog.length>0;
}
function renderMass(){const masses=[];$('massResults').innerHTML=MOONS.map(m=>{const f=session.fits[m.id];if(!f)return `<tr><td>${m.roman} · ${m.name}</td><td colspan="6" class="subtle">Enter and fit this moon’s orbit to calculate a mass.</td></tr>`;const v=massFromFit(f);masses.push(v);return `<tr><td>${m.roman} · ${m.name}</td><td>${f.amplitude.toFixed(4)}</td><td>${f.period.toFixed(5)}</td><td>${v.radiusAU.toFixed(6)}</td><td>${v.periodYears.toFixed(6)}</td><td>${v.kg.toExponential(4)}</td><td>${v.earth.toFixed(2)}</td></tr>`;}).join('');$('averageMass').textContent=masses.length?'Unweighted mean of '+masses.length+' orbit'+(masses.length===1?'':'s')+': '+(masses.reduce((a,m)=>a+m.kg,0)/masses.length).toExponential(4)+' kg · '+(masses.reduce((a,m)=>a+m.earth,0)/masses.length).toFixed(2)+' Earth masses':'Four moons provide four independent estimates of the same planet’s mass.';}
function download(name,content,type){const b=new Blob([content],{type}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let reportGeneratedAt=Date.now(),reportFigure=null;
function refreshReport(){
  reportFigure=buildReport(session,{scope:$('reportScope').value,moon,generatedAt:reportGeneratedAt});
  $('reportTime').textContent=reportTime(reportGeneratedAt);$('reportPreview').innerHTML=reportFigure.svg;
  return reportFigure;
}
function openReport(){
  stop();reportGeneratedAt=Date.now();$('reportMembers').value=session.student;$('reportGroup').value=session.group;
  $('reportMembers').setCustomValidity('');
  $('reportScope').options[1].textContent='Current moon: '+MOONS.find(m=>m.id===moon).name;
  $('reportError').hidden=true;refreshReport();$('reportDialog').showModal();
  if(!session.student.trim())$('reportMembers').focus();
}
function validReport(){
  $('reportMembers').setCustomValidity($('reportMembers').value.trim()?'':'Enter the lab group members’ names.');
  return $('reportForm').reportValidity();
}
function preparePrint(){
  reportGeneratedAt=Date.now();$('printedFigure').innerHTML=refreshReport().svg;
}
function reportError(err){$('reportError').textContent=err.message||String(err);$('reportError').hidden=false;}
async function confirmAction(title,text){$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmDialog').showModal();return new Promise(resolve=>confirmResolver=resolve);}
function finishConfirm(result){$('confirmDialog').close();confirmResolver?.(result);confirmResolver=null;}
async function pinHash(s){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
function openSettings(){const s=session.settings;for(const [id,key] of [['settingIdentify','identify'],['settingDistances','distances'],['settingClouds','clouds'],['settingRestart','restart']])$(id).checked=s[key];$('settingPercent').value=s.percentCloudy;$('settingInstructions').value=s.instructions;$('settingPin').value='';$('settingsDialog').showModal();}
function resetSession(start){const settings={...session.settings},student=session.student,group=session.group;stop();session=newSession(start);measurementMarkers.clear();invalidateUndo();session.settings=settings;session.student=student;session.group=group;plotView=null;range=[null,null];resetSelection();loadFitControls();changed();renderAll();}

$('sky').addEventListener('pointermove',e=>{
  const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)*1000/b.width,y=(e.clientY-b.top)*360/b.height;
  if(!selected&&!ruler)$('cursorReadout').textContent=`x = ${x.toFixed(1)} px · y = ${y.toFixed(1)} px`;
  const active=!overhead&&!playing&&!weatherNow()&&ruler===null&&!pendingPick;
  const candidates=active?candidatesAt(x,y,b.width):[],star=active?starAt(x,y,b.width,candidates[0]):null;hovered=star||candidates[0]||null;
  const tip=$('moonHover');tip.hidden=!hovered||!session.settings.identify;
  if(!tip.hidden){
    if(star){const detail=document.createElement('span');detail.className='hover-detail';detail.textContent=`Background star · Vₜ ${star.magnitude.toFixed(2)}`;tip.replaceChildren(document.createTextNode(star.id),detail);}
    else tip.textContent=candidates.map(p=>p.name).join(' + ')+(candidates.length>1?' · overlapping / nearby':hovered.transit?' · in transit':'');
    positionHover(tip,hovered,b);
  }
});
$('sky').addEventListener('pointerleave',()=>{$('moonHover').hidden=true;hovered=null;});
$('sky').addEventListener('click',run(e=>{if(overhead||playing||weatherNow())return;const b=e.currentTarget.getBoundingClientRect(),x=(e.clientX-b.left)*1000/b.width,y=(e.clientY-b.top)*360/b.height;if(ruler){ruler.push(x);if(ruler.length===2){$('cursorReadout').textContent='Horizontal separation: '+Math.abs(ruler[1]-ruler[0]).toFixed(2)+' detector pixels';$('rulerButton').textContent='Clear scale marks';}else if(ruler.length>2){ruler=[x];}renderScene();return;}$('sky').focus({preventScroll:true});let candidates=candidatesAt(x,y,b.width);if(starAt(x,y,b.width,candidates[0]))candidates=[];if(candidates.length>1&&session.settings.identify&&session.settings.distances)showPick(candidates,x,y);else if(candidates.length)selectTarget(candidates[0],x,y);else{closePick();status('No moon selected here. Background stars are not moon targets.');}}));
$('rulerButton').addEventListener('click',()=>{closePick();ruler=ruler?null:[];selected=null;$('rulerButton').textContent=ruler?'Cancel ruler':'Measure scale';$('cursorReadout').textContent=ruler?'Click the left and right edges of Jupiter to measure its diameter.':'Detector: 1000 × 360 pixels';renderScene();});
$('cancelOverlap').addEventListener('click',()=>{closePick();$('sky').focus({preventScroll:true});});
$('undoMeasurement').addEventListener('click',undoMeasurement);
for(const [id,key] of [['imageBrightness','brightness'],['imageContrast','contrast']])$(id).addEventListener('input',e=>{session.settings[key]=Number(e.target.value);changed();syncControls();renderScene();});
$('resetImage').addEventListener('click',()=>{session.settings.brightness=0;session.settings.contrast=1;changed();syncControls();renderScene();});
document.addEventListener('keydown',run(e=>{
  if(e.target.closest?.('input,textarea,select,[contenteditable="true"],dialog')||document.querySelector('dialog[open]'))return;
  if(!e.target.closest?.('.telescope-panel,.observing-controls')&&e.target!==document.body)return;
  if(e.key==='Escape'){closePick();$('sky').focus({preventScroll:true});return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undoMeasurement();return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();if(e.repeat)return;stop();stepTime(e.key==='ArrowRight'?1:-1);}
}));
$('measurementForm').addEventListener('submit',run(e=>{e.preventDefault();recordMeasurement();}));
document.querySelectorAll('[data-mag]').forEach(b=>b.addEventListener('click',()=>{mag=+b.dataset.mag;resetSelection();document.querySelectorAll('[data-mag]').forEach(v=>v.setAttribute('aria-pressed',String(v===b)));renderScene();}));
$('overhead').addEventListener('change',e=>{overhead=e.target.checked;resetSelection();syncControls();renderScene();});
$('viewMode').addEventListener('change',e=>{session.settings.viewMode=e.target.value;resetSelection();changed();syncControls();renderScene();});
$('seeing').addEventListener('input',e=>{session.settings.seeing=Number(e.target.value);changed();syncControls();renderScene();});
$('colorMoons').addEventListener('change',e=>{session.settings.colors=e.target.checked;changed();renderScene();});
$('interval').addEventListener('change',run(()=>{if(locked()){$('interval').value=session.interval;throw new Error('The instructor has locked the observing interval.');}const v=Number($('interval').value);if(!(v>=.05&&v<=168)){$('interval').value=session.interval;throw new Error('Choose an interval from 0.05 to 168 hours.');}session.interval=v;changed();}));
$('nextTime').addEventListener('click',run(()=>{stop();stepTime(1);}));$('previousTime').addEventListener('click',run(()=>{stop();stepTime(-1);}));
$('animate').addEventListener('click',run(()=>{if(playing){stop();changed();return;}resetSelection();$('animate').textContent='Pause motion';playing=setInterval(()=>{const ms=session.current+Math.max(.05,session.interval)/12*3600000;if(!dateValid(ms)){stop();return;}session.current=ms;renderScene();},100);renderScene();}));
$('beginSession').addEventListener('click',run(async()=>{if(locked())throw new Error('The instructor has disabled restarting observations.');const start=new Date($('startTime').value+'Z').getTime(),interval=Number($('interval').value);if(!dateValid(start)||!(interval>=.05&&interval<=168))throw new Error('Enter a date from 1600–2200 and an interval from 0.05–168 hours.');if((session.measurements.length||session.cloudLog.length||session.notes)&&!await confirmAction('Start a new observing sequence?','This clears the current observations, fits, and notes. Save a session first if you want to keep them.'))return;resetSession(start);session.interval=interval;syncControls();status('Observing sequence set. Select a moon to begin measuring.');}));
$('newSession').addEventListener('click',run(async()=>{if(locked())throw new Error('Restarting is disabled.');if(dirty&&!await confirmAction('Start a new session?','Unsaved observations will be cleared. Save a session file first to keep them.'))return;resetSession(midnight);status('New session started. Instructor settings have been retained.');}));
$('saveSession').addEventListener('click',()=>{stop();download('jupiter-lab-'+new Date(session.start).toISOString().slice(0,10)+'.json',JSON.stringify(session,null,2),'application/json');dirty=false;$('saveState').textContent='Session download requested. Keep the file to reopen your work.';status('Session file prepared for download.');});
$('loadSession').addEventListener('click',()=>{if(!locked())$('sessionFile').click();});
$('sessionFile').addEventListener('change',run(async e=>{const file=e.target.files[0];if(!file)return;try{if(locked())throw new Error('Opening another session is disabled by the instructor.');if(file.size>6000000)throw new Error('Session file is too large.');const s=validateSession(JSON.parse(await file.text()));if(dirty&&!await confirmAction('Open another session?','This replaces the current unsaved work. Continue only if you have saved anything you need.'))return;stop();session=s;measurementMarkers.clear();invalidateUndo();plotView=null;resetSelection();loadFitControls();dirty=false;renderAll();$('saveState').textContent='Opened '+file.name;status('Session restored: '+session.measurements.length+' recorded observations.');}finally{e.target.value='';}}));
$('exportCsv').addEventListener('click',()=>{download('jupiter-measurements.csv',csvText(session),'text/csv;charset=utf-8');status('Data Tool CSV prepared: elapsed days and four moon position columns. Missing observations are blank; inclusion flags and notes are retained.');});
for(const id of ['exportPlot','printPlot','printLab'])$(id).addEventListener('click',openReport);
$('reportScope').addEventListener('change',refreshReport);
for(const [id,key] of [['reportMembers','student'],['reportGroup','group']])$(id).addEventListener('input',e=>{e.target.setCustomValidity('');session[key]=e.target.value;$(key).value=e.target.value;changed();refreshReport();});
$('reportForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!validReport())return;$('reportError').hidden=true;$('saveReportPng').disabled=true;
  try{reportGeneratedAt=Date.now();const figure=refreshReport(),blob=await reportPng(figure);download(figure.filename,blob,'image/png');status('PNG report prepared for download.');}
  catch(err){reportError(err);}finally{$('saveReportPng').disabled=false;}
});
$('printReport').addEventListener('click',()=>{if(!validReport())return;try{preparePrint();$('reportDialog').close();window.print();}catch(err){reportError(err);}});
window.addEventListener('beforeprint',()=>{stop();preparePrint();});
for(const key of ['student','group','notes'])$(key).addEventListener('input',e=>{session[key]=e.target.value;changed();});
$('analysisMoon').addEventListener('change',e=>{moon=e.target.value;plotView=null;loadFitControls();renderPlot();});
for(const id of ['connectPoints','showResiduals'])$(id).addEventListener('change',renderPlot);
$('fitForm').addEventListener('submit',run(e=>{e.preventDefault();const values=['fitAmplitude','fitPeriod','fitT0'].map(id=>$(id).value);if(values.some(v=>!v.trim()))throw new Error('Enter all three estimates.');setFit({amplitude:+values[0],period:+values[1],t0:+values[2]});setupSliders();status('Your curve is plotted. Adjust it by eye, then compare the residuals.');}));
for(const [id,key,field]of [['amplitudeSlider','amplitude','fitAmplitude'],['periodSlider','period','fitPeriod'],['t0Slider','t0','fitT0']])$(id).addEventListener('input',run(e=>{const f={...session.fits[moon],[key]:Number(e.target.value)};$(field).value=f[key].toFixed(6);setFit(f);}));
$('fineSliders').addEventListener('change',setupSliders);
$('refine').addEventListener('click',run(()=>{setFit(refineFit(fitPoints(),session.fits[moon]));loadFitControls();status('Local least-squares refinement finished. Check that the cycle count still makes sense.');}));
$('clearFit').addEventListener('click',()=>{delete session.fits[moon];changed();loadFitControls();renderPlot();renderMass();});
$('applyRange').addEventListener('click',run(()=>{const a=$('fitFrom').value.trim(),b=$('fitTo').value.trim();const nextRange=[a===''?null:Number(a),b===''?null:Number(b)];if(nextRange.some(v=>v!==null&&!Number.isFinite(v))||(nextRange[0]!==null&&nextRange[1]!==null&&nextRange[0]>=nextRange[1]))throw new Error('Fit start must be earlier than fit end.');range=nextRange;session.ranges??={};session.ranges[moon]=range;changed();renderPlot();}));
$('clearRange').addEventListener('click',()=>{range=[null,null];if(session.ranges)delete session.ranges[moon];$('fitFrom').value='';$('fitTo').value='';changed();renderPlot();});
function zoom(factor){const [lo,hi]=plotDomain(),mid=(lo+hi)/2,span=Math.min(10000,Math.max(.02,(hi-lo)*factor));plotView=[mid-span/2,mid+span/2];renderPlot();}
$('zoomIn').addEventListener('click',()=>zoom(.65));$('zoomOut').addEventListener('click',()=>zoom(1/.65));$('resetZoom').addEventListener('click',()=>{plotView=null;renderPlot();});
let drag=null;
$('plot').addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;drag={x:e.clientX,domain:plotDomain()};$('plot').setPointerCapture?.(e.pointerId);});
$('plot').addEventListener('pointermove',e=>{const b=$('plot').getBoundingClientRect();if(drag){const dt=(e.clientX-drag.x)/b.width*(drag.domain[1]-drag.domain[0]);plotView=drag.domain.map(v=>v-dt);renderPlot();return;}if(!plotMeta)return;const {L,R,T,B,domain,ymax}=plotMeta,px=(e.clientX-b.left)*1000/b.width,py=(e.clientY-b.top)*430/b.height,t=domain[0]+(px-L)/(R-L)*(domain[1]-domain[0]),v=((B+T)/2-py)*2*ymax/(B-T);$('plotReadout').textContent='Day '+t.toFixed(4)+' · '+v.toFixed(4)+' Jupiter diameters';});
for(const evt of ['pointerup','pointercancel','lostpointercapture'])$('plot').addEventListener(evt,()=>drag=null);
$('plot').addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){zoom(.65);e.preventDefault();}if(e.key==='-'){zoom(1/.65);e.preventDefault();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const d=plotDomain(),shift=(d[1]-d[0])*.15*(e.key==='ArrowLeft'?-1:1);plotView=d.map(v=>v+shift);renderPlot();e.preventDefault();}});
$('measurements').addEventListener('change',e=>{if(e.target.dataset.include){const p=session.measurements.find(p=>p.id===+e.target.dataset.include);p.include=e.target.checked;invalidateUndo();changed();renderNotebook();renderPlot();}});
const edit=document.createElement('dialog');edit.id='editDialog';edit.innerHTML='<div class="dialog-heading"><h2>Edit measurement</h2><button type="button" id="closeEdit">Close</button></div><form id="editForm" class="guide-body"><p id="editDescription"></p><label>Moon<select id="editMoon">'+MOONS.map(m=>`<option value="${m.id}">${m.name}</option>`).join('')+'</select></label><label>Position (Jupiter diameters)<input id="editX" type="number" min="-30" max="30" step="0.001" required></label><label>Note<input id="editNote" maxlength="1000"></label><button class="primary" type="submit">Save measurement</button></form>';document.body.append(edit);let editId=null;
$('closeEdit').addEventListener('click',()=>edit.close());
$('measurements').addEventListener('click',run(async e=>{const id=Number(e.target.dataset.edit||e.target.dataset.delete);if(!id)return;const p=session.measurements.find(p=>p.id===id);if(e.target.dataset.delete){if(await confirmAction('Delete this measurement?',`${MOONS.find(m=>m.id===p.moon).name} at ${utc(p.ms)} UTC will be removed from this session.`)){session.measurements=session.measurements.filter(p=>p.id!==id);resetSelection();invalidateUndo();changed();renderAll();}}else{editId=id;$('editDescription').textContent=utc(p.ms)+' UTC · elapsed day '+elapsed(p.ms).toFixed(4);$('editMoon').value=p.moon;$('editX').value=p.x;$('editNote').value=p.note;edit.showModal();}}));
$('editForm').addEventListener('submit',run(e=>{e.preventDefault();const p=session.measurements.find(p=>p.id===editId),x=Number($('editX').value),id=$('editMoon').value;if(!$('editX').value.trim()||!Number.isFinite(x)||Math.abs(x)>30)throw new Error('Enter a valid signed position.');if(session.measurements.some(v=>v.id!==p.id&&v.ms===p.ms&&v.moon===id))throw new Error('Another measurement already assigns this moon at this time.');if(x!==p.x){const mark=measurementMarkers.get(p.id);if(mark)measurementMarkers.set(p.id,{...mark,xPixel:500-x*(1000/(32*100/mark.mag))});}resetSelection();p.x=x;p.moon=id;p.note=$('editNote').value;invalidateUndo();edit.close();changed();renderAll();}));
for(const [button,dialog]of [['guideButton','guideDialog'],['provenanceButton','provenanceDialog']])$(button).addEventListener('click',()=>{stop();$(dialog).showModal();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('settingsButton').addEventListener('click',()=>{stop();if(session.settings.pinHash){$('pinEntry').value='';$('pinError').hidden=true;$('pinDialog').showModal();}else openSettings();});
$('pinForm').addEventListener('submit',run(async e=>{e.preventDefault();if(await pinHash($('pinEntry').value)===session.settings.pinHash){$('pinDialog').close();openSettings();}else $('pinError').hidden=false;}));
$('settingsForm').addEventListener('submit',run(async e=>{e.preventDefault();const percent=Number($('settingPercent').value),pin=$('settingPin').value;if(!Number.isFinite(percent)||percent<0||percent>100)throw new Error('Cloud percentage must be between 0 and 100.');if(pin&&pin.length<4)throw new Error('Use at least four characters for the PIN.');const hash=pin?await pinHash(pin):session.settings.pinHash;for(const [id,key]of [['settingIdentify','identify'],['settingDistances','distances'],['settingClouds','clouds'],['settingRestart','restart']])session.settings[key]=$(id).checked;session.settings.percentCloudy=percent;session.settings.instructions=$('settingInstructions').value;session.settings.pinHash=hash;resetSelection();changed();$('settingsDialog').close();renderAll();status('Instructor settings applied. Save an empty session to reuse this setup.');}));
$('confirmCancel').addEventListener('click',()=>finishConfirm(false));$('confirmOk').addEventListener('click',()=>finishConfirm(true));$('confirmDialog').addEventListener('cancel',()=>{confirmResolver?.(false);confirmResolver=null;});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
// Structured actions use the same validation and state as visible controls.
if(document.modelContext?.registerTool){const lifecycle=new AbortController();for(const tool of [
 {name:'read_jupiter_lab_session',description:'Read recorded observations and fits in this Jupiter lab session.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('No arguments expected.');return ({start:session.start,current:session.current,measurements:session.measurements.map(p=>({...p})),fits:structuredClone(session.fits),notes:session.notes});}},
 {name:'advance_jupiter_observation',description:'Advance to the next observing time; records a cloudy gap when applicable.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('No arguments expected.');stop();stepTime(1);return {utc:new Date(session.current).toISOString(),cloudedOut:weatherNow()};}}
])try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
// Read-only test/debug access does not reveal unmeasured orbital coordinates.
export const getSession=()=>structuredClone(session);
loadFitControls();renderAll();
