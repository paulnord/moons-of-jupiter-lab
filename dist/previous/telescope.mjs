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
export const FRAMES=raw.map(([id,time,...crop])=>({id,time,crop,phase:phase(Date.parse(time)),url:`../assets/jupiter/jupiter_2024_view_${String(id).padStart(2,'0')}.png`}));
export function frameForTime(ms){const p=phase(ms);return FRAMES.reduce((a,b)=>{
  const distance=f=>Math.min(Math.abs(f.phase-p),ROTATION_MS-Math.abs(f.phase-p));
  return distance(b)<distance(a)?b:a;
});}
export function opticalSigma(scale,mode,seeing){
  // Seeing FWHM is expressed as a fraction of a nominal 40-arcsecond disk.
  // It is illustrative, not an observing-date-dependent instrument model.
  return Math.hypot(.42,scale*(mode==='ground'?seeing/40/2.355:.002));
}
export function paintTelescope(c,{surface,frame,image,scale,moons,mode='space',seeing=2}){
  const k=4,g=surface.getContext('2d');
  g.setTransform(k,0,0,k,0,0);g.clearRect(0,0,1000,360);
  g.fillStyle='#000';g.fillRect(0,0,1000,360);
  const disk=()=>{g.beginPath();g.ellipse(500,180,scale/2,scale/2*66854/71492,0,0,Math.PI*2);};
  const moon=p=>{
    if(p.eclipsed||p.sx< -10||p.sx>1010||p.sy< -10||p.sy>370)return;
    const r=p.moonRadius*scale;
    // An unresolved source appears as a point-spread footprint, not a tiny
    // low-opacity antialiased polygon. The display exposure is illustrative.
    // Suppress this extra footprint on transit so the physical opaque disk
    // covers the clouds without a bright identification halo.
    if(!p.transit&&r<1.1){
      const flux=(p.radiusKm/2631.2)**2*p.albedo/.44;
      const glow=g.createRadialGradient(p.sx,p.sy,0,p.sx,p.sy,1.65);
      if(glow){glow.addColorStop(0,`rgba(247,242,230,${Math.min(.98,.95*Math.sqrt(flux))})`);glow.addColorStop(.45,`rgba(240,235,223,${.42*Math.sqrt(flux)})`);glow.addColorStop(1,'rgba(240,235,223,0)');
        g.fillStyle=glow;g.beginPath();g.arc(p.sx,p.sy,1.65,0,Math.PI*2);g.fill();}
    }
    // Neutral reflectance, with Io only slightly warmer. No identification colors.
    const level=Math.round(230*Math.sqrt(p.albedo/.68));
    g.fillStyle=p.id==='io'?`rgb(${level},${Math.round(level*.96)},${Math.round(level*.85)})`:`rgb(${level},${level},${Math.round(level*.98)})`;
    g.beginPath();g.arc(p.sx,p.sy,r,0,Math.PI*2);g.fill();
  };
  // Far-side light is covered by the opaque planetary disk, including its dark limb.
  for(const p of moons)if(p.z>0&&!p.occulted)moon(p);
  g.save();disk();g.clip();g.fillStyle='#000';g.fillRect(500-scale/2,180-scale/2,scale,scale);
  if(image)g.drawImage(image,...frame.crop,500-scale/2,180-scale/2*66854/71492,scale,scale*66854/71492);
  // Computed shadows are separate from moon silhouettes and move independently.
  for(const p of moons){const s=p.shadow;if(!s)continue;
    g.fillStyle='#080705';g.beginPath();
    g.ellipse(500-s.x*scale,180-s.y*scale,s.radius*scale*Math.max(.12,s.foreshorten),s.radius*scale,s.angle,0,Math.PI*2);g.fill();
  }
  g.restore();
  for(const p of moons)if(p.z<=0)moon(p);
  c.save();c.filter=`blur(${opticalSigma(scale,mode,seeing)}px)`;
  c.drawImage(surface,0,0,1000,360);c.restore();
  return !!image;
}
export function createTelescopeRenderer(onReady){
  const surface=document.createElement('canvas');surface.width=4000;surface.height=1440;
  const images=new Map(),failed=new Set();
  for(const frame of FRAMES){const img=document.createElement('img');
    img.onload=()=>{images.set(frame.id,img);onReady();};
    img.onerror=()=>{failed.add(frame.id);onReady();};
    img.src=frame.url;
  }
  return (c,options)=>{const frame=frameForTime(options.ms),image=images.get(frame.id);
    const ready=paintTelescope(c,{...options,surface,frame,image});
    return {ready,failed:failed.has(frame.id),frame};
  };
}
