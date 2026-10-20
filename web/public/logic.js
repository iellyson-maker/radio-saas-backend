(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.QolanLogic=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const pad=n=>String(n).padStart(2,"0");
 const weekdayNumbers={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
 const validTime=value=>typeof value==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
 const validDate=value=>{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T00:00:00Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
 };
 const isObject=value=>!!value&&typeof value==="object"&&!Array.isArray(value);
 function isValidTimeZone(timeZone){
  if(typeof timeZone!=="string"||!timeZone.trim())return false;
  try{new Intl.DateTimeFormat("en-US",{timeZone}).format(new Date(0));return true;}catch(_){return false;}
 }
 function stationClockParts(date=new Date(),timeZone="America/Sao_Paulo"){
  const d=date instanceof Date?date:new Date(date);
  if(Number.isNaN(d.getTime()))throw new TypeError("Data inválida para o relógio da emissora.");
  try{
   const safeZone=isValidTimeZone(timeZone)?timeZone:"America/Sao_Paulo";
   const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:safeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
    minute:"2-digit",second:"2-digit",weekday:"short",hourCycle:"h23"
   }).formatToParts(d).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
   const hour=parts.hour==="24"?"00":parts.hour;
   return {dateKey:parts.year+"-"+parts.month+"-"+parts.day,timeKey:hour+":"+parts.minute,hour,minute:parts.minute,second:parts.second,day:weekdayNumbers[parts.weekday]??d.getDay(),timeZone:safeZone};
  }catch(_){
   return {dateKey:d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()),timeKey:pad(d.getHours())+":"+pad(d.getMinutes()),hour:pad(d.getHours()),minute:pad(d.getMinutes()),second:pad(d.getSeconds()),day:d.getDay(),timeZone:"local"};
  }
 }
 function mediaLookup(id,lookup){if(typeof lookup==="function")return lookup(id);if(lookup instanceof Map)return lookup.get(id);if(isObject(lookup))return lookup[id];return null;}
 function collectDueItems(schedules,campaigns,lookup,date=new Date(),timeZone="America/Sao_Paulo"){
  const parts=stationClockParts(date,timeZone),minuteKey=parts.dateKey+"@"+parts.timeKey,events=[];
  const matches=item=>item&&item.enabled===true&&item.time===parts.timeKey&&(item.day==="*"||Number(item.day)===parts.day);
  for(const item of Array.isArray(schedules)?schedules:[]){
   if(!matches(item)||item.lastFiredAt===minuteKey)continue;
   const media=mediaLookup(item.mediaId,lookup);if(!media)continue;
   item.lastFiredAt=minuteKey;events.push({kind:"schedule",item,media});
  }
  for(const item of Array.isArray(campaigns)?campaigns:[]){
   if(!matches(item)||item.lastFiredAt===minuteKey||!validDate(item.startDate)||!validDate(item.endDate))continue;
   if(item.endDate<item.startDate||parts.dateKey<item.startDate||parts.dateKey>item.endDate)continue;
   const media=mediaLookup(item.mediaId,lookup);if(!media)continue;
   item.lastFiredAt=minuteKey;events.push({kind:"campaign",item,media});
  }
  return {parts,minuteKey,events};
 }
 const cleanString=(v,max,fallback="")=>typeof v==="string"?v.trim().slice(0,max):fallback;
 function validLastFired(value){return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}@(?!24:)(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)?value:null;}
 function normalizeBackup(payload,availableMediaIds=[]){
  if(!isObject(payload)||payload.product!=="Qolan Studio"||payload.schemaVersion!==1)throw new Error("Este arquivo não é um backup compatível do Qolan Studio.");
  const defaults={stationName:"Rádio Central",frequency:"98.7 FM",timezone:"America/Sao_Paulo"};
  const raw=isObject(payload.settings)?payload.settings:{};
  const cleanVolume=(value,fallback)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)))):fallback;
  const settings={stationName:cleanString(raw.stationName,100,defaults.stationName)||defaults.stationName,frequency:cleanString(raw.frequency,50,defaults.frequency),timezone:isValidTimeZone(raw.timezone)?raw.timezone:defaults.timezone,mainVolume:cleanVolume(raw.mainVolume,100),cartVolume:cleanVolume(raw.cartVolume,75),previewVolume:cleanVolume(raw.previewVolume,65),mainOutput:"",cartOutput:"",previewOutput:""};
  for(const key of ["schedules","campaigns","logs","queueIds","cartSlots"])if(payload[key]!==undefined&&!Array.isArray(payload[key]))throw new Error("Campo inválido no backup: "+key+".");
  if(payload.jingleRotation!==undefined&&!isObject(payload.jingleRotation))throw new Error("Campo inválido no backup: jingleRotation.");
  const ss=payload.schedules||[],cc=payload.campaigns||[],ll=payload.logs||[],qq=payload.queueIds||[],cs=payload.cartSlots||[];
  if(ss.length>500||cc.length>500||ll.length>500||qq.length>2000||cs.length>24)throw new Error("O backup excede o limite de registros permitido.");
  const schedules=[];
  for(const s of ss){
   if(!isObject(s))continue;
   const id=cleanString(s.id,100),label=cleanString(s.label,120),mediaId=cleanString(s.mediaId,100),day=s.day==="*"?"*":Number(s.day);
   if(!id||!label||!mediaId||!validTime(s.time)||!(day==="*"||(Number.isInteger(day)&&day>=0&&day<=6)))continue;
   schedules.push({id,label,mediaId,time:s.time,day,enabled:s.enabled===true,lastFiredAt:validLastFired(s.lastFiredAt)});
  }
  const campaigns=[];
  for(const c of cc){
   if(!isObject(c))continue;
   const id=cleanString(c.id,100),name=cleanString(c.name,120),mediaId=cleanString(c.mediaId,100),day=c.day==="*"?"*":Number(c.day);
   if(!id||!name||!mediaId||!validTime(c.time)||!validDate(c.startDate)||!validDate(c.endDate)||c.endDate<c.startDate||!(day==="*"||(Number.isInteger(day)&&day>=0&&day<=6)))continue;
   campaigns.push({id,name,mediaId,startDate:c.startDate,endDate:c.endDate,time:c.time,day,enabled:c.enabled===true,lastFiredAt:validLastFired(c.lastFiredAt)});
  }
  const logs=ll.filter(isObject).map(l=>{
   const timestamp=cleanString(l.timestamp,40);if(!timestamp||Number.isNaN(Date.parse(timestamp)))return null;
   const entry={id:cleanString(l.id,100),event:cleanString(l.event,60),message:cleanString(l.message,500),timestamp,mediaId:cleanString(l.mediaId,100),title:cleanString(l.title,300),type:cleanString(l.type,40),source:cleanString(l.source,100),result:cleanString(l.result,100)};
   if(l.startedAt&&typeof l.startedAt==="string"&&!Number.isNaN(Date.parse(l.startedAt)))entry.startedAt=l.startedAt.slice(0,40);
   if(Number.isFinite(Number(l.seconds))&&l.seconds>=0)entry.seconds=Math.min(Number(l.seconds),604800);
   return entry.event&&entry.message?entry:null;
  }).filter(Boolean).slice(0,500);
  const known=new Set(Array.from(availableMediaIds||[]).filter(x=>typeof x==="string"));
  const queueIds=qq.filter(x=>typeof x==="string"&&known.has(x)).slice(0,2000);
  const cartSlots=normalizeCartSlots(cs,12).map(id=>typeof id==="string"&&known.has(id)?id:null);
  const rotation=isObject(payload.jingleRotation)?payload.jingleRotation:{};
  const jingleRotation={
    enabled:rotation.enabled===true,
    every:Math.max(2,Math.min(12,Math.floor(Number(rotation.every)||3))),
    counter:Math.max(0,Math.min(1000,Math.floor(Number(rotation.counter)||0))),
    index:Math.max(0,Math.min(100000,Math.floor(Number(rotation.index)||0)))
  };
  return {settings,schedules,campaigns,logs,queueIds,cartSlots,jingleRotation};
 }
 function normalizeCartSlots(slots=[],size=12){
  const raw=Array.from({length:Math.max(1,Math.min(24,Number(size)||12))},(_,i)=>typeof slots[i]==="string"&&slots[i]?slots[i]:null);
  const seen=new Set();
  return raw.map(id=>{
   if(!id||seen.has(id))return null;
   seen.add(id);return id;
  });
 }
 function fillEmptyCartSlots(slots=[],mediaIds=[],size=12){
  const next=normalizeCartSlots(slots,size),assigned=[],overflow=[];
  const used=new Set(next.filter(Boolean));
  for(const id of Array.from(mediaIds||[]).filter(x=>typeof x==="string"&&x)){
   if(used.has(id))continue;
   const index=next.findIndex(x=>!x);
   if(index<0){overflow.push(id);continue;}
   next[index]=id;used.add(id);assigned.push({slot:index,mediaId:id});
  }
  return {slots:next,assigned,overflow};
 }
 function advanceJingleRotation(config={},currentType,counter=0,hasJingles=false){
  const every=Math.max(2,Math.min(12,Math.floor(Number(config.every)||3)));
  const enabled=config.enabled===true;
  const safeCounter=Math.max(0,Math.min(1000,Math.floor(Number(counter)||0)));
  if(!enabled||currentType!=="music")return {counter:safeCounter,insert:false,every};
  const next=safeCounter+1;
  if(next<every)return {counter:next,insert:false,every};
  if(hasJingles)return {counter:0,insert:true,every};
  return {counter:next,insert:false,every};
 }
 return {isValidTimeZone,stationClockParts,collectDueItems,normalizeBackup,normalizeCartSlots,fillEmptyCartSlots,advanceJingleRotation};
});
