const DEFAULT_URL='https://myxyqulfmzlkncpvuxmn.supabase.co';
const state={url:localStorage.getItem('am_supabase_url')||DEFAULT_URL,key:localStorage.getItem('am_supabase_key')||'',email:localStorage.getItem('am_email')||'',client:null,session:null,data:null,lastSync:null};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function entityData(x){
  if(!x || typeof x!=='object') return {};
  const d=(x.data && typeof x.data==='object' && !Array.isArray(x.data)) ? x.data : x;
  return d;
}
function flattenMeasurements(projects){
  const out=[];
  const seen=new Set();
  for(const rawProject of (projects||[])){
    const project=entityData(rawProject);
    const projectName=project.name||rawProject.name||'';
    const projectNo=project.projectNo||rawProject.projectNo||'';
    const positions=Array.isArray(project.positions)?project.positions:[];
    for(const rawPosition of positions){
      const position=entityData(rawPosition);
      const positionNo=position.no||rawPosition.no||'';
      const positionShort=position.short||rawPosition.short||'';
      const measurements=Array.isArray(position.measurements)?position.measurements:[];
      for(const rawM of measurements){
        const m=entityData(rawM);
        const key=m.syncId||rawM.syncId||m.id||rawM.id||`${projectName}|${positionNo}|${out.length}`;
        if(seen.has(String(key))) continue;
        seen.add(String(key));
        out.push({
          ...m,
          projectName,
          projectNo,
          positionNo,
          positionShort,
          line:m.line??rawM.line??'',
          room:m.room??rawM.room??'',
          qty:m.qty??m.q??m.quantity??rawM.qty??rawM.q??rawM.quantity??'',
          updatedAt:m.updatedAt??rawM.updatedAt??position.updatedAt??project.updatedAt??''
        });
      }
    }
    // Compatibility with states where measurements were stored directly on the project.
    const direct=Array.isArray(project.measurements)?project.measurements:[];
    for(const rawM of direct){
      const m=entityData(rawM);
      const key=m.syncId||rawM.syncId||m.id||rawM.id||`${projectName}|direct|${out.length}`;
      if(seen.has(String(key))) continue;
      seen.add(String(key));
      out.push({...m,projectName,projectNo,positionNo:m.positionNo||'',positionShort:'',line:m.line??'',room:m.room??'',qty:m.qty??m.q??m.quantity??'',updatedAt:m.updatedAt??project.updatedAt??''});
    }
  }
  return out;
}
function arrays(){
  const d=state.data||{};
  const projects=d.projects||[];
  const nested=flattenMeasurements(projects);
  const measurements=(Array.isArray(d.measurements)&&d.measurements.length)?d.measurements:nested;
  return {projects,lvCatalogs:d.lvCatalogs||[],savedPlans:d.savedPlans||[],measurements,changeLog:d.changeLog||[]}
}
function msg(text,ok=false){$('loginMsg').innerHTML=`<span class="${ok?'ok':'err'}">${esc(text)}</span>`}
function setLoggedIn(on){$('loginView').hidden=on;$('appView').hidden=!on;$('accountBadge').innerHTML=on?`<span class="badge">${esc(state.email)}</span>`:''}
function saveConfig(){state.url=$('projectUrl').value.trim().replace(/\/$/,'');state.key=$('publishableKey').value.trim();localStorage.setItem('am_supabase_url',state.url);localStorage.setItem('am_supabase_key',state.key);localStorage.setItem('am_email',state.email)}
function initClient(){if(!state.url||!state.key)throw Error('Brak Supabase URL lub Publishable Key.');if(!window.supabase)throw Error('Nie załadowano biblioteki Supabase.');state.client=window.supabase.createClient(state.url,state.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return state.client}
async function loadCloud(){const{data,error}=await state.client.from('cloud_state').select('state,updated_at').eq('user_id',state.session.user.id).maybeSingle();if(error)throw error;state.data=data?.state||{projects:[],lvCatalogs:[],savedPlans:[],measurements:[],changeLog:[],syncQueue:[],fileManifest:[]};state.lastSync=data?.updated_at||null}
async function saveCloud(){const payload={user_id:state.session.user.id,state:state.data||{},updated_at:Date.now()};const{error}=await state.client.from('cloud_state').upsert(payload,{onConflict:'user_id'});if(error)throw error;state.lastSync=payload.updated_at}
async function auth(mode){try{saveConfig();state.email=$('email').value.trim().toLowerCase();const password=$('password').value;if(!state.email||!password||!state.url||!state.key)throw Error('Podaj e-mail, hasło, Supabase URL i Publishable Key.');const c=initClient();if(mode==='signup'){const r=await c.auth.signUp({email:state.email,password});if(r.error)throw r.error;if(!r.data.session){msg('Konto utworzone. Jeśli Supabase wymaga potwierdzenia e-mail, potwierdź adres przed logowaniem.',true);return}state.session=r.data.session}else{const r=await c.auth.signInWithPassword({email:state.email,password});if(r.error)throw r.error;state.session=r.data.session}state.email=state.session.user.email||state.email;localStorage.setItem('am_email',state.email);await loadCloud();setLoggedIn(true);view('dashboard')}catch(e){msg(e.message||'Błąd logowania')}}
async function restore(){try{if(!state.key){$('projectUrl').value=state.url;$('publishableKey').value='';if(state.email)$('email').value=state.email;return}initClient();const r=await state.client.auth.getSession();if(r.error||!r.data.session)return;state.session=r.data.session;state.email=state.session.user.email||state.email;$('email').value=state.email;$('projectUrl').value=state.url;$('publishableKey').value=state.key;await loadCloud();setLoggedIn(true);view('dashboard')}catch(e){console.warn(e)}}
function renderDashboard(){const d=arrays();$('content').innerHTML=`<h2>Pulpit</h2><div class="grid"><section class="card"><div class="muted">Projekty</div><div class="stat">${d.projects.length}</div></section><section class="card"><div class="muted">LV</div><div class="stat">${d.lvCatalogs.length}</div></section><section class="card"><div class="muted">Plany</div><div class="stat">${d.savedPlans.length}</div></section><section class="card"><div class="muted">Pomiary</div><div class="stat">${d.measurements.length}</div></section></div><section class="card" style="margin-top:14px"><h3>Chmura</h3><p>Użytkownik: <b>${esc(state.email)}</b></p><p>Ostatnia synchronizacja: <b>${state.lastSync?new Date(Number(state.lastSync)).toLocaleString():'brak'}</b></p><button id="dashSync">☁ Synchronizuj z Supabase</button><p id="dashMsg" class="muted"></p></section>`;$('dashSync').onclick=sync}
function rows(items,fields){return`<div class="tableWrap"><table><thead><tr>${fields.map(x=>`<th>${esc(x[1])}</th>`).join('')}</tr></thead><tbody>${items.map(x=>`<tr>${fields.map(f=>`<td>${esc(typeof f[0]==='function'?f[0](x):x[f[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function renderList(type){const d=arrays();let title,items,fields;if(type==='projects'){title='Projekty';items=d.projects;fields=[['name','Nazwa'],['address','Adres'],['client','Klient'],['updatedAt','Aktualizacja']]}else if(type==='lv'){title='Katalog LV';items=d.lvCatalogs;fields=[['name','Nazwa'],['building','Budynek'],['area','Obszar'],['updatedAt','Aktualizacja']]}else if(type==='plans'){title='Plany';items=d.savedPlans;fields=[['name','Nazwa'],['building','Budynek'],['area','Obszar'],['floor','Piętro'],['updatedAt','Aktualizacja']]}else{title='Pomiary';items=d.measurements;fields=[['projectName','Budowa'],['positionNo','LV'],['line','Element'],['room','Pomieszczenie'],['qty','Ilość'],['updatedAt','Aktualizacja']]};$('content').innerHTML=`<h2>${title}</h2><div class="toolbar"><button id="refresh">Odśwież z chmury</button></div>${items.length?rows(items,fields):'<section class="card muted">Brak danych w zapisanym stanie chmury.</section>'}`;$('refresh').onclick=async()=>{try{await loadCloud();renderList(type)}catch(e){alert('Błąd: '+e.message)}}}
async function signedUrl(path){const r=await state.client.storage.from('aufmass-files').createSignedUrl(path,3600);if(r.error)throw r.error;return r.data.signedUrl}
async function listFiles(){const root=state.session.user.id;const out=[];const folders=['photos','plans'];for(const folder of folders){const r=await state.client.storage.from('aufmass-files').list(`${root}/${folder}`,{limit:1000,sortBy:{column:'name',order:'asc'}});if(r.error)throw r.error;for(const f of(r.data||[])){if(!f.name||f.id===null)continue;out.push({path:`${root}/${folder}/${f.name}`,kind:folder,name:f.name,size:f.metadata?.size||0,updatedAt:f.updated_at||f.created_at})}}return out}
async function renderFiles(){ $('content').innerHTML='<h2>Zdjęcia i plany</h2><section class="card">Ładowanie plików z Supabase Storage…</section>';try{const files=await listFiles();$('content').innerHTML=`<h2>Zdjęcia i plany</h2><section class="card"><p class="muted">Pliki z prywatnego bucketu <b>aufmass-files</b>.</p>${files.length?files.map((f,i)=>`<div class="file"><b>${esc(f.name)}</b><br><span class="muted">${esc(f.kind)} · ${esc(f.size)} B · ${esc(f.updatedAt||'')}</span> <button data-file="${i}">Otwórz</button></div>`).join(''):'<span class="muted">Brak plików.</span>'}</section>`;document.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{try{const u=await signedUrl(files[+b.dataset.file].path);window.open(u,'_blank','noopener')}catch(e){alert('Błąd pliku: '+e.message)}})}catch(e){$('content').innerHTML=`<h2>Zdjęcia i plany</h2><section class="card"><span class="err">Błąd Storage: ${esc(e.message)}</span></section>`}}
function renderSync(){const q=state.data?.syncQueue||[];$('content').innerHTML=`<h2>Synchronizacja</h2><section class="card"><p>Supabase: <b>${esc(state.url)}</b></p><p>Użytkownik: <b>${esc(state.email)}</b></p><p>Elementy w kolejce zapisane w chmurze: <b>${q.length}</b></p><p>Ostatnia synchronizacja: <b>${state.lastSync?new Date(Number(state.lastSync)).toLocaleString():'brak'}</b></p><button id="syncNow">☁ Synchronizuj teraz</button><p id="syncMsg" class="muted"></p></section>`;$('syncNow').onclick=sync}
async function sync(){try{await loadCloud();await saveCloud();if($('syncMsg'))$('syncMsg').innerHTML='<span class="ok">Synchronizacja zakończona.</span>';if($('dashMsg'))$('dashMsg').innerHTML='<span class="ok">Synchronizacja zakończona.</span>';view('sync')}catch(e){const m='Błąd synchronizacji: '+e.message;if($('syncMsg'))$('syncMsg').innerHTML=`<span class="err">${esc(m)}</span>`;else alert(m)}}
function view(v){if(v==='dashboard')renderDashboard();else if(v==='files')renderFiles();else if(v==='sync')renderSync();else renderList(v)}
$('loginBtn').onclick=()=>auth('login');$('signupBtn').onclick=()=>auth('signup');$('logoutBtn').onclick=async()=>{if(state.client)await state.client.auth.signOut();state.session=null;state.data=null;setLoggedIn(false)};document.querySelectorAll('nav [data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
$('email').value=state.email;$('projectUrl').value=state.url;$('publishableKey').value=state.key;restore();
