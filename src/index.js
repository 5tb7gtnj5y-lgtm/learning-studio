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

const REVIEW_DDL=[
'CREATE TABLE IF NOT EXISTS review_links (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT)',
'CREATE INDEX IF NOT EXISTS review_links_course_idx ON review_links(course_id)',
'CREATE TABLE IF NOT EXISTS review_comments (id TEXT PRIMARY KEY, link_id TEXT NOT NULL, course_id TEXT NOT NULL, page_id TEXT NOT NULL, block_id TEXT, author TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', created_at TEXT NOT NULL, resolved_at TEXT)',
'CREATE INDEX IF NOT EXISTS review_comments_course_idx ON review_comments(course_id,created_at)'
];
async function ensureReviews(env){await env.DB.batch(REVIEW_DDL.map(sql=>env.DB.prepare(sql)))}
function validId(s){return /^[0-9a-f-]{36}$/i.test(s||'')}
async function validReviewLink(env,token){
 if(!/^[0-9a-f]{64}$/i.test(token||''))return null;
 const hashed=hex(await digest(token.toLowerCase()));
 const link=await env.DB.prepare('SELECT id,course_id,expires_at FROM review_links WHERE token_hash=? AND revoked_at IS NULL').bind(hashed).first();
 return link&&Date.parse(link.expires_at)>Date.now()?link:null;
}

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

 // Review links are capability URLs: a long random secret is required to read an unpublished draft.
 const reviewMatch=path.match(/^\/api\/review\/([0-9a-f]{64})(?:\/comments)?$/i);
 if(reviewMatch){
  if(!['GET','POST'].includes(method))return fail('Method not allowed',405);
  await ensureReviews(env);
  const link=await validReviewLink(env,reviewMatch[1]);if(!link)return fail('This review link has expired or been disabled',404);
  const record=await env.DB.prepare('SELECT draft_json FROM courses WHERE id=?').bind(link.course_id).first();
  if(!record)return fail('This learning package is unavailable',404);
  const draft=JSON.parse(record.draft_json);
  if(path.endsWith('/comments')&&method==='POST'){
   const b=await readBody(request),author=typeof b.author==='string'?b.author.trim():'',body=typeof b.body==='string'?b.body.trim():'';
   if(author.length<1||author.length>60||body.length<1||body.length>2000)return fail('Enter your name (up to 60 characters) and feedback (up to 2,000 characters)');
   if(!validId(b.pageId)||!(draft.pages||[]).some(p=>p.id===b.pageId))return fail('Choose a valid page');
   const p=draft.pages.find(p=>p.id===b.pageId),blockId=b.blockId==null?null:b.blockId;
   if(blockId!==null&&(!validId(blockId)||!(p.blocks||[]).some(x=>x.id===blockId)))return fail('Choose a valid section');
   const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM review_comments WHERE link_id=?').bind(link.id).first();
   if(Number(count?.n||0)>=500)return fail('This review has reached its feedback limit',429);
   const commentId=id(),now=new Date().toISOString();
   await env.DB.prepare('INSERT INTO review_comments(id,link_id,course_id,page_id,block_id,author,body,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(commentId,link.id,link.course_id,b.pageId,blockId,author,body,'open',now).run();
   return json({ok:true,id:commentId},201);
  }
  if(!path.endsWith('/comments')&&method==='GET')return json({course:draft});
  return fail('Not found',404);
 }
 if(!path.startsWith('/api/'))return new Response('Not found',{status:404});
 if(!await auth(request,env))return reject();

 const reviewLinkRoute=path.match(/^\/api\/courses\/([0-9a-f-]{36})\/review-link$/i);
 const reviewsRoute=path.match(/^\/api\/courses\/([0-9a-f-]{36})\/reviews(?:\/([0-9a-f-]{36}))?$/i);
 if(reviewLinkRoute||reviewsRoute){
  await ensureReviews(env);
  const courseId=(reviewLinkRoute||reviewsRoute)[1];
  const row=await env.DB.prepare('SELECT id FROM courses WHERE id=?').bind(courseId).first();
  if(!row)return fail('Learning package not found',404);
  if(reviewLinkRoute&&method==='POST'){
   // Generating a fresh link revokes the previous one. Never store bearer tokens in plain text.
   const raw=hex(crypto.getRandomValues(new Uint8Array(32))),tokenHash=hex(await digest(raw)),now=new Date().toISOString();
   const expires=new Date(Date.now()+30*24*60*60*1000).toISOString();
   await env.DB.prepare('UPDATE review_links SET revoked_at=? WHERE course_id=? AND revoked_at IS NULL').bind(now,courseId).run();
   await env.DB.prepare('INSERT INTO review_links(id,course_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)').bind(id(),courseId,tokenHash,now,expires).run();
   return json({url:new URL('/?review='+raw,url.origin).toString(),expires_at:expires});
  }
  if(reviewLinkRoute&&method==='DELETE'){
   await env.DB.prepare('UPDATE review_links SET revoked_at=? WHERE course_id=? AND revoked_at IS NULL').bind(new Date().toISOString(),courseId).run();return json({ok:true});
  }
  if(reviewLinkRoute&&method==='GET'){
   const link=await env.DB.prepare('SELECT created_at,expires_at,revoked_at FROM review_links WHERE course_id=? ORDER BY created_at DESC LIMIT 1').bind(courseId).first();
   return json({active:!!link&&!link.revoked_at&&Date.parse(link.expires_at)>Date.now(),expires_at:link?.expires_at||null});
  }
  if(reviewsRoute&&method==='GET'&&!reviewsRoute[2]){
   const comments=await env.DB.prepare('SELECT id,page_id,block_id,author,body,status,created_at,resolved_at FROM review_comments WHERE course_id=? ORDER BY created_at DESC LIMIT 500').bind(courseId).all();
   return json({comments:comments.results});
  }
  if(reviewsRoute&&method==='PATCH'&&reviewsRoute[2]){
   const b=await readBody(request);if(!['open','resolved'].includes(b.status))return fail('Choose open or resolved');
   const time=b.status==='resolved'?new Date().toISOString():null;
   const updated=await env.DB.prepare('UPDATE review_comments SET status=?,resolved_at=? WHERE id=? AND course_id=?').bind(b.status,time,reviewsRoute[2],courseId).run();
   return updated.meta.changes?json({ok:true}):fail('Comment not found',404);
  }
  return fail('Method not allowed',405);
 }
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