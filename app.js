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

/* ---------- Orte entlang der Strecke ----------
   [Name, lat, lon, Plan-km (Näherung), Land, Hinweis, nurAlternative] */
const W = [
  ["Pontremoli",44.375,9.880,0,"it","Start"],
  ["Passo della Cisa",44.475,9.960,15,"it","A15, Tunnel unter dem Apennin"],
  ["Parma",44.825,10.250,70,"it","A15 → A1"],
  ["Piacenza",45.050,9.700,135,"it","A1"],
  ["Lodi",45.310,9.500,170,"it","A1"],
  ["Mailand",45.480,9.150,200,"it","Tangenziale, viel Verkehr"],
  ["Como / Chiasso",45.835,9.030,250,"ch","Grenze Italien – Schweiz"],
  ["Lugano",46.000,8.950,275,"ch","A2"],
  ["Bellinzona",46.190,9.020,305,"ch","A2"],
  ["Airolo",46.530,8.610,360,"ch","Gotthard-Südportal"],
  ["Göschenen",46.665,8.590,378,"ch","Gotthard-Nordportal"],
  ["Altdorf",46.880,8.640,405,"ch","A2"],
  ["Luzern",47.050,8.310,445,"ch","A2"],
  ["Basel",47.560,7.590,540,"de","Grenze Schweiz – Deutschland"],
  ["Freiburg",47.990,7.840,610,"de","A5"],
  ["Karlsruhe",49.010,8.400,740,"de","A5"],
  ["Walldorf",49.300,8.640,790,"de","A5 / A6"],
  ["Frankfurt",50.050,8.570,885,"de","Frankfurter Kreuz, A3"],
  ["Limburg",50.390,8.060,950,"de","A3"],
  ["Siegburg",50.800,7.200,1040,"de","A3"],
  ["Ludwigshafen",49.480,8.390,null,"de","A61",true],
  ["Bingen",49.950,7.900,null,"de","A61",true],
  ["Koblenz",50.360,7.550,null,"de","A61, Moseltal",true],
  ["Meckenheim",50.620,7.030,null,"de","A61 / A565",true],
  ["Köln",50.940,6.960,1075,"de","Ziel"]
];
const PLAN_SPEED = [65,75,85,80,60,75,75,80,70,80,75,80,85,85,85,85,85,85,85,75];
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

function finishRoute(pts, segV, src){
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
  if(src === "plan"){ // Plan-km aus der Tabelle verwenden
    const plan = W.filter(w=>!w[6]);
    for(let i=0;i<n;i++) R.cumKm[i] = plan[i][3];
    for(let i=0;i<n-1;i++) R.segKm[i] = plan[i+1][3]-plan[i][3];
  }
  recomputeTime();
  // Orte auf die Route legen
  const stops = [];
  W.forEach(w=>{
    if(src==="plan" && w[6]) return;
    const p = locate(w[1],w[2]);
    if(p.d <= 12) stops.push({name:w[0], km:p.km, cc:w[4], note:w[5]});
  });
  stops.sort((a,b)=>a.km-b.km);
  stops[0].km = 0; stops[stops.length-1].km = R.cumKm[n-1];
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
  finishRoute(plan.map(w=>[w[1],w[2]]), PLAN_SPEED.slice(), "plan");
}

function buildOsrmRoute(data){
  finishRoute(data.pts, data.seg, "osrm");
}

async function fetchOsrm(){
  const vias = [[44.3757,9.8797],[46.0167,8.9339],[47.5920,7.6060],DEST];
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
  const data = {pts, seg, at: Date.now(), km: j.routes[0].distance/1000};
  store.set("route", data);
  return data;
}

async function loadRoute(force){
  const cached = store.get("route", null);
  if(cached && cached.pts && !force){
    buildOsrmRoute(cached);
  } else if(!R){
    buildPlanRoute();
  }
  updateRouteNote();
  if(!cached || force){
    $("routeSrc").textContent = "Echte Straßenroute wird geladen …";
    try{
      buildOsrmRoute(await fetchOsrm());
    }catch(e){
      if(!R) buildPlanRoute();
    }
    updateRouteNote();
    relocate();
    drawRoute();
  }
}

function updateRouteNote(){
  if(!R) return;
  const km = R.cumKm[R.cumKm.length-1], h = R.cumH[R.cumH.length-1];
  $("routeSrc").textContent = R.src === "osrm"
    ? `Route aus echten Straßendaten (OpenStreetMap): ${fmtKm(km)} km, reine Fahrzeit Bus ca. ${fmtHM(h*H)} h ohne Stopps.`
    : `Keine Verbindung zum Routenserver. Näherung über ${R.pts.length} Wegpunkte: ${fmtKm(km)} km, ca. ${fmtHM(h*H)} h ohne Stopps.`;
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
  renderDriver();
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
  const sel = $("manualWp"), keep = store.get("mName", "Pontremoli");
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
  if(name==="karte"){ initMap(); if(map){ setTimeout(()=>{ map.invalidateSize(); updateBus(); }, 60); } }
  if(name==="fahrt") loadWeatherKoeln();
  window.scrollTo(0,0);
}
document.querySelectorAll(".tabbar button").forEach(b=>b.addEventListener("click", ()=>showTab(b.dataset.go)));

/* ---------- Fahrer & Lenkzeit ---------- */
const D = Object.assign({names:["Fahrer 1","Fahrer 2"], cur:0, status:"idle", since:0, cont:[0,0], day:[0,0], lastEnd:[0,0], log:[]}, store.get("drv", {}));
const saveD = () => store.set("drv", D);
$("d1name").value = D.names[0]; $("d2name").value = D.names[1];
["d1name","d2name"].forEach((id,i)=>$(id).addEventListener("input", ()=>{ D.names[i] = $(id).value.trim() || `Fahrer ${i+1}`; saveD(); renderDriver(); }));

function settle(now){
  if(D.status==="drive"){ const e = now - D.since; D.cont[D.cur] += e; D.day[D.cur] += e; }
  D.since = now;
}
function addLog(txt){ D.log.unshift({t:Date.now(), txt}); D.log = D.log.slice(0,60); }
$("dStart").addEventListener("click", ()=>{
  const now = Date.now();
  if(D.status==="drive") return;
  if(D.status==="pause" && now-D.since >= 45*MIN){ D.cont[D.cur] = 0; }
  if(D.status==="idle" && !state.start){ state.start = now; store.set("start", now); }
  settle(now); D.status = "drive";
  addLog(`${D.names[D.cur]} fährt`);
  saveD(); renderDriver(true);
});
$("dSwap").addEventListener("click", ()=>{
  const now = Date.now();
  settle(now);
  if(D.status!=="idle") D.lastEnd[D.cur] = now;
  const was = D.cur; D.cur = 1-D.cur;
  if(D.lastEnd[D.cur] && now - D.lastEnd[D.cur] >= 45*MIN) D.cont[D.cur] = 0;
  if(D.status==="idle"){ addLog(`Startfahrer: ${D.names[D.cur]}`); }
  else { D.status = "drive"; addLog(`Wechsel: ${D.names[was]} → ${D.names[D.cur]}`); }
  saveD(); renderDriver(true);
});
$("dPause").addEventListener("click", ()=>{
  const now = Date.now();
  if(D.status==="drive"){
    settle(now); D.lastEnd[D.cur] = now; D.status = "pause";
    addLog(`Pause (${D.names[D.cur]} hat ${fmtHM(D.cont[D.cur])} am Stück)`);
  } else if(D.status==="pause"){
    const p = now - D.since;
    if(p >= 45*MIN){ D.cont = [0,0]; }
    settle(now); D.status = "drive";
    addLog(`Pause beendet nach ${fmtHM(p)} h, ${D.names[D.cur]} fährt`);
  }
  saveD(); renderDriver(true);
});

let logStamp = -1;
function renderDriver(force){
  const now = Date.now();
  const live = D.status==="drive" ? now - D.since : 0;
  const cont = D.cont[D.cur] + live;
  const day = [D.day[0] + (D.cur===0?live:0), D.day[1] + (D.cur===1?live:0)];
  $("dNow").textContent = D.names[D.cur];
  const st = $("dState");
  if(D.status==="drive"){ st.className = "dstate drive"; st.textContent = `Fährt seit ${fmtClock(D.since)} Uhr`; }
  else if(D.status==="pause"){ st.className = "dstate pause"; st.textContent = `Pause seit ${fmtHM(now-D.since)} h` + (now-D.since>=45*MIN ? " · gilt als volle Pause" : ` · noch ${fmtHM(45*MIN-(now-D.since))} bis 45 min`); }
  else { st.className = "dstate"; st.textContent = "Noch nicht gestartet. Mit „Fahrerwechsel“ den Startfahrer wählen."; }
  $("dStart").disabled = D.status==="drive";
  $("dStart").textContent = D.status==="pause" ? "Weiterfahren" : "Fahrt starten";
  $("dPause").disabled = D.status==="idle";
  $("dPause").textContent = D.status==="pause" ? "Pause beenden" : "Pause";

  const LIM = 4.5*H;
  const mc = $("mCont"); mc.style.width = Math.min(100, cont/LIM*100)+"%";
  mc.className = cont >= LIM ? "bad" : cont >= 4.25*H ? "warn" : "";
  $("contTxt").textContent = fmtHM(cont);
  const w = $("contWarn");
  if(D.status==="drive" && cont >= LIM){ w.hidden=false; w.className="msg bad"; w.textContent = `Lenkzeit überschritten. Jetzt wechseln oder 45 Minuten Pause.`; }
  else if(D.status==="drive" && cont >= 4*H){ w.hidden=false; w.className="msg"; w.textContent = `Noch ${fmtHM(LIM-cont)} bis zur Pflichtpause. Fahrerwechsel planen.`; }
  else w.hidden = true;

  [0,1].forEach(i=>{
    $(`d${i+1}lbl`).textContent = D.names[i];
    $(`d${i+1}day`).textContent = fmtHM(day[i]);
    const m = $(`m${i+1}`); m.style.width = Math.min(100, day[i]/(10*H)*100)+"%";
    m.className = day[i] >= 10*H ? "bad" : day[i] >= 9*H ? "warn" : "";
  });

  if(force || logStamp !== D.log.length){
    logStamp = D.log.length;
    const ul = $("dLog"); ul.innerHTML = "";
    if(!D.log.length){ const li=document.createElement("li"); li.textContent="Noch keine Einträge."; ul.appendChild(li); }
    D.log.forEach(e=>{
      const li = document.createElement("li"), t = document.createElement("time"), s = document.createElement("span");
      t.textContent = fmtClock(e.t); s.textContent = e.txt; li.append(t, s); ul.appendChild(li);
    });
  }
}

/* ---------- Neue Fahrt ---------- */
$("resetBtn").addEventListener("click", ()=>{ $("resetConfirm").hidden = false; });
$("resetNo").addEventListener("click", ()=>{ $("resetConfirm").hidden = true; });
$("resetYes").addEventListener("click", ()=>{
  state.hist = []; state.track = []; state.start = null;
  store.set("hist", []); store.set("track", []); store.set("start", null);
  store.set("mName","Pontremoli"); store.set("mPlus",0); $("manualPlus").value = 0;
  Object.assign(D, {cur:0, status:"idle", since:0, cont:[0,0], day:[0,0], lastEnd:[0,0], log:[]}); saveD();
  if(trackLine) trackLine.setLatLngs([]);
  fillManual(); relocate(); renderDriver(true);
  $("resetConfirm").hidden = true;
});
$("reloadRoute").addEventListener("click", ()=>loadRoute(true));

/* ---------- Start ---------- */
loadRoute(false).then(()=>{ relocate(); loadWeatherKoeln(); });
showTab(store.get("tab","fahrt"));
if(store.get("gpsOn",false) && navigator.permissions){
  navigator.permissions.query({name:"geolocation"}).then(s=>{ if(s.state==="granted") startGps(); }).catch(()=>{});
}
setInterval(renderTick, 1000);
setInterval(showWeatherKoeln, 60000);
setInterval(loadWeatherKoeln, 30*MIN);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
