const express = require("express");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const VERSION = "0.6.1";
const PUBLIC_DIR = path.join(__dirname, "public");

const NEWS_FEEDS = Object.freeze({
  "agencia-brasil": {label:"Agência Brasil · Últimas notícias",url:"https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",category:"BRASIL"},
  "radioagencia": {label:"Radioagência Nacional · Últimas notícias",url:"https://agenciabrasil.ebc.com.br/radioagencia-nacional/rss/ultimasnoticias/feed.xml",category:"RADIOAGÊNCIA"},
  "politica": {label:"Agência Brasil · Política",url:"https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",category:"POLÍTICA"},
  "economia": {label:"Agência Brasil · Economia",url:"https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",category:"ECONOMIA"},
  "esportes": {label:"Agência Brasil · Esportes",url:"https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml",category:"ESPORTES"}
});
const newsCache = new Map();
const newsInFlight = new Map();
const NEWS_CACHE_MS = 180000;
const NEWS_STALE_MS = 30 * 60 * 1000;
const MAX_FEED_BYTES = 1500000;
const MAX_FEED_REDIRECTS = 3;
function rssClean(value,max=600){
  return String(value||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi,"$1").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ")
    .replace(/&#(\d+);/g,(_m,n)=>{try{return String.fromCodePoint(Number(n));}catch{return " ";}})
    .replace(/&#x([0-9a-f]+);/gi,(_m,n)=>{try{return String.fromCodePoint(parseInt(n,16));}catch{return " ";}})
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/\s+/g," ").trim().slice(0,max);
}
function rssField(xml,tag,max=600){
  const m=xml.match(new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+tag+">","i"));
  return m?rssClean(m[1],max):"";
}
function parseFeed(xml,category){
  const items=xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
  return items.slice(0,25).map(item=>{
    const title=rssField(item,"title",300),rawLink=rssField(item,"link",800),description=rssField(item,"description",450),rawDate=rssField(item,"pubDate",100);
    let url="";try{const u=new URL(rawLink);if(u.protocol==="https:"&&u.hostname==="agenciabrasil.ebc.com.br")url=u.href;}catch{}
    const d=rawDate?new Date(rawDate):null;
    return {title,url,description,publishedAt:d&&!Number.isNaN(d.getTime())?d.toISOString():null,category};
  }).filter(x=>x.title&&x.url);
}


function validateFeedUrl(value){
  const url=value instanceof URL?new URL(value.href):new URL(value);
  if(url.protocol!=="https:"||url.hostname!=="agenciabrasil.ebc.com.br"||url.username||url.password||url.port)throw new Error("Destino de feed não permitido.");
  return url;
}
async function fetchAllowedFeed(startUrl,fetchImpl=fetch){
  let target=validateFeedUrl(startUrl);
  for(let redirects=0;redirects<=MAX_FEED_REDIRECTS;redirects++){
    const response=await fetchImpl(target.href,{headers:{accept:"application/rss+xml, application/xml, text/xml","user-agent":"QolanStudio/0.6.1 RSS reader"},signal:AbortSignal.timeout(9000),redirect:"manual"});
    if(![301,302,303,307,308].includes(response.status))return response;
    const location=response.headers&&response.headers.get("location");
    try{if(response.body)await response.body.cancel();}catch(_){}
    if(!location||redirects===MAX_FEED_REDIRECTS)throw new Error("Redirecionamento de feed inválido ou excessivo.");
    target=validateFeedUrl(new URL(location,target));
  }
  throw new Error("Redirecionamento de feed excessivo.");
}
async function readLimitedBody(response,maxBytes=MAX_FEED_BYTES){
  if(!response.body){const body=await response.text();if(Buffer.byteLength(body,"utf8")>maxBytes)throw new Error("Feed excedeu o limite de tamanho.");return body;}
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>maxBytes){try{await reader.cancel();}catch(_){}throw new Error("Feed excedeu o limite de tamanho.");}chunks.push(part.value);}}
  finally{try{reader.releaseLock();}catch(_){}}
  const all=new Uint8Array(total);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder("utf-8").decode(all);
}
app.disable("x-powered-by");
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  next();
});
app.use(express.static(PUBLIC_DIR, {
  maxAge: 0,
  etag: true,
  setHeaders(res, filePath) {
    if (["index.html", "app.js", "styles.css"].includes(path.basename(filePath))) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    }
  }
}));

app.get("/health", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "qolan-studio-web",
    product: "Qolan Studio",
    version: VERSION,
    time: new Date().toISOString()
  });
});


app.get("/api/news-sources", (_req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({ok:true,sources:Object.entries(NEWS_FEEDS).map(([id,f])=>({id,label:f.label,category:f.category}))});
});
app.get("/api/news/:source",async(req,res)=>{
  res.set("Cache-Control","no-store");
  const key=req.params.source,feed=NEWS_FEEDS[key];
  if(!feed)return res.status(404).json({ok:false,message:"Fonte de notícias não permitida."});
  const cached=newsCache.get(key);
  if(cached&&Date.now()-cached.fetchedAt<NEWS_CACHE_MS)return res.json({...cached.payload,cached:true,stale:false});
  let request=newsInFlight.get(key);
  if(!request){
    request=(async()=>{
      const response=await fetchAllowedFeed(feed.url);
      if(!response.ok)throw new Error("A fonte respondeu HTTP "+response.status+".");
      const xml=await readLimitedBody(response);
      if(!/<(?:rss|feed|rdf:RDF)\b/i.test(xml))throw new Error("A fonte não retornou um feed RSS válido.");
      const items=parseFeed(xml,feed.category);
      if(!items.length)throw new Error("O feed não retornou manchetes legíveis.");
      const payload={ok:true,source:key,sourceLabel:feed.label,updatedAt:new Date().toISOString(),items};
      newsCache.set(key,{fetchedAt:Date.now(),payload});
      return payload;
    })();
    newsInFlight.set(key,request);
  }
  try{
    const payload=await request;
    return res.json({...payload,cached:false,stale:false});
  }catch(error){
    if(cached&&Date.now()-cached.fetchedAt<NEWS_STALE_MS)return res.json({...cached.payload,cached:true,stale:true});
    const timeout=error&&error.name==="TimeoutError";
    console.error("[qolan-news] feed="+key+" error="+String(error&&error.message||error));
    return res.status(502).json({ok:false,source:key,message:"Não foi possível atualizar "+feed.label+". "+(timeout?"A conexão excedeu o tempo limite.":"A fonte está temporariamente indisponível.")});
  }finally{
    if(newsInFlight.get(key)===request)newsInFlight.delete(key);
  }
});
app.use("/api",(req,res)=>res.status(404).json({ok:false,message:"Endpoint de API não encontrado."}));

app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-cache, must-revalidate");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

if(require.main===module){
  app.listen(PORT,"0.0.0.0",()=>console.log("Qolan Studio Web "+VERSION+" listening on "+PORT));
}
module.exports={app,parseFeed,rssClean,rssField,validateFeedUrl,fetchAllowedFeed,readLimitedBody,NEWS_FEEDS};
