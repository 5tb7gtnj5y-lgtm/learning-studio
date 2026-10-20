import html from '../public/index.html';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const enc=new TextEncoder();
async function digest(input){return new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(input)))}
function eq(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a[i]^b[i];return n===0}
function hex(a){return [...a].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function auth(request,env){
 const ck=request.headers.get('cookie')||'';const token=ck.match(/(?:^|;\s*)studio_session=([^;]+)/)?.[1];if(!token)return false;
 const [expiry,signature]=token.split('.');if(!expiry||!signature||!/^\d+$/.test(expiry)||Number(expiry)<Date.now())return false;
 return eq(enc.encode(signature),enc.encode(hex(await digest(`${expiry}.${env.SESSION_SECRET}`))));
}
function reject(){return json({error:'Administrator login required'},401)}
function fail(error,status=400){return json({error},status)}
function id(){return crypto.randomUUID()}
function emptyCourse(){return {title:'Untitled learning',pages:[{id:id(),title:'Welcome',blocks:[{id:id(),type:'text',text:'Welcome to your new learning package.'}],link:'next'}]}}
function validateCourse(c){return c&&typeof c.title==='string'&&c.title.length<=150&&Array.isArray(c.pages)&&c.pages.length<=100&&c.pages.every(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&p.title.length<=150&&Array.isArray(p.blocks)&&p.blocks.length<=100)}
async function readBody(request){if(Number(request.headers.get('content-length')||0)>4_000_000)throw Error('Project exceeds 4 MB');const text=await request.text();if(text.length>4_000_000)throw Error('Project exceeds 4 MB');return JSON.parse(text)}
export default {async fetch(request,env){
 try{
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/'&&method==='GET')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src https://*.sharepoint.com https://*.microsoft.com https://web.microsoftstream.com; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"}});
 if(path==='/api/session'&&method==='GET')return json({admin:await auth(request,env)});
 if(path==='/api/login'&&method==='POST'){
  if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return fail('Server secrets are not configured',503);
  const b=await readBody(request);if(typeof b.password!=='string')return fail('Password required');
  if(!eq(await digest(b.password),await digest(env.ADMIN_PASSWORD)))return fail('Incorrect password',401);
  const expiry=String(Date.now()+24*60*60*1000),signature=hex(await digest(`${expiry}.${env.SESSION_SECRET}`));
  return json({ok:true},200,{'set-cookie':`studio_session=${expiry}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`});
 }
 if(path==='/api/logout'&&method==='POST')return json({ok:true},200,{'set-cookie':'studio_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 if(path==='/api/published'&&method==='GET'){
  const list=await env.DB.prepare('SELECT id, title, updated_at FROM courses WHERE published_json IS NOT NULL ORDER BY updated_at DESC').all();return json(list.results);
 }
 const pub=path.match(/^\/api\/published\/([0-9a-f-]{36})$/);
 if(pub&&method==='GET'){
  const item=await env.DB.prepare('SELECT published_json FROM courses WHERE id=?').bind(pub[1]).first();return item?.published_json?json(JSON.parse(item.published_json)):fail('Learning not found',404);
 }
 if(!path.startsWith('/api/'))return new Response('Not found',{status:404});
 if(!await auth(request,env))return reject();
 if(path==='/api/courses'&&method==='GET'){
  const list=await env.DB.prepare('SELECT id,title,published_json IS NOT NULL AS published,updated_at FROM courses ORDER BY updated_at DESC').all();return json(list.results);
 }
 if(path==='/api/courses'&&method==='POST'){
  const course=emptyCourse(),courseId=id(),now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO courses(id,title,draft_json,created_at,updated_at) VALUES(?,?,?,?,?)').bind(courseId,course.title,JSON.stringify(course),now,now).run();return json({id:courseId,course},201);
 }
 const m=path.match(/^\/api\/courses\/([0-9a-f-]{36})(?:\/(publish|unpublish))?$/);
 if(!m)return fail('Unknown API route',404);
 const [_,courseId,action]=m;
 if(method==='GET'&&!action){const row=await env.DB.prepare('SELECT id,draft_json,published_json FROM courses WHERE id=?').bind(courseId).first();return row?json({id:row.id,course:JSON.parse(row.draft_json),published:!!row.published_json}):fail('Not found',404)}
 if(method==='PUT'&&!action){const course=await readBody(request);if(!validateCourse(course))return fail('Invalid learning package');const out=await env.DB.prepare('UPDATE courses SET title=?,draft_json=?,updated_at=? WHERE id=?').bind(course.title,JSON.stringify(course),new Date().toISOString(),courseId).run();return out.meta.changes?json({ok:true}):fail('Not found',404)}
 if(method==='DELETE'&&!action){await env.DB.prepare('DELETE FROM courses WHERE id=?').bind(courseId).run();return json({ok:true})}
 if(method==='POST'&&action==='publish'){const result=await env.DB.prepare('UPDATE courses SET published_json=draft_json,updated_at=? WHERE id=?').bind(new Date().toISOString(),courseId).run();return result.meta.changes?json({ok:true}):fail('Not found',404)}
 if(method==='POST'&&action==='unpublish'){const result=await env.DB.prepare('UPDATE courses SET published_json=NULL,updated_at=? WHERE id=?').bind(new Date().toISOString(),courseId).run();return result.meta.changes?json({ok:true}):fail('Not found',404)}
 return fail('Not found',404);
 }catch(err){return fail(err?.message||'Server error',500)}
 }};