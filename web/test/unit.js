const test=require("node:test");
const assert=require("node:assert/strict");
const {stationClockParts,collectDueItems,normalizeBackup}=require("../public/logic.js");
const {parseFeed,fetchAllowedFeed,validateFeedUrl,readLimitedBody}=require("../server");

test("station clock follows configured timezone and handles date rollover",()=>{
 const instant=new Date("2026-10-20T02:30:00.000Z");
 const sao=stationClockParts(instant,"America/Sao_Paulo"),ny=stationClockParts(instant,"America/New_York");
 assert.equal(sao.dateKey,"2026-10-19");assert.equal(sao.timeKey,"23:30");assert.equal(sao.day,1);
 assert.equal(ny.dateKey,"2026-10-19");assert.equal(ny.timeKey,"22:30");
 assert.equal(stationClockParts(instant,"Not/A_Timezone").timeKey,sao.timeKey);
});

test("coincident schedule and campaign events preserve configured order and are idempotent",()=>{
 const date=new Date("2026-10-20T12:15:00.000Z"),tz="America/Sao_Paulo",p=stationClockParts(date,tz),m={id:"m1",name:"Faixa"};
 const schedules=[
  {id:"s1",label:"Noticiário",mediaId:"m1",time:p.timeKey,day:String(p.day),enabled:true},
  {id:"s2",label:"Vinheta",mediaId:"m1",time:p.timeKey,day:"*",enabled:true}
 ];
 const campaigns=[{id:"c1",name:"Comercial",mediaId:"m1",time:p.timeKey,day:"*",startDate:p.dateKey,endDate:p.dateKey,enabled:true}];
 const first=collectDueItems(schedules,campaigns,id=>id==="m1"?m:null,date,tz);
 assert.deepEqual(first.events.map(x=>x.item.id),["s1","s2","c1"]);
 assert.deepEqual(first.events.map(x=>x.kind),["schedule","schedule","campaign"]);
 assert.equal(collectDueItems(schedules,campaigns,()=>m,date,tz).events.length,0);
});

test("backup normalization rejects wrong schema and filters invalid records",()=>{
 const payload={product:"Qolan Studio",schemaVersion:1,settings:{stationName:" Rádio Teste ",frequency:" 99.1 FM ",timezone:"America/Sao_Paulo",unknown:"x"},
  schedules:[{id:"s1",label:"Manhã",mediaId:"m1",time:"08:30",day:1,enabled:true},{id:"bad",label:"Quebrado",mediaId:"m1",time:"99:88",day:9,enabled:true}],
  campaigns:[{id:"c1",name:"Spot",mediaId:"m1",time:"12:00",day:"*",startDate:"2026-10-20",endDate:"2026-10-21",enabled:true}],
  logs:[{id:"l1",event:"play-complete",message:"Tocou",timestamp:"2026-10-20T12:00:00.000Z",seconds:5}],queueIds:["m1","absent"]};
 const clean=normalizeBackup(payload,new Set(["m1"]));
 assert.equal(clean.settings.stationName,"Rádio Teste");assert.equal(clean.schedules.length,1);assert.equal(clean.campaigns.length,1);
 assert.equal(clean.logs.length,1);assert.deepEqual(clean.queueIds,["m1"]);
 assert.throws(()=>normalizeBackup({...payload,schemaVersion:9}),/backup compatível/);
 assert.throws(()=>normalizeBackup({...payload,logs:"not-array"}),/Campo inválido/);
});

test("missing local media does not consume the scheduled minute",()=>{
 const date=new Date("2026-10-20T12:15:00.000Z"),tz="America/Sao_Paulo",p=stationClockParts(date,tz);
 const schedules=[{id:"s1",label:"Jingle",mediaId:"missing",time:p.timeKey,day:"*",enabled:true}];
 assert.equal(collectDueItems(schedules,[],()=>null,date,tz).events.length,0);
 assert.equal(schedules[0].lastFiredAt,undefined);
 assert.equal(collectDueItems(schedules,[],()=>({id:"missing"}),date,tz).events.length,1);
});
test("invalid campaign date ranges never enter the scheduler",()=>{
 const date=new Date("2026-10-20T12:15:00.000Z"),tz="America/Sao_Paulo",p=stationClockParts(date,tz);
 const c=[{id:"c",name:"bad",mediaId:"m",time:p.timeKey,day:"*",startDate:"2026-11-01",endDate:"2026-10-01",enabled:true}];
 assert.equal(collectDueItems([],c,()=>({id:"m"}),date,tz).events.length,0);
});

test("RSS parser accepts only HTTPS links from the approved publisher",()=>{
 const xml='<rss version="2.0"><channel><item><title><![CDATA[Manhã &amp; Notícias]]></title><link>https://agenciabrasil.ebc.com.br/noticia/1</link><description><![CDATA[<p>Texto &amp; contexto</p>]]></description><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Link externo</title><link>https://example.com/story</link></item></channel></rss>';
 const items=parseFeed(xml,"TEST");
 assert.equal(items.length,1);assert.equal(items[0].title,"Manhã & Notícias");assert.equal(items[0].description,"Texto & contexto");assert.equal(items[0].category,"TEST");
});

test("RSS redirect validator blocks cross-host redirects before another request",async()=>{
 let calls=0;
 await assert.rejects(fetchAllowedFeed("https://agenciabrasil.ebc.com.br/rss/feed.xml",async()=>{
  calls++;return {status:302,headers:{get:()=> "https://evil.example/data"},body:null};
 }),/Destino de feed não permitido/);
 assert.equal(calls,1);assert.throws(()=>validateFeedUrl("http://agenciabrasil.ebc.com.br/rss/feed.xml"),/Destino/);
});

test("same-host RSS redirects are bounded and response bodies have a hard byte limit",async()=>{
 const seen=[];let call=0;
 const response=await fetchAllowedFeed("https://agenciabrasil.ebc.com.br/rss/feed.xml",async url=>{
  seen.push(url);call++;
  if(call===1)return {status:302,headers:{get:()=>"/rss/real.xml"},body:null};
  return {status:200,headers:{get:()=>null},body:null};
 });
 assert.equal(response.status,200);assert.equal(seen.length,2);assert.ok(seen[1].endsWith("/rss/real.xml"));
 await assert.rejects(readLimitedBody(new Response("x".repeat(20)),10),/limite de tamanho/);
});
