/* Busfahrt nach Köln – App-Logik */
(function(){
"use strict";

const $ = id => document.getElementById(id);
const store = {
  get(k,d){ try{ const v = localStorage.getItem("bk_"+k); return v===null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem("bk_"+k, JSON.stringify(v)); }catch(e){} }
};
const H = 3600e3, MIN = 60e3;
const DEST = [50.9375, 6.9603];
const BIBBONA = {lat:43.243, lon:10.528, name:"Marina di Bibbona", auto:true};
let tripStart = store.get("tripStart", null) || {...BIBBONA};
const startKey = () => tripStart.lat.toFixed(3)+","+tripStart.lon.toFixed(3);

/* ---------- Orte entlang der Strecke ----------
   [Name, lat, lon, Plan-km (Näherung), Land, Hinweis, nurAlternative] */
const W = [
  ["Marina di Bibbona",43.243,10.528,0,"it","Toskanische Küste"],
  ["Cecina",43.310,10.520,12,"it","Via Aurelia"],
  ["Livorno",43.530,10.360,50,"it","Via Aurelia / A12"],
  ["Pisa",43.720,10.420,72,"it","A12"],
  ["Viareggio",43.870,10.280,95,"it","A12, Versilia"],
  ["Massa / Carrara",44.030,10.120,120,"it","A12, Marmorberge"],
  ["Sarzana",44.110,9.960,140,"it","A12 → A15"],
  ["Aulla",44.210,9.970,158,"it","A15, Lunigiana"],
  ["Pontremoli",44.375,9.880,180,"it","A15 Richtung Parma"],
  ["Passo della Cisa",44.475,9.960,195,"it","A15, Tunnel unter dem Apennin"],
  ["Parma",44.825,10.250,250,"it","A15 → A1"],
  ["Piacenza",45.050,9.700,315,"it","A1"],
  ["Lodi",45.310,9.500,350,"it","A1"],
  ["Mailand",45.480,9.150,380,"it","Tangenziale, viel Verkehr"],
  ["Como / Chiasso",45.835,9.030,430,"ch","Grenze Italien – Schweiz"],
  ["Lugano",46.000,8.950,455,"ch","A2"],
  ["Bellinzona",46.190,9.020,485,"ch","A2"],
  ["Airolo",46.530,8.610,540,"ch","Gotthard-Südportal"],
  ["Göschenen",46.665,8.590,558,"ch","Gotthard-Nordportal"],
  ["Altdorf",46.880,8.640,585,"ch","A2"],
  ["Luzern",47.050,8.310,625,"ch","A2"],
  ["Basel",47.560,7.590,720,"de","Grenze Schweiz – Deutschland"],
  ["Freiburg",47.990,7.840,790,"de","A5"],
  ["Karlsruhe",49.010,8.400,920,"de","A5"],
  ["Walldorf",49.300,8.640,970,"de","A5 / A6"],
  ["Frankfurt",50.050,8.570,1065,"de","Frankfurter Kreuz, A3"],
  ["Limburg",50.390,8.060,1130,"de","A3"],
  ["Siegburg",50.800,7.200,1220,"de","A3"],
  ["Ludwigshafen",49.480,8.390,null,"de","A61",true],
  ["Bingen",49.950,7.900,null,"de","A61",true],
  ["Koblenz",50.360,7.550,null,"de","A61, Moseltal",true],
  ["Meckenheim",50.620,7.030,null,"de","A61 / A565",true],
  ["Köln",50.940,6.960,1255,"de","Ziel"]
];
const PLAN_SPEED = [70,85,80,85,85,85,75,75,65,75,85,80,60,75,75,80,70,80,75,80,85,85,85,85,85,85,85,75];
const BORDERS = [
  {lat:45.835, lon:9.026, to:"ch", name:"Grenze Italien → Schweiz",
   tip:"Zoll Chiasso/Brogeda. Für ausländische Reisebusse ist in der Schweiz die Schwerverkehrsabgabe (PSVA) fällig."},
  {lat:47.592, lon:7.606, to:"de", name:"Grenze Schweiz → Deutschland",
   tip:"Zoll Basel/Weil am Rhein. Danach Autobahn A5 Richtung Karlsruhe."}
];
const COUNTRY = {
  it:{name:"Italien", info:"Reisebus auf der Autostrada max. 100 km/h, Landstraße 80 km/h. Maut an den Mautstellen."},
  ch:{name:"Schweiz", info:"Reisebus auf der Autobahn max. 100 km/h. Gotthard-Straßentunnel: 16,9 km, max. 80 km/h, 150 m Abstand für schwere Fahrzeuge."},
  de:{name:"Deutschland", info:"Reisebus auf der Autobahn max. 100 km/h mit Tempo-100-Zulassung, sonst 80 km/h."}
};

/* ---------- Mathe ---------- */
function hav(a1,o1,a2,o2){
  const r = Math.PI/180, dA=(a2-a1)*r, dO=(o2-o1)*r;
  const s = Math.sin(dA/2)**2 + Math.cos(a1*r)*Math.cos(a2*r)*Math.sin(dO/2)**2;
  return 12742*Math.asin(Math.sqrt(s));
}

/* ---------- Route ---------- */
let R = null;          // {pts, segKm, segV, cumKm, cumH, px, py, src, stops, borderKm}
let routeVersion = 0;

function finishRoute(pts, segV, src, planKm){
  const n = pts.length, segKm = new Array(n-1), cumKm = new Float64Array(n);
  const px = new Float64Array(n), py = new Float64Array(n);
  for(let i=0;i<n;i++){
    px[i] = pts[i][1]*Math.cos(pts[i][0]*Math.PI/180)*111.32;
    py[i] = pts[i][0]*110.57;
  }
  for(let i=0;i<n-1;i++){
    segKm[i] = hav(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]);
    cumKm[i+1] = cumKm[i] + segKm[i];
  }
  R = {pts, segKm, segV, cumKm, cumH:new Float64Array(n), px, py, src};
  if(planKm){ // Plan-km aus der Tabelle verwenden
    for(let i=0;i<n;i++) R.cumKm[i] = planKm[i];
    for(let i=0;i<n-1;i++) R.segKm[i] = planKm[i+1]-planKm[i];
  }
  recomputeTime();
  // Orte auf die Route legen
  const stops = [];
  W.forEach(w=>{
    if(src==="plan" && w[6]) return;
    const p = locate(w[1],w[2]);
    if(p.d <= 12) stops.push({name:w[0], km:p.km, cc:w[4], note:w[5]});
  });
  const total = R.cumKm[n-1];
  const mid = stops.filter(x=>x.km > 3 && x.km < total-3 && x.name!=="Köln").sort((a,b)=>a.km-b.km);
  const startCc = tripStart.lat > 47.58 ? "de" : (tripStart.lat > 45.84 && tripStart.lon < 9.3 ? "ch" : "it");
  stops.length = 0;
  stops.push({name:tripStart.name, km:0, cc:startCc, note:"Start"}, ...mid, {name:"Köln", km:total, cc:"de", note:"Ziel"});
  R.stops = stops;
  R.borderKm = BORDERS.map(b=>({...b, km: locate(b.lat,b.lon).km}));
  routeVersion++;
  if(routeVersion > 1){ state.hist = []; store.set("hist", []); }
  fillManual();
}

function recomputeTime(){
  if(!R) return;
  const vmax = clamp(+$("vmax").value||90, 50, 110);
  R.cumH[0] = 0;
  for(let i=0;i<R.segKm.length;i++){
    let v = R.src==="osrm" ? Math.min(R.segV[i]*0.95, vmax) : Math.min(R.segV[i], vmax);
    if(!(v>5)) v = 30;
    R.cumH[i+1] = R.cumH[i] + R.segKm[i]/v;
  }
}

function buildPlanRoute(){
  const plan = W.filter(w=>!w[6]);
  let pts = plan.map(w=>[w[1],w[2]]), km = plan.map(w=>w[3]), sp = PLAN_SPEED.slice();
  // Startort auf die Plan-Strecke legen und alles davor abschneiden
  let best = {d:Infinity,i:0,t:0};
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1], c=Math.cos(tripStart.lat*Math.PI/180);
    const ax=a[1]*c*111.32, ay=a[0]*110.57, dx=b[1]*c*111.32-ax, dy=b[0]*110.57-ay;
    const x=tripStart.lon*c*111.32, y=tripStart.lat*110.57, L2=dx*dx+dy*dy;
    let t=L2?((x-ax)*dx+(y-ay)*dy)/L2:0; t=Math.max(0,Math.min(1,t));
    const d=Math.hypot(ax+t*dx-x, ay+t*dy-y);
    if(d<best.d) best={d,i,t};
  }
  const i = best.i, k0 = km[i] + best.t*(km[i+1]-km[i]);
  const extra = best.d > 1 ? best.d*1.3 : 0;
  const nPts = [[tripStart.lat,tripStart.lon]].concat(pts.slice(i+1));
  const nKm = [0].concat(km.slice(i+1).map(v=>v-k0+extra));
  const nSp = [sp[i]].concat(sp.slice(i+1));
  finishRoute(nPts, nSp, "plan", nKm);
}

function buildOsrmRoute(data){
  finishRoute(data.pts, data.seg, "osrm");
}

async function fetchOsrm(){
  const key = startKey();
  const vias = [[tripStart.lat,tripStart.lon]];
  if(tripStart.lat < 45.9) vias.push([46.0167,8.9339]);   // über Lugano / Gotthard
  if(tripStart.lat < 47.5) vias.push([47.5920,7.6060]);   // über Basel
  vias.push(DEST);
  const url = "https://router.project-osrm.org/route/v1/driving/" +
    vias.map(v=>v[1]+","+v[0]).join(";") +
    "?overview=full&geometries=geojson&annotations=distance,duration";
  const res = await fetch(url);
  if(!res.ok) throw new Error("HTTP "+res.status);
  const j = await res.json();
  if(!j.routes || !j.routes[0]) throw new Error("keine Route");
  const coords = j.routes[0].geometry.coordinates;
  const dist = [], dur = [];
  j.routes[0].legs.forEach(l=>{ if(l.annotation){ dist.push(...l.annotation.distance); dur.push(...l.annotation.duration); } });
  // Punkte ausdünnen (alle ~150 m), Tempo je Abschnitt mitnehmen
  const pts = [[coords[0][1],coords[0][0]]], seg = [];
  let accD = 0, accT = 0, last = coords[0];
  const useAnno = dist.length === coords.length-1;
  for(let i=1;i<coords.length;i++){
    const c = coords[i];
    const d = useAnno ? dist[i-1]/1000 : hav(last[1],last[0],c[1],c[0]);
    const t = useAnno ? dur[i-1]/3600 : d/90;
    accD += d; accT += t;
    if(accD >= 0.15 || i === coords.length-1){
      pts.push([+c[1].toFixed(5), +c[0].toFixed(5)]);
      seg.push(+(accT>0 ? accD/accT : 80).toFixed(1));
      accD = 0; accT = 0;
    }
    last = c;
  }
  const data = {pts, seg, at: Date.now(), km: j.routes[0].distance/1000, key};
  store.set("route", data);
  return data;
}

async function loadRoute(force){
  let cached = store.get("route", null);
  if(cached && cached.key !== startKey()) cached = null;
  if(cached && cached.pts && !force){
    buildOsrmRoute(cached);
  } else {
    buildPlanRoute();
  }
  updateRouteNote();
  if(!cached || force){
    $("routeSrc").textContent = "Echte Straßenroute wird geladen …";
    try{
      const data = await fetchOsrm();
      if(data.key === startKey()) buildOsrmRoute(data);
    }catch(e){}
    updateRouteNote();
    relocate();
    drawRoute();
  }
}

function updateRouteNote(){
  if(!R) return;
  const km = R.cumKm[R.cumKm.length-1], h = R.cumH[R.cumH.length-1];
  $("routeSrc").textContent = `Start: ${tripStart.name}. ` + (R.src === "osrm"
    ? `Route aus echten Straßendaten (OpenStreetMap): ${fmtKm(km)} km, reine Fahrzeit Bus ca. ${fmtHM(h*H)} h ohne Stopps.`
    : `Keine Verbindung zum Routenserver. Näherung über ${R.pts.length} Wegpunkte: ${fmtKm(km)} km, ca. ${fmtHM(h*H)} h ohne Stopps.`);
  $("barStart").textContent = tripStart.name;
}

/* Position auf die Route projizieren */
function locate(lat,lon){
  const x = lon*Math.cos(lat*Math.PI/180)*111.32, y = lat*110.57;
  let best = {d:Infinity, i:0, t:0};
  for(let i=0;i<R.pts.length-1;i++){
    const ax=R.px[i], ay=R.py[i], dx=R.px[i+1]-ax, dy=R.py[i+1]-ay, L2=dx*dx+dy*dy;
    let t = L2 ? ((x-ax)*dx+(y-ay)*dy)/L2 : 0;
    t = t<0?0:t>1?1:t;
    const ex = ax+t*dx-x, ey = ay+t*dy-y, d2 = ex*ex+ey*ey;
    if(d2 < best.d){ best = {d:d2, i, t}; }
  }
  const i = best.i, t = best.t;
  return {
    d: Math.sqrt(best.d),
    km: R.cumKm[i] + t*(R.cumKm[i+1]-R.cumKm[i]),
    h: R.cumH[i] + t*(R.cumH[i+1]-R.cumH[i]),
    i, t
  };
}
function hoursAtKm(km){
  const c = R.cumKm; let lo=0, hi=c.length-1;
  if(km<=0) return 0;
  if(km>=c[hi]) return R.cumH[hi];
  while(hi-lo>1){ const m=(lo+hi)>>1; if(c[m]<=km) lo=m; else hi=m; }
  const t = (km-c[lo])/((c[hi]-c[lo])||1);
  return R.cumH[lo] + t*(R.cumH[hi]-R.cumH[lo]);
}
function pointAtKm(km){
  const c = R.cumKm; let lo=0, hi=c.length-1;
  if(km<=0) return R.pts[0];
  if(km>=c[hi]) return R.pts[hi];
  while(hi-lo>1){ const m=(lo+hi)>>1; if(c[m]<=km) lo=m; else hi=m; }
  const t = (km-c[lo])/((c[hi]-c[lo])||1), a=R.pts[lo], b=R.pts[hi];
  return [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])];
}

/* ---------- Zustand ---------- */
const state = {
  km: 0, source: "manual", off: 0,
  fix: null,                         // {lat,lon,acc,alt,spd,t}
  hist: store.get("hist", []),       // [{t,km}]
  track: store.get("track", []),     // [[lat,lon]]
  start: store.get("start", null),
  arrival: null, computedAt: 0, totalH: 0
};

function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function pauseFactor(){ return 1 + clamp(+$("pause").value||0,0,60)/60; }
function tempoFactor(){ return clamp(+$("tempo").value||100,50,150)/100; }

/* Restzeit (inkl. Stopps) von km a bis km b */
function hoursBetween(a,b){
  return Math.max(0, hoursAtKm(b)-hoursAtKm(a)) / tempoFactor() * pauseFactor();
}

let calcKey = "";
function recalc(){
  if(!R) return;
  const total = R.cumKm[R.cumKm.length-1];
  state.km = clamp(state.km, 0, total);
  const key = [state.km.toFixed(4), state.fix ? state.fix.t : 0, $("pause").value, $("tempo").value, $("vmax").value, routeVersion].join("|");
  if(key === calcKey && state.arrival !== null) return;
  calcKey = key;
  state.totalH = hoursBetween(state.km, total);
  state.computedAt = Date.now();
  state.arrival = state.computedAt + state.totalH*H;
}

/* ---------- Formatierung ---------- */
const fmtClock = ts => new Date(ts).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
function dayTag(ts){
  const n = new Date(), d = new Date(ts);
  const a = new Date(n.getFullYear(),n.getMonth(),n.getDate()), b = new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const diff = Math.round((b-a)/864e5);
  return diff===0 ? "" : diff===1 ? " (morgen)" : diff>1 ? ` (+${diff} Tage)` : "";
}
function fmtHM(ms){ const m = Math.max(0,Math.round(ms/MIN)); return Math.floor(m/60)+":"+String(m%60).padStart(2,"0"); }
function fmtKm(k){ return k>=100 ? Math.round(k).toLocaleString("de-DE") : k.toLocaleString("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1}); }
function fmtNum(v,d){ return v.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d}); }

/* ---------- Anzeige: Fahrt ---------- */
function renderTick(){
  if(!R || state.arrival===null) return;
  const total = R.cumKm[R.cumKm.length-1];
  const left = Math.max(0, state.arrival - Date.now());
  if(total - state.km < 0.5){
    $("remain").textContent = "Angekommen";
    $("eta").textContent = "jetzt";
  } else {
    const s = Math.floor(left/1000), hh = Math.floor(s/3600), mm = Math.floor(s%3600/60), ss = s%60;
    $("remain").innerHTML = `${hh}<small>h</small>${String(mm).padStart(2,"0")}<small>min</small><span class="sec">${String(ss).padStart(2,"0")}s</span>`;
    $("eta").textContent = fmtClock(state.arrival) + " Uhr" + dayTag(state.arrival);
  }
  $("mapRemain").textContent = fmtHM(left) + " h";
  if(state.start){ $("since").textContent = fmtHM(Date.now()-state.start); }
}

function render(){
  if(!R) return;
  recalc();
  const total = R.cumKm[R.cumKm.length-1], km = state.km;
  $("kmLeft").textContent = fmtKm(total-km);
  $("kmDone").textContent = fmtKm(km);
  $("mapKm").textContent = fmtKm(total-km) + " km";
  const pct = km/total*100;
  $("barFill").style.width = pct.toFixed(2)+"%";
  $("pct").textContent = fmtNum(pct,1)+" %";

  // Tempo & GPS-Daten
  const f = state.fix;
  $("spdNow").textContent = f && f.spd!=null ? Math.round(f.spd) : "–";
  $("alti").textContent = f && f.alt!=null ? Math.round(f.alt).toLocaleString("de-DE") : "–";
  $("acc").textContent = f && f.acc!=null ? Math.round(f.acc) : "–";
  const here = f ? [f.lat,f.lon] : pointAtKm(km);
  $("air").textContent = fmtKm(hav(here[0],here[1],DEST[0],DEST[1]));

  const live = liveSpeed(30);
  $("speed").textContent = live ? Math.round(live) : "–";
  if(state.start && km>1){
    const hrs = (Date.now()-state.start)/H;
    $("avgTrip").textContent = hrs>0.05 ? Math.round(km/hrs) : "–";
  } else $("avgTrip").textContent = "–";

  const live20 = liveSpeed(60, 20);
  if(live20 && total-km>0.5){
    const lh = (total-km)/live20, la = Date.now()+lh*H;
    $("alt").textContent = `Mit eurem Tempo der letzten Stunde (Ø ${Math.round(live20)} km/h inkl. Stopps): Ankunft ${fmtClock(la)} Uhr${dayTag(la)}`;
  } else {
    $("alt").textContent = state.source==="gps" ? "Prognose aus eurem echten Tempo erscheint nach etwa 20 Minuten Fahrt." : "";
  }

  // Nächster Ort
  const stops = R.stops;
  let ni = stops.findIndex(s => s.km > km + 0.3);
  if(ni<0) ni = stops.length-1;
  const ns = stops[ni];
  $("sign").className = "sign " + ns.cc;
  $("nextName").textContent = ns.name;
  $("nextKm").textContent = fmtKm(Math.max(0,ns.km-km)) + " km";
  const nts = state.computedAt + hoursBetween(km, ns.km)*H;
  $("nextEta").textContent = `ca. ${fmtClock(nts)} Uhr · ${ns.note}`;

  // Land
  const b = R.borderKm;
  const cc = km < b[0].km ? "it" : km < b[1].km ? "ch" : "de";
  $("ccBadge").textContent = cc.toUpperCase(); $("ccBadge").className = "cc " + cc;
  $("ccName").textContent = COUNTRY[cc].name;
  $("ccInfo").textContent = COUNTRY[cc].info;
  const nb = b.find(x => x.km > km + 0.3);
  if(nb){
    const bts = state.computedAt + hoursBetween(km, nb.km)*H;
    $("borderInfo").textContent = `${nb.name} in ${fmtKm(nb.km-km)} km, ca. ${fmtClock(bts)} Uhr. ${nb.tip}`;
  } else $("borderInfo").textContent = "Keine Grenze mehr bis Köln.";

  renderStops();
  renderSights();
  renderChip();
  updateBus();
  renderTick();
}

function liveSpeed(windowMin, minSpanMin){
  const h = state.hist; if(h.length<2) return null;
  const now = Date.now(), from = now - windowMin*MIN;
  const pts = h.filter(x=>x.t>=from); if(pts.length<2) return null;
  const a = pts[0], z = pts[pts.length-1], dt = (z.t-a.t)/H;
  if(dt < (minSpanMin||10)/60 || z.km<=a.km) return null;
  return (z.km-a.km)/dt;
}

function renderStops(){
  const ul = $("stops"); ul.innerHTML = "";
  const km = state.km;
  let nextMarked = false;
  R.stops.forEach((s,i)=>{
    const li = document.createElement("li");
    const past = i===0 ? km>0.5 : s.km <= km+0.3;
    if(past) li.className = "past";
    else if(!nextMarked){ li.className = "next"; nextMarked = true; }
    const ts = state.computedAt + hoursBetween(km, s.km)*H;
    li.innerHTML = `<span class="dot ${s.cc}"></span><span class="nm"></span><span class="km"></span><span class="t"></span>`;
    li.querySelector(".nm").append(s.name);
    const sm = document.createElement("small"); sm.textContent = past ? s.note : `${s.note} · noch ${fmtKm(s.km-km)} km`;
    li.querySelector(".nm").append(sm);
    li.querySelector(".km").textContent = Math.round(s.km) + " km";
    li.querySelector(".t").textContent = past ? "✓" : fmtClock(ts);
    ul.appendChild(li);
  });
}

function renderChip(){
  const c = $("chip");
  if(state.source === "gps"){
    if(state.off > 3){ c.className = "chip warn"; c.textContent = `GPS · ${fmtKm(state.off)} km neben Route`; }
    else { c.className = "chip live"; c.textContent = "GPS live"; }
  } else { c.className = "chip"; c.textContent = "Manuell"; }
}

/* ---------- Manuelle Eingabe ---------- */
function fillManual(){
  const sel = $("manualWp"), keep = store.get("mName", tripStart.name);
  sel.innerHTML = "";
  R.stops.forEach((s,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=`${s.name} (${Math.round(s.km)} km)`; if(s.name===keep) o.selected=true; sel.appendChild(o); });
}
function manualKm(){
  const s = R.stops[+$("manualWp").value || 0] || R.stops[0];
  return s.km + Math.max(0, +$("manualPlus").value || 0);
}
function onManual(){
  const s = R.stops[+$("manualWp").value||0];
  if(s) store.set("mName", s.name);
  store.set("mPlus", +$("manualPlus").value||0);
  if(state.source !== "gps"){ state.km = manualKm(); render(); }
}
$("manualWp").addEventListener("change", onManual);
$("manualPlus").addEventListener("input", onManual);
$("manualPlus").value = store.get("mPlus",0);

["pause","tempo","vmax"].forEach(id=>{
  $(id).value = store.get(id, +$(id).value);
  $(id).addEventListener("input", ()=>{ store.set(id, +$(id).value); if(id==="vmax"){ recomputeTime(); updateRouteNote(); } render(); });
});

/* ---------- GPS ---------- */
let watchId = null;
function relocate(){
  if(!R) return;
  if(state.source==="gps" && state.fix){
    const p = locate(state.fix.lat, state.fix.lon);
    state.km = p.km; state.off = p.d;
  } else state.km = manualKm();
  render();
}
/* Startort = aktueller Standort */
function setStartHere(lat, lon){
  tripStart = {lat:+lat.toFixed(4), lon:+lon.toFixed(4), name:"Dein Standort", auto:false};
  store.set("tripStart", tripStart);
  store.set("mName", tripStart.name);
  state.track = []; store.set("track", []); if(trackLine) trackLine.setLatLngs([]);
  loadRoute(false).then(relocate);
  relocate();
  nameStart();
}
async function nameStart(){
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=de&lat=${tripStart.lat}&lon=${tripStart.lon}`);
    const j = await r.json(), a = j.address || {};
    const n = a.city || a.town || a.village || a.hamlet || a.suburb || a.municipality || a.county;
    if(n){
      tripStart.name = n; store.set("tripStart", tripStart); store.set("mName", n);
      if(R && R.stops && R.stops[0]) R.stops[0].name = n;
      fillManual(); updateRouteNote(); render();
    }
  }catch(e){}
}

function onPos(pos){
  const c = pos.coords, now = Date.now();
  let spd = c.speed!=null && c.speed>=0 ? c.speed*3.6 : null;
  if(spd===null && state.fix && now-state.fix.t > 2000){
    spd = hav(state.fix.lat,state.fix.lon,c.latitude,c.longitude) / ((now-state.fix.t)/H);
  }
  state.fix = {lat:c.latitude, lon:c.longitude, acc:c.accuracy, alt:c.altitude, spd, t:now};
  state.source = "gps";
  const p = locate(c.latitude, c.longitude);
  state.km = p.km; state.off = p.d;
  if(!state.start){ state.start = now; store.set("start", now); }
  if(tripStart.auto){ setStartHere(c.latitude, c.longitude); return; }
  // Verlauf
  state.hist.push({t:now, km:+state.km.toFixed(3)});
  state.hist = state.hist.filter(x => now-x.t <= 3*H);
  store.set("hist", state.hist);
  // Spur
  const last = state.track[state.track.length-1];
  if(!last || hav(last[0],last[1],c.latitude,c.longitude) > 0.15){
    state.track.push([+c.latitude.toFixed(5), +c.longitude.toFixed(5)]);
    if(state.track.length > 6000) state.track = state.track.filter((_,i)=>i%2===0);
    store.set("track", state.track);
    if(trackLine) trackLine.setLatLngs(state.track);
  }
  store.set("gpsOn", true);
  $("gpsBtn").textContent = "GPS läuft";
  $("gpsBtn2").hidden = true;
  $("gpsMsg").hidden = true;
  render();
  maybeWeatherHere();
}
function onPosErr(err){
  $("gpsBtn").textContent = "GPS starten";
  if(err.code===1){ $("gpsBtn2").hidden = false; $("gpsBtn2").textContent = "Standort nicht erlaubt – Ort im Tab Etappen eintragen"; }
  const m = $("gpsMsg"); m.hidden = false;
  m.textContent = err.code===1
    ? "Standortzugriff abgelehnt. Erlaube den Standort für diese Seite (Schloss-Symbol neben der Adresse) oder trag euren Ort unten ein."
    : "Kein GPS-Signal, zum Beispiel im Tunnel. Die Zeit läuft weiter, sobald das Signal zurück ist.";
  if(err.code===1){ state.source = "manual"; relocate(); }
}
function startGps(){
  if(!("geolocation" in navigator)){ onPosErr({code:1}); return; }
  $("gpsBtn").textContent = "GPS sucht …";
  $("gpsBtn2").textContent = "GPS sucht …";
  if(watchId!==null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, {enableHighAccuracy:true, maximumAge:5000, timeout:60000});
}
$("gpsBtn").addEventListener("click", startGps);
$("gpsBtn2").addEventListener("click", startGps);

/* ---------- Bildschirm anlassen ---------- */
let lock = null, wantLock = false;
async function getLock(){
  try{
    lock = await navigator.wakeLock.request("screen");
    $("wakeBtn").textContent = "Bildschirm bleibt an";
    lock.addEventListener("release", ()=>{ lock=null; if(!wantLock) $("wakeBtn").textContent = "Bildschirm anlassen"; });
  }catch(e){ $("wakeBtn").textContent = "Nicht möglich"; wantLock = false; }
}
$("wakeBtn").addEventListener("click", async ()=>{
  if(wantLock){ wantLock=false; if(lock) await lock.release(); lock=null; $("wakeBtn").textContent="Bildschirm anlassen"; return; }
  wantLock = true; getLock();
});
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible"){
    if(wantLock && !lock) getLock();
    render();
  }
});

/* ---------- Wetter (Open-Meteo) ---------- */
const WX = {0:"Klar",1:"Überwiegend klar",2:"Teilweise bewölkt",3:"Bedeckt",45:"Nebel",48:"Nebel mit Reif",
  51:"Leichter Nieselregen",53:"Nieselregen",55:"Starker Nieselregen",56:"Gefrierender Niesel",57:"Gefrierender Niesel",
  61:"Leichter Regen",63:"Regen",65:"Starker Regen",66:"Gefrierender Regen",67:"Gefrierender Regen",
  71:"Leichter Schnee",73:"Schnee",75:"Starker Schnee",77:"Schneegriesel",80:"Regenschauer",81:"Kräftige Schauer",82:"Heftige Schauer",
  85:"Schneeschauer",86:"Starke Schneeschauer",95:"Gewitter",96:"Gewitter mit Hagel",99:"Gewitter mit Hagel"};
let wxKoeln = null, wxKoelnAt = 0, wxHereAt = 0;
async function loadWeatherKoeln(){
  if(Date.now()-wxKoelnAt < 30*MIN && wxKoeln){ showWeatherKoeln(); return; }
  try{
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${DEST[0]}&longitude=${DEST[1]}&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&timezone=UTC&forecast_days=3`);
    wxKoeln = await r.json(); wxKoelnAt = Date.now(); showWeatherKoeln();
  }catch(e){ $("wxKoeln").textContent = "Wetter gerade nicht erreichbar."; }
}
function showWeatherKoeln(){
  if(!wxKoeln || !wxKoeln.hourly || state.arrival===null) return;
  const t = wxKoeln.hourly.time.map(s=>Date.parse(s+"Z"));
  let bi = 0, bd = Infinity;
  t.forEach((x,i)=>{ const d=Math.abs(x-state.arrival); if(d<bd){bd=d;bi=i;} });
  if(bd > 2*H){ $("wxKoeln").textContent = "Ankunft liegt außerhalb der Vorhersage."; return; }
  const h = wxKoeln.hourly;
  $("wxKoeln").innerHTML = `<span class="t">${Math.round(h.temperature_2m[bi])}°</span><span><b></b><br><span class="d"></span></span>`;
  $("wxKoeln").querySelector("b").textContent = WX[h.weather_code[bi]] || "–";
  $("wxKoeln").querySelector(".d").textContent = `um ${fmtClock(t[bi])} Uhr · Regenrisiko ${h.precipitation_probability[bi] ?? "–"} % · Wind ${Math.round(h.wind_speed_10m[bi])} km/h`;
}
async function maybeWeatherHere(){
  if(!state.fix || Date.now()-wxHereAt < 15*MIN) return;
  wxHereAt = Date.now();
  try{
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${state.fix.lat.toFixed(3)}&longitude=${state.fix.lon.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m`);
    const j = await r.json(), c = j.current;
    $("wxHere").innerHTML = `<span class="t">${Math.round(c.temperature_2m)}°</span><span><b></b><br><span class="d"></span></span>`;
    $("wxHere").querySelector("b").textContent = WX[c.weather_code] || "–";
    $("wxHere").querySelector(".d").textContent = `Wind ${Math.round(c.wind_speed_10m)} km/h · Stand ${fmtClock(Date.now())} Uhr`;
  }catch(e){ wxHereAt = 0; }
}

/* ---------- Karte ---------- */
let map = null, routeLine = null, trackLine = null, busMarker = null, stopLayer = null, follow = true, drawnVersion = -1;
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function initMap(){
  if(map || typeof L === "undefined"){ if(typeof L==="undefined") $("map").textContent = "Karte braucht beim ersten Öffnen Internet."; return; }
  map = L.map("map", {zoomControl:false, attributionControl:true});
  L.control.zoom({position:"bottomright"}).addTo(map);
  map.setView(pointAtKm(state.km), 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:18, attribution:"© OpenStreetMap"}).addTo(map);
  trackLine = L.polyline(state.track, {color:cssVar("--done"), weight:7, opacity:.9}).addTo(map);
  busMarker = L.marker(pointAtKm(state.km), {icon:L.divIcon({className:"", html:'<div class="busmark"></div>', iconSize:[22,22], iconAnchor:[11,11]}), zIndexOffset:1000}).addTo(map);
  L.marker(DEST, {icon:L.divIcon({className:"", html:'<div class="wpmark" style="width:16px;height:16px;border-color:#c0262d"></div>', iconSize:[16,16], iconAnchor:[8,8]})}).addTo(map).bindPopup("Köln – Ziel");
  map.on("dragstart", ()=>{ follow = false; $("followBtn").textContent = "Mitfahren: aus"; });
  drawRoute();
  map.fitBounds(routeLine.getBounds(), {padding:[30,30], animate:false});
}
function drawRoute(){
  if(!map || !R || drawnVersion===routeVersion) return;
  drawnVersion = routeVersion;
  if(routeLine) routeLine.remove();
  if(stopLayer) stopLayer.remove();
  routeLine = L.polyline(R.pts, {color:cssVar("--route"), weight:5, opacity:.85}).addTo(map);
  if(trackLine && state.track.length) trackLine.bringToFront();
  stopLayer = L.layerGroup(R.stops.slice(1,-1).map(s=>{
    const p = pointAtKm(s.km);
    return L.marker(p, {icon:L.divIcon({className:"", html:'<div class="wpmark"></div>', iconSize:[12,12], iconAnchor:[6,6]})})
      .bindPopup(`<b>${s.name}</b><br>km ${Math.round(s.km)} · ${s.note}`);
  })).addTo(map);
}
function updateBus(){
  if(!map || !busMarker) return;
  const p = state.fix && state.source==="gps" ? [state.fix.lat,state.fix.lon] : pointAtKm(state.km);
  busMarker.setLatLng(p);
  if(follow && !$("tab-karte").hidden) map.setView(p, Math.max(map.getZoom()||0, 11), {animate:false});
}
$("followBtn").addEventListener("click", ()=>{
  follow = !follow; $("followBtn").textContent = "Mitfahren: " + (follow?"an":"aus");
  if(follow) updateBus();
});

/* ---------- Tabs ---------- */
function showTab(name){
  document.querySelectorAll(".tab").forEach(s=>s.hidden = s.dataset.tab!==name);
  document.querySelectorAll(".tabbar button").forEach(b=>b.classList.toggle("on", b.dataset.go===name));
  store.set("tab", name);
  if(name==="karte"){ initMap(); if(map){ updateSightMarkers(); setTimeout(()=>{ map.invalidateSize(); updateBus(); }, 60); } }
  if(name==="fahrt") loadWeatherKoeln();
  window.scrollTo(0,0);
}
document.querySelectorAll(".tabbar button").forEach(b=>b.addEventListener("click", ()=>showTab(b.dataset.go)));

/* ---------- Unterwegs: Ausblicke & Roaming ---------- */
// [Titel, lat, lon (Punkt an der Autobahn), Text, Land]
const SIGHTS = [
  ["Die Marmorberge von Carrara",44.060,10.060,"Rechts über der Küstenautobahn leuchten die Apuanischen Alpen weiß, als läge Schnee. Das ist Marmor: Aus diesen Brüchen stammt seit der Römerzeit der berühmte Carrara-Marmor, auch Michelangelo holte seinen Stein hier.","it"],
  ["Pontremoli und die Stelen-Statuen",44.378,9.879,"Über der Altstadt thront das Castello del Piagnaro. Darin steht eine Sammlung prähistorischer Stelen-Statuen aus der Lunigiana, einige über 4.000 Jahre alt.","it"],
  ["Apennin und Cisa-Pass",44.500,9.990,"Die A15 quert hier den Apennin zwischen Toskana und Emilia. Oben liegt der Cisa-Pass (1.041 m), über den auch der alte Pilgerweg Via Francigena nach Rom führt.","it"],
  ["Der Po",45.075,9.715,"Kurz vor Piacenza geht es über den Po, mit gut 650 km Italiens längster Fluss. Rundherum die flache Po-Ebene, eine der wichtigsten Agrarregionen Europas.","it"],
  ["Seedamm von Melide",45.955,8.968,"Die Autobahn fährt auf einem Damm mitten über den Luganersee, links und rechts Wasser. Gebaut wurde der Damm Mitte des 19. Jahrhunderts. Darüber ragt der Monte San Salvatore (912 m) auf.","ch"],
  ["Monte Ceneri",46.140,8.925,"Die Autobahn klettert über den Monte-Ceneri-Pass (554 m). Tief darunter fährt seit 2020 die Bahn durch den 15 km langen Ceneri-Basistunnel.","ch"],
  ["Die Burgen von Bellinzona",46.193,9.020,"Drei mittelalterliche Burgen bewachen das Tal: Castelgrande, Montebello und Sasso Corbaro. Seit 2000 sind sie UNESCO-Welterbe. Castelgrande sieht man von der Autobahn aus.","ch"],
  ["Gotthard-Straßentunnel",46.600,8.600,"16,9 km durch den Berg, einer der längsten Straßentunnel der Welt, eröffnet 1980. Bei 80 km/h knapp 13 Minuten ohne Tageslicht. Oben drüber liegt der Gotthardpass auf 2.106 m.","ch"],
  ["Altdorf, Wilhelm Tells Ort",46.880,8.640,"Im Hauptort von Uri steht das berühmte Tell-Denkmal. Der Sage nach soll Tell hier den Apfel vom Kopf seines Sohnes geschossen haben.","ch"],
  ["Vierwaldstättersee, Pilatus und Rigi",46.990,8.310,"Bei Hergiswil führt die Autobahn am Vierwaldstättersee entlang. Bei klarer Sicht siehst du den Pilatus (2.128 m) und auf der anderen Seeseite die Rigi (1.798 m).","ch"],
  ["Basel und der Rhein",47.570,7.600,"Hier macht der Rhein seinen großen Knick nach Norden. Am Dreiländereck treffen sich die Schweiz, Deutschland und Frankreich. Ab jetzt Deutschland.","de"],
  ["Schwarzwald",47.990,7.800,"Die A5 fährt durch die flache Rheinebene. Rechts (Osten) stehen die Hänge des Schwarzwalds, sein höchster Berg ist der Feldberg (1.493 m). Links, weit hinter dem Rhein, liegen die Vogesen in Frankreich.","de"],
  ["Karlsruhe",49.010,8.400,"Die Fächerstadt: Die Straßen laufen sternförmig auf das Schloss zu. Hier sitzen das Bundesverfassungsgericht und der Bundesgerichtshof.","de"],
  ["Frankfurter Flughafen",50.050,8.570,"Am Frankfurter Kreuz liegt Deutschlands größter Flughafen direkt neben der Autobahn. Oft siehst du Flugzeuge tief über die Straße zur Landung gleiten.","de"],
  ["ICE-Strecke neben der A3",50.430,7.830,"Zwischen Frankfurt und Köln läuft die Schnellfahrstrecke lange direkt neben der Autobahn. Die ICEs fahren hier bis 300 km/h und überholen den Bus mühelos. Bei Montabaur hält der ICE sogar direkt an der A3.","de"],
  ["Moseltalbrücke Winningen",50.310,7.500,"Die A61 überquert die Mosel auf einer der höchsten Brücken Deutschlands, rund 935 m lang und bis 136 m hoch. Unten liegt das Weindorf Winningen.","de"],
  ["Siebengebirge",50.670,7.300,"Kurz vor Köln sieht man die Kuppen des Siebengebirges. Auf dem bekanntesten Gipfel, dem Drachenfels, steht eine Burgruine hoch über dem Rhein.","de"],
  ["Kölner Dom",50.920,7.020,"Schon bei der Einfahrt nach Köln sieht man oft die beiden Türme (157 m). Gebaut wurde von 1248 bis 1880, heute ist der Dom UNESCO-Welterbe. Gleich seid ihr da.","de"]
];
let S = [];          // Ausblicke auf der aktuellen Route: {title,text,km,cc,i}
let sightsVersion = -1;
function placeSights(){
  if(!R || sightsVersion===routeVersion) return;
  sightsVersion = routeVersion;
  S = [];
  SIGHTS.forEach((x,i)=>{
    const p = locate(x[1],x[2]);
    if(p.d <= 15) S.push({title:x[0], text:x[3], cc:x[4], km:p.km, i});
  });
  S.sort((a,b)=>a.km-b.km);
}

const notified = store.get("notified", {});
let notifOn = store.get("notifOn", false);
function canNotify(){ return "Notification" in window && Notification.permission==="granted"; }
function updateNotifBtn(){
  const b = $("notifBtn");
  if(!("Notification" in window)){ b.textContent = notifOn ? "Hinweise: an (nur Vibration)" : "Hinweise einschalten (nur Vibration)"; return; }
  b.textContent = notifOn ? "Hinweise: an" : "Hinweise aufs Handy schicken";
  b.className = notifOn ? "primary" : "";
}
$("notifBtn").addEventListener("click", async ()=>{
  if(notifOn){ notifOn = false; store.set("notifOn", false); updateNotifBtn(); return; }
  if("Notification" in window && Notification.permission==="default"){
    try{ await Notification.requestPermission(); }catch(e){}
  }
  notifOn = true; store.set("notifOn", true); updateNotifBtn();
  if("Notification" in window && Notification.permission==="denied")
    $("notifNote").textContent = "Benachrichtigungen sind für diese Seite blockiert. Es gibt nur Vibration und den Hinweis oben auf der Startseite.";
});
async function alertOnce(key, title, body){
  if(notified[key]) return;
  notified[key] = Date.now(); store.set("notified", notified);
  if(!notifOn) return;
  try{ if(navigator.vibrate) navigator.vibrate([200,100,200]); }catch(e){}
  if(canNotify()){
    try{
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      const opt = {body, icon:"icons/icon-192.png", badge:"icons/icon-192.png", tag:key};
      if(reg) reg.showNotification(title, opt); else new Notification(title, opt);
    }catch(e){}
  }
}

function roamStatus(km){
  const b = R.borderKm, ch = b[0].km, de = b[1].km;
  if(km < ch - 0.3) return {phase:"before", dist: ch-km};
  if(km < de - 0.3) return {phase:"in", dist: de-km};
  return {phase:"after", dist: km-de};
}

function renderSights(){
  if(!R) return;
  placeSights();
  const km = state.km;

  // Roaming
  const r = roamStatus(km), st = $("roamState");
  const chTs = state.computedAt + hoursBetween(km, R.borderKm[0].km)*H;
  const deTs = state.computedAt + hoursBetween(km, R.borderKm[1].km)*H;
  if(r.phase==="before"){
    $("roamTitle").textContent = "Gleich Schweiz: an Roaming denken";
    $("roamText").textContent = `Schweizer Grenze bei Chiasso in ${fmtKm(r.dist)} km, ca. ${fmtClock(chTs)} Uhr. Bis dahin gilt in Italien Roaming wie zu Hause.`;
    st.className = r.dist < 40 ? "roamstate warn" : "roamstate";
    st.textContent = r.dist < 40 ? "Jetzt mobile Daten ausschalten, falls die Schweiz nicht im Tarif ist." : "";
  } else if(r.phase==="in"){
    $("roamTitle").textContent = "Du bist in der Schweiz";
    $("roamText").textContent = `Noch ${fmtKm(r.dist)} km bis Deutschland, ca. ${fmtClock(deTs)} Uhr. Auch kurz hinter Basel kann sich das Handy noch ins Schweizer Netz einbuchen.`;
    if(navigator.onLine){ st.className = "roamstate bad"; st.textContent = "Dein Handy ist gerade online. Wenn das nicht das Bus-WLAN ist, laufen Roamingkosten."; }
    else { st.className = "roamstate ok"; st.textContent = "Offline. Keine Roamingkosten, die App läuft trotzdem weiter."; }
  } else {
    $("roamTitle").textContent = "Zurück in der EU";
    $("roamText").textContent = "In Deutschland gilt wieder Roaming wie zu Hause.";
    st.className = r.dist < 15 ? "roamstate warn" : "roamstate ok";
    st.textContent = r.dist < 15 ? "Erst nach ein paar Kilometern hinter Basel die Daten wieder einschalten, damit das Handy im deutschen Netz ist." : "Mobile Daten kannst du wieder einschalten.";
  }
  if(r.phase==="before" && r.dist < 40) alertOnce("roam-ch","Gleich Schweiz: Roaming!",`Grenze in ${fmtKm(r.dist)} km. Mobile Daten aus, falls die Schweiz nicht im Tarif ist.`);
  if(r.phase==="after" && r.dist >= 15 && notified["roam-ch"]) alertOnce("roam-de","Zurück in der EU","Du kannst die mobilen Daten wieder einschalten.");

  // Ausblicke
  const ul = $("sights"); ul.innerHTML = "";
  let firstAhead = null;
  S.forEach(x=>{
    const ahead = x.km - km;
    const li = document.createElement("li");
    const now = ahead > -2 && ahead <= 8;
    const past = ahead <= -2;
    if(now) li.className = "now"; else if(past) li.className = "past";
    if(!past && !firstAhead) firstAhead = {...x, ahead};
    const ts = state.computedAt + hoursBetween(km, x.km)*H;
    const when = past ? "vorbei" : now ? (ahead <= 0.5 ? "jetzt" : `gleich · ${fmtKm(ahead)} km`) : `${fmtKm(ahead)} km · ${fmtClock(ts)}`;
    li.innerHTML = `<div class="hd"><b></b><span class="when"></span></div><p></p>`;
    li.querySelector("b").textContent = x.title;
    li.querySelector(".when").textContent = when;
    li.querySelector("p").textContent = x.text;
    ul.appendChild(li);
    if(ahead > -1 && ahead <= 5) alertOnce("s"+x.i, "Gleich zu sehen: "+x.title, x.text);
  });
  if(!S.length){ const li=document.createElement("li"); li.textContent="Keine Ausblicke auf dieser Route gefunden."; ul.appendChild(li); }

  // Hinweis auf der Startseite
  const bn = $("banner");
  const sightNow = firstAhead && firstAhead.ahead <= 3;
  if(!sightNow && ((r.phase==="before" && r.dist < 40) || r.phase==="in")){
    bn.hidden = false; bn.className = "banner roam";
    bn.innerHTML = "<b></b><span></span>";
    bn.querySelector("b").textContent = r.phase==="in" ? "Schweiz: Roaming beachten" : `Schweizer Grenze in ${fmtKm(r.dist)} km`;
    bn.querySelector("span").textContent = r.phase==="in" ? (navigator.onLine ? "Handy ist online. Ohne Bus-WLAN fallen Roamingkosten an." : "Offline, alles gut. Die App läuft weiter.") : "Mobile Daten ausschalten, falls die Schweiz nicht im Tarif ist.";
  } else if(firstAhead && firstAhead.ahead <= 15){
    bn.hidden = false; bn.className = "banner";
    bn.innerHTML = "<b></b><span></span>";
    bn.querySelector("b").textContent = (firstAhead.ahead <= 0.5 ? "Jetzt: " : `In ${fmtKm(firstAhead.ahead)} km: `) + firstAhead.title;
    bn.querySelector("span").textContent = firstAhead.text;
  } else bn.hidden = true;
  updateSightMarkers();
}
let sightLayer = null, sightMarkVersion = -1;
function updateSightMarkers(){
  if(!map || sightMarkVersion===routeVersion) return;
  sightMarkVersion = routeVersion;
  if(sightLayer) sightLayer.remove();
  sightLayer = L.layerGroup(S.map(x=>{
    const p = pointAtKm(x.km);
    const m = L.marker(p, {icon:L.divIcon({className:"", html:'<div class="sightmark"></div>', iconSize:[14,14], iconAnchor:[7,7]})});
    const div = document.createElement("div"); const b = document.createElement("b"); b.textContent = x.title;
    div.append(b, document.createElement("br"), x.text); m.bindPopup(div, {maxWidth:260});
    return m;
  })).addTo(map);
}
window.addEventListener("online", ()=>renderSights());
window.addEventListener("offline", ()=>renderSights());
updateNotifBtn();

/* ---------- Neue Fahrt ---------- */
$("resetBtn").addEventListener("click", ()=>{ $("resetConfirm").hidden = false; });
$("resetNo").addEventListener("click", ()=>{ $("resetConfirm").hidden = true; });
$("resetYes").addEventListener("click", ()=>{
  state.hist = []; state.track = []; state.start = null;
  store.set("hist", []); store.set("track", []); store.set("start", null);
  if(state.fix && state.source==="gps"){ setStartHere(state.fix.lat, state.fix.lon); }
  else { tripStart = {...BIBBONA}; store.set("tripStart", null); store.set("route", null); loadRoute(false).then(relocate); }
  store.set("mName", tripStart.name); store.set("mPlus",0); $("manualPlus").value = 0;
  for(const k in notified) delete notified[k]; store.set("notified", {});
  if(trackLine) trackLine.setLatLngs([]);
  fillManual(); relocate();
  $("resetConfirm").hidden = true;
});
$("reloadRoute").addEventListener("click", ()=>loadRoute(true));

/* ---------- Start ---------- */
loadRoute(false).then(()=>{ relocate(); loadWeatherKoeln(); });
showTab(["fahrt","karte","unterwegs","etappen"].includes(store.get("tab","fahrt")) ? store.get("tab","fahrt") : "fahrt");
if(store.get("gpsOn",false) && navigator.permissions){
  navigator.permissions.query({name:"geolocation"}).then(s=>{ if(s.state==="granted") startGps(); }).catch(()=>{});
}
setInterval(renderTick, 1000);
setInterval(showWeatherKoeln, 60000);
setInterval(loadWeatherKoeln, 30*MIN);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
