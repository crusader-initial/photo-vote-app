import type { Express } from "express";
import { Router } from "express";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { storagePut } from "./storage";

// Hardcoded admin credentials – change these before deploying to production
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "photoAdmin2026";
const ADMIN_OPEN_ID = "admin:operator";

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>投票卡管理后台</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100vh;display:flex;align-items:center;justify-content:center}
.container{width:100%;max-width:540px;padding:20px}
.card{background:#fff;border-radius:14px;box-shadow:0 2px 20px rgba(0,0,0,.08);padding:32px}
h1{font-size:21px;color:#1a1a2e;text-align:center;margin-bottom:4px}
.subtitle{color:#888;font-size:14px;text-align:center;margin-bottom:28px}
.field{margin-bottom:16px}
label{display:block;font-size:13px;font-weight:500;color:#333;margin-bottom:6px}
label .opt{color:#9ca3af;font-weight:400}
input[type=text],input[type=password],textarea{width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;transition:border-color .2s;font-family:inherit}
input:focus,textarea:focus{border-color:#4f46e5}
textarea{resize:vertical;min-height:80px}
.btn{width:100%;padding:12px;background:#4f46e5;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}
.btn:hover{background:#4338ca}
.btn:disabled{background:#a5b4fc;cursor:not-allowed}
.msg-error{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px}
.msg-ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;padding:10px 12px;border-radius:8px;font-size:13px;margin-bottom:14px}
.hidden{display:none!important}
.top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.top-title{font-size:16px;font-weight:600;color:#1a1a2e}
.logout-btn{font-size:13px;color:#9ca3af;cursor:pointer;background:none;border:none;padding:0}
.logout-btn:hover{color:#ef4444}
.photo-zone{border:2px dashed #d1d5db;border-radius:10px;padding:24px 16px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;user-select:none}
.photo-zone:hover,.photo-zone.drag-over{border-color:#4f46e5;background:#f5f3ff}
.photo-zone p{color:#9ca3af;font-size:14px;line-height:1.6}
.photo-zone p span{color:#4f46e5;font-weight:500}
.photo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.photo-item{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#f3f4f6}
.photo-item img{width:100%;height:100%;object-fit:cover;display:block}
.del-btn{position:absolute;top:4px;right:4px;width:22px;height:22px;background:rgba(0,0,0,.55);border:none;border-radius:50%;color:#fff;cursor:pointer;font-size:14px;line-height:22px;text-align:center;padding:0}
.del-btn:hover{background:rgba(239,68,68,.85)}
.hint{font-size:12px;color:#9ca3af;margin-top:6px}
.progress-wrap{height:4px;background:#e0e7ff;border-radius:2px;margin-bottom:14px;overflow:hidden}
.progress-bar{height:100%;background:#4f46e5;width:0;transition:width .35s;border-radius:2px}
.count-badge{display:inline-block;padding:2px 8px;background:#e0e7ff;color:#4f46e5;border-radius:12px;font-size:12px;font-weight:600;margin-left:6px}
</style>
</head>
<body>
<div class="container">

  <!-- Login panel -->
  <div id="loginBox" class="card">
    <h1>📸 投票卡管理后台</h1>
    <p class="subtitle">工作人员专用 · 上传官网投票卡片</p>
    <div id="loginErr" class="msg-error hidden"></div>
    <div class="field">
      <label>用户名</label>
      <input id="uname" type="text" placeholder="请输入用户名" autocomplete="username" />
    </div>
    <div class="field">
      <label>密码</label>
      <input id="upass" type="password" placeholder="请输入密码" autocomplete="current-password" />
    </div>
    <button class="btn" id="loginBtn" onclick="doLogin()">登 录</button>
  </div>

  <!-- Upload panel -->
  <div id="uploadBox" class="card hidden">
    <div class="top-bar">
      <span class="top-title">📸 上传投票卡片</span>
      <button class="logout-btn" onclick="doLogout()">退出登录</button>
    </div>
    <div id="uploadMsg" class="hidden"></div>
    <div id="progressWrap" class="progress-wrap hidden"><div class="progress-bar" id="progressBar"></div></div>

    <div class="field">
      <label>标题 <span class="opt">（选填，最多 14 字）</span></label>
      <input id="cardTitle" type="text" maxlength="14" placeholder="不填则无标题" />
    </div>
    <div class="field">
      <label>描述 <span class="opt">（选填）</span></label>
      <textarea id="cardDesc" maxlength="2000" placeholder="可添加说明文字…"></textarea>
    </div>
    <div class="field">
      <label>
        投票图片 <span class="opt">（必选，2–4 张）</span>
        <span class="count-badge" id="countBadge">0 / 4</span>
      </label>
      <div class="photo-zone" id="photoZone"
        onclick="document.getElementById('photoInput').click()"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="handleDrop(event)">
        <p>点击或将图片<strong>拖拽</strong>到此处<br><span>选择图片</span></p>
      </div>
      <div class="photo-grid" id="photoGrid"></div>
      <p class="hint">支持 JPG / PNG / WEBP，最多 4 张</p>
      <input id="photoInput" type="file" accept="image/*" multiple style="display:none" onchange="handleFileSelect(event)" />
    </div>
    <button class="btn" id="uploadBtn" onclick="doUpload()">上传投票卡片</button>
  </div>

</div>
<script>
var photos=[];

async function checkAuth(){
  try{
    var r=await fetch('/api/admin/me',{credentials:'include'});
    var d=await r.json();
    if(d.loggedIn) showUpload();
  }catch(e){}
}
checkAuth();

function showUpload(){
  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('uploadBox').classList.remove('hidden');
}
function showLogin(){
  document.getElementById('uploadBox').classList.add('hidden');
  document.getElementById('loginBox').classList.remove('hidden');
}

async function doLogin(){
  var u=document.getElementById('uname').value.trim();
  var p=document.getElementById('upass').value;
  var err=document.getElementById('loginErr');
  var btn=document.getElementById('loginBtn');
  err.classList.add('hidden');
  if(!u||!p){err.textContent='请输入用户名和密码';err.classList.remove('hidden');return;}
  btn.disabled=true;btn.textContent='登录中…';
  try{
    var r=await fetch('/api/admin/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    var d=await r.json();
    if(d.success){showUpload();}
    else{err.textContent=d.error||'登录失败';err.classList.remove('hidden');}
  }catch(e){err.textContent='网络错误，请重试';err.classList.remove('hidden');}
  finally{btn.disabled=false;btn.textContent='登 录';}
}

async function doLogout(){
  await fetch('/api/admin/logout',{method:'POST',credentials:'include'}).catch(function(){});
  photos.forEach(function(p){URL.revokeObjectURL(p.objectUrl);});
  photos=[];renderPhotos();
  document.getElementById('cardTitle').value='';
  document.getElementById('cardDesc').value='';
  document.getElementById('uploadMsg').classList.add('hidden');
  showLogin();
}

document.getElementById('upass').addEventListener('keydown',function(e){if(e.key==='Enter')doLogin();});

function handleFileSelect(e){addFiles(Array.from(e.target.files));e.target.value='';}
function handleDrop(e){
  e.preventDefault();
  document.getElementById('photoZone').classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files).filter(function(f){return f.type.startsWith('image/');}));
}

function addFiles(files){
  var remaining=4-photos.length;
  var toAdd=files.slice(0,remaining);
  toAdd.forEach(function(file){
    var reader=new FileReader();
    reader.onload=function(ev){
      var dataUrl=ev.target.result;
      var mime=file.type||'image/jpeg';
      var b64=dataUrl.split(',')[1];
      photos.push({base64:b64,mimeType:mime,objectUrl:URL.createObjectURL(file)});
      renderPhotos();
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotos(){
  var grid=document.getElementById('photoGrid');
  grid.innerHTML='';
  photos.forEach(function(p,i){
    var div=document.createElement('div');
    div.className='photo-item';
    div.innerHTML='<img src="'+p.objectUrl+'" /><button class="del-btn" onclick="removePhoto('+i+')">×</button>';
    grid.appendChild(div);
  });
  document.getElementById('countBadge').textContent=photos.length+' / 4';
}

function removePhoto(idx){
  URL.revokeObjectURL(photos[idx].objectUrl);
  photos.splice(idx,1);
  renderPhotos();
}

function setMsg(text,type){
  var el=document.getElementById('uploadMsg');
  el.className=type==='ok'?'msg-ok':'msg-error';
  el.textContent=text;
  el.classList.remove('hidden');
  if(type==='ok') setTimeout(function(){el.classList.add('hidden');},6000);
}

async function doUpload(){
  var title=document.getElementById('cardTitle').value.trim();
  var desc=document.getElementById('cardDesc').value.trim();
  var btn=document.getElementById('uploadBtn');
  var pw=document.getElementById('progressWrap');
  var pb=document.getElementById('progressBar');
  document.getElementById('uploadMsg').classList.add('hidden');
  if(photos.length<2){setMsg('请至少选择 2 张图片','err');return;}
  btn.disabled=true;btn.textContent='上传中…';
  pw.classList.remove('hidden');pb.style.width='25%';
  try{
    pb.style.width='55%';
    var body={photos:photos.map(function(p){return{base64:p.base64,mimeType:p.mimeType};})};
    if(title) body.title=title;
    if(desc) body.description=desc;
    var r=await fetch('/api/admin/create-card',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    pb.style.width='90%';
    var d=await r.json();
    if(d.success){
      pb.style.width='100%';
      setTimeout(function(){pw.classList.add('hidden');pb.style.width='0';},700);
      setMsg('✓ 上传成功！卡片 ID: '+d.cardId,'ok');
      photos.forEach(function(p){URL.revokeObjectURL(p.objectUrl);});
      photos=[];renderPhotos();
      document.getElementById('cardTitle').value='';
      document.getElementById('cardDesc').value='';
    }else{
      pb.style.width='0';pw.classList.add('hidden');
      setMsg(d.error||'上传失败，请重试','err');
    }
  }catch(e){
    pb.style.width='0';pw.classList.add('hidden');
    setMsg('网络错误：'+e.message,'err');
  }finally{
    btn.disabled=false;btn.textContent='上传投票卡片';
  }
}
</script>
</body>
</html>`;

export function registerAdminRoutes(app: Express): void {
  const router = Router();

  // Serve the admin HTML page
  router.get("/admin", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(ADMIN_HTML);
  });

  // Check if current session is an authenticated admin
  router.get("/api/admin/me", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.openId === ADMIN_OPEN_ID) {
        res.json({ loggedIn: true });
      } else {
        res.json({ loggedIn: false });
      }
    } catch {
      res.json({ loggedIn: false });
    }
  });

  // Login with hardcoded credentials
  router.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      res.status(401).json({ success: false, error: "用户名或密码错误" });
      return;
    }

    // Ensure the admin user exists in the database
    await db.upsertUser({
      openId: ADMIN_OPEN_ID,
      name: "Admin",
      lastSignedIn: new Date(),
    });

    const token = await sdk.createSessionToken(ADMIN_OPEN_ID, { name: "Admin" });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, token, {
      ...cookieOptions,
      sameSite: "lax",  // lax works over HTTP; "none" requires HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ success: true });
  });

  // Logout – clear the session cookie
  router.post("/api/admin/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Create a voting card with photos (admin only)
  router.post("/api/admin/create-card", async (req, res) => {
    // Authenticate and verify this is the admin account
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ success: false, error: "请先登录" });
      return;
    }

    if (user.openId !== ADMIN_OPEN_ID) {
      res.status(403).json({ success: false, error: "无权限" });
      return;
    }

    const { title, description, photos } = req.body as {
      title?: string;
      description?: string;
      photos?: Array<{ base64: string; mimeType: string }>;
    };

    if (!photos || photos.length < 2 || photos.length > 4) {
      res.status(400).json({ success: false, error: "请上传 2–4 张图片" });
      return;
    }

    const cardId = await db.createCard({
      userId: user.id,
      title: title || null,
      description: description || null,
    });

    try {
      const photoRecords = await Promise.all(
        photos.map(async (photo, index) => {
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const extension = photo.mimeType.split("/")[1] || "jpg";
          const fileKey = `cards/${cardId}/photo-${index}-${randomSuffix}.${extension}`;
          const buffer = Buffer.from(photo.base64, "base64");
          const { url } = await storagePut(fileKey, buffer, photo.mimeType);
          return { cardId, url, photoIndex: index };
        }),
      );

      await db.createPhotos(photoRecords);
    } catch (err) {
      await db.deleteCard(cardId, user.id);
      const message = err instanceof Error ? err.message : "图片上传失败";
      res.status(500).json({ success: false, error: message });
      return;
    }

    res.json({ success: true, cardId });
  });

  app.use(router);
}
