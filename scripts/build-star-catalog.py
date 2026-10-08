"""Build a reproducible Tycho-2 ecliptic subset from CDS/VizieR.
Requires network only at build time; the Site serves local 30-degree RA tiles.
"""
import csv,io,json,math,struct,hashlib,urllib.request,urllib.parse,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/assets/stars';OUT.mkdir(exist_ok=True)
BASE='https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync'
BAND=5.0;LIMIT=12.0;eps=math.radians(23.4392911)
def query(q):
 u=BASE+'?'+urllib.parse.urlencode({'REQUEST':'doQuery','LANG':'ADQL','FORMAT':'csv','MAXREC':'300000','QUERY':q})
 cache=Path(tempfile.gettempdir())/'jupiter-tycho-cache';cache.mkdir(exist_ok=True)
 saved=cache/(hashlib.sha256(q.encode()).hexdigest()+'.csv')
 if saved.exists():b=saved.read_bytes()
 else:
  with urllib.request.urlopen(u,timeout=90) as response:
   chunks=[];size=0
   while True:
    chunk=response.read(1024*1024)
    if not chunk:break
    chunks.append(chunk);size+=len(chunk);print('Catalog bytes:',size,flush=True)
   b=b''.join(chunks)
  if not b.startswith(b'<?xml'):saved.write_bytes(b)
 if b.startswith(b'<?xml'):raise RuntimeError(b.decode()[:1200])
 return list(csv.DictReader(io.StringIO(b.decode()))),hashlib.sha256(b).hexdigest()
def number(v):
 try:return float(v)
 except (ValueError,TypeError):return None
def inside(ra,dec):
 return abs(math.sin(math.radians(dec))*math.cos(eps)-math.cos(math.radians(dec))*math.sin(math.radians(ra))*math.sin(eps))<=math.sin(math.radians(BAND))
# Query the ecliptic strip; repeat the cut locally at the stored position epoch.
q='SELECT TYC1,TYC2,TYC3,RAmdeg,DEmdeg,pmRA,pmDE,VTmag,"RA(ICRS)","DE(ICRS)","EpRA-1990","EpDE-1990" FROM "I/259/tyc2" WHERE VTmag <= 12 AND ABS(SIN(RADIANS("DE(ICRS)"))*0.9174820621 - COS(RADIANS("DE(ICRS)"))*SIN(RADIANS("RA(ICRS)"))*0.3977771559) < 0.0871557428'
rows,h1=query(q);assert len(rows)<300000, 'Query truncated';print('Main rows fetched:',len(rows),flush=True)
qs='SELECT TYC1,TYC2,TYC3,"RA(ICRS)" AS RAdeg,"DE(ICRS)" AS DEdeg,pmRA,pmDE,VTmag FROM "I/259/suppl_1" WHERE VTmag <= 12'
supp,h2=query(qs);print('Supplement rows fetched:',len(supp),flush=True)
tiles=[[] for _ in range(12)];seen=set();missing=0
for row in rows+supp:
 main='RAmdeg' in row;ra=number(row.get('RAmdeg' if main else 'RAdeg'));dec=number(row.get('DEmdeg' if main else 'DEdeg'))
 epoch=2000.0 if main else 1991.25
 pmra=number(row['pmRA']);pmdec=number(row['pmDE']);flags=0
 if ra is None or dec is None:
  ra=number(row.get('RA(ICRS)'));dec=number(row.get('DE(ICRS)'))
  epoch=1990+((number(row.get('EpRA-1990')) or 1.25)+(number(row.get('EpDE-1990')) or 1.25))/2
 if ra is None or dec is None or not inside(ra,dec):continue
 if pmra is None or pmdec is None:flags=1;missing+=1
 ident=tuple(int(row[k]) for k in ['TYC1','TYC2','TYC3'])
 if ident in seen:continue
 seen.add(ident);mag=number(row['VTmag'])
 record=(*ident,flags,round(mag*1000),ra,dec,pmra or 0,pmdec or 0,epoch)
 tiles[int(ra//30)%12].append(record)
files=[]
for i,records in enumerate(tiles):
 records.sort(key=lambda r:r[5]);data=b''.join(struct.pack('<HHBBhddfff',*r) for r in records)
 name=f'tycho2-{i:02}.bin';(OUT/name).write_bytes(data)
 files.append({'file':name,'rows':len(records),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
meta={'catalog':'Tycho-2 main catalogue and Supplement-1','citation':'Høg et al. 2000, A&A 355, L27; VizieR I/259','source':'https://cdsarc.cds.unistra.fr/viz-bin/cat/I/259','documentation':'https://cdsarc.cds.unistra.fr/ftp/cats/I/259/ReadMe','authors_page':'https://www.astro.ku.dk/~erik/Tycho-2/','retrieved':'2026-10-08','queries':[q,qs],'csv_sha256':[h1,h2],'ecliptic_band_degrees':BAND,'magnitude_limit_VT':LIMIT,'obliquity_J2000_degrees':23.4392911,'row_count':len(seen),'missing_proper_motion':missing,'record_bytes':36,'record_layout':'Little-endian: TYC1 uint16, TYC2 uint16, TYC3 uint8, missing-PM flag uint8, VT millimag int16, RA degrees float64, Dec degrees float64, pmRA*cosDec mas/yr float32, pmDec mas/yr float32, epoch Julian year float32','limitations':'Catalog selection V_T <= 12 is not a completeness claim. Tycho-2 is approximately 90% complete to V~11.5. Linear proper motion where available; no stellar parallax, radial velocity, variability, or binary orbital motion. Frozen epoch position where proper motion is unavailable. No synthetic stars.','files':files}
(OUT/'sources.json').write_text(json.dumps(meta,indent=2)+'\n')
with urllib.request.urlopen(meta['documentation'],timeout=30) as r:(OUT/'Tycho-2-ReadMe.txt').write_bytes(r.read())
print(json.dumps({'stars':len(seen),'bytes':sum(f['bytes'] for f in files),'missing_pm':missing,'tiles':len(files)}),flush=True)
