const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const dataDir = path.join(root, 'data');
const dbFile = path.join(dataDir, 'users.json');
const env = Object.fromEntries((process.env.ENV_FILE ? [] : []));
for (const line of (()=>{try{return fsSync.readFileSync(path.join(root,'.env'),'utf8')}catch{return ''}})().split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/); if (match) env[match[1].trim()] = match[2].trim();
}
const cfg = {port: Number(env.PORT || process.env.PORT || 3000), appUrl: env.APP_URL || process.env.APP_URL || 'http://localhost:3000', resendKey: env.RESEND_API_KEY || process.env.RESEND_API_KEY, from: env.MAIL_FROM || process.env.MAIL_FROM, adminEmail:'admin@cyberquest.demo', adminPassword:'admin123'};
const sessions = new Map();
const b64 = value => Buffer.from(value).toString('base64url');
const id = () => crypto.randomBytes(32).toString('base64url');
const hash = password => new Promise((resolve, reject) => crypto.scrypt(password, crypto.randomBytes(16), 64, (e, key) => e ? reject(e) : resolve(`${key.toString('hex')}`)));
const hashWithSalt = password => new Promise((resolve, reject) => { const salt = crypto.randomBytes(16).toString('hex'); crypto.scrypt(password, salt, 64, (e, key) => e ? reject(e) : resolve(`${salt}:${key.toString('hex')}`)); });
const verify = (password, saved) => new Promise((resolve, reject) => { const [salt, key] = saved.split(':'); crypto.scrypt(password, salt, 64, (e, out) => e ? reject(e) : resolve(crypto.timingSafeEqual(Buffer.from(key, 'hex'), out))); });
async function readDb() { await fs.mkdir(dataDir, {recursive:true}); try { return JSON.parse(await fs.readFile(dbFile, 'utf8')); } catch { return {users:[]}; } }
async function writeDb(db) { await fs.writeFile(dbFile, JSON.stringify(db, null, 2)); }
function json(res, status, body, cookie) { res.writeHead(status, {'Content-Type':'application/json', ...(cookie ? {'Set-Cookie':cookie} : {})}); res.end(JSON.stringify(body)); }
function cookie(req, name) { return (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1); }
function publicUser(user) { return {id:user.id, name:user.name, email:user.email, role:user.role}; }
async function sendVerification(user) {
  if (!cfg.resendKey || !cfg.from) throw new Error('El proveedor de correo no está configurado.');
  const link = `${cfg.appUrl}/api/verify?token=${encodeURIComponent(user.verifyToken)}`;
  const response = await fetch('https://api.resend.com/emails', {method:'POST',headers:{Authorization:`Bearer ${cfg.resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:cfg.from,to:[user.email],subject:'Verificá tu cuenta de CyberQuest',html:`<h2>Bienvenido/a a CyberQuest</h2><p>Confirmá tu correo para activar tu cuenta:</p><p><a href="${link}">Verificar mi cuenta</a></p>`})});
  if (!response.ok) throw new Error('No se pudo enviar el correo de verificación.');
}
async function bootstrapAdmin() { if (!cfg.adminEmail || !cfg.adminPassword) return; const db=await readDb(),existing=db.users.find(u=>u.email===cfg.adminEmail); if(existing){existing.name='Administrador';existing.role='admin';existing.verified=true;existing.password=await hashWithSalt(cfg.adminPassword);await writeDb(db);return}db.users.push({id:id(),name:'Administrador',email:cfg.adminEmail,password:await hashWithSalt(cfg.adminPassword),role:'admin',verified:true,createdAt:new Date().toISOString()}); await writeDb(db); }
async function body(req) { let raw=''; for await (const chunk of req) raw+=chunk; return JSON.parse(raw || '{}'); }
function serveFile(res, url) { const safe=url==='/'?'index.html':decodeURIComponent(url).replace(/^\/+/, ''); const file=path.resolve(root,safe); if (!file.startsWith(root)) return json(res,403,{error:'No autorizado'}); const ext=path.extname(file); const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'}; fs.readFile(file).then(data=>{res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(data)}).catch(()=>json(res,404,{error:'No encontrado'})); }
function requireAdmin(req,res){const session=sessions.get(cookie(req,'cq_session'));if(session?.user?.role!=='admin'){json(res,403,{error:'Se requiere autorización de administrador.'});return null}return session.user}
const server=http.createServer(async(req,res)=>{try { const url=new URL(req.url,cfg.appUrl); if(req.method==='GET'&&url.pathname==='/api/session'){const s=sessions.get(cookie(req,'cq_session'));return json(res,200,{user:s?.user||null});}
if(req.method==='POST'&&url.pathname==='/api/register'){const {name,email,password}=await body(req), normalized=String(email||'').trim().toLowerCase();if(!name||!/^\S+@\S+\.\S+$/.test(normalized)||String(password).length<8)return json(res,400,{error:'Completá nombre, email válido y una contraseña de al menos 8 caracteres.'});const db=await readDb();if(db.users.some(u=>u.email===normalized))return json(res,409,{error:'Ese email ya está registrado. Iniciá sesión.'});const user={id:id(),name:String(name).trim(),email:normalized,password:await hashWithSalt(password),role:'user',verified:true,createdAt:new Date().toISOString()};db.users.push(user);await writeDb(db);const token=id();sessions.set(token,{user:publicUser(user)});return json(res,201,{user:publicUser(user),message:'Cuenta creada. Ya ingresaste a CyberQuest.'},`cq_session=${token}; HttpOnly; SameSite=Lax; Path=/`);}
if(req.method==='GET'&&url.pathname==='/api/verify'){const db=await readDb(),user=db.users.find(u=>u.verifyToken===url.searchParams.get('token'));if(!user){res.writeHead(302,{Location:'/?verification=error'});return res.end()}user.verified=true;delete user.verifyToken;await writeDb(db);res.writeHead(302,{Location:'/?verification=ok'});return res.end();}
if(req.method==='POST'&&url.pathname==='/api/login'){const {email,password,remember}=await body(req),db=await readDb(),user=db.users.find(u=>u.email===String(email||'').trim().toLowerCase());if(!user||!await verify(String(password||''),user.password))return json(res,401,{error:'Email o contraseña incorrectos.'});const token=id();sessions.set(token,{user:publicUser(user)});const lifetime=remember?'; Max-Age=2592000':'';return json(res,200,{user:publicUser(user)},`cq_session=${token}; HttpOnly; SameSite=Lax; Path=/${lifetime}`);}
if(req.method==='POST'&&url.pathname==='/api/logout'){sessions.delete(cookie(req,'cq_session'));return json(res,200,{ok:true},'cq_session=; HttpOnly; Max-Age=0; Path=/');}
if(req.method==='POST'&&url.pathname==='/api/admin/promote'){if(!requireAdmin(req,res))return;const {email}=await body(req),db=await readDb(),user=db.users.find(u=>u.email===String(email||'').trim().toLowerCase());if(!user)return json(res,404,{error:'El usuario debe registrarse antes de ser autorizado.'});if(!user.verified)return json(res,400,{error:'El usuario debe verificar su email antes de ser Admin.'});user.role='admin';await writeDb(db);for(const session of sessions.values())if(session.user.id===user.id)session.user.role='admin';return json(res,200,{message:`${user.name} ahora es Administrador.`});}
serveFile(res,url.pathname);}catch(error){console.error(error);json(res,500,{error:error.message||'Error interno'});}});
(async()=>{await bootstrapAdmin();server.listen(cfg.port,()=>console.log(`CyberQuest disponible en ${cfg.appUrl}`));})();
