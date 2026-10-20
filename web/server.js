const express = require("express");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const VERSION = "0.5.0";
const PUBLIC_DIR = path.join(__dirname, "public");

const NEWS_FEEDS = Object.freeze({
  "agencia-brasil": {label:"Agência Brasil · Últimas notícias",url:"https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",category:"BRASIL"},
  "radioagencia": {label:"Radioagência Nacional · Últimas notícias",url:"https://agenciabrasil.ebc.com.br/radioagencia-nacional/rss/ultimasnoticias/feed.xml",category:"RADIOAGÊNCIA"},
  "politica": {label:"Agência Brasil · Política",url:"https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",category:"POLÍTICA"},
  "economia": {label:"Agência Brasil · Economia",url:"https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",category:"ECONOMIA"},
  "esportes": {label:"Agência Brasil · Esportes",url:"https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml",category:"ESPORTES"}
});
const newsCache = new Map();
const NEWS_CACHE_MS = 180000;
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


app.disable("x-powered-by");
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
  if(cached&&Date.now()-cached.fetchedAt<NEWS_CACHE_MS)return res.json({...cached.payload,cached:true});
  try{
    const response=await fetch(feed.url,{headers:{accept:"application/rss+xml, application/xml, text/xml","user-agent":"QolanStudio/0.5.0 RSS reader"},signal:AbortSignal.timeout(9000),redirect:"follow"});
    if(!response.ok)throw new Error("A fonte respondeu HTTP "+response.status+".");
    const finalUrl=new URL(response.url);
    if(finalUrl.protocol!=="https:"||finalUrl.hostname!=="agenciabrasil.ebc.com.br")throw new Error("Redirecionamento da fonte não permitido.");
    const xml=await response.text();
    if(xml.length>1500000)throw new Error("Feed excedeu o limite de tamanho.");
    if(!/<(?:rss|feed|rdf:RDF)\b/i.test(xml))throw new Error("A fonte não retornou um feed RSS válido.");
    const items=parseFeed(xml,feed.category);
    if(!items.length)throw new Error("O feed não retornou manchetes legíveis.");
    const payload={ok:true,source:key,sourceLabel:feed.label,updatedAt:new Date().toISOString(),items};
    newsCache.set(key,{fetchedAt:Date.now(),payload});
    return res.json(payload);
  }catch(error){
    return res.status(502).json({ok:false,source:key,message:"Não foi possível atualizar "+feed.label+". "+(error&&error.name==="TimeoutError"?"A conexão excedeu o tempo limite.":(error.message||"Fonte indisponível."))});
  }
});

app.get("*", (_req, res) => {
  res.set("Cache-Control", "no-cache, must-revalidate");
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Qolan Studio Web " + VERSION + " listening on " + PORT);
});
