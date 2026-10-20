(() => {
"use strict";

const $ = id => document.getElementById(id);
const mainAudio = $("audio");
const cartAudio = $("cartAudio");
const core = window.QolanLogic;
if(!core)throw new Error("Qolan Studio core logic is unavailable.");
const DB_NAME = "qolan-studio-db";
const DB_VERSION = 1;
const APP_KEY = "main";
const CATEGORY_LABELS = { music:"Música", jingle:"Vinheta", spot:"Comercial", track:"Trilha" };
let db = null;
let media = [];
let queue = [];
let current = null;
let filter = "all";
let cartFilter = "all";
const CART_SLOT_COUNT = 12;
let cartSlots = Array(CART_SLOT_COUNT).fill(null);
let pendingCartSlot = null;
let jingleRotation = {enabled:false,every:3,counter:0,index:0};
let auto = false;
let segue = false;
let schedules = [];
let campaigns = [];
let logs = [];
let settings = { stationName:"Rádio Central", frequency:"98.7 FM", timezone:"America/Sao_Paulo" };
let audioContext = null;
let mediaSource = null;
let splitter = null;
let analyzers = [];
let meterNodes = [];
let meterTimer = null;
let fadeTimer = null;
let activeSession = null;
let pendingSource = "manual";
let toastTimer = null;
let urlSet = new Set();
let currentCart = null;
let cartDuckApplied = false;
let mainVolumeBeforeCart = 1;
let newsItems = [];
let newsLoadedSource = "";
let newsLoadedAt = 0;
let obsSocket = null;
let obsConnected = false;
let obsScenes = [];
let obsCurrentScene = "";
let obsPending = new Map();
let obsHandshake = null;

const now = () => new Date();
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
const pad = n => String(n).padStart(2,"0");
const fmt = sec => {
  sec = Number.isFinite(Number(sec)) ? Math.max(0,Math.floor(Number(sec))) : 0;
  return pad(Math.floor(sec/60)) + ":" + pad(sec%60);
};
const localDateKey = d => core.stationClockParts(d,settings.timezone).dateKey;
const timeKey = d => core.stationClockParts(d,settings.timezone).timeKey;
function formatStationDate(value,options={}){
  const d=value instanceof Date?value:new Date(value);
  const zone=core.stationClockParts(d,settings.timezone).timeZone;
  return new Intl.DateTimeFormat("pt-BR",{timeZone:zone==="local"?undefined:zone,...options}).format(d);
}
const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bytesLabel = n => {
  if (!Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (v < 1024) return v+" B";
  if (v < 1048576) return (v/1024).toFixed(1)+" KB";
  return (v/1048576).toFixed(1)+" MB";
};
const labelDay = d => d === "*" ? "Todos os dias" : (["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"][Number(d)] || d);
const labelEvent = event => ({
  "play-start":"Início de reprodução",
  "play-complete":"Faixa concluída",
  "play-interrupted":"Reprodução interrompida",
  "play-error":"Erro de reprodução",
  "queued":"Adicionado à fila",
  "scheduled":"Evento agendado na fila",
  "campaign":"Inserção de campanha na fila",
  "system":"Sistema",
  "media-import":"Mídia importada",
  "media-classify":"Categoria alterada",
  "media-delete":"Mídia removida",
  "automation":"Automação local",
  "block-generated":"Bloco musical montado",
  "cart-start":"Disparo de cartwall",
  "cart-complete":"Disparo concluído",
  "cart-stop":"Disparo interrompido"
}[event] || event);

function showToast(message, error=false) {
  const el=$("toast");
  if(!el)return;
  el.textContent=message;
  el.classList.toggle("error",!!error);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove("show"),3200);
}
function openDb() {
  return new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){reject(new Error("Este navegador não disponibiliza IndexedDB."));return;}
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const database=req.result;
      if(!database.objectStoreNames.contains("media"))database.createObjectStore("media",{keyPath:"id"});
      if(!database.objectStoreNames.contains("state"))database.createObjectStore("state",{keyPath:"key"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Falha ao abrir armazenamento local."));
    req.onblocked=()=>reject(new Error("O armazenamento local está bloqueado por outra aba."));
  });
}
function idbRequest(req) {
  return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Falha no armazenamento."));});
}
function dbGet(store,key) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readonly");
    const req=tx.objectStore(store).get(key);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function dbGetAll(store) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readonly");
    const req=tx.objectStore(store).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
function dbPut(store,value) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error||new Error("Não foi possível salvar os dados."));
    tx.onabort=()=>reject(tx.error||new Error("Gravação cancelada."));
  });
}
function dbDelete(store,key) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}
function dbClear(store) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,"readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}
async function persistState() {
  if(!db)return;
  const payload={
    key:APP_KEY,
    value:{
      queueIds:queue.map(m=>m.id),
      queueKinds:queue.map(m=>m._qolanQueueKind||"regular"),
      cartSlots:core.normalizeCartSlots(cartSlots,CART_SLOT_COUNT),
      jingleRotation:{enabled:jingleRotation.enabled===true,every:jingleRotation.every,counter:jingleRotation.counter,index:jingleRotation.index},
      schedules,campaigns,logs:logs.slice(0,500),settings,
      segue
    }
  };
  try { await dbPut("state",payload); }
  catch(err){showToast("Não foi possível salvar localmente: "+(err.message||err),true);}
}
async function restoreState() {
  const [records,saved]=await Promise.all([dbGetAll("media"),dbGet("state",APP_KEY)]);
  media=records.map(rec=>{
    const url=URL.createObjectURL(rec.blob);
    urlSet.add(url);
    return {...rec,url,file:rec.blob};
  });
  if(saved&&saved.value){
    const state=saved.value;
    schedules=Array.isArray(state.schedules)?state.schedules:[];
    campaigns=Array.isArray(state.campaigns)?state.campaigns:[];
    logs=Array.isArray(state.logs)?state.logs:[];
    settings={...settings,...(state.settings||{})};
    if(!core.isValidTimeZone(settings.timezone))settings.timezone="America/Sao_Paulo";
    segue=!!state.segue;
    const queueIds=Array.isArray(state.queueIds)?state.queueIds:[];
    const queueKinds=Array.isArray(state.queueKinds)?state.queueKinds:[];
    queue=queueIds.map((id,i)=>{const item=media.find(m=>m.id===id);return item&&queueKinds[i]==="priority"?{...item,_qolanQueueKind:"priority"}:item;}).filter(Boolean);
    cartSlots=core.normalizeCartSlots(Array.isArray(state.cartSlots)?state.cartSlots:[],CART_SLOT_COUNT);
    jingleRotation={
      enabled:!!(state.jingleRotation&&state.jingleRotation.enabled===true),
      every:Math.max(2,Math.min(12,Math.floor(Number(state.jingleRotation&&state.jingleRotation.every)||3))),
      counter:Math.max(0,Math.min(1000,Math.floor(Number(state.jingleRotation&&state.jingleRotation.counter)||0))),
      index:Math.max(0,Math.min(100000,Math.floor(Number(state.jingleRotation&&state.jingleRotation.index)||0)))
    };
  }
}
function classify(name) {
  const n=String(name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/comercial|anuncio|spot|merchan|patrocin/.test(n))return "spot";
  if(/vinheta|jingle|id.?radio|identificacao/.test(n))return "jingle";
  if(/trilha|bed|instrumental|fundo/.test(n))return "track";
  return "music";
}
function writeLog(event,message,extra={}) {
  const entry={id:uid(),event,message:String(message||""),timestamp:now().toISOString(),...extra};
  logs.unshift(entry);
  if(logs.length>500)logs.length=500;
  renderLogs();
  renderRecentLogs();
  renderStats();
  persistState();
  return entry;
}
function startSession(source) {
  if(!current||activeSession)return;
  activeSession={id:uid(),mediaId:current.id,title:current.name,type:current.type,source:source||pendingSource,startedAt:now().toISOString()};
  writeLog("play-start","Início: "+current.name,{mediaId:current.id,title:current.name,type:current.type,source:activeSession.source,result:"em execução"});
  $("sourceLabel").textContent="FONTE: "+String(activeSession.source||"manual").toUpperCase();
  renderStats();
}
function finishSession(result) {
  if(!activeSession)return;
  const session=activeSession;
  activeSession=null;
  const seconds=Math.max(0,Number(mainAudio.currentTime)||0);
  const isComplete=result==="concluída";
  writeLog(isComplete?"play-complete":result==="erro"?"play-error":"play-interrupted",
    (isComplete?"Concluída: ":result==="erro"?"Falha: ":"Interrompida: ")+session.title,
    {mediaId:session.mediaId,title:session.title,type:session.type,source:session.source,startedAt:session.startedAt,seconds:Number(seconds.toFixed(2)),result});
}
function findMedia(id){return media.find(m=>m.id===id);}
function setStatus(text){$("status").textContent=text;}
function setPlayState(text, playing=false){$("playState").textContent=text;$("playState").classList.toggle("playing",playing);}
function drawClock(){
  const d=now(),p=core.stationClockParts(d,settings.timezone);
  $("clock").textContent=p.hour+":"+p.minute+":"+p.second;
  $("dateLabel").textContent=formatStationDate(d,{weekday:"short",day:"2-digit",month:"short"}).toUpperCase();
}
function showView(view){
  if(!$("view-"+view))view="console";
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id==="view-"+view));
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  const names={console:"Console de estúdio",library:"Biblioteca de mídia",programming:"Programação e automação",commercials:"Campanhas e comerciais",live:"Conteúdo ao vivo",visual:"Rádio visual / OBS",logs:"Registros de execução",diagnostics:"Diagnóstico do sistema",settings:"Configurações"};
  $("viewTitle").textContent=names[view]||"Qolan Studio";
  if(view==="library")drawLibrary();
  if(view==="programming")drawSchedules();
  if(view==="commercials")drawCampaigns();
  if(view==="logs")renderLogs();
  if(view==="diagnostics")refreshDiagnostics();
  if(view==="settings")fillSettings();
  if(view==="live"){initLiveNotes();const source=$("newsSourceSelect").value;if(!newsItems.length||newsLoadedSource!==source||Date.now()-newsLoadedAt>180000)loadNews();}
  if(view==="visual"){restoreObsAddress();renderObsScenes();}
}
function renderStation(){
  $("sidebarStation").textContent=settings.stationName||"Emissora";
  $("sidebarFrequency").textContent=settings.frequency||"—";
  document.title=(settings.stationName||"Qolan Studio")+" | Qolan Studio";
}
function renderCurrent(){
  $("currentTitle").textContent=current?current.name:"Nenhuma faixa selecionada";
  $("currentMeta").textContent=current?((CATEGORY_LABELS[current.type]||current.type)+" · "+bytesLabel(current.size)+" · áudio local"):"Importe áudio ou selecione um item na biblioteca.";
  $("statNow").textContent=current?current.name:"—";
  $("statNowMeta").textContent=current?(CATEGORY_LABELS[current.type]||current.type):"Nenhuma faixa";
  $("duration").textContent=fmt(current?current.duration:0);
  $("sourceLabel").textContent="FONTE: "+(activeSession?String(activeSession.source).toUpperCase():"—");
}
function renderStats(){
  $("statMedia").textContent=String(media.length);
  $("statQueue").textContent=String(queue.length);
  const today=localDateKey(now());
  const plays=logs.filter(l=>l.event==="play-complete"&&localDateKey(new Date(l.timestamp))===today).length;
  $("statPlays").textContent=String(plays);
}
function estimatedQueueTime(index){
  let seconds=0;if(current&&!mainAudio.paused&&!mainAudio.ended)seconds=Math.max(0,(Number(mainAudio.duration)||current.duration||0)-mainAudio.currentTime);
  for(let i=0;i<index;i++)seconds+=Number(queue[i].duration)||0;
  return formatStationDate(new Date(Date.now()+seconds*1000),{hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
}
function drawQueue(){
  $("queueCount").textContent=queue.length+" itens";$("statQueue").textContent=String(queue.length);
  const el=$("queueList");
  if(!queue.length){el.className="record-list empty-state";el.textContent="Fila vazia. Monte um bloco musical ou adicione faixas pela biblioteca.";return;}
  el.className="record-list";
  el.innerHTML=queue.map((m,i)=>'<div class="record-row queue-record"><span class="row-index">'+String(i+1).padStart(2,"0")+'</span><div class="record-main"><b title="'+escapeHtml(m.name)+'">'+escapeHtml(m.name)+'</b><small><span class="queue-time">PREV. '+estimatedQueueTime(i)+'</span> · '+escapeHtml(CATEGORY_LABELS[m.type]||m.type)+' · '+fmt(m.duration)+'</small></div><div class="row-actions"><button class="icon-button" data-up="'+i+'" title="Mover para cima" '+(i===0?"disabled":"")+' aria-label="Mover para cima">↑</button><button class="icon-button" data-down="'+i+'" title="Mover para baixo" '+(i===queue.length-1?"disabled":"")+' aria-label="Mover para baixo">↓</button><button class="icon-button" data-remove="'+i+'" title="Remover da fila" aria-label="Remover">×</button></div></div>').join("");
}
function categorySelect(m){
  return '<select class="type-select" data-type-id="'+m.id+'" aria-label="Categoria de '+escapeHtml(m.name)+'">'+Object.keys(CATEGORY_LABELS).map(t=>'<option value="'+t+'" '+(m.type===t?"selected":"")+'>'+CATEGORY_LABELS[t]+'</option>').join("")+'</select>';
}
function drawLibrary(){
  const query=($("search")?$("search").value:"").trim().toLowerCase();
  const rows=media.filter(m=>(filter==="all"||m.type===filter)&&m.name.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  $("libraryFoot").textContent=rows.length+" de "+media.length+" arquivos";
  $("count");
  const body=$("libraryList");
  if(!rows.length){body.innerHTML='<tr><td colspan="5" class="empty-cell">'+(media.length?"Nenhum arquivo corresponde à pesquisa.":"Importe arquivos de áudio para começar.")+'</td></tr>';drawCarts();fillMediaSelects();return;}
  body.innerHTML=rows.map(m=>'<tr><td><div class="media-title"><span class="file-glyph">♫</span><span><b title="'+escapeHtml(m.name)+'">'+escapeHtml(m.name)+'</b><small>'+bytesLabel(m.size)+' · arquivo local</small></span></div></td><td>'+categorySelect(m)+'</td><td>'+fmt(m.duration)+'</td><td>'+bytesLabel(m.size)+'</td><td><div class="row-actions"><button class="btn btn-quiet btn-small" data-media-play="'+m.id+'">▶ Tocar</button><button class="btn btn-quiet btn-small" data-media-queue="'+m.id+'">＋ Fila</button><button class="icon-button" data-media-delete="'+m.id+'" title="Excluir">×</button></div></td></tr>').join("");
  drawCarts();
  fillMediaSelects();
}
function drawCarts(){
  const el=$("cartList");if(!el)return;
  cartSlots=core.normalizeCartSlots(cartSlots,CART_SLOT_COUNT);
  const loaded=cartSlots.filter(id=>id&&findMedia(id)).length;
  $("cartSlotCount").textContent=loaded+"/"+CART_SLOT_COUNT;
  const html=[];
  for(let i=0;i<CART_SLOT_COUNT;i++){
    const id=cartSlots[i],m=id?findMedia(id):null;
    const visible=m&&(cartFilter==="all"||m.type===cartFilter);
    const key=i<9?"F"+(i+1):"—";
    if(m&&visible){
      const category=m.type==="spot"?"COMERCIAL":m.type==="track"?"TRILHA":"VINHETA";
      const playing=currentCart&&currentCart.id===m.id;
      html.push('<article class="cart-pad is-loaded '+(m.type==="spot"?"type-spot":m.type==="track"?"type-track":"type-jingle")+' '+(playing?"is-playing":"")+'" data-slot="'+i+'">'+
        '<button type="button" class="cart-pad-fire" data-cart-slot-play="'+i+'" aria-label="Disparar '+escapeHtml(m.name)+'">'+
        '<span class="cart-pad-top"><span class="cart-pad-number">'+String(i+1).padStart(2,"0")+'</span><span class="cart-pad-hotkey">'+key+'</span></span>'+
        '<span class="cart-pad-icon">'+(m.type==="spot"?"◉":m.type==="track"?"♫":"✳")+'</span>'+
        '<span class="cart-pad-name" title="'+escapeHtml(m.name)+'">'+escapeHtml(m.name)+'</span>'+
        '<span class="cart-pad-meta"><span>'+category+'</span><span>'+fmt(m.duration)+'</span></span></button>'+
        '<div class="cart-pad-tools"><button type="button" data-cart-slot-load="'+i+'" title="Trocar áudio deste slot">Trocar</button><button type="button" data-cart-slot-clear="'+i+'" title="Esvaziar slot" aria-label="Esvaziar slot">×</button></div></article>');
    }else if(m){
      html.push('<article class="cart-pad is-filtered-out '+(m.type==="spot"?"type-spot":m.type==="track"?"type-track":"type-jingle")+'" data-slot="'+i+'"><div class="cart-pad-filtered"><span class="cart-pad-number">'+String(i+1).padStart(2,"0")+'</span><b>'+escapeHtml(m.name)+'</b><small>Filtro: '+escapeHtml(CATEGORY_LABELS[m.type])+'</small></div><div class="cart-pad-tools"><button type="button" data-cart-filter-show="all">Ver todos</button></div></article>');
    }else{
      html.push('<article class="cart-pad is-empty" data-slot="'+i+'"><button type="button" class="cart-pad-empty" data-cart-slot-load="'+i+'"><span class="cart-pad-top"><span class="cart-pad-number">'+String(i+1).padStart(2,"0")+'</span><span class="cart-pad-hotkey">'+key+'</span></span><span class="cart-pad-plus">＋</span><b>Carregar áudio</b><small>'+(cartFilter==="all"?"Vinheta, comercial ou trilha":CATEGORY_LABELS[cartFilter])+'</small></button></article>');
    }
  }
  el.className="cart-grid";
  el.innerHTML=html.join("");
  refreshJingleRotationUI();
}
function getRotationJingles(){
  const seen=new Set();
  const assigned=cartSlots.map(id=>findMedia(id)).filter(m=>m&&m.type==="jingle");
  const rest=media.filter(m=>m.type==="jingle").sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  return [...assigned,...rest].filter(m=>{if(seen.has(m.id))return false;seen.add(m.id);return true;});
}
function refreshJingleRotationUI(){
  const toggle=$("jingleRotationEnabled"),interval=$("jingleRotationEvery"),status=$("jingleRotationStatus"),detail=$("jingleRotationDetail");
  if(!toggle||!interval||!status||!detail)return;
  if(document.activeElement!==toggle)toggle.checked=jingleRotation.enabled===true;
  if(document.activeElement!==interval)interval.value=String(jingleRotation.every||3);
  const count=getRotationJingles().length;
  status.textContent=jingleRotation.enabled?"ATIVA":"DESATIVADA";
  status.classList.toggle("warning-pill",!jingleRotation.enabled||!count);
  status.classList.toggle("success-pill",jingleRotation.enabled&&count>0);
  detail.textContent=count?("Próxima vinheta após "+Math.max(0,jingleRotation.every-jingleRotation.counter)+" música(s) · "+count+" disponível(is)."):"Importe vinhetas para ativar a inserção automática.";
}
function processJingleRotationAfterTrack(){
  if(!current||current.type!=="music"||!jingleRotation.enabled)return;
  const allJingles=getRotationJingles();
  const decision=core.advanceJingleRotation(jingleRotation,"music",jingleRotation.counter,allJingles.length>0);
  jingleRotation.counter=decision.counter;
  if(decision.insert){
    const candidates=allJingles.filter(m=>!queue.some(q=>q.id===m.id));
    if(candidates.length){
      const selected=candidates[jingleRotation.index%candidates.length];
      jingleRotation.index=(jingleRotation.index+1)%Math.max(1,allJingles.length);
      let insertionIndex=0;
      while(insertionIndex<queue.length&&queue[insertionIndex]._qolanQueueKind==="priority")insertionIndex++;
      queue.splice(insertionIndex,0,{...selected,_qolanAutomaticJingle:true});
      writeLog("jingle-rotation","Vinheta automática: "+selected.name,{mediaId:selected.id,title:selected.name,type:"jingle",source:"rotação automática",result:"inserida após eventos prioritários"});
      drawQueue();showToast("Vinheta inserida automaticamente: "+selected.name);
    }else{
      jingleRotation.counter=Math.max(jingleRotation.every,jingleRotation.counter);
      writeLog("jingle-rotation","Inserção adiada: todas as vinhetas já estão na fila.",{source:"rotação automática",result:"adiada"});
    }
  }
  refreshJingleRotationUI();persistState();
}
function fillMediaSelects(){
  const schedule=$("scheduleMedia"), campaign=$("campaignMedia");
  if(schedule){
    const currentValue=schedule.value;
    schedule.innerHTML='<option value="">Selecione um áudio…</option>'+media.map(m=>'<option value="'+m.id+'">'+escapeHtml(m.name)+' · '+CATEGORY_LABELS[m.type]+'</option>').join("");
    if(findMedia(currentValue))schedule.value=currentValue;
  }
  if(campaign){
    const currentValue=campaign.value;
    const spots=media.filter(m=>m.type==="spot");
    campaign.innerHTML='<option value="">Selecione um comercial…</option>'+spots.map(m=>'<option value="'+m.id+'">'+escapeHtml(m.name)+'</option>').join("");
    if(spots.some(m=>m.id===currentValue))campaign.value=currentValue;
  }
}
function drawSchedules(){
  $("scheduleCount").textContent=schedules.length+" eventos";
  const el=$("scheduleList");
  if(!schedules.length){el.className="record-list empty-state";el.textContent="Nenhum evento agendado.";return;}
  el.className="record-list";
  const rows=[...schedules].sort((a,b)=>a.time.localeCompare(b.time));
  el.innerHTML=rows.map(s=>'<div class="event-row"><div class="event-time">'+escapeHtml(s.time)+'</div><div class="event-info"><b>'+escapeHtml(s.label)+'</b><small>'+escapeHtml((findMedia(s.mediaId)||{}).name||"Mídia não encontrada")+' · '+escapeHtml(labelDay(s.day))+'</small></div><span class="event-status '+(s.enabled?"":"inactive")+'">'+(s.enabled?"ATIVO":"PAUSADO")+'</span><div class="row-actions"><button class="icon-button" data-schedule-toggle="'+s.id+'" title="Ativar/desativar">'+(s.enabled?"Ⅱ":"▶")+'</button><button class="icon-button" data-schedule-delete="'+s.id+'" title="Excluir">×</button></div></div>').join("");
}
function drawCampaigns(){
  $("campaignCount").textContent=campaigns.length+" campanhas";
  const el=$("campaignList");
  if(!campaigns.length){el.className="record-list empty-state";el.textContent="Nenhuma campanha cadastrada.";return;}
  el.className="record-list";
  el.innerHTML=[...campaigns].sort((a,b)=>a.time.localeCompare(b.time)).map(c=>'<div class="event-row"><div class="event-time">'+escapeHtml(c.time)+'</div><div class="event-info"><b>'+escapeHtml(c.name)+'</b><small>'+escapeHtml((findMedia(c.mediaId)||{}).name||"Comercial removido")+' · '+escapeHtml(c.startDate)+' a '+escapeHtml(c.endDate)+' · '+escapeHtml(labelDay(c.day))+'</small></div><span class="event-status '+(c.enabled?"":"inactive")+'">'+(c.enabled?"ATIVA":"PAUSADA")+'</span><div class="row-actions"><button class="icon-button" data-campaign-toggle="'+c.id+'" title="Ativar/desativar">'+(c.enabled?"Ⅱ":"▶")+'</button><button class="icon-button" data-campaign-delete="'+c.id+'" title="Excluir">×</button></div></div>').join("");
}
function renderRecentLogs(){
  const el=$("recentLogs");
  const recent=logs.slice(0,7);
  if(!recent.length){el.className="record-list empty-state";el.textContent="Ainda não há eventos registrados.";return;}
  el.className="record-list";
  el.innerHTML=recent.map(l=>'<div class="record-row"><span class="row-index">'+escapeHtml(l.timestamp?formatStationDate(l.timestamp,{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}):"—")+'</span><div class="record-main"><b>'+escapeHtml(l.message)+'</b><small>'+escapeHtml(labelEvent(l.event))+' · '+escapeHtml(l.title||"")+'</small></div></div>').join("");
}
function renderLogs(){
  const el=$("logTable");
  $("logCount").textContent=logs.length+" registros";
  if(!logs.length){el.innerHTML='<tr><td colspan="5" class="empty-cell">Nenhum registro.</td></tr>';return;}
  el.innerHTML=logs.slice(0,300).map(l=>{
    const date=l.timestamp?formatStationDate(l.timestamp,{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}):"—";
    const duration=Number.isFinite(Number(l.seconds))?fmt(l.seconds):"—";
    const result=l.result||"registrado";
    return '<tr><td>'+escapeHtml(date)+'</td><td>'+escapeHtml(labelEvent(l.event))+'</td><td>'+escapeHtml(l.title||l.message||"—")+'</td><td>'+duration+'</td><td><span class="category-tag">'+escapeHtml(result)+'</span></td></tr>';
  }).join("");
}
function renderEverything(){
  renderStation();renderCurrent();drawLibrary();drawQueue();drawSchedules();drawCampaigns();renderLogs();renderRecentLogs();renderStats();
  $("segueBtn").textContent="SEGUE: "+(segue?"ON":"OFF");
}
function addQueue(m,source="manual"){
  if(!m)return;
  queue.push(m);
  writeLog("queued","Fila + "+m.name,{mediaId:m.id,title:m.name,type:m.type,source,result:"na fila"});
  drawQueue();renderStats();persistState();
}
function chooseRotation(){
  const music=media.filter(m=>m.type==="music");
  if(!music.length)return null;
  const recentIds=new Set(logs.filter(l=>l.event==="play-complete"&&l.mediaId).slice(0,10).map(l=>l.mediaId));
  const candidates=music.filter(m=>!recentIds.has(m.id));
  const pool=candidates.length?candidates:music;
  return pool[Math.floor(Math.random()*pool.length)];
}
function play(m,source="manual"){
  if(!m)return;
  if(activeSession)finishSession("interrompida");
  mainAudio.pause();
  if(currentCart){
    if(!cartDuckApplied){mainVolumeBeforeCart=1;cartDuckApplied=true;}
    mainAudio.volume=Math.min(mainVolumeBeforeCart,0.30);
  }else mainAudio.volume=1;
  current=m;
  pendingSource=source;
  mainAudio.src=m.url;
  mainAudio.load();
  renderCurrent();
  setPlayState("CARREGANDO");
  $("playBtn").textContent="Ⅱ";
  setStatus("CARREGANDO ÁUDIO");
  mainAudio.play().then(()=>{
    setPlayState("REPRODUZINDO",true);
    setStatus("REPRODUZINDO");
    initializeMeter();
  }).catch(err=>{
    setPlayState("ERRO");
    $("playBtn").textContent="▶";
    setStatus("ERRO DE ÁUDIO");
    writeLog("play-error","Falha ao reproduzir "+m.name,{mediaId:m.id,title:m.name,type:m.type,source,result:err.name||"erro"});
    showToast("Não foi possível reproduzir este arquivo. Clique novamente após verificar o formato.",true);
  });
}
function next(){
  clearInterval(fadeTimer);
  mainAudio.volume=currentCart?(cartDuckApplied?Math.min(mainVolumeBeforeCart,0.30):1):1;
  if(queue.length){
    const m=queue.shift();
    persistState();drawQueue();
    play(m,"fila");
  }else if(auto){
    const m=chooseRotation();
    if(m)play(m,"rotação local sem repetir as últimas 10 faixas");
    else stopPlayback("Fila vazia; nenhuma música na biblioteca.");
  }else{
    stopPlayback("Fim da sequência.");
  }
}
function stopPlayback(reason="Parada manual."){
  clearInterval(fadeTimer);
  if(activeSession)finishSession("interrompida");
  mainAudio.pause();
  mainAudio.currentTime=0;
  mainAudio.volume=1;
  $("playBtn").textContent="▶";
  setPlayState("PARADO");
  setStatus("SISTEMA PRONTO");
  $("audioContextState").textContent=audioContext?"MOTOR DE ANÁLISE ATIVO":"ÁUDIO AGUARDANDO";
  showToast(reason);
}
function togglePlay(){
  if(!current){
    if(queue.length){next();return;}
    if(media.length){play(media[0],"biblioteca");return;}
    showToast("Importe um arquivo de áudio primeiro.",true);return;
  }
  if(mainAudio.paused){
    mainAudio.play().then(()=>{$("playBtn").textContent="Ⅱ";setPlayState("REPRODUZINDO",true);setStatus("REPRODUZINDO");}).catch(()=>showToast("O navegador bloqueou a reprodução. Clique novamente.",true));
  }else{
    mainAudio.pause();$("playBtn").textContent="▶";setPlayState("PAUSADO");setStatus("PAUSADO");
  }
}
function fadeNext(){
  if(mainAudio.paused||!current){showToast("Não há áudio tocando para fazer fade.",true);return;}
  clearInterval(fadeTimer);
  const start=mainAudio.volume,steps=25;
  let step=0;
  $("fadeBtn").disabled=true;
  fadeTimer=setInterval(()=>{
    step++;
    mainAudio.volume=Math.max(0,start*(1-step/steps));
    if(step>=steps){
      clearInterval(fadeTimer);fadeTimer=null;mainAudio.volume=currentCart?(cartDuckApplied?Math.min(mainVolumeBeforeCart,0.30):1):1;$("fadeBtn").disabled=false;
      if(activeSession)finishSession("fade-out");
      next();
    }
  },100);
  showToast("Fade-out de 2,5 segundos iniciado.");
}
async function initializeMeter(){
  try{
    if(!window.AudioContext&&!window.webkitAudioContext){$("audioContextState").textContent="ANÁLISE INDISPONÍVEL";return;}
    if(!audioContext){
      const Context=window.AudioContext||window.webkitAudioContext;
      audioContext=new Context();
      mediaSource=audioContext.createMediaElementSource(mainAudio);
      splitter=audioContext.createChannelSplitter(2);
      mediaSource.connect(audioContext.destination);
      mediaSource.connect(splitter);
      analyzers=[0,1].map(()=>{const a=audioContext.createAnalyser();a.fftSize=1024;return a;});
      meterNodes=[0,1].map(()=>audioContext.createGain());
      meterNodes.forEach(n=>n.gain.value=0);
      analyzers.forEach((a,i)=>{splitter.connect(a,i);a.connect(meterNodes[i]);meterNodes[i].connect(audioContext.destination);});
    }
    await audioContext.resume();
    $("audioContextState").textContent="RMS L/R ATIVO";
    if(meterTimer)clearInterval(meterTimer);
    const buffers=analyzers.map(()=>new Float32Array(1024));
    meterTimer=setInterval(()=>{
      if(!analyzers.length)return;
      analyzers.forEach((a,i)=>{
        a.getFloatTimeDomainData(buffers[i]);
        let sum=0;for(let j=0;j<buffers[i].length;j++)sum+=buffers[i][j]*buffers[i][j];
        const rms=Math.sqrt(sum/buffers[i].length);
        const db=rms>0?20*Math.log10(rms):-60;
        const pct=Math.max(0,Math.min(100,((db+60)/60)*100));
        $(i===0?"leftMeter":"rightMeter").style.width=pct+"%";
        $(i===0?"leftDb":"rightDb").textContent=(db<=-59.5?"−∞":db.toFixed(1))+" dB";
      });
    },90);
  }catch(err){
    $("audioContextState").textContent="ANÁLISE INDISPONÍVEL";
    writeLog("system","Análise de áudio indisponível: "+(err.message||"erro"));
  }
}
function refreshMode(){
  $("modeLabel").textContent=auto?"AUTOMAÇÃO LOCAL":"MANUAL";
  $("modeDot").parentElement.classList.toggle("on",auto);
  $("autoBtn").textContent=auto?"Ⅱ Desativar automação":"▶ Ativar automação local";
  $("diagMode").textContent=auto?"Ativa nesta aba":"Manual";
}
async function importFiles(files,options={}){
  let imported=0;
  const importedIds=[];
  const forcedType=options.forcedType&&CATEGORY_LABELS[options.forcedType]?options.forcedType:null;
  let targetSlot=Number.isInteger(options.targetSlot)&&options.targetSlot>=0&&options.targetSlot<CART_SLOT_COUNT?options.targetSlot:null;
  for(const file of Array.from(files||[])){
    if(!file.type.startsWith("audio/")&&!/\.(mp3|wav|ogg|flac|m4a|aac|opus|wma)$/i.test(file.name)){
      showToast("Arquivo ignorado: "+file.name+" não parece ser áudio.",true);continue;
    }
    const id=uid(),url=URL.createObjectURL(file);urlSet.add(url);
    const duration=await new Promise(resolve=>{
      const probe=new Audio();probe.preload="metadata";
      const done=()=>{const d=Number.isFinite(probe.duration)?probe.duration:0;probe.removeAttribute("src");probe.load();resolve(d);};
      probe.onloadedmetadata=done;probe.onerror=()=>resolve(0);probe.src=url;
    });
    const inferredType=forcedType||classify(file.name);
    const type=options.assignCart===true&&!["jingle","spot","track"].includes(inferredType)?"jingle":inferredType;
    const m={id,name:file.name,type,url,file,blob:file,duration,size:file.size,lastModified:file.lastModified};
    try{
      await dbPut("media",{id,name:file.name,type,duration,size:file.size,lastModified:file.lastModified,blob:file});
      media.push(m);imported++;importedIds.push(id);
      if(options.assignCart===true&&["jingle","spot","track"].includes(type)){
        if(targetSlot!==null){cartSlots[targetSlot]=id;targetSlot=null;}
        else cartSlots=core.fillEmptyCartSlots(cartSlots,[id],CART_SLOT_COUNT).slots;
      }
      writeLog("media-import","Importado: "+m.name,{mediaId:m.id,title:m.name,type:m.type,result:"armazenado no navegador"});
    }catch(err){
      URL.revokeObjectURL(url);urlSet.delete(url);
      showToast("Falha ao armazenar "+file.name+". Verifique o espaço disponível no navegador.",true);
    }
  }
  drawLibrary();drawQueue();renderStats();refreshJingleRotationUI();persistState();
  if(imported)showToast(imported+" arquivo(s) importado(s)"+(options.assignCart===true?" para a biblioteca e cartwall":"")+" neste navegador.");
  return importedIds;
}
async function updateMediaType(id,type){
  const m=findMedia(id);if(!m||!CATEGORY_LABELS[type])return;
  m.type=type;
  try{
    await dbPut("media",{id:m.id,name:m.name,type:m.type,duration:m.duration,size:m.size,lastModified:m.lastModified,blob:m.blob||m.file});
    writeLog("media-classify","Categoria: "+m.name+" → "+CATEGORY_LABELS[type],{mediaId:m.id,title:m.name,type,result:"alterada"});
    drawLibrary();drawQueue();drawSchedules();drawCampaigns();
  }catch(err){showToast("Não foi possível salvar a categoria: "+err.message,true);}
}
async function removeMedia(id){
  const m=findMedia(id);if(!m)return;
  if(!window.confirm("Remover "+m.name+" do armazenamento local?"))return;
  if(currentCart&&currentCart.id===id)stopCartPlayback(true);
  if(current&&current.id===id){stopPlayback("Faixa removida.");current=null;}
  media=media.filter(x=>x.id!==id);queue=queue.filter(x=>x.id!==id);
  schedules=schedules.filter(x=>x.mediaId!==id);campaigns=campaigns.filter(x=>x.mediaId!==id);
  cartSlots=cartSlots.map(slotId=>slotId===id?null:slotId);
  try{await dbDelete("media",id);}catch(_){} 
  if(urlSet.has(m.url)){URL.revokeObjectURL(m.url);urlSet.delete(m.url);}
  writeLog("media-delete","Removido: "+m.name,{mediaId:id,title:m.name,type:m.type,result:"removido localmente"});
  drawLibrary();drawQueue();drawSchedules();drawCampaigns();drawCarts();renderCurrent();persistState();
  if(auto&&current===null&&queue.length&&!currentCart)next();
}
function scheduleTick(){
  if(!auto||!db)return;
  const due=core.collectDueItems(schedules,campaigns,id=>findMedia(id),now(),settings.timezone);
  if(!due.events.length)return;
  queue.unshift(...due.events.map(event=>({...event.media,_qolanQueueKind:"priority",_qolanEventKind:event.kind})));
  for(const event of due.events){
    const item=event.item,m=event.media;
    if(event.kind==="schedule")writeLog("scheduled","Evento na fila: "+item.label,{mediaId:m.id,title:m.name,type:m.type,source:"agenda local",result:"inserido na fila"});
    else writeLog("campaign","Campanha na fila: "+item.name,{mediaId:m.id,title:m.name,type:m.type,source:"campanha local",result:"inserido na fila"});
  }
  drawQueue();drawSchedules();drawCampaigns();persistState();
  if(mainAudio.paused&&queue.length&&!currentCart)next();
  else showToast(due.events.length+" evento(s) de programação entrou/entraram na fila na ordem configurada.");
}
function updateProgress(){
  const duration=Number(mainAudio.duration)||0;
  $("elapsed").textContent=fmt(mainAudio.currentTime||0);
  $("duration").textContent=fmt(duration);
  $("progress").style.width=duration?Math.min(100,(mainAudio.currentTime/duration)*100)+"%":"0%";
}
async function refreshDiagnostics(){
  try{
    const resp=await fetch("/health",{cache:"no-store"});
    const data=await resp.json();
    $("diagServer").textContent=resp.ok?"Online":"Erro HTTP";
    $("diagServerDetail").textContent=(data.product||"Qolan Studio")+" · v"+(data.version||"?")+" · /health";
    $("health").textContent=resp.ok?"SERVIÇO WEB ONLINE":"SERVIÇO COM ERRO";
    $("health").style.color=resp.ok?"var(--green)":"var(--red)";
  }catch(_){
    $("diagServer").textContent="Indisponível";$("diagServerDetail").textContent="Não foi possível consultar /health";$("health").textContent="SERVIDOR NÃO VERIFICADO";
  }
  $("diagStorage").textContent=db?"IndexedDB ativo":"Indisponível";
  $("diagStorageDetail").textContent=media.length+" arquivos · "+queue.length+" na fila";
  $("diagAudio").textContent=audioContext?(audioContext.state==="running"?"Ativo":"Suspenso"):"Aguardando";
  $("diagAudioDetail").textContent=window.AudioContext?"Web Audio API":"Não suportado";
  $("diagMode").textContent=auto?"Ativa nesta aba":"Manual";
  if(navigator.storage&&navigator.storage.estimate){
    try{const e=await navigator.storage.estimate();$("storageFooter").textContent="Armazenamento estimado: "+bytesLabel(e.usage||0)+" de "+bytesLabel(e.quota||0);$("diagStorageDetail").textContent=media.length+" arquivos · "+bytesLabel(e.usage||0)+" usados";}
    catch(_){$("storageFooter").textContent="Dados salvos neste navegador";}
  }else $("storageFooter").textContent="Dados salvos neste navegador";
}
function fillSettings(){
  $("stationNameInput").value=settings.stationName||"";
  $("stationFrequencyInput").value=settings.frequency||"";
  $("timezoneInput").value=settings.timezone||"America/Sao_Paulo";
}
function csvEscape(v){return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}
function download(name,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function exportBackup(){
  const payload={product:"Qolan Studio",schemaVersion:1,exportedAt:now().toISOString(),settings,schedules,campaigns,queueIds:queue.map(m=>m.id),logs};
  download("qolan-studio-backup-"+localDateKey(now())+".json",JSON.stringify(payload,null,2),"application/json");
  showToast("Backup de configurações e registros exportado. Os arquivos de áudio não estão incluídos.");
}
async function restoreBackup(file){
  try{
    if(!file)throw new Error("Nenhum arquivo selecionado.");
    if(file.size>5*1024*1024)throw new Error("O backup excede 5 MB.");
    const payload=JSON.parse(await file.text());
    const clean=core.normalizeBackup(payload,new Set(media.map(m=>m.id)));
    settings=clean.settings;schedules=clean.schedules;campaigns=clean.campaigns;logs=clean.logs;
    queue=clean.queueIds.map(findMedia).filter(Boolean);
    await persistState();renderEverything();fillSettings();
    showToast("Backup importado. Reimporte separadamente os arquivos de áudio ausentes.");
  }catch(err){showToast("Não foi possível importar o backup: "+(err.message||"arquivo inválido"),true);}
}
async function deleteAllMedia(){
  if(!window.confirm("Isto remove todos os áudios armazenados neste navegador e seus agendamentos/campanhas. Continuar?"))return;
  stopPlayback("Biblioteca removida.");
  if(currentCart)stopCartPlayback(true);
  current=null;
  for(const url of urlSet)URL.revokeObjectURL(url);
  urlSet.clear();media=[];queue=[];schedules=[];campaigns=[];cartSlots=Array(CART_SLOT_COUNT).fill(null);jingleRotation={enabled:false,every:3,counter:0,index:0};
  await dbClear("media");await persistState();renderEverything();
  writeLog("system","Biblioteca local removida",{result:"ação manual"});
  showToast("Biblioteca local removida.");
}

function setCartStatus(text,active=false){
  const el=$("cartStatus");if(el){el.textContent=text;el.classList.toggle("active",active);}
  if($("stopCartBtn"))$("stopCartBtn").disabled=!active;
}
function restoreMainVolume(){
  if(cartDuckApplied){mainAudio.volume=mainVolumeBeforeCart;cartDuckApplied=false;}
  setCartStatus("SEM DISPARO",false);
  if($("cartDuckingLabel"))$("cartDuckingLabel").textContent="Áudio de apoio";
}
function stopCartPlayback(write=true){
  const prior=currentCart;cartAudio.pause();try{cartAudio.currentTime=0;}catch(_){}
  currentCart=null;restoreMainVolume();$("cartNowLabel").textContent="Cartwall aguardando disparo";drawCarts();persistState();
  if(prior&&write)writeLog("cart-stop","Disparo interrompido: "+prior.name,{mediaId:prior.id,title:prior.name,type:prior.type,source:prior.source,result:"interrompido"});
}
function playCart(m,source="cartwall"){
  if(!m)return;if(currentCart)stopCartPlayback(true);else restoreMainVolume();
  currentCart={id:m.id,name:m.name,type:m.type,source};
  if(!mainAudio.paused&&!mainAudio.ended){mainVolumeBeforeCart=mainAudio.volume;mainAudio.volume=Math.min(mainVolumeBeforeCart,0.30);cartDuckApplied=true;$("cartDuckingLabel").textContent="Programa atenuado";}
  else $("cartDuckingLabel").textContent="Sem programa principal";
  $("cartNowLabel").textContent=m.name;setCartStatus("DISPARANDO",true);drawCarts();cartAudio.src=m.url;cartAudio.currentTime=0;cartAudio.load();
  writeLog("cart-start","Cartwall: "+m.name,{mediaId:m.id,title:m.name,type:m.type,source,result:"disparo iniciado"});
  cartAudio.play().catch(err=>{const failed=currentCart;stopCartPlayback(false);if(failed)writeLog("play-error","Falha no disparo: "+failed.name,{mediaId:failed.id,title:failed.name,type:failed.type,source,result:err.name||"erro"});showToast("Não foi possível disparar este áudio. Verifique o arquivo e tente novamente.",true);});
}
function finishCartPlayback(){const finished=currentCart;currentCart=null;restoreMainVolume();$("cartNowLabel").textContent="Cartwall aguardando disparo";drawCarts();persistState();if(finished)writeLog("cart-complete","Disparo concluído: "+finished.name,{mediaId:finished.id,title:finished.name,type:finished.type,source:finished.source,result:"concluído"});if(auto&&mainAudio.paused&&queue.length)next();}
function buildRotationBlock(){
  const count=Math.max(1,Math.min(20,Number($("rotationCount").value)||8));
  const blocked=new Set(queue.map(m=>m.id));if(current)blocked.add(current.id);
  const music=media.filter(m=>m.type==="music"&&!blocked.has(m.id));
  const recent=new Set(logs.filter(l=>l.event==="play-complete"&&l.mediaId).slice(0,10).map(l=>l.mediaId));
  let pool=music.filter(m=>!recent.has(m.id));if(pool.length<count)pool=music.slice();
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  const selected=pool.slice(0,count);
  if(!selected.length){$("rotationSummary").textContent="Não há músicas disponíveis. Importe e classifique arquivos como Música.";showToast("Não há músicas disponíveis para montar o bloco.",true);return;}
  queue.push(...selected);drawQueue();renderStats();persistState();
  $("rotationSummary").textContent=selected.length+" faixas adicionadas. "+(selected.length<count?"Foram usadas todas as faixas disponíveis.":"Ordem aleatória, sem repetição dentro do bloco.");
  writeLog("block-generated","Bloco musical montado: "+selected.length+" faixas",{source:"gerador local",title:selected.map(m=>m.name).join(" | "),result:"adicionado à fila"});showToast("Bloco criado com "+selected.length+" faixas.");
}
function setNewsStatus(message,mode="idle"){const el=$("newsStatus");if(el){el.textContent=message;el.className="feed-status "+mode;}}
function renderNews(){
  const el=$("newsList");if(!el)return;
  if(!newsItems.length){el.className="news-list empty-state";el.textContent="Nenhuma manchete disponível. Atualize a fonte ou tente novamente.";return;}
  el.className="news-list";el.innerHTML=newsItems.map((item,i)=>{
    const date=item.publishedAt?formatStationDate(item.publishedAt,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}):"Data não informada";
    return '<article class="news-story"><div class="news-story-meta"><span class="news-source-tag">'+escapeHtml(item.category||"NOTÍCIA")+'</span><time>'+escapeHtml(date)+'</time></div><a class="news-story-title" href="'+escapeHtml(item.url)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(item.title)+'</a>'+(item.description?'<p>'+escapeHtml(item.description)+'</p>':'')+'<div class="news-story-actions"><a class="news-open-link" href="'+escapeHtml(item.url)+'" target="_blank" rel="noopener noreferrer">Ler original ↗</a><button type="button" class="btn btn-quiet btn-small" data-news-use="'+i+'">＋ Pauta</button></div></article>';
  }).join("");
}
async function loadNews(){
  const source=$("newsSourceSelect").value;setNewsStatus("CONSULTANDO…","loading");$("refreshNewsBtn").disabled=true;
  try{const r=await fetch("/api/news/"+encodeURIComponent(source),{cache:"no-store"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||"Fonte indisponível");newsItems=d.items||[];newsLoadedSource=source;newsLoadedAt=Date.now();renderNews();setNewsStatus((d.stale?"CACHE ANTIGO · ":"")+(d.cached&&!d.stale?"CACHE · ":"")+newsItems.length+" manchetes · "+new Date(d.updatedAt||Date.now()).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),"success");}
  catch(e){newsItems=[];renderNews();setNewsStatus("FALHA NA FONTE","error");$("newsList").insertAdjacentHTML("afterbegin",'<div class="news-error">'+escapeHtml(e.message||"Tente novamente")+'</div>');}
  finally{$("refreshNewsBtn").disabled=false;}
}
function initLiveNotes(){try{$("liveNotes").value=localStorage.getItem("qolan-live-notes")||"";}catch(_){}updateNotesSavedLabel();}
function updateNotesSavedLabel(){$("notesSavedAt").textContent=$("liveNotes").value?"Rascunho salvo localmente às "+new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"Pauta vazia";}
function saveLiveNotes(){try{localStorage.setItem("qolan-live-notes",$("liveNotes").value);updateNotesSavedLabel();}catch(_){$("notesSavedAt").textContent="Armazenamento local indisponível";}}
function addNewsToNotes(index){const item=newsItems[Number(index)];if(!item)return;const el=$("liveNotes");el.value=(el.value.trim()?el.value.trim()+"\n\n":"")+"• "+item.title+"\n"+item.url+"\n";saveLiveNotes();el.focus();showToast("Manchete adicionada à pauta local.");}
async function copyLiveNotes(){const value=$("liveNotes").value;if(!value.trim()){showToast("A pauta está vazia.",true);return;}try{await navigator.clipboard.writeText(value);showToast("Pauta copiada.");}catch(_){$("liveNotes").focus();$("liveNotes").select();const ok=document.execCommand("copy");showToast(ok?"Pauta copiada.":"Não foi possível copiar.",!ok);}}
function setObsStatus(message,mode="disconnected"){const el=$("obsConnectionStatus");if(el){el.textContent=message;el.className="obs-status "+mode;}if($("obsConnectBtn"))$("obsConnectBtn").disabled=mode==="connecting"||mode==="connected";if($("obsDisconnectBtn"))$("obsDisconnectBtn").disabled=mode!=="connected";}
function restoreObsAddress(){try{$("obsAddress").value=localStorage.getItem("qolan-obs-address")||"ws://127.0.0.1:4455";}catch(_){}}
function obsBase64(buffer){let x="";for(const v of new Uint8Array(buffer))x+=String.fromCharCode(v);return btoa(x);}
async function obsHash(value){if(!crypto.subtle)throw new Error("Web Crypto indisponível");return obsBase64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));}
function obsRequest(type,data={}){
  if(!obsSocket||obsSocket.readyState!==WebSocket.OPEN||!obsConnected)return Promise.reject(new Error("OBS não conectado."));
  const id=uid();return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{obsPending.delete(id);reject(new Error("Tempo esgotado na solicitação "+type));},6500);obsPending.set(id,{resolve,reject,timer});
    try{obsSocket.send(JSON.stringify({op:6,d:{requestType:type,requestId:id,requestData:data}}));}catch(e){clearTimeout(timer);obsPending.delete(id);reject(e);}
  });
}
function renderObsScenes(){
  const el=$("obsSceneList");if(!el)return;$("obsSceneCount").textContent=obsScenes.length+" cenas";$("obsSceneTitle").textContent=obsCurrentScene||"Prévia do estúdio";
  if(!obsScenes.length){el.className="obs-scene-list empty-state";el.textContent=obsConnected?"Nenhuma cena retornada.":"A lista de cenas aparecerá após conectar.";return;}
  el.className="obs-scene-list";el.innerHTML=obsScenes.map(s=>'<button type="button" class="obs-scene-button '+(s.sceneName===obsCurrentScene?"active":"")+'" data-obs-scene="'+escapeHtml(s.sceneName)+'"><span class="obs-scene-led"></span><b>'+escapeHtml(s.sceneName)+'</b><small>'+(s.sceneName===obsCurrentScene?"NO PROGRAMA":"DEFINIR NO AR")+'</small></button>').join("");
}
async function refreshObsPreview(){if(!obsConnected||!obsCurrentScene)return;try{
  const d=await obsRequest("GetSourceScreenshot",{sourceName:obsCurrentScene,imageFormat:"jpg",imageWidth:800,imageHeight:450,imageCompressionQuality:70});let src=d.imageData||"";
  if(src&&!src.startsWith("data:"))src="data:image/jpeg;base64,"+src;if(!src)throw new Error("OBS não retornou imagem");
  $("obsPreviewImage").src=src;$("obsPreviewImage").hidden=false;$("obsPreviewPlaceholder").hidden=true;$("obsPreviewState").textContent="PRÉVIA LOCAL";
 }catch(e){$("obsPreviewImage").hidden=true;$("obsPreviewPlaceholder").hidden=false;$("obsPreviewPlaceholder").querySelector("small").textContent="Prévia indisponível: "+(e.message||"erro");$("obsPreviewState").textContent="PRÉVIA INDISPONÍVEL";}}
async function setObsProgramScene(name){if(!obsConnected)return;if(!confirm("Enviar a cena “"+name+"” para o programa do OBS? A alteração pode ir ao ar."))return;try{await obsRequest("SetCurrentProgramScene",{sceneName:name});obsCurrentScene=name;renderObsScenes();await refreshObsPreview();showToast("Cena enviada ao programa: "+name);}catch(e){showToast("Não foi possível alterar a cena: "+e.message,true);}}
async function obsMessage(m,socket){
  if(socket!==obsSocket||typeof m.op!=="number")return;
  if(m.op===0){const d=m.d||{},identify={rpcVersion:d.rpcVersion,eventSubscriptions:4};try{if(d.authentication)identify.authentication=await obsHash(await obsHash($("obsPassword").value+d.authentication.salt)+d.authentication.challenge);socket.send(JSON.stringify({op:1,d:identify}));}catch(e){if(obsHandshake){clearTimeout(obsHandshake.timer);obsHandshake.reject(e);obsHandshake=null;}}}
  else if(m.op===2){obsConnected=true;if(obsHandshake){clearTimeout(obsHandshake.timer);obsHandshake.resolve();obsHandshake=null;}setObsStatus("CONECTADO","connected");}
  else if(m.op===7){const d=m.d||{},p=obsPending.get(d.requestId);if(!p)return;clearTimeout(p.timer);obsPending.delete(d.requestId);if(d.requestStatus&&d.requestStatus.result)p.resolve(d.responseData||{});else p.reject(new Error(d.requestStatus&&d.requestStatus.comment||"OBS rejeitou a solicitação."));}
  else if(m.op===5&&m.d&&m.d.eventType==="CurrentProgramSceneChanged"){obsCurrentScene=m.d.eventData.sceneName||obsCurrentScene;renderObsScenes();refreshObsPreview();}
}
async function connectObs(){
  if(obsSocket)disconnectObs(false);const address=$("obsAddress").value.trim();if(!/^wss?:\/\//i.test(address)){showToast("Endereço WebSocket inválido.",true);return;}
  try{const u=new URL(address);if(!["ws:","wss:"].includes(u.protocol)||!u.hostname)throw new Error("Endereço inválido");localStorage.setItem("qolan-obs-address",address);}catch(e){showToast(e.message,true);return;}
  setObsStatus("CONECTANDO…","connecting");
  try{await new Promise((resolve,reject)=>{let ws;try{ws=new WebSocket(address);}catch(e){reject(e);return;}obsSocket=ws;obsConnected=false;
    const timer=setTimeout(()=>{if(obsHandshake){clearTimeout(obsHandshake.timer);obsHandshake.reject(new Error("Tempo esgotado. Confira OBS, endereço, porta e senha."));obsHandshake=null;}try{ws.close();}catch(_){}},9000);
    obsHandshake={resolve,reject,timer};ws.onmessage=e=>{try{obsMessage(JSON.parse(e.data),ws);}catch(err){if(obsHandshake){clearTimeout(obsHandshake.timer);obsHandshake.reject(err);obsHandshake=null;}}};
    ws.onerror=()=>{setObsStatus("FALHA NA CONEXÃO","error");if(obsHandshake){clearTimeout(obsHandshake.timer);obsHandshake.reject(new Error("Conexão recusada. Confira se o servidor WebSocket está ativado no OBS."));obsHandshake=null;}};
    ws.onclose=()=>{if(obsSocket===ws){obsSocket=null;obsConnected=false;setObsStatus("DESCONECTADO","disconnected");}};
  });
  const result=await obsRequest("GetSceneList");obsScenes=Array.isArray(result.scenes)?result.scenes:[];obsCurrentScene=result.currentProgramSceneName||"";renderObsScenes();await refreshObsPreview();showToast("OBS conectado: "+obsScenes.length+" cenas.");
  }catch(e){setObsStatus("FALHA NA CONEXÃO","error");showToast("OBS não conectado: "+(e.message||"erro"),true);}
}
function disconnectObs(show=true){
  const ws=obsSocket;obsSocket=null;obsConnected=false;if(obsHandshake){clearTimeout(obsHandshake.timer);obsHandshake.reject(new Error("Desconectado pelo operador."));obsHandshake=null;}
  for(const [id,p] of obsPending){clearTimeout(p.timer);p.reject(new Error("Conexão encerrada."));obsPending.delete(id);}if(ws&&ws.readyState<WebSocket.CLOSING)ws.close();
  obsScenes=[];obsCurrentScene="";renderObsScenes();$("obsPreviewImage").hidden=true;$("obsPreviewPlaceholder").hidden=false;$("obsPreviewPlaceholder").querySelector("small").textContent="Conecte o OBS para carregar a cena do programa.";$("obsPreviewState").textContent="AGUARDANDO OBS";setObsStatus("DESCONECTADO","disconnected");if(show)showToast("OBS desconectado.");
}

function bindEvents(){
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>showView(b.dataset.view)));
  $("buildRotationBtn").addEventListener("click",buildRotationBlock);
  $("refreshNewsBtn").addEventListener("click",loadNews);$("newsSourceSelect").addEventListener("change",loadNews);
  $("liveNotes").addEventListener("input",saveLiveNotes);$("copyNotesBtn").addEventListener("click",copyLiveNotes);
  $("clearNotesBtn").addEventListener("click",()=>{if(confirm("Limpar a pauta local?")){$("liveNotes").value="";saveLiveNotes();showToast("Pauta limpa.");}});
  $("obsConnectBtn").addEventListener("click",connectObs);$("obsDisconnectBtn").addEventListener("click",()=>disconnectObs(true));$("stopCartBtn").addEventListener("click",()=>stopCartPlayback(true));
  document.addEventListener("click",e=>{
    const goto=e.target.closest("[data-go]");if(goto)showView(goto.dataset.go);
    const newsUse=e.target.closest("[data-news-use]");if(newsUse){addNewsToNotes(newsUse.dataset.newsUse);return;}
    const obsScene=e.target.closest("[data-obs-scene]");if(obsScene){setObsProgramScene(obsScene.dataset.obsScene);return;}
    const slotFire=e.target.closest("[data-cart-slot-play]");
    if(slotFire){const index=Number(slotFire.dataset.cartSlotPlay),m=findMedia(cartSlots[index]);if(m)playCart(m,"cartwall slot "+String(index+1).padStart(2,"0"));return;}
    const slotLoad=e.target.closest("[data-cart-slot-load]");
    if(slotLoad){pendingCartSlot=Number(slotLoad.dataset.cartSlotLoad);$("cartSlotInput").click();return;}
    const slotClear=e.target.closest("[data-cart-slot-clear]");
    if(slotClear){const index=Number(slotClear.dataset.cartSlotClear);if(Number.isInteger(index)&&index>=0&&index<CART_SLOT_COUNT){cartSlots[index]=null;drawCarts();persistState();showToast("Slot "+String(index+1).padStart(2,"0")+" esvaziado.");}return;}
    const revealAll=e.target.closest("[data-cart-filter-show]");
    if(revealAll){cartFilter="all";document.querySelectorAll("[data-cart-filter]").forEach(x=>x.classList.toggle("active",x.dataset.cartFilter==="all"));drawCarts();return;}
    const playBtn=e.target.closest("[data-media-play]");
    if(playBtn){const m=findMedia(playBtn.dataset.mediaPlay);if(m)play(m,"biblioteca");}
    const queued=e.target.closest("[data-media-queue]");
    if(queued)addQueue(findMedia(queued.dataset.mediaQueue));
    const remove=e.target.closest("[data-remove]");
    if(remove){queue.splice(Number(remove.dataset.remove),1);drawQueue();persistState();}
    const up=e.target.closest("[data-up]");
    if(up){const i=Number(up.dataset.up);if(i>0){[queue[i-1],queue[i]]=[queue[i],queue[i-1]];drawQueue();persistState();}}
    const down=e.target.closest("[data-down]");
    if(down){const i=Number(down.dataset.down);if(i<queue.length-1){[queue[i+1],queue[i]]=[queue[i],queue[i+1]];drawQueue();persistState();}}
    const schedToggle=e.target.closest("[data-schedule-toggle]");
    if(schedToggle){const s=schedules.find(x=>x.id===schedToggle.dataset.scheduleToggle);if(s){s.enabled=!s.enabled;drawSchedules();persistState();}}
    const schedDelete=e.target.closest("[data-schedule-delete]");
    if(schedDelete){schedules=schedules.filter(s=>s.id!==schedDelete.dataset.scheduleDelete);drawSchedules();persistState();}
    const campToggle=e.target.closest("[data-campaign-toggle]");
    if(campToggle){const c=campaigns.find(x=>x.id===campToggle.dataset.campaignToggle);if(c){c.enabled=!c.enabled;drawCampaigns();persistState();}}
    const campDelete=e.target.closest("[data-campaign-delete]");
    if(campDelete){campaigns=campaigns.filter(c=>c.id!==campDelete.dataset.campaignDelete);drawCampaigns();persistState();}
    const mediaDelete=e.target.closest("[data-media-delete]");
    if(mediaDelete)removeMedia(mediaDelete.dataset.mediaDelete);
  });
  $("importBtn").addEventListener("click",()=>$("fileInput").click());
  $("importBtnLibrary").addEventListener("click",()=>$("fileInput").click());
  $("fileInput").addEventListener("change",async e=>{await importFiles(e.target.files);e.target.value="";});
  document.querySelectorAll("[data-cart-import]").forEach(button=>button.addEventListener("click",()=>{
    const inputId=({jingle:"cartImportJingleInput",spot:"cartImportSpotInput",track:"cartImportTrackInput"})[button.dataset.cartImport];
    if(inputId)$(inputId).click();
  }));
  for(const [inputId,type] of [["cartImportJingleInput","jingle"],["cartImportSpotInput","spot"],["cartImportTrackInput","track"]]){
    $(inputId).addEventListener("change",async e=>{await importFiles(e.target.files,{forcedType:type,assignCart:true});e.target.value="";drawCarts();persistState();});
  }
  $("cartSlotInput").addEventListener("change",async e=>{
    const files=e.target.files,targetSlot=pendingCartSlot;pendingCartSlot=null;
    const forcedType=cartFilter==="all"?null:cartFilter;
    if(files&&files.length)await importFiles(files,{forcedType,targetSlot,assignCart:true});
    e.target.value="";drawCarts();persistState();
  });
  $("jingleRotationEnabled").addEventListener("change",async e=>{
    jingleRotation.enabled=e.target.checked;refreshJingleRotationUI();await persistState();
    showToast(jingleRotation.enabled?"Inserção automática de vinhetas ativada.":"Inserção automática de vinhetas desativada.");
  });
  $("jingleRotationEvery").addEventListener("change",async e=>{
    jingleRotation.every=Math.max(2,Math.min(12,Number(e.target.value)||3));refreshJingleRotationUI();await persistState();
    showToast("Vinheta automática configurada a cada "+jingleRotation.every+" músicas.");
  });
  $("search").addEventListener("input",drawLibrary);
  document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{
    filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("active",x===b));drawLibrary();
  }));
  document.querySelectorAll("[data-cart-filter]").forEach(b=>b.addEventListener("click",()=>{
    cartFilter=b.dataset.cartFilter;document.querySelectorAll("[data-cart-filter]").forEach(x=>x.classList.toggle("active",x===b));drawCarts();
  }));
  $("libraryList").addEventListener("change",e=>{
    const sel=e.target.closest("[data-type-id]");if(sel)updateMediaType(sel.dataset.typeId,sel.value);
  });
  $("playBtn").addEventListener("click",togglePlay);
  cartAudio.addEventListener("ended",finishCartPlayback);
  cartAudio.addEventListener("error",()=>{if(currentCart){const c=currentCart;stopCartPlayback(false);writeLog("play-error","Falha no disparo: "+c.name,{mediaId:c.id,title:c.name,type:c.type,source:c.source,result:"erro"});}});
  $("stopBtn").addEventListener("click",()=>stopPlayback("Reprodução parada."));
  $("nextBtn").addEventListener("click",next);
  $("prevBtn").addEventListener("click",()=>{if(current){mainAudio.currentTime=0;if(mainAudio.paused)togglePlay();}});
  $("fadeBtn").addEventListener("click",fadeNext);
  $("segueBtn").addEventListener("click",()=>{segue=!segue;$("segueBtn").textContent="SEGUE: "+(segue?"ON":"OFF");writeLog("system","Segue "+(segue?"ativado":"desativado"),{result:segue?"on":"off"});persistState();});
  $("autoBtn").addEventListener("click",()=>{
    auto=!auto;refreshMode();
    writeLog("automation","Automação local "+(auto?"ativada":"desativada"),{result:auto?"on":"off"});
    showToast(auto?"Automação local ligada. Mantenha esta aba aberta e o áudio permitido.":"Automação local desligada.");
    if(auto&&mainAudio.paused&&queue.length)next();
  });
  $("clearQueue").addEventListener("click",()=>{queue=[];drawQueue();persistState();writeLog("system","Fila limpa",{result:"fila vazia"});});
  $("saveQueueBtn").addEventListener("click",async()=>{await persistState();showToast("Fila salva neste navegador.");});
  $("scheduleForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const mediaId=$("scheduleMedia").value, m=findMedia(mediaId),time=$("scheduleTime").value,label=$("scheduleLabel").value.trim();
    if(!m||!time||!label){showToast("Preencha o nome, áudio e horário.",true);return;}
    schedules.push({id:uid(),label,mediaId,time,day:$("scheduleDay").value,enabled:true,lastFiredAt:null});
    await persistState();drawSchedules();e.target.reset();$("scheduleTime").value="09:00";fillMediaSelects();showToast("Evento adicionado à programação local.");writeLog("system","Agendamento criado: "+label,{title:m.name,result:"ativo"});
  });
  $("campaignForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const name=$("campaignName").value.trim(),mediaId=$("campaignMedia").value,m=findMedia(mediaId),startDate=$("campaignStart").value,endDate=$("campaignEnd").value,time=$("campaignTime").value,day=$("campaignDay").value;
    if(!name||!m||!startDate||!endDate||!time||endDate<startDate){showToast("Revise os dados e as datas da campanha.",true);return;}
    campaigns.push({id:uid(),name,mediaId,startDate,endDate,time,day,enabled:true,lastFiredAt:null});
    await persistState();drawCampaigns();e.target.reset();$("campaignTime").value="12:00";fillMediaSelects();showToast("Campanha local cadastrada.");writeLog("system","Campanha criada: "+name,{title:m.name,result:"ativa"});
  });
  $("settingsForm").addEventListener("submit",async e=>{
    e.preventDefault();settings={stationName:$("stationNameInput").value.trim()||"Emissora",frequency:$("stationFrequencyInput").value.trim(),timezone:$("timezoneInput").value};
    await persistState();renderStation();showToast("Configurações da emissora salvas neste navegador.");writeLog("system","Configurações da emissora alteradas",{result:"salvas"});
  });
  $("settingsShortcut").addEventListener("click",()=>showView("settings"));
  $("exportCsv").addEventListener("click",()=>{
    const rows=[["timestamp","event","title","category","source","seconds","result"],...logs.map(l=>[l.timestamp,labelEvent(l.event),l.title||l.message,l.type||"",l.source||"",l.seconds==null?"":l.seconds,l.result||""])];
    download("qolan-studio-playout-log-"+localDateKey(now())+".csv","\uFEFF"+rows.map(row=>row.map(csvEscape).join(";")).join("\r\n"),"text/csv;charset=utf-8");
  });
  $("exportJson").addEventListener("click",()=>download("qolan-studio-playout-log.json",JSON.stringify({product:"Qolan Studio",exportedAt:now().toISOString(),logs},null,2),"application/json"));
  $("clearLogs").addEventListener("click",async()=>{if(!window.confirm("Apagar todos os registros locais de veiculação?"))return;logs=[];await persistState();renderLogs();renderRecentLogs();renderStats();showToast("Histórico local apagado.");});
  $("refreshDiagnostics").addEventListener("click",refreshDiagnostics);
  $("backupBtn").addEventListener("click",exportBackup);
  $("restoreBtn").addEventListener("click",()=>$("restoreInput").click());
  $("restoreInput").addEventListener("change",async e=>{const file=e.target.files&&e.target.files[0];if(file)await restoreBackup(file);e.target.value="";});
  $("clearMediaBtn").addEventListener("click",deleteAllMedia);
  document.addEventListener("keydown",e=>{
    if(e.ctrlKey&&e.key.toLowerCase()==="i"){e.preventDefault();$("fileInput").click();return;}
    if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName))return;
    if(e.key===" "){e.preventDefault();togglePlay();return;}
    if(e.key==="F10"){e.preventDefault();showView("console");return;}
    if(/^F[1-9]$/.test(e.key)){
      e.preventDefault();const index=Number(e.key.slice(1))-1;
      const item=findMedia(cartSlots[index]);
      if(item)playCart(item,"cartwall "+e.key);
    }
  });
  mainAudio.addEventListener("play",()=>{if(!activeSession)startSession(pendingSource);setPlayState("REPRODUZINDO",true);$("playBtn").textContent="Ⅱ";setStatus("REPRODUZINDO");initializeMeter();});
  mainAudio.addEventListener("pause",()=>{if(mainAudio.ended)return;if(!mainAudio.currentSrc)return;if($("playState").textContent==="REPRODUZINDO")setPlayState("PAUSADO");});
  mainAudio.addEventListener("ended",()=>{
    $("playState").classList.remove("playing");
    finishSession("concluída");$("playBtn").textContent="▶";
    processJingleRotationAfterTrack();
    if(queue.length&&(auto||segue))next();
    else if(auto)next();
    else{setPlayState("FIM DA FAIXA");setStatus("SISTEMA PRONTO");}
  });
  mainAudio.addEventListener("timeupdate",updateProgress);
  mainAudio.addEventListener("error",()=>{
    if(!current)return;
    if(activeSession)finishSession("erro");
    else writeLog("play-error","Erro ao carregar: "+current.name,{mediaId:current.id,title:current.name,result:"erro"});
    setPlayState("ERRO");setStatus("ERRO DE ÁUDIO");
    if(queue.length&&auto)next();
  });
}
async function init(){
  bindEvents();restoreObsAddress();initLiveNotes();setObsStatus("DESCONECTADO","disconnected");
  drawClock();setInterval(drawClock,1000);
  setInterval(scheduleTick,1000);
  refreshMode();
  try{
    db=await openDb();await restoreState();
    $("storageFooter").textContent="IndexedDB: ativo · "+media.length+" arquivos";
  }catch(err){
    $("storageFooter").textContent="Armazenamento local indisponível";
    $("diagStorage").textContent="Indisponível";
    showToast("O navegador não permitiu abrir a biblioteca persistente: "+err.message,true);
  }
  renderEverything();fillSettings();fillMediaSelects();
  const today=localDateKey(now());
  $("campaignStart").value=today;$("campaignEnd").value=today;
  await refreshDiagnostics();
  writeLog("system","Console Qolan Studio iniciado",{result:"pronto"});
}
window.addEventListener("beforeunload",()=>{
  clearInterval(meterTimer);clearInterval(fadeTimer);try{cartAudio.pause();}catch(_){}try{if(obsSocket)disconnectObs(false);}catch(_){}
  for(const url of urlSet)URL.revokeObjectURL(url);
});
init();
})();