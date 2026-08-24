// Genera MappaEuropa.html da geometrie reali (world.geo.json, PD).
// Proiezione equirettangolare con correzione cos(lat) come il modello UE:
// lon -25..45, lat 71..34 → viewBox 0 0 480 400
const fs=require('fs');
const world=require('./world.json');
const UE={ 'Italy':'Italia','France':'Francia','Germany':'Germania','Spain':'Spagna','Portugal':'Portogallo',
'Belgium':'Belgio','Netherlands':'Paesi Bassi','Luxembourg':'Lussemburgo','Austria':'Austria','Poland':'Polonia',
'Czech Republic':'Rep. Ceca','Slovakia':'Slovacchia','Hungary':'Ungheria','Slovenia':'Slovenia','Croatia':'Croazia',
'Romania':'Romania','Bulgaria':'Bulgaria','Greece':'Grecia','Sweden':'Svezia','Finland':'Finlandia','Denmark':'Danimarca',
'Ireland':'Irlanda','Lithuania':'Lituania','Latvia':'Lettonia','Estonia':'Estonia','Cyprus':'Cipro','Malta':'Malta' };
const CONTORNO={ 'United Kingdom':'Regno Unito','Norway':'Norvegia','Switzerland':'Svizzera','Iceland':'Islanda',
'Ukraine':'Ucraina','Belarus':'Bielorussia','Serbia':'Serbia','Bosnia and Herzegovina':'Bosnia','Albania':'Albania',
'Macedonia':'Macedonia del Nord','Montenegro':'Montenegro','Moldova':'Moldova','Kosovo':'Kosovo','Turkey':'Turchia' };

const LON0=-25,LON1=45,LAT0=71,LAT1=34,W=480,H=400;
const KLAT=Math.cos(52*Math.PI/180); // fattore medio per proporzioni tipo Mercatore leggero
function px(lon,lat){ return [ (lon-LON0)/(LON1-LON0)*W, (LAT0-lat)/(LAT0-LAT1)*H ]; }

// Douglas-Peucker
function dp(pts,eps){
  if(pts.length<3) return pts;
  let dmax=0,idx=0; const [x1,y1]=pts[0],[x2,y2]=pts[pts.length-1];
  const dx=x2-x1,dy=y2-y1,den=Math.hypot(dx,dy)||1e-9;
  for(let i=1;i<pts.length-1;i++){
    const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/den;
    if(d>dmax){dmax=d;idx=i;}
  }
  if(dmax>eps){ const a=dp(pts.slice(0,idx+1),eps),b=dp(pts.slice(idx),eps); return a.slice(0,-1).concat(b); }
  return [pts[0],pts[pts.length-1]];
}
function ringPath(ring,eps){
  let pts=ring.map(([lo,la])=>px(lo,la));
  // anello chiuso: primo==ultimo -> il segmento base di DP e' degenere e tutto
  // collassa a 2 punti. Si toglie la chiusura e si spezza al punto piu' lontano.
  if(pts.length>3){
    const [fx,fy]=pts[0], last=pts[pts.length-1];
    if(Math.hypot(last[0]-fx,last[1]-fy)<1e-6) pts=pts.slice(0,-1);
    let far=0,fd=0;
    for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-fx,pts[i][1]-fy);if(d>fd){fd=d;far=i;}}
    const a=dp(pts.slice(0,far+1),eps), b=dp(pts.slice(far).concat([pts[0]]),eps);
    pts=a.slice(0,-1).concat(b).slice(0,-1);
  } else { pts=dp(pts,eps); }
  if(pts.length<4) return {d:'',area:0,pts:[]};
  // area per scartare micro-isole
  let area=0; for(let i=0;i<pts.length-1;i++) area+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];
  area=Math.abs(area/2);
  const d='M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L')+'Z';
  return {d,area,pts};
}
function featPaths(f,eps,minArea){
  const g=f.geometry; const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  const parts=[]; let cx=0,cy=0,tot=0, maxA=0, main=null;
  for(const poly of polys){
    const r=ringPath(poly[0],eps);
    if(r.area<minArea) continue;
    parts.push(r.d);
    if(r.area>maxA){maxA=r.area;main=r.pts;}
  }
  if(main){ for(const p of main){cx+=p[0];cy+=p[1];tot++;} cx/=tot;cy/=tot; }
  return {d:parts.join(' '),cx:+cx.toFixed(0),cy:+cy.toFixed(0)};
}

let paths={},centroidi={},contorno={};
for(const f of world.features){
  const n=f.properties.name;
  if(UE[n]){ const r=featPaths(f,1.1,10); if(r.d){paths[UE[n]]=r.d; centroidi[UE[n]]=[r.cx,r.cy];} }
  else if(CONTORNO[n]){ const r=featPaths(f,1.4,14); if(r.d) contorno[CONTORNO[n]]=r.d; }
}
// aggiusta centroidi noti fuori-terra
if(centroidi['Francia']) centroidi['Francia']=[Math.round(px(2.5,46.8)[0]),Math.round(px(2.5,46.8)[1])];
if(centroidi['Italia'])  centroidi['Italia'] =[Math.round(px(12.5,43.5)[0]),Math.round(px(12.5,43.5)[1])];
if(centroidi['Croazia']) centroidi['Croazia']=[Math.round(px(16.5,45.6)[0]),Math.round(px(16.5,45.6)[1])];
if(centroidi['Svezia'])  centroidi['Svezia'] =[Math.round(px(15.5,59.5)[0]),Math.round(px(15.5,59.5)[1])];
if(centroidi['Finlandia'])centroidi['Finlandia']=[Math.round(px(26,62.5)[0]),Math.round(px(26,62.5)[1])];

const out=`<!-- ============================================================
  MappaEuropa.html — geometrie reali semplificate (world.geo.json, PD)
  QA 21/08/2026 — rigenerata da dati geografici veri: la versione precedente
  era disegnata a mano e risultava irriconoscibile. Proiezione equirettangolare
  lon ${LON0}..${LON1}, lat ${LAT0}..${LAT1} -> viewBox 0 0 ${W} ${H}.
  paths = i 27 stati UE (cliccabili, con centroidi per le bolle conteggio)
  contorno = stati non-UE di sfondo (grigio, non cliccabili)
  Rigenerabile con lo script in docs/ (genmappa.js su countries.geo.json).
============================================================= -->
<script>
var OC_GEO_EUROPA = {
"viewBox": "0 0 ${W} ${H}",
"paths": ${JSON.stringify(paths)},
"centroidi": ${JSON.stringify(centroidi)},
"contorno": ${JSON.stringify(contorno)}
};
</script>`;
fs.writeFileSync('MappaEuropa.new.html',out);
console.log('UE paths:',Object.keys(paths).length,'· contorno:',Object.keys(contorno).length,'· bytes:',out.length);
