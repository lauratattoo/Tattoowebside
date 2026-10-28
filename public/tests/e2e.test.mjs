import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const wait=t=>new Promise(r=>setTimeout(r,t));
async function freePort(){const s=net.createServer();await new Promise(res=>s.listen(0,'127.0.0.1',res));const port=s.address().port;await new Promise(res=>s.close(res));return port}
const post=async(url,body,method='POST',cookie='')=>fetch(url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
test('Salon tattoo Laura: public, admin, booking, status, images, blocks and settings',async()=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),'tattoo-test-'));const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.mjs'],{cwd:ROOT,env:{...process.env,PORT:String(port),ADMIN_PASSWORD:'A_strong_demo_password_76',SESSION_SECRET:'test-secret-at-least-32-chars-long',DATA_FILE:path.join(tmp,'data.json')}});
 let stderr='';proc.stderr.on('data',b=>stderr+=b.toString());
 try{
  let ok=false;for(let i=0;i<60;i++){try{const r=await fetch(base+'/health');if(r.ok){ok=true;break}}catch{}await wait(100)}assert.ok(ok,'server started: '+stderr);
  for(const asset of ['/','/admin.html','/app.js','/style.css','/admin.js','/admin.css','/assets/original-1.jpg']){const r=await fetch(base+asset);assert.equal(r.status,200,asset)}
  const pub=await(await fetch(base+'/api/public')).json();assert.equal(pub.settings.name,'Salon tattoo Laura');assert.equal(pub.gallery.length,9);assert.deepEqual(pub.occupied,[]);
  const bad=await post(base+'/api/admin/login',{password:'wrong'});assert.equal(bad.status,401);
  const good=await post(base+'/api/admin/login',{password:'A_strong_demo_password_76'});assert.equal(good.status,200);const cookie=good.headers.get('set-cookie').split(';')[0];assert.ok(cookie.startsWith('tattoo_admin='));
  const day=new Date(Date.now()+14*86400000);while([0,6].includes(day.getUTCDay()))day.setDate(day.getDate()+1);const date=day.toISOString().slice(0,10);
  const reserve={firstName:'Eliška',lastName:'Testerová',email:'eliska@example.com',date,start:'10:00',duration:120,description:'Minimalistická květina',attachment:null};
  const rr=await post(base+'/api/reservations',reserve);assert.equal(rr.status,201,JSON.stringify(await rr.clone().json()));const result=await rr.json();assert.equal(result.notificationSent,false);
  const d=await(await fetch(base+'/api/admin/dashboard',{headers:{Cookie:cookie}})).json();assert.equal(d.reservations.length,1);assert.equal(d.reservations[0].status,'pending');assert.equal(d.reservations[0].firstName,'Eliška');
  const unauth=await fetch(base+'/api/admin/dashboard');assert.equal(unauth.status,401);
  const patch=await post(base+`/api/admin/reservations/${result.id}`,{status:'confirmed'},'PATCH',cookie);assert.equal(patch.status,200);assert.equal((await patch.json()).emailSent,false);
  const clash=await post(base+'/api/reservations',reserve);assert.equal(clash.status,409);
  const blocking=await post(base+'/api/admin/blocks',{date,start:'13:00',end:'16:00',kind:'blocked',title:'Dovolená'},'POST',cookie);assert.equal(blocking.status,201);
  const clashingBlock=await post(base+'/api/admin/blocks',{date,start:'11:00',end:'14:00',kind:'booking',title:'Kolize'},'POST',cookie);assert.equal(clashingBlock.status,409);
  const updated=await post(base+'/api/admin/settings',{name:'Salon tattoo Laura',email:'laura@example.com',instagram:'laura.tattoo',hoursStart:'09:00',hoursEnd:'19:00',workdays:[1,2,3,4,5,6],theme:'rose'},'PUT',cookie);assert.equal(updated.status,200);
  const pub2=await(await fetch(base+'/api/public')).json();assert.equal(pub2.settings.instagram,'laura.tattoo');assert.equal(pub2.occupied.length,2);
  const img='data:image/png;base64,'+Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');
  const gallery=await post(base+'/api/admin/gallery',{image:img,title:'Test obrázek',category:'Kresba / návrh'},'POST',cookie);assert.equal(gallery.status,201);
  const galleryId=(await gallery.json()).id;const del=await fetch(base+'/api/admin/gallery/'+galleryId,{method:'DELETE',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(del.status,200);
  const forbidden=await post(base+'/api/admin/settings',{name:'Někdo jiný'},'PUT');assert.equal(forbidden.status,401);
  const origin=await fetch(base+'/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://evil.example'},body:'{}'});assert.equal(origin.status,403);
 }finally{proc.kill();rmSync(tmp,{recursive:true,force:true})}
});
