// Photographic Jupiter and physical moon disks share one optical blur.
// All coordinates are detector pixels; picking remains in app.mjs.
export const PHOTO_EPOCH=Date.UTC(2024,0,5,20,46);
export const ROTATION_MS=9.925*3600000;
const phase=ms=>((ms-PHOTO_EPOCH)%ROTATION_MS+ROTATION_MS)%ROTATION_MS;
const raw=[
  [1,'2024-01-05T20:46:20Z',122,148,1079,1022],
  [2,'2024-01-05T22:14:56Z',119,142,1083,1024],
  [3,'2024-01-05T23:47:34Z',119,143,1083,1023],
  [7,'2024-01-06T06:07:19Z',117,141,1083,1024],
  [8,'2024-01-06T07:42:16Z',118,142,1081,1020],
  [9,'2024-01-06T09:17:12Z',119,142,1082,1023],
  [10,'2024-01-06T10:52:08Z',118,142,1082,1023],
  [11,'2024-01-06T14:03:46Z',119,142,1081,1022],
  [12,'2024-01-06T15:42:47Z',119,143,1081,1022],
];
export const FRAMES=raw.map(([id,time,...crop])=>({id,time,crop,phase:phase(Date.parse(time)),url:`assets/jupiter/jupiter_2024_view_${String(id).padStart(2,'0')}.png`}));
export function frameForTime(ms){const p=phase(ms);return FRAMES.reduce((a,b)=>{
  const distance=f=>Math.min(Math.abs(f.phase-p),ROTATION_MS-Math.abs(f.phase-p));
  return distance(b)<distance(a)?b:a;
});}
export function opticalSigma(scale,mode,seeing){
  // Seeing FWHM is expressed as a fraction of a nominal 40-arcsecond disk.
  // It is illustrative, not an observing-date-dependent instrument model.
  return Math.hypot(.42,scale*(mode==='ground'?seeing/40/2.355:.002));
}
// The source photography is display-ready RGB, not raw Hubble detector data.
// Decode it to linear intensity, then retain the simulated optical image as
// Float32 RGB. Moon coverage, stars, blur and glare are computed before display.
const W=1000,H=360,CHANNELS=3;
const linear=Float32Array.from({length:256},(_,i)=>{const s=i/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const inPlanet=(x,y,scale)=>((x-500)/(scale/2))**2+((y-180)/(scale/2*66854/71492))**2<=1;
function gaussianBlur(input,sigma){
  const radius=Math.ceil(sigma*3),kernel=[];let sum=0;
  for(let i=-radius;i<=radius;i++){const v=Math.exp(-.5*(i/sigma)**2);kernel.push(v);sum+=v;}
  for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
  const tmp=new Float32Array(input.length),out=new Float32Array(input.length);
  // Skip empty pixels/rows while preserving the same normalized PSF for all light.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const dst=(y*W+x)*3;
    for(let k=-radius;k<=radius;k++){const xx=x+k;if(xx<0||xx>=W)continue;const src=(y*W+xx)*3,w=kernel[k+radius];
      tmp[dst]+=input[src]*w;tmp[dst+1]+=input[src+1]*w;tmp[dst+2]+=input[src+2]*w;}
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const dst=(y*W+x)*3;
    for(let k=-radius;k<=radius;k++){const yy=y+k;if(yy<0||yy>=H)continue;const src=(yy*W+x)*3,w=kernel[k+radius];
      out[dst]+=tmp[src]*w;out[dst+1]+=tmp[src+1]*w;out[dst+2]+=tmp[src+2]*w;}
  }
  return out;
}
export function captureTelescope({surface,frame,image,scale,moons,stars=[],mode='space',seeing=2}){
  const g=surface.getContext('2d'),k=4,raw=new Float32Array(W*H*CHANNELS);
  // Supersample the photographic disk and shadows; the originals are unchanged.
  g.setTransform(k,0,0,k,0,0);g.clearRect(0,0,W,H);g.save();
  g.beginPath();g.ellipse(500,180,scale/2,scale/2*66854/71492,0,0,Math.PI*2);g.clip();
  g.fillStyle='#000';g.fillRect(500-scale/2,180-scale/2,scale,scale);
  if(image)g.drawImage(image,...frame.crop,500-scale/2,180-scale/2*66854/71492,scale,scale*66854/71492);
  for(const p of moons){const s=p.shadow;if(!s)continue;g.fillStyle='#080705';g.beginPath();
    g.ellipse(500-s.x*scale,180-s.y*scale,s.radius*scale*Math.max(.12,s.foreshorten),s.radius*scale,s.angle,0,Math.PI*2);g.fill();}
  g.restore();
  const left=Math.floor(500-scale/2)-1,top=Math.floor(180-scale/2)-1,size=Math.ceil(scale)+3;
  const pixels=g.getImageData(left*k,top*k,size*k,size*k)?.data;
  if(!pixels)return {width:W,height:H,data:raw}; // DOM test contexts have no raster.
  let total=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dst=((top+y)*W+left+x)*3;if(dst<0||dst+2>=raw.length)continue;
    for(let sy=0;sy<k;sy++)for(let sx=0;sx<k;sx++){
      const j=((y*k+sy)*size*k+x*k+sx)*4;
      for(let ch=0;ch<3;ch++)raw[dst+ch]+=linear[pixels[j+ch]]/16;
    }total+=(raw[dst]+raw[dst+1]+raw[dst+2])/3;
  }
  // A star is an unresolved source. Its intrinsic tiny footprint is convolved
  // with exactly the same optical PSF as the planet and moon disks.
  for(const s of stars){
    const sx=500-s.x*scale,sy=180-s.y*scale;
    const flux=Math.PI*(1821.49/142984*scale)**2*.62*10**(-.4*(s.magnitude-5));
    const weights=[];let sum=0;
    for(let y=Math.floor(sy)-2;y<=Math.floor(sy)+2;y++)for(let x=Math.floor(sx)-2;x<=Math.floor(sx)+2;x++){
      const w=Math.exp(-((x+.5-sx)**2+(y+.5-sy)**2)/(.32**2*2));weights.push({x,y,w});sum+=w;
    }
    for(const {x,y,w} of weights){if(x<0||x>=W||y<0||y>=H||inPlanet(x+.5,y+.5,scale))continue;
      const dst=(y*W+x)*3;for(let ch=0;ch<3;ch++)raw[dst+ch]+=flux*w/sum;
    }
  }
  // Physical subpixel moon disks. Retaining fractional coverage in Float32
  // avoids losing faint moon light to an intermediate 8-bit display buffer.
  for(const p of [...moons].sort((a,b)=>b.z-a.z)){
    if(p.eclipsed||p.occulted)continue;
    const r=p.moonRadius*scale,cx=500-p.x*scale,cy=180-p.y*scale;
    const colors=p.id==='io'?[p.albedo,p.albedo*.92,p.albedo*.73]:[p.albedo,p.albedo,p.albedo*.97];
    for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(H-1,Math.ceil(cy+r));y++)for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(W-1,Math.ceil(cx+r));x++){
      let covered=0;for(let sy=0;sy<8;sy++)for(let sx=0;sx<8;sx++){
        const px=x+(sx+.5)/8,py=y+(sy+.5)/8;
        if((px-cx)**2+(py-cy)**2<=r*r&&!(p.z>0&&inPlanet(px,py,scale)))covered++;
      }
      const alpha=covered/64,dst=(y*W+x)*3;
      for(let ch=0;ch<3;ch++)raw[dst+ch]=raw[dst+ch]*(1-alpha)+colors[ch]*alpha;
    }
  }
  const light=gaussianBlur(raw,opticalSigma(scale,mode,seeing));
  // Fixed illustrative scattered-light halo, part of the capture, not a
  // brightness-dependent bloom. Display stretching merely reveals more of it.
  const mean=total/(Math.PI*(scale/2)**2*66854/71492),wing=scale*.12+1.5;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const rho=Math.hypot(x+.5-500,(y+.5-180)/(66854/71492));
    const d=Math.max(0,rho-scale/2),halo=mean*(mode==='ground'?.022:.012)/(1+(d/wing)**2)**1.5;
    const dst=(y*W+x)*3;light[dst]+=halo;light[dst+1]+=halo*.96;light[dst+2]+=halo*.88;
  }
  return {width:W,height:H,data:light};
}
let toneKey='',toneTable;
export function displayTelescope(c,capture,{brightness=0,contrast=1}={}){
  const key=String(contrast);if(toneKey!==key){
    toneKey=key;toneTable=Uint8ClampedArray.from({length:65536},(_,i)=>{
      const v=(i/65535)**contrast;return 255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055);
    });
  }
  const image=c.createImageData(W,H);if(!image?.data)return;
  const gain=2**brightness,data=capture.data,out=image.data;
  for(let i=0,j=0;i<data.length;i+=3,j+=4){
    out[j]=toneTable[clamp(Math.round(data[i]*gain*65535),0,65535)];
    out[j+1]=toneTable[clamp(Math.round(data[i+1]*gain*65535),0,65535)];
    out[j+2]=toneTable[clamp(Math.round(data[i+2]*gain*65535),0,65535)];out[j+3]=255;
  }
  c.putImageData(image,0,0);
}
export function paintTelescope(c,options){
  const capture=captureTelescope(options);displayTelescope(c,capture,options);return !!options.image;
}
export function createTelescopeRenderer(onReady){
  const surface=document.createElement('canvas');surface.width=4000;surface.height=1440;
  const images=new Map(),failed=new Set();let lastKey='',capture=null,requested=null;
  for(const frame of FRAMES){const img=document.createElement('img');
    img.onload=()=>{images.set(frame.id,img);if(requested===frame.id)onReady();};
    img.onerror=()=>{failed.add(frame.id);if(requested===frame.id)onReady();};img.src=frame.url;
  }
  return (c,options)=>{
    const frame=frameForTime(options.ms),image=images.get(frame.id);requested=frame.id;
    if(!image)return {ready:false,failed:failed.has(frame.id),frame};
    const key=[options.ms,options.scale,options.mode,options.seeing,frame.id,options.stars?.map(s=>s.id).join(',')].join(':');
    if(lastKey!==key){capture=captureTelescope({...options,surface,frame,image});lastKey=key;}
    displayTelescope(c,capture,options);return {ready:true,failed:false,frame};
  };
}
