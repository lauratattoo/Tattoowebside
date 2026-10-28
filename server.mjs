import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const STORE_PATH = process.env.DATA_FILE || path.join(ROOT, 'data', 'demo.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || randomUUID() + randomUUID();
const COOKIE = 'tattoo_admin';
const MAX_BODY = 18_000_000;
const EDITABLE = ['name','subtitle','intro','artist','city','address','phone','email','facebook','instagram','whatsapp','hoursStart','hoursEnd','workdays','theme'];
const nowISO = () => new Date().toISOString();

const freshState = () => ({
  settings: {
    name:'Salon tattoo Laura', artist:'Laura', subtitle:'INK WITH A PERSONAL TOUCH',
    intro:'Jemné linky, dotwork a originální motivy na míru. Každé tetování začíná tvým příběhem. Pošli svůj nápad a společně doladíme detaily.',
    city:'', address:'', phone:'', email:'', instagram:'', facebook:'', whatsapp:'',
    hoursStart:'10:00', hoursEnd:'18:00', workdays:[1,2,3,4,5], theme:'rose'
  },
  gallery: [
    {id:'sample-2',title:'Jemná dotwork ilustrace',category:'Ilustrativní vizualizace',image:'/assets/portfolio-2.jpg',sample:true},
    {id:'sample-5',title:'Ornamentální lilie',category:'Ilustrativní vizualizace',image:'/assets/portfolio-5.jpg',sample:true},
    {id:'sample-3',title:'Ručně psaný motiv',category:'Ilustrativní vizualizace',image:'/assets/portfolio-3.jpg',sample:true},
    {id:'sample-4',title:'Lev a datum',category:'Ilustrativní vizualizace',image:'/assets/portfolio-4.jpg',sample:true},
    {id:'sample-1',title:'EMNEM – typografie',category:'Původní fotografie',image:'/assets/original-1.jpg',sample:true},
    {id:'sample-11',title:'Tréninková kůže – jemné motivy',category:'Původní fotografie',image:'/assets/original-2.jpg',sample:true},
    {id:'sample-12',title:'Lev – kresba na tréninkové kůži',category:'Původní fotografie',image:'/assets/original-3.jpg',sample:true},
    {id:'sample-13',title:'Ornament – tréninková kůže',category:'Původní fotografie',image:'/assets/original-4.jpg',sample:true},
    {id:'sample-8',title:'Křídlo a detail',category:'Ilustrativní vizualizace',image:'/assets/portfolio-8.jpg',sample:true}
  ],
  reservations: [],
  blocks: []
});

function loadState() {
  try {
    const data = JSON.parse(readFileSync(STORE_PATH,'utf8'));
    const initial = freshState();
    return {settings:{...initial.settings,...data.settings},gallery:Array.isArray(data.gallery)?data.gallery:initial.gallery,reservations:Array.isArray(data.reservations)?data.reservations:[],blocks:Array.isArray(data.blocks)?data.blocks:[]};
  } catch { return freshState(); }
}
let db = loadState();
function save() {
  mkdirSync(path.dirname(STORE_PATH),{recursive:true});
  const tmp = STORE_PATH+'.tmp';
  writeFileSync(tmp,JSON.stringify(db,null,2),'utf8');
  renameSync(tmp,STORE_PATH);
}
const json = (res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
const msg = (res,status,text)=>json(res,status,{error:text});
const timeRx = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRx = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v,max=300)=>String(v??'').trim().slice(0,max);
const minutes = t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
function validDate(d){ if(!dateRx.test(d)) return false; const [y,m,day]=d.split('-').map(Number); const test=new Date(Date.UTC(y,m-1,day)); return test.getUTCFullYear()===y && test.getUTCMonth()===m-1 && test.getUTCDate()===day; }
function dayOfWeek(d){return new Date(d+'T12:00:00Z').getUTCDay();}
function todayPrague(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function busy(date,start,end,exclude='') {
  const a=minutes(start),b=minutes(end);
  return db.blocks.some(x=>x.date===date && x.id!==exclude && a<minutes(x.end) && b>minutes(x.start)) ||
    db.reservations.some(x=>x.date===date && x.id!==exclude && x.status==='confirmed' && a<minutes(x.end) && b>minutes(x.start));
}
function availability(date,start,end,exclude=''){
  if(!validDate(date)||!timeRx.test(start)||!timeRx.test(end)||minutes(start)>=minutes(end))return false;
  if(date<todayPrague())return false;
 if(date===todayPrague()){const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());if(minutes(start)<minutes(clock))return false;}
  const {hoursStart,hoursEnd,workdays}=db.settings;
  if(!workdays.includes(dayOfWeek(date)) || minutes(start)<minutes(hoursStart) || minutes(end)>minutes(hoursEnd))return false;
  return !busy(date,start,end,exclude);
}
function publicState() {
  const {settings,gallery,blocks,reservations}=db;
  return {
    settings, gallery,
    occupied:[...blocks.map(({id,date,start,end})=>({id,date,start,end})),...reservations.filter(x=>x.status==='confirmed').map(({id,date,start,end})=>({id,date,start,end}))],
    emailConfigured:Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
  };
}
function sign(payload){const data=Buffer.from(JSON.stringify(payload)).toString('base64url');return data+'.'+createHmac('sha256',SESSION_SECRET).update(data).digest('base64url');}
function checkSession(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';const i=raw.lastIndexOf('.');if(i<0)return false;const data=raw.slice(0,i),sig=raw.slice(i+1);const expected=createHmac('sha256',SESSION_SECRET).update(data).digest('base64url');try{if(!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return false;const obj=JSON.parse(Buffer.from(data,'base64url').toString('utf8'));return obj.admin===true && Number(obj.exp)>Date.now();}catch{return false;}}
function requireAdmin(req,res){if(!checkSession(req)){msg(res,401,'Pro tuto akci se nejdříve přihlas do administrace.');return false;}return true;}
const cookieOpts = req => `Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${process.env.NODE_ENV==='production'||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`;
const hits=new Map();
function limit(key,n,period){const ts=Date.now();const list=(hits.get(key)||[]).filter(t=>ts-t<period);if(list.length>=n)return false;list.push(ts);hits.set(key,list);if(hits.size>2000)hits.clear();return true;}
async function readBody(req){const pieces=[];let len=0;for await(const chunk of req){len+=chunk.length;if(len>MAX_BODY)throw new Error('Soubor nebo požadavek je příliš velký (max. 2 MB na obrázek).');pieces.push(chunk);}try{return JSON.parse(Buffer.concat(pieces).toString('utf8')||'{}');}catch{throw new Error('Neplatná data formuláře.');}}
function imageData(str){if(str==null||str==='')return null;if(typeof str!=='string')return false;const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(str);if(!match)return false;const bytes=Buffer.from(match[2],'base64');if(bytes.length>2_000_000||bytes.length<12)return false;
  const jpg=match[1]==='jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=match[1]==='png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=match[1]==='webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  return jpg||png||webp?str:false;}
const escapeHTML = s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function sendMail(to,subject,body){if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!to)return {sent:false};try{
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[to],subject,html:`<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.7;color:#202020"><h2>${escapeHTML(db.settings.name)}</h2>${body}</div>`})});
 if(!response.ok){console.error('Email delivery failed',response.status,await response.text());return {sent:false};}
 return {sent:true};
 }catch(e){console.error('Email error:',e.message);return {sent:false};}}
async function handleAPI(req,res,url){
 const method=req.method||'GET'; const pathname=url.pathname;
 if(pathname==='/health' && method==='GET')return json(res,200,{ok:true,service:'tattoo-demo'});
 if(pathname==='/api/public' && method==='GET')return json(res,200,publicState());
 if(pathname==='/api/admin/session' && method==='GET')return json(res,200,{authenticated:checkSession(req),emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)});
 if(pathname==='/api/admin/login' && method==='POST'){
  const ip=req.socket.remoteAddress||'unknown';if(!limit('login:'+ip,12,3600000))return msg(res,429,'Příliš mnoho pokusů. Zkus to později.');
  const body=await readBody(req);if(!ADMIN_PASSWORD)return msg(res,503,'V Renderu nejdříve nastav ADMIN_PASSWORD.');
  const actual=Buffer.from(String(body.password||''));const expected=Buffer.from(ADMIN_PASSWORD);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return msg(res,401,'Nesprávné heslo.');
  res.setHeader('Set-Cookie',COOKIE+'='+sign({admin:true,exp:Date.now()+8*3600*1000})+'; '+cookieOpts(req));return json(res,200,{ok:true});
 }
 if(pathname==='/api/admin/logout' && method==='POST'){res.setHeader('Set-Cookie',COOKIE+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return json(res,200,{ok:true});}
 if(pathname==='/api/reservations' && method==='POST'){
  const ip=req.socket.remoteAddress||'unknown';if(!limit('reserve:'+ip,10,3600000))return msg(res,429,'Příliš mnoho žádostí. Zkus to později.');
  const b=await readBody(req);if(b.website)return json(res,201,{ok:true});
  const firstName=clean(b.firstName,70),lastName=clean(b.lastName,70),email=clean(b.email,160),description=clean(b.description,1500);
  const date=clean(b.date,10),start=clean(b.start,5),duration=Number(b.duration);
  if(!firstName||!lastName||!/^\S+@\S+\.\S+$/.test(email)||!Number.isInteger(duration)||![60,120,180,240].includes(duration)||!timeRx.test(start))return msg(res,400,'Vyplň jméno, příjmení, platný e-mail, datum a čas.');
  const endM=minutes(start)+duration;const end=String(Math.floor(endM/60)).padStart(2,'0')+':'+String(endM%60).padStart(2,'0');
  if(!availability(date,start,end))return msg(res,409,'Tento termín již není dostupný. Vyber jiný.');
  const attachment=imageData(b.attachment);if(attachment===false)return msg(res,400,'Návrh musí být PNG, JPG nebo WebP do 2 MB.');
  const booking={id:randomUUID(),createdAt:nowISO(),firstName,lastName,email,description,date,start,end,duration,status:'pending',attachment};
  db.reservations.push(booking);save();
  const info=`<p>Nová žádost: <strong>${escapeHTML(firstName+' '+lastName)}</strong></p><p>Termín: ${escapeHTML(date)} ${escapeHTML(start)}–${escapeHTML(end)}</p><p>E-mail: ${escapeHTML(email)}</p><p>Popis: ${escapeHTML(description||'Bez popisu')}</p><p>Otevři administraci webu a žádost vyřiď.</p>`;
  const notification=await sendMail(db.settings.email,'Nová žádost o tetování',info);
  return json(res,201,{ok:true,id:booking.id,notificationSent:notification.sent});
 }
 // All following endpoints are private.
 if(!pathname.startsWith('/api/admin/'))return false;
 if(!requireAdmin(req,res))return true;
 if(pathname==='/api/admin/backup'&&method==='GET'){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="salon-tattoo-laura-backup.json"','Cache-Control':'no-store'});
  return res.end(JSON.stringify({exportedAt:nowISO(),version:1,...db},null,2));
 }
 if(pathname==='/api/admin/dashboard'&&method==='GET')return json(res,200,{settings:db.settings,gallery:db.gallery,blocks:db.blocks,reservations:db.reservations.map(({attachment,...rest})=>({...rest,hasAttachment:Boolean(attachment)})),emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)});
 if(pathname.startsWith('/api/admin/attachment/')&&method==='GET'){
  const id=pathname.split('/').pop();const b=db.reservations.find(x=>x.id===id);if(!b||!b.attachment)return msg(res,404,'Příloha neexistuje.');
  const match=/^data:image\/(png|jpeg|webp);base64,(.*)$/.exec(b.attachment);if(!match)return msg(res,404,'Příloha neexistuje.');
  res.writeHead(200,{'Content-Type':'image/'+match[1], 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(Buffer.from(match[2],'base64'));
 }
 if(pathname==='/api/admin/settings'&&method==='PUT'){
  const b=await readBody(req),next={...db.settings};
  for(const f of EDITABLE){if(f==='workdays'){if(Array.isArray(b.workdays))next.workdays=[...new Set(b.workdays.map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6))];}else if(typeof b[f]==='string')next[f]=clean(b[f],f==='intro'?1000:200);}
  if(!['rose','noir','ivory','bold','bloom','muse','chrome','pure'].includes(next.theme))next.theme='rose';
  if(!timeRx.test(next.hoursStart)||!timeRx.test(next.hoursEnd)||minutes(next.hoursEnd)<=minutes(next.hoursStart))return msg(res,400,'Neplatná provozní doba.');
  if(next.email&&!/^\S+@\S+\.\S+$/.test(next.email))return msg(res,400,'E-mail není platný.');
  db.settings=next;save();return json(res,200,{ok:true,settings:next});
 }
 if(pathname==='/api/admin/gallery'&&method==='POST'){
  const b=await readBody(req);const image=imageData(b.image);if(!image)return msg(res,400,'Nahraj JPG, PNG nebo WebP do 2 MB.');
  const item={id:randomUUID(),title:clean(b.title,100)||'Nové tetování',category:clean(b.category,70)||'Tetování',image,sample:false};
  db.gallery.unshift(item);save();return json(res,201,{ok:true,id:item.id});
 }
 const gal=pathname.match(/^\/api\/admin\/gallery\/([^/]+)$/);
 if(gal&&method==='DELETE'){const before=db.gallery.length;db.gallery=db.gallery.filter(x=>x.id!==gal[1]);if(before===db.gallery.length)return msg(res,404,'Fotografie nenalezena.');save();return json(res,200,{ok:true});}
 if(gal&&method==='PUT'){const b=await readBody(req),item=db.gallery.find(x=>x.id===gal[1]);if(!item)return msg(res,404,'Fotografie nenalezena.');item.title=clean(b.title,100)||item.title;item.category=clean(b.category,70)||item.category;save();return json(res,200,{ok:true});}
 if(pathname==='/api/admin/blocks'&&method==='POST'){
  const b=await readBody(req);const date=clean(b.date,10),start=clean(b.start,5),end=clean(b.end,5);
  if(!validDate(date)||!timeRx.test(start)||!timeRx.test(end)||minutes(start)>=minutes(end)||busy(date,start,end))return msg(res,409,'Neplatný interval nebo už existuje obsazený čas.');
  const item={id:randomUUID(),date,start,end,kind:b.kind==='booking'?'booking':'blocked',title:clean(b.title,110)||'Obsazeno',createdAt:nowISO()};db.blocks.push(item);save();return json(res,201,{ok:true,id:item.id});
 }
 const block=pathname.match(/^\/api\/admin\/blocks\/([^/]+)$/);
 if(block&&method==='DELETE'){db.blocks=db.blocks.filter(x=>x.id!==block[1]);save();return json(res,200,{ok:true});}
 const reservation=pathname.match(/^\/api\/admin\/reservations\/([^/]+)$/);
 if(reservation&&method==='DELETE'){const prev=db.reservations.length;db.reservations=db.reservations.filter(x=>x.id!==reservation[1]);if(db.reservations.length===prev)return msg(res,404,'Rezervace nenalezena.');save();return json(res,200,{ok:true});}
 if(reservation&&method==='PATCH'){
  const b=await readBody(req);const item=db.reservations.find(x=>x.id===reservation[1]);if(!item)return msg(res,404,'Rezervace nenalezena.');
  const status=clean(b.status,40);if(!['confirmed','rejected','discussion','cancelled','pending'].includes(status))return msg(res,400,'Neznámý stav.');
  if(status==='confirmed'&&!availability(item.date,item.start,item.end,item.id))return msg(res,409,'Termín se překrývá s jiným potvrzeným termínem nebo je uzavřeno.');
  const previous=item.status;item.status=status;item.updatedAt=nowISO();save();let emailSent=false;
  if(status!==previous){const base=`<p>Dobrý den, ${escapeHTML(item.firstName)},</p><p>Termín ${escapeHTML(item.date)}, ${escapeHTML(item.start)}–${escapeHTML(item.end)}.</p>`;
   if(status==='confirmed')emailSent=(await sendMail(item.email,'Potvrzení termínu tetování',base+'<p><strong>Váš termín je potvrzen.</strong> Těšíme se na Vás!</p>')).sent;
   if(status==='discussion')emailSent=(await sendMail(item.email,'Domluva termínu tetování',base+'<p>Ještě se potřebujeme domluvit na podrobnostech. Brzy se Vám ozveme.</p>')).sent;
   if(status==='rejected'||status==='cancelled')emailSent=(await sendMail(item.email,'Informace o rezervaci tetování',base+'<p>Vybraný termín bohužel není možné potvrdit. Prosím napište nám kvůli náhradnímu termínu.</p>')).sent;
  }
  return json(res,200,{ok:true,emailSent,emailConfigured:Boolean(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM)});
 }
 return msg(res,404,'Stránka nebyla nalezena.');
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(url.pathname==='/health'||url.pathname.startsWith('/api/')){
   if(!['GET','HEAD','OPTIONS'].includes(req.method||'GET')){
    const origin=req.headers.origin;
    if(origin){let hostname='';try{hostname=new URL(origin).host}catch{return msg(res,403,'Neplatný původ požadavku.')}
     if(hostname!==req.headers.host)return msg(res,403,'Přístup z jiné stránky je zakázaný.');}
    if(['POST','PUT','PATCH'].includes(req.method||'')&&!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return msg(res,415,'Požadován JSON.');
   }
   const done=await handleAPI(req,res,url);if(done===false)msg(res,404,'Stránka nebyla nalezena.');return;}
  if(req.method!=='GET'&&req.method!=='HEAD')return msg(res,405,'Metoda není podporována.');
  let requested;try{requested=decodeURIComponent(url.pathname);}catch{return msg(res,400,'Neplatná adresa.');}
  if(requested.includes('\0'))return msg(res,400,'Neplatná adresa.');
  const file=path.resolve(PUBLIC,'.'+(requested==='/'?'/index.html':requested));
  if(!file.startsWith(PUBLIC+path.sep)&&file!==PUBLIC)return msg(res,403,'Přístup odepřen.');
  let bytes;try{bytes=readFileSync(file);}catch{return msg(res,404,'Stránka nebyla nalezena.');}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':file.endsWith('.html')?'no-cache':'public, max-age=300'});return res.end(req.method==='HEAD'?undefined:bytes);
 }catch(err){console.error('Server error:',err);if(!res.headersSent)msg(res,err.message?.startsWith('Soubor')?413:400,err.message||'Došlo k chybě.');else res.end();}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Tattoo demo: http://localhost:${PORT} — admin password ${ADMIN_PASSWORD?'configured':'NOT SET'}`));
