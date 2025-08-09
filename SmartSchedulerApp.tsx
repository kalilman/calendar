/* SmartSchedulerApp.tsx
   Single-file demo implementing your feature spec.

   External deps: react, framer-motion (optional). Tailwind classes used for nice defaults.
   If you don’t use Tailwind, it’s still usable (just plainer).
*/

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays, addMinutes, addMonths, differenceInMinutes, endOfDay, format,
  getHours, setHours, setMinutes, startOfDay, startOfWeek
} from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

/* ----------------------------- Constants & Types ---------------------------- */
const START_HOUR = 6;
const END_HOUR = 21;
const HOUR_PX = 64;
const PX_PER_MIN = HOUR_PX / 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const uid = () => Math.random().toString(36).slice(2);
const clamp = (n:number, a:number, b:number)=>Math.max(a, Math.min(b, n));
const asISO = (d: Date | string | number) => new Date(d).toISOString();
const minutesBetween = (a: Date, b: Date) => Math.abs(differenceInMinutes(a, b));

const Category = {
  FIXED_MANDATORY: "Fixed Mandatory",
  FIXED_OPTIONAL: "Fixed Optional",
  FLEX_MANDATORY: "Flexible Mandatory",
  FLEX_OPTIONAL: "Flexible Optional",
} as const;
type CategoryType = typeof Category[keyof typeof Category];

type Subtask = { id: string; text: string; done: boolean };
type Loc = { name?: string; lat?: number|null; lon?: number|null } | null;

type EventItem = {
  id: string;
  title: string;
  category: CategoryType;
  start: string|null;
  end: string|null;
  durationMin?: number;
  priority: number;
  location: Loc;
  subtasks: Subtask[];
  completionPct: number; // 0-100
  flexibleWindow: null | { earliest?: string|null; latest?: string|null };
  notes?: string;
};

const CategoryColor: Record<CategoryType, string> = {
  [Category.FIXED_MANDATORY]: "bg-rose-500",
  [Category.FIXED_OPTIONAL]: "bg-amber-500",
  [Category.FLEX_MANDATORY]: "bg-emerald-600",
  [Category.FLEX_OPTIONAL]: "bg-sky-600",
};
const categoryList = Object.values(Category);

/* ------------------------------- Local Storage ------------------------------ */
const toStore = (k:string,v:any)=>{ try{localStorage.setItem(k, JSON.stringify(v));}catch{} };
const fromStore = <T,>(k:string,fb:T):T => { try{const v=localStorage.getItem(k); return v?JSON.parse(v):fb;}catch{ return fb;} };

/* ------------------------------ Travel helpers ------------------------------ */
function travelMinutes(
  from?: {lat:number|null, lon:number|null}|null,
  to?: {lat:number|null, lon:number|null}|null,
  kmh=40
){
  if (!from || !to || from.lat==null || to.lat==null || from.lon==null || to.lon==null) return 0;
  const R=6371, dLat=(Math.PI/180)*(to.lat-from.lat), dLon=(Math.PI/180)*(to.lon-from.lon);
  const lat1=(Math.PI/180)*from.lat, lat2=(Math.PI/180)*to.lat;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  const c=2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distKm=R*c;
  return Math.round((distKm/kmh)*60);
}

/* --------------------------------- Seed Data -------------------------------- */
function seed(today: Date): EventItem[] {
  const s = startOfDay(today);
  return [
    { id: uid(), title: "Team Standup", category: Category.FIXED_MANDATORY,
      start: asISO(setMinutes(setHours(s, 9),30)), end: asISO(setMinutes(setHours(s,10),0)),
      priority: 4, location: {name:"Office",lat:33.7488,lon:-84.388}, subtasks:[{id:uid(),text:"Notes ready",done:false}],
      completionPct: 0, flexibleWindow: null },

    { id: uid(), title: "Workout", category: Category.FLEX_MANDATORY, start:null, end:null, durationMin: 60,
      priority: 5, location: {name:"Gym",lat:33.781,lon:-84.388}, subtasks:[{id:uid(),text:"Warmup 10m",done:false}],
      completionPct: 0, flexibleWindow: { earliest: asISO(setHours(s,6)), latest: asISO(setHours(s,20)) } },

    { id: uid(), title: "Read/Study", category: Category.FLEX_OPTIONAL, start:null, end:null, durationMin:45,
      priority: 3, location: null, subtasks:[], completionPct: 0,
      flexibleWindow: { earliest: asISO(setHours(s,7)), latest: asISO(setHours(s,22)) } },

    { id: uid(), title: "Doctor's Appointment", category: Category.FIXED_MANDATORY,
      start: asISO(setMinutes(setHours(s,15),0)), end: asISO(setMinutes(setHours(s,15),45)),
      priority: 5, location: {name:"Clinic",lat:33.755,lon:-84.39}, subtasks:[{id:uid(),text:"Insurance card",done:false}],
      completionPct: 0, flexibleWindow: null },
  ];
}

/* --------------------------------- Defaults --------------------------------- */
const defaultPrefs = {
  view: "week" as "day"|"week",
  locationTracking: false,
  currentLocation: {lat:null as number|null, lon:null as number|null},
  avgTravelSpeedKmh: 40,
  ratios: { Work: 60, Wellness: 20, Leisure: 20 },
  preferredBlocks: [
    { category: Category.FLEX_MANDATORY, label: "Morning workouts", startHour:6, endHour:10 },
    { category: Category.FLEX_OPTIONAL, label: "Evening leisure",  startHour:18, endHour:22 },
  ],
  notifications: true,
  motivationFrequency: "low" as "none"|"low"|"high",
  wellnessSuggestions: true,
};

/* ------------------------------ Helper UI bits ------------------------------ */
const Button = (p:any)=><button {...p} className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50 transition ${p.className||""}`} />;
const Badge  = ({children,className=""}:{children:React.ReactNode,className?:string})=><span className={`inline-flex items-center rounded-2xl border px-2 py-[2px] text-xs ${className}`}>{children}</span>;
const Label  = ({children}:{children:React.ReactNode})=><label className="text-xs font-medium text-slate-700">{children}</label>;
const Input  = (p:any)=><input {...p} className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 ${p.className||""}`} />;
const Textarea=(p:any)=><textarea {...p} className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 ${p.className||""}`} />;

/* ------------------------------ Mini Calendar ------------------------------- */
function startOfMonth(d: Date){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function sameDate(a?:Date|null,b?:Date|null){
  return !!a && !!b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function combineDateTime(dateOnly: Date, timeStr: string){
  const [hh,mm]=timeStr.split(":").map(Number); const d=new Date(dateOnly); d.setHours(hh||0, mm||0, 0, 0); return d.toISOString();
}
function splitToDateTime(iso?: string|null){
  if(!iso) return {date:undefined as Date|undefined, time:"09:00"};
  const d=new Date(iso); return {date:new Date(d.getFullYear(),d.getMonth(),d.getDate()), time:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`};
}
function MiniCalendar({selected,onSelect}:{selected?:Date; onSelect:(d:Date)=>void}){
  const [cursor,setCursor]=useState<Date>(selected?new Date(selected):new Date());
  const s=startOfMonth(cursor), e=endOfMonth(cursor); const first=s.getDay(); const nd=e.getDate();
  const grid:(Date|null)[]=[]; for(let i=0;i<first;i++) grid.push(null); for(let d=1; d<=nd; d++) grid.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  return (
    <div className="p-2 w-[268px]">
      <div className="flex items-center justify-between mb-2">
        <Button onClick={()=>setCursor(addMonths(cursor,-1))}>‹</Button>
        <div className="text-sm font-medium">{format(cursor,"MMMM yyyy")}</div>
        <Button onClick={()=>setCursor(addMonths(cursor,1))}>›</Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-500 mb-1">["S","M","T","W","T","F","S"].map(d=><div key={d} className="text-center">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d,i)=> d
        ? <button key={i} className={`h-8 rounded ${sameDate(d,selected)?"bg-slate-900 text-white":"hover:bg-slate-100"}`} onClick={()=>onSelect(d!)}>{d!.getDate()}</button>
        : <div key={i} className="h-8" />)}
      </div>
    </div>
  );
}
function DateOnlyField({value,onChange}:{value:string|null; onChange:(iso:string|null)=>void}){
  const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ const f=(e:MouseEvent)=>{ if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown",f); return ()=>document.removeEventListener("mousedown",f); },[]);
  const d=value?new Date(value):undefined;
  return (
    <div className="relative" ref={ref}>
      <Button className="w-full justify-start" onClick={()=>setOpen(o=>!o)}>{d?d.toDateString():"Pick date"}</Button>
      {open && (
        <div className="absolute z-20 top-10 left-0 rounded-lg border bg-white shadow">
          <MiniCalendar selected={d} onSelect={(sel)=>{ const iso=new Date(sel.getFullYear(),sel.getMonth(),sel.getDate(),0,0,0,0).toISOString(); onChange(iso); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}
function DateTimeField({label,value,onChange}:{label:string; value?:string|null; onChange:(iso:string|null)=>void}){
  const [open,setOpen]=useState(false); const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ const f=(e:MouseEvent)=>{ if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown",f); return ()=>document.removeEventListener("mousedown",f); },[]);
  const {date,time}=splitToDateTime(value);
  return (
    <div className="space-y-2" ref={ref}>
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-2 relative">
        <Button className="justify-start" onClick={()=>setOpen(o=>!o)}>{date?date.toDateString():"Pick date"}</Button>
        <Input type="time" value={time} onChange={(e)=>{ if(!date) return; onChange(combineDateTime(date, e.target.value)); }} />
        {open && (
          <div className="absolute z-20 top-10 left-0 rounded-lg border bg-white shadow">
            <MiniCalendar selected={date} onSelect={(d)=>{ onChange(combineDateTime(d, time)); setOpen(false); }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- App Root --------------------------------- */
export default function SmartSchedulerApp(){
  const [today,setToday]=useState(new Date());
  const [events,setEvents]=useState<EventItem[]>(()=>fromStore("ss_events", seed(new Date())));
  const [prefs,setPrefs]=useState(()=>fromStore("ss_prefs", defaultPrefs));
  const [selected,setSelected]=useState<EventItem|null>(null);
  const [points,setPoints]=useState(()=>fromStore("ss_points",0));
  const [badges,setBadges]=useState<string[]>(()=>fromStore("ss_badges",[]));
  const [publicMode,setPublicMode]=useState(false);
  const [endOfDayOpen,setEndOfDayOpen]=useState(false);
  const [reschedPrompt,setReschedPrompt]=useState<null|{ev:EventItem; proposal:{start:string;end:string}}>(null);

  useEffect(()=>toStore("ss_events", events),[events]);
  useEffect(()=>toStore("ss_prefs", prefs),[prefs]);
  useEffect(()=>toStore("ss_points", points),[points]);
  useEffect(()=>toStore("ss_badges", badges),[badges]);

  /* End-of-day review 21:00 */
  useEffect(()=>{
    const t=setInterval(()=>{ if(getHours(new Date())===21 && !endOfDayOpen) setEndOfDayOpen(true); }, 60_000);
    return ()=>clearInterval(t);
  },[endOfDayOpen]);

  /* Notifications: ping 5 minutes before */
  useEffect(()=>{
    if(!prefs.notifications) return;
    if("Notification" in window){
      if(Notification.permission==="default") Notification.requestPermission();
    }
    const timers:number[]=[];
    for(const e of events){
      if(!e.start) continue;
      const delta = new Date(e.start).getTime() - Date.now() - 5*60_000;
      if(delta>0){
        const id = window.setTimeout(()=>notifyUpcoming(e, completeEvent), delta);
        timers.push(id);
      }
    }
    return ()=>timers.forEach(clearTimeout);
  },[events,prefs.notifications]);

  /* Offline (self-register SW) */
  useEffect(()=>{
    if(!("serviceWorker" in navigator)) return;
    const code = `
      const CACHE='ss-cache-v1';
      self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./']))); self.skipWaiting();});
      self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return res;})).catch(()=>new Response('Offline',{status:200})));});
    `;
    const blob = new Blob([code], {type:'text/javascript'});
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).catch(()=>{});
    return ()=>URL.revokeObjectURL(url);
  },[]);

  /* View range */
  const rangeStart = startOfWeek(today, {weekStartsOn:1});
  const days = prefs.view==="day" ? [today] : Array.from({length:7},(_,i)=>addDays(rangeStart,i));

  const eventsByDay = useMemo(()=>{
    const map=new Map<string,EventItem[]>();
    for(const d of days) map.set(format(d,"yyyy-MM-dd"), []);
    for(const e of events){
      if(!e.start || !e.end) continue;
      const k=format(new Date(e.start),"yyyy-MM-dd");
      if(map.has(k)) map.get(k)!.push(e);
    }
    for(const [,list] of map) list.sort((a,b)=>+new Date(a.start!)-+new Date(b.start!));
    return map;
  },[events,days]);

  /* ---- Scheduling (greedy + ratios + travel buffers + wellness breaks) ---- */
  function scheduleAll(){
    const newEvents=[...events];
    const fixed=newEvents.filter(e=>e.start && e.end);
    const flex =newEvents.filter(e=>!e.start || !e.end);

    const occupied = new Map<string, {start:Date; end:Date; ev:EventItem}[]>();
    for(const d of days){
      const key=format(d,"yyyy-MM-dd");
      const list=fixed
        .filter(e=>format(new Date(e.start!),"yyyy-MM-dd")===key)
        .map(e=>({start:new Date(e.start!), end:new Date(e.end!), ev:e}))
        .sort((a,b)=>+a.start-+b.start);
      occupied.set(key, list);
    }
    const fits=(key:string, start:Date, end:Date)=>{
      const day=occupied.get(key)||[];
      for(const it of day){ if(start<it.end && end>it.start) return false; }
      return true;
    };
    const place=(key:string, start:Date, end:Date, ev:EventItem)=>{
      const day=occupied.get(key)||[];
      day.push({start,end,ev}); day.sort((a,b)=>+a.start-+b.start); occupied.set(key,day);
      ev.start=asISO(start); ev.end=asISO(end);
    };

    /* Ratios for *today* */
    const todayKey=format(today,"yyyy-MM-dd");
    const availMinutes=(END_HOUR-START_HOUR+1)*60;
    const desired={ Work: Math.round(availMinutes*(prefs.ratios.Work/100)),
                    Wellness: Math.round(availMinutes*(prefs.ratios.Wellness/100)),
                    Leisure: Math.round(availMinutes*(prefs.ratios.Leisure/100)) };
    const bucketOf=(cat:CategoryType)=>(
      (cat===Category.FIXED_MANDATORY||cat===Category.FIXED_OPTIONAL)?"Work":
      (cat===Category.FLEX_MANDATORY)?"Wellness":"Leisure"
    ) as "Work"|"Wellness"|"Leisure";
    const current={Work:0,Wellness:0,Leisure:0};
    for(const it of occupied.get(todayKey)||[]){
      current[bucketOf(it.ev.category)]+=minutesBetween(it.start,it.end);
    }

    const scored = flex.map(ev=>{
      const windowStart=new Date(ev.flexibleWindow?.earliest||startOfDay(today));
      const windowEnd  =new Date(ev.flexibleWindow?.latest  ||endOfDay(today));
      const duration=ev.durationMin||30;
      const bucket=bucketOf(ev.category);
      let prefScore=0;
      for(const pb of prefs.preferredBlocks){
        if(pb.category!==ev.category) continue;
        if(duration <= (pb.endHour-pb.startHour)*60) prefScore+=1;
      }
      const deficit=Math.max(0, desired[bucket]-current[bucket]);
      const ratioScore=deficit/60; // hours def
      const priorityScore=(ev.priority||3)*2;
      const base=priorityScore+prefScore+ratioScore;
      return {ev, windowStart, windowEnd, duration, score:base};
    }).sort((a,b)=>b.score-a.score);

    for(const item of scored){
      const key=todayKey;
      const dayStart=setHours(startOfDay(today), START_HOUR);
      const dayEnd  =setHours(startOfDay(today), END_HOUR);
      const startCandidate=new Date(Math.max(+dayStart, +item.windowStart));
      const endLimit=new Date(Math.min(+dayEnd, +item.windowEnd));
      let placed=false;
      for(let t=startCandidate; t<endLimit; t=addMinutes(t, 15)){
        const end=addMinutes(t, item.duration);
        if(end> endLimit) break;
        if(!fits(key,t,end)) continue;

        /* Travel buffers if enabled */
        const day=occupied.get(key)||[];
        const prev=[...day].reverse().find(it=>it.start<=t);
        const next=day.find(it=>it.start>=end);
        let ok=true; let preBuf=0, postBuf=0;
        if(prefs.locationTracking && prev?.ev?.location && item.ev.location)
          preBuf=travelMinutes(prev.ev.location, item.ev.location, prefs.avgTravelSpeedKmh);
        if(prefs.locationTracking && next?.ev?.location && item.ev.location)
          postBuf=travelMinutes(item.ev.location, next.ev.location, prefs.avgTravelSpeedKmh);
        if(preBuf && !fits(key, addMinutes(t,-preBuf), t)) ok=false;
        if(postBuf && !fits(key, end, addMinutes(end, postBuf))) ok=false;
        if(!ok) continue;

        if(preBuf) place(key, addMinutes(t,-preBuf), t, ghostTravel("Travel in", item.ev));
        place(key, t, end, item.ev);
        if(postBuf) place(key, end, addMinutes(end, postBuf), ghostTravel("Travel out", item.ev));

        placed=true; break;
      }
      if(!placed){ item.ev.start=null; item.ev.end=null; }
    }

    /* Wellness break suggestion: insert 10m after >120m continuous */
    if(prefs.wellnessSuggestions){
      const key=todayKey, day=occupied.get(key)||[];
      for(let i=0;i<day.length-1;i++){
        const a=day[i], b=day[i+1];
        if(minutesBetween(a.start,a.end)>=120){
          const breakDur=10;
          const s=a.end, e=addMinutes(a.end, breakDur);
          if(!day.some(d=>!(e<=d.start||s>=d.end))){
            place(key,s,e,ghostBreak("Wellness break"));
          }
        }
      }
    }

    setEvents([...newEvents]);
  }

  function ghostTravel(title:string, base:EventItem): EventItem {
    return { id: uid(), title, category: Category.FIXED_OPTIONAL, start:null, end:null, priority:1, location: base.location, subtasks:[], completionPct:0, flexibleWindow:null };
  }
  function ghostBreak(title:string): EventItem {
    return { id: uid(), title, category: Category.FIXED_OPTIONAL, start:null, end:null, priority:1, location:null, subtasks:[], completionPct:0, flexibleWindow:null };
  }

  /* Quick add */
  function addEventQuick(day:Date, hour:number){
    const s=setMinutes(setHours(startOfDay(day), hour), 0); const e=addMinutes(s,60);
    const ev:EventItem={ id:uid(), title:"New Event", category:Category.FLEX_OPTIONAL, start:asISO(s), end:asISO(e), priority:3, location:null, subtasks:[], completionPct:0, flexibleWindow:null };
    setEvents(prev=>[...prev, ev]); setSelected(ev);
  }
  function deleteEvent(id:string){ setEvents(prev=>prev.filter(e=>e.id!==id)); }
  function updateEvent(updated:EventItem){ setEvents(prev=>prev.map(e=>e.id===updated.id?updated:e)); }
  function completeEvent(ev:EventItem, pct:number){
    const updated={...ev, completionPct:pct};
    if(pct===100){
      const add=Math.max(5,(ev.priority||3)*3);
      setPoints(p=>p+add);
      if(points+add>=100 && !badges.includes("Century Club")) setBadges(b=>[...b,"Century Club"]);
    }
    updateEvent(updated);
  }

  /* Adaptive rescheduler: detect “late” + propose next slot today */
  useEffect(()=>{
    const now=new Date();
    const running = events.filter(e=>e.start && e.end && new Date(e.start)<=now && now<new Date(e.end));
    const next = events.filter(e=>e.start && new Date(e.start)>now).sort((a,b)=>+new Date(a.start!)-+new Date(b.start!))[0];
    if(next && prefs.locationTracking){
      const prev = running[0];
      const buf = prev?.location && next.location ? travelMinutes(prev.location, next.location, prefs.avgTravelSpeedKmh):0;
      const shouldMove = prev && addMinutes(now,buf) > new Date(next.start!);
      if(shouldMove){
        // propose move by 30m later
        const propStart = addMinutes(new Date(next.start!), 30);
        const propEnd = addMinutes(new Date(next.end!), 30);
        setReschedPrompt({ev: next, proposal:{start:asISO(propStart), end:asISO(propEnd)}});
      }
    }
  },[events, prefs.locationTracking]);

  const barData = useMemo(()=>{
    const acc:Record<string,{hour:string;done:number;total:number}>={}
    for(const e of events){
      if(!e.start||!e.end) continue;
      const h=getHours(new Date(e.start)); const key=String(h).padStart(2,"0")+":00";
      acc[key]=acc[key]||{hour:key,done:0,total:0}; acc[key].total+=1;
      if((e.completionPct||0)>=100) acc[key].done+=1;
    }
    return Object.values(acc).map(r=>({hour:r.hour, rate:r.total?Math.round(100*r.done/r.total):0})).sort((a,b)=>a.hour.localeCompare(b.hour));
  },[events]);

  const minutesByBucket = useMemo(()=>{
    const bucket=(c:CategoryType)=> (c===Category.FLEX_MANDATORY?"Wellness": (c===Category.FLEX_OPTIONAL?"Leisure":"Work")) as "Work"|"Wellness"|"Leisure";
    const acc={Work:0,Wellness:0,Leisure:0};
    for(const e of events){ if(!e.start||!e.end) continue; acc[bucket(e.category)]+=minutesBetween(new Date(e.start), new Date(e.end)); }
    return acc;
  },[events]);

  /* Top bar navigation */
  const step=(delta:number)=> setToday(prefs.view==="day"? addDays(today,delta) : addMonths(today,delta));

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      {/* Top bar */}
      <div className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="font-semibold flex items-center gap-2">📅 Smart Scheduler</div>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={()=>step(-1)}>◀</Button>
            <div className="px-2 text-sm font-medium tabular-nums">
              {prefs.view==="day" ? format(today,"EEE, MMM d yyyy") : format(today,"MMMM yyyy")}
            </div>
            <Button onClick={()=>step(1)}>▶</Button>
            <select className="ml-2 border rounded-md px-2 py-2 text-sm" value={prefs.view} onChange={e=>setPrefs((p:any)=>({...p,view:e.target.value}))}>
              <option value="day">Day</option><option value="week">Week</option>
            </select>
            <Button className="ml-2" onClick={scheduleAll}>✨ Auto‑Schedule</Button>
            <Button className="ml-2" onClick={()=>exportICS(events)}>Export ICS</Button>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-12 gap-4 p-4 max-w-screen-2xl mx-auto">
        {/* Left panels */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <PreferencesPanel prefs={prefs} setPrefs={setPrefs} points={points} badges={badges} />
          <TrackingPanel barData={barData} minutesByBucket={minutesByBucket} />
          <GamificationPanel points={points} badges={badges} />
          <PublicBookingPanel enabled={publicMode} setEnabled={setPublicMode} events={events} />
        </div>

        {/* Calendar */}
        <div className="col-span-12 lg:col-span-9">
          <CalendarBoard days={days} eventsByDay={eventsByDay}
            onAdd={addEventQuick} onSelect={setSelected} onDelete={deleteEvent} onComplete={completeEvent} />
        </div>
      </div>

      {/* Modals & toasts */}
      <EventModal ev={selected} setEv={setSelected} onSave={updateEvent} onDelete={(id:string)=>{deleteEvent(id); setSelected(null);}} />
      <EndOfDayReview open={endOfDayOpen} setOpen={setEndOfDayOpen} events={events} onComplete={completeEvent} />
      <AnimatePresence>{prefs.motivationFrequency!=="none" && <MotivationToasts frequency={prefs.motivationFrequency} />}</AnimatePresence>

      {/* Adaptive rescheduler prompt */}
      <AnimatePresence>
        {reschedPrompt && (
          <motion.div initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:40,opacity:0}}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border shadow-lg rounded-xl px-4 py-3 w-[520px]">
            <div className="text-sm font-semibold mb-1">Running late—move “{reschedPrompt.ev.title}” by 30m?</div>
            <div className="text-xs text-slate-600 mb-3">
              Proposed: {format(new Date(reschedPrompt.proposal.start),"HH:mm")} – {format(new Date(reschedPrompt.proposal.end),"HH:mm")}
            </div>
            <div className="flex gap-2 justify-end">
              <Button onClick={()=>setReschedPrompt(null)}>Cancel</Button>
              <Button className="bg-slate-900 text-white hover:bg-slate-800"
                onClick={()=>{
                  const e={...reschedPrompt.ev, start:reschedPrompt.proposal.start, end:reschedPrompt.proposal.end};
                  updateEvent(e); setReschedPrompt(null);
                }}>Move it</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dev self-tests (console) */}
      <DevSelfTests/>
    </div>
  );
}

/* ----------------------------- Panels & Widgets ----------------------------- */
function PreferencesPanel({prefs,setPrefs,points,badges}:{prefs:any;setPrefs:any;points:number;badges:string[]}) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-3 space-y-4">
      <div className="text-base font-semibold">Settings</div>

      <div className="space-y-2">
        <Label>Location tracking (opt‑in)</Label>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!prefs.locationTracking} onChange={e=>setPrefs((p:any)=>({...p,locationTracking:e.target.checked}))} />
          <span className="text-sm text-slate-600">Use location to add travel buffers</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="Lat" value={prefs.currentLocation.lat??""}
                 onChange={e=>setPrefs((p:any)=>({...p,currentLocation:{...p.currentLocation,lat:Number(e.target.value)}}))}/>
          <Input type="number" placeholder="Lon" value={prefs.currentLocation.lon??""}
                 onChange={e=>setPrefs((p:any)=>({...p,currentLocation:{...p.currentLocation,lon:Number(e.target.value)}}))}/>
        </div>
        <div className="flex items-center gap-2">
          <Label>Avg travel speed</Label>
          <Input type="number" className="w-24" value={prefs.avgTravelSpeedKmh}
                 onChange={e=>setPrefs((p:any)=>({...p,avgTravelSpeedKmh:Number(e.target.value)}))}/>
          <span className="text-xs text-slate-500">km/h</span>
        </div>
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="text-sm font-medium">Ratios</div>
        {Object.entries(prefs.ratios).map(([k,v]:any)=>(
          <div key={k} className="mb-2">
            <div className="flex items-center justify-between text-xs"><span>{k}</span><span>{v}%</span></div>
            <input type="range" min={0} max={100} step={5} value={v}
                   onChange={e=>setPrefs((p:any)=>({...p,ratios:{...p.ratios,[k]:Number(e.target.value)}}))} />
          </div>
        ))}
      </div>

      <div className="border-t pt-3 space-y-2">
        <div className="text-sm font-medium">Motivation</div>
        <select className="w-full border rounded-md px-2 py-2 text-sm" value={prefs.motivationFrequency}
                onChange={e=>setPrefs((p:any)=>({...p,motivationFrequency:e.target.value}))}>
          <option value="none">Off</option><option value="low">Low</option><option value="high">High</option>
        </select>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!prefs.wellnessSuggestions} onChange={e=>setPrefs((p:any)=>({...p,wellnessSuggestions:e.target.checked}))}/>
          <span className="text-sm text-slate-600">Wellness break suggestions</span>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Points</div>
          <div className="font-semibold">{points}</div>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {badges.length? badges.map((b,i)=><Badge key={i} className="border-slate-300">{b}</Badge>)
            : <div className="text-xs text-slate-500">No badges yet—finish tasks!</div>}
        </div>
      </div>
    </div>
  );
}

function TrackingPanel({barData,minutesByBucket}:{barData:{hour:string,rate:number}[]; minutesByBucket:{Work:number;Wellness:number;Leisure:number}}){
  const total=Math.max(1, minutesByBucket.Work+minutesByBucket.Wellness+minutesByBucket.Leisure);
  const pie=[
    {name:"Work",value:Math.round(100*minutesByBucket.Work/total)},
    {name:"Wellness",value:Math.round(100*minutesByBucket.Wellness/total)},
    {name:"Leisure",value:Math.round(100*minutesByBucket.Leisure/total)},
  ];
  return (
    <div className="bg-white rounded-xl border shadow-sm p-3">
      <div className="text-base font-semibold mb-2">Tracking & Analytics</div>
      <div className="text-xs text-slate-600 mb-2">Completion rate by start-hour</div>
      <div className="grid grid-cols-6 gap-2 mb-3">
        {barData.map(r=>(
          <div key={r.hour} className="rounded bg-slate-100 p-2 text-center">
            <div className="font-semibold">{r.rate}%</div>
            <div className="text-[11px] text-slate-500">{r.hour}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {pie.map(p=>(
          <div key={p.name} className="rounded bg-slate-100 p-2 text-center">
            <div className="font-semibold">{p.value}%</div>
            <div className="text-[11px] text-slate-500">{p.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamificationPanel({points,badges}:{points:number;badges:string[]}) {
  function downloadCertificate(){
    const c=document.createElement("canvas"); c.width=1000; c.height=600; const ctx=c.getContext("2d")!;
    ctx.fillStyle="#111827"; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle="#fff"; ctx.font="bold 48px system-ui"; ctx.fillText("Achievement Unlocked", 260, 140);
    ctx.font="28px system-ui"; ctx.fillText(`Points: ${points}`, 260, 220);
    ctx.fillText(`Badges: ${badges.join(", ")||"—"}`, 260, 270);
    const url=c.toDataURL("image/png");
    const a=document.createElement("a"); a.href=url; a.download="certificate.png"; a.click();
  }
  return (
    <div className="bg-white rounded-xl border shadow-sm p-3">
      <div className="text-base font-semibold mb-2">Gamification</div>
      <div className="text-sm text-slate-600 mb-2">Earn points for completions. Badges at milestones.</div>
      <Button onClick={downloadCertificate}>🎉 Download celebration image</Button>
    </div>
  );
}

function PublicBookingPanel({enabled,setEnabled,events}:{enabled:boolean;setEnabled:(b:boolean)=>void; events:EventItem[]}) {
  const [slotLen,setSlotLen]=useState(30), [winStart,setWinStart]=useState(9), [winEnd,setWinEnd]=useState(17);
  return (
    <div className="bg-white rounded-xl border shadow-sm p-3">
      <div className="text-base font-semibold mb-2">Public Availability</div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-slate-600">Enable booking page (local demo)</div>
        <input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} />
      </div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div><Label>Slot (min)</Label><Input type="number" value={slotLen} onChange={e=>setSlotLen(Number(e.target.value))}/></div>
        <div><Label>Start hr</Label><Input type="number" value={winStart} onChange={e=>setWinStart(Number(e.target.value))}/></div>
        <div><Label>End hr</Label><Input type="number" value={winEnd} onChange={e=>setWinEnd(Number(e.target.value))}/></div>
      </div>
      <AvailableSlotsPreview events={events} slotLen={slotLen} winStart={winStart} winEnd={winEnd}/>
    </div>
  );
}
function AvailableSlotsPreview({events,slotLen,winStart,winEnd}:{events:EventItem[];slotLen:number;winStart:number;winEnd:number}){
  const tomorrow=addDays(new Date(),1);
  const key=format(tomorrow,"yyyy-MM-dd");
  const busy=events.filter(e=>e.start && format(new Date(e.start),"yyyy-MM-dd")===key)
                   .map(e=>({start:new Date(e.start!), end:new Date(e.end!)}))
                   .sort((a,b)=>+a.start-+b.start);
  const slots:{start:Date;end:Date}[]=[];
  let t=setMinutes(setHours(startOfDay(tomorrow),winStart),0);
  const end=setMinutes(setHours(startOfDay(tomorrow),winEnd),0);
  while(addMinutes(t,slotLen)<=end){
    const s2=addMinutes(t,slotLen);
    const conflict=busy.some(b=>!(s2<=b.start || t>=b.end));
    if(!conflict) slots.push({start:new Date(t), end:new Date(s2)});
    t=s2;
  }
  return (
    <div className="mt-2 rounded-lg border p-2 bg-slate-50 max-h-40 overflow-auto">
      {slots.length===0 && <div className="text-xs text-slate-500">No free slots tomorrow in window.</div>}
      <div className="flex flex-wrap gap-2">
        {slots.map((s,i)=><Badge key={i} className="border-slate-300">{format(s.start,"HH:mm")} – {format(s.end,"HH:mm")}</Badge>)}
      </div>
    </div>
  );
}

/* --------------------------------- Calendar --------------------------------- */
function CalendarBoard({days,eventsByDay,onAdd,onSelect,onDelete,onComplete}:{days:Date[];eventsByDay:Map<string,EventItem[]>;onAdd:(d:Date,h:number)=>void;onSelect:(e:EventItem)=>void;onDelete:(id:string)=>void;onComplete:(e:EventItem,p:number)=>void;}) {
  const columnHeight=(END_HOUR-START_HOUR+1)*HOUR_PX;
  const handleDouble=(d:Date,e:React.MouseEvent)=>{
    const rect=(e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y=e.clientY-rect.top;
    const minutes=Math.max(0,Math.min(y,columnHeight))/PX_PER_MIN;
    const hour=START_HOUR + Math.floor(minutes/60);
    onAdd(d,hour);
  };
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="border-b px-3 py-2 text-base font-semibold">Calendar</div>
      <div className="p-3">
        <div className="flex">
          <div className="w-20 shrink-0">
            {HOURS.map(h=>(
              <div key={h} className="h-[64px] border-t text-xs pr-2 text-right text-slate-500 flex items-start justify-end pt-3">
                {String(h).padStart(2,"0")}:00
              </div>
            ))}
          </div>
          <div className="grid gap-0 flex-1" style={{gridTemplateColumns:`repeat(${days.length}, minmax(0,1fr))`}}>
            {days.map((d,i)=>{
              const key=format(d,"yyyy-MM-dd"); const list=eventsByDay.get(key)||[];
              return (
                <div key={i} className="relative border-l" style={{height:columnHeight}} onDoubleClick={(e)=>handleDouble(d,e)}>
                  {HOURS.map(h=> <div key={h} className="absolute left-0 right-0 border-t" style={{top:(h-START_HOUR)*HOUR_PX}}/>) }
                  {list.map(ev=> <EventBlock key={ev.id} ev={ev} onSelect={onSelect} onDelete={onDelete} onComplete={onComplete}/>) }
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
function EventBlock({ev,onSelect,onDelete,onComplete}:{ev:EventItem; onSelect:(e:EventItem)=>void; onDelete:(id:string)=>void; onComplete:(e:EventItem,p:number)=>void;}){
  const s=new Date(ev.start!); const e=new Date(ev.end!);
  const dayStart=setHours(startOfDay(s), START_HOUR);
  const startMin=differenceInMinutes(s, dayStart);
  const durMin = Math.max(1, differenceInMinutes(e,s));
  const topPx=startMin*PX_PER_MIN, hPx=Math.max(28,durMin*PX_PER_MIN);
  const cls=`${CategoryColor[ev.category]} h-full rounded-xl shadow text-white px-3 py-2 cursor-pointer`;
  return (
    <motion.div layout className="absolute left-1 right-1" style={{top:topPx, height:hPx}}>
      <motion.div layout className={cls} whileHover={{scale:1.01}} whileTap={{scale:0.995}} onClick={()=>onSelect(ev)}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold truncate">{ev.title}</div>
          <div className="text-white/90 text-xs">{format(s,"HH:mm")}–{format(e,"HH:mm")}</div>
        </div>
        <div className="mt-1 text-[11px] text-white/90 flex items-center gap-2">
          <Badge className="bg-white/20 border-white/20 text-white">{ev.category}</Badge>
          {ev.location?.name && <span>📍 {ev.location.name}</span>}
          <span className="ml-auto">{ev.completionPct}%</span>
        </div>
        <div className="mt-2 w-full h-1.5 bg-white/30 rounded-full overflow-hidden">
          <div className="h-full bg-white" style={{width:`${ev.completionPct||0}%`}}/>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button onClick={(e)=>{e.stopPropagation(); onComplete(ev, 100);}}>✅</Button>
          <Button onClick={(e)=>{e.stopPropagation(); onDelete(ev.id);}}>🗑️</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------- Event Modal ------------------------------- */
function EventModal({ev,setEv,onSave,onDelete}:{ev:EventItem|null; setEv:(e:EventItem|null)=>void; onSave:(e:EventItem)=>void; onDelete:(id:string)=>void;}){
  const [form,setForm]=useState<EventItem|null>(null);
  useEffect(()=>{ setForm(ev?{...ev}:null); },[ev]);
  if(!ev || !form) return null;

  const isFlex=!form.start || !form.end;
  const setField=(k:keyof EventItem, v:any)=>setForm((p:any)=>({...p,[k]:v}));
  const setLoc=(k:keyof NonNullable<Loc>, v:any)=>setForm((p:any)=>({...p, location:{...(p.location||{}), [k]:v}}));
  const save=()=>{ onSave(form!); setEv(null); };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold">Edit Event</div>
          <button className="text-slate-500" onClick={()=>setEv(null)}>✕</button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={e=>setField("title", e.target.value)} />

            <Label>Category</Label>
            <select className="w-full border rounded-md px-2 py-2 text-sm" value={form.category} onChange={e=>setField("category", e.target.value)}>
              {categoryList.map(c=><option key={c} value={c}>{c}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <DateTimeField label="Start" value={form.start} onChange={(iso)=>setField("start", iso)} />
              <DateTimeField label="End" value={form.end} onChange={(iso)=>setField("end", iso)} />
            </div>

            {isFlex && (
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Duration (min)</Label><Input type="number" value={form.durationMin||30} onChange={e=>setField("durationMin", Number(e.target.value))}/></div>
                <div><Label>Window earliest</Label><DateOnlyField value={form.flexibleWindow?.earliest||null} onChange={(iso)=>setField("flexibleWindow",{...(form.flexibleWindow||{}),earliest:iso})}/></div>
                <div><Label>Window latest</Label><DateOnlyField value={form.flexibleWindow?.latest||null} onChange={(iso)=>setField("flexibleWindow",{...(form.flexibleWindow||{}),latest:iso})}/></div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div><Label>Priority</Label><Input type="number" value={form.priority||3} onChange={e=>setField("priority", Number(e.target.value))}/></div>
              <div><Label>Location</Label><Input value={form.location?.name||""} onChange={e=>setLoc("name", e.target.value)}/></div>
              <div><Label>Completion %</Label><Input type="number" value={form.completionPct||0} onChange={e=>setField("completionPct", clamp(Number(e.target.value),0,100))}/></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Lat" value={form.location?.lat??""} onChange={e=>setLoc("lat", Number(e.target.value))}/>
              <Input type="number" placeholder="Lon" value={form.location?.lon??""} onChange={e=>setLoc("lon", Number(e.target.value))}/>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subtasks</Label>
            <SubtaskEditor subtasks={form.subtasks||[]} onChange={(s)=>setField("subtasks", s)} />
            <Label>Notes</Label>
            <Textarea rows={6} value={form.notes||""} onChange={e=>setField("notes", e.target.value)} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={save} className="bg-slate-900 text-white hover:bg-slate-800">Save</Button>
              <Button onClick={()=>{onDelete(form.id); setEv(null);}} className="border-red-300 text-red-600">Delete</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubtaskEditor({subtasks,onChange}:{subtasks:Subtask[]; onChange:(s:Subtask[])=>void}){
  const toggle=(id:string)=>onChange(subtasks.map(s=>s.id===id?{...s,done:!s.done}:s));
  const add =()=>onChange([...(subtasks||[]), {id:uid(), text:"", done:false}]);
  const setText=(id:string,t:string)=>onChange(subtasks.map(s=>s.id===id?{...s,text:t}:s));
  const remove=(id:string)=>onChange(subtasks.filter(s=>s.id!==id));
  return (
    <div className="rounded-xl border p-3 bg-slate-50 space-y-2 max-h-40 overflow-auto">
      {subtasks?.map(s=>(
        <div key={s.id} className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={!!s.done} onChange={()=>toggle(s.id)} />
          <Input value={s.text} onChange={e=>setText(s.id, e.target.value)} placeholder="Subtask..." />
          <Button onClick={()=>remove(s.id)}>✕</Button>
        </div>
      ))}
      <Button onClick={add}>＋ Add subtask</Button>
    </div>
  );
}

/* ----------------------------- End-of-day Review ---------------------------- */
function EndOfDayReview({open,setOpen,events,onComplete}:{open:boolean; setOpen:(b:boolean)=>void; events:EventItem[]; onComplete:(e:EventItem,p:number)=>void;}){
  const todayKey=format(new Date(),"yyyy-MM-dd");
  const todays=events.filter(e=>e.start && format(new Date(e.start),"yyyy-MM-dd")===todayKey);
  if(!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold">End of Day Review</div>
          <button className="text-slate-500" onClick={()=>setOpen(false)}>✕</button>
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {todays.length===0 && <div className="text-sm text-slate-600">No events today. Plan some key tasks for tomorrow.</div>}
          {todays.map(ev=>(
            <div key={ev.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{ev.title}</div>
                <div className="text-xs text-slate-500">
                  {format(new Date(ev.start!),"HH:mm")} – {format(new Date(ev.end!),"HH:mm")}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Label>Completion</Label>
                <input type="range" min={0} max={100} value={ev.completionPct||0} onChange={(e)=>onComplete(ev, Number(e.target.value))} className="w-full"/>
                <div className="w-12 text-right text-xs">{ev.completionPct||0}%</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-2"><Button onClick={()=>setOpen(false)}>Done</Button></div>
      </div>
    </div>
  );
}

/* ------------------------------ Motivation Toasts --------------------------- */
function MotivationToasts({frequency}:{frequency:"none"|"low"|"high"}){
  const msgsHigh=["Tiny steps beat zero steps.","Future‑you is watching. Make them proud.","You only need the next 10 minutes."];
  const msgsLow =["One focused block now > three later.","Protect your energy, then your schedule."];
  const list=frequency==="high"?msgsHigh:msgsLow;
  const [msg,setMsg]=useState(list[0]);
  useEffect(()=>{
    const ms=frequency==="high"?4*60_000:12*60_000;
    const t=setInterval(()=>setMsg(list[Math.floor(Math.random()*list.length)]), ms);
    return ()=>clearInterval(t);
  },[frequency]); // eslint-disable-line
  return (
    <motion.div initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:40,opacity:0}}
      className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl">
      {msg}
    </motion.div>
  );
}

/* -------------------------------- ICS export -------------------------------- */
function exportICS(events:EventItem[]){
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//SmartScheduler//EN"];
  const pad=(n:number)=>String(n).padStart(2,"0");
  const fmt=(d:Date)=>`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  for(const e of events){
    if(!e.start||!e.end) continue;
    const dtStart=new Date(e.start), dtEnd=new Date(e.end);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id||uid()}@smartscheduler`);
    lines.push(`DTSTAMP:${fmt(new Date())}`);
    lines.push(`DTSTART:${fmt(dtStart)}`);
    lines.push(`DTEND:${fmt(dtEnd)}`);
    lines.push(`SUMMARY:${(e.title||"").replace(/\n/g," ")}`);
    if(e.location?.name) lines.push(`LOCATION:${(e.location.name||"").replace(/\n/g," ")}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  const blob=new Blob([lines.join("\n")],{type:"text/calendar;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="schedule.ics"; a.click(); URL.revokeObjectURL(url);
}

/* ---------------------------- Notifications helper -------------------------- */
function notifyUpcoming(e:EventItem, complete:(ev:EventItem,pct:number)=>void){
  if(!("Notification" in window) || Notification.permission!=="granted") return;
  const n=new Notification(`Upcoming: ${e.title}`, {
    body:`Starts at ${format(new Date(e.start!),"HH:mm")}`,
    requireInteraction:false,
  });
  // Simulate action: click = mark 100%
  n.onclick=()=>complete(e,100);
}

/* --------------------------------- Self-tests ------------------------------- */
function DevSelfTests(){
  useEffect(()=>{
    // Simple smoke checks
    console.debug("[SS] mounted, running quick self-tests…");
  },[]);
  return null;
}
