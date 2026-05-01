// ══ SUPABASE CONFIG ══════════════════════════════════════════════════════════
var SUPABASE_URL = 'https://tabobhdntfnedwjrqboc.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYm9iaGRudGZuZWR3anJxYm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTcyMTUsImV4cCI6MjA5MzE5MzIxNX0.Q7p0cd7aseU08JEwrQ2GHpbYQukbctRJlM1A3Y4FTaA';
// ═════════════════════════════════════════════════════════════════════════════

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var currentUser = null;
var txs = [], filter = 'all', dateRef = 'date';
var editingId = null;
var settings = { name:'', vat:'', key:'', gclientid:'', gfolderid:'' };
var filterPeriods = new Set(['all']);
var filterYear = 'all';
var filterPeriodsS = new Set(['all']);
var filterYearS = 'all';
var currentRegime = 'malta-se';

// ── AUTH ──────────────────────────────────────────────────────────────────────
function doLogin() {
  var email = document.getElementById('lock-email').value.trim();
  var pwd   = document.getElementById('lock-input').value;
  var btn   = document.getElementById('lock-btn');
  if (!email || !pwd) { showLockError('Inserisci email e password.'); return; }
  btn.disabled = true; btn.textContent = 'Accesso...';
  sb.auth.signInWithPassword({ email:email, password:pwd }).then(function(r) {
    btn.disabled = false; btn.textContent = 'Accedi';
    if (r.error) { showLockError('Email o password errata'); return; }
    currentUser = r.data.user; showApp();
  });
}
function doSignUp(e) {
  e.preventDefault();
  var email = document.getElementById('lock-email').value.trim();
  var pwd   = document.getElementById('lock-input').value;
  if (!email || !pwd) { showLockError('Inserisci email e password.'); return; }
  sb.auth.signUp({ email:email, password:pwd }).then(function(r) {
    if (r.error) { showLockError('Errore: ' + r.error.message); return; }
    showLockError('Account creato! Clicca Accedi.');
  });
}
function doLogout() {
  sb.auth.signOut().then(function() {
    currentUser = null; txs = [];
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'flex';
    document.getElementById('lock-email').value = '';
    document.getElementById('lock-input').value = '';
  });
}
function showLockError(msg) {
  var el = document.getElementById('lock-error');
  el.textContent = msg; el.style.display = '';
  setTimeout(function(){ el.style.display='none'; }, 5000);
}
function showApp() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('app-content').style.display = '';
  var b = document.getElementById('user-email-badge');
  if (b && currentUser) b.textContent = currentUser.email;
  loadSettings().then(function(){ loadInvoices(); });
  updateAmountSections();
  showTab('carica');
}

// ── DB HELPERS ────────────────────────────────────────────────────────────────
function txToDb(t) {
  return { user_id:currentUser.id, date:t.date, service_month:t.serviceMonth,
    type:t.type, invoice_num:t.invoice, counterparty:t.counterparty, category:t.category,
    country:t.country, vat_id:t.vatId, address:t.address, description:t.description,
    entrate_net:t.entrateNet||0, entrate_vat:t.entrateVat||0, entrate_total:t.entrateTotal||0,
    uscite_net:t.usciteNet||0, uscite_vat:t.usciteVat||0, uscite_total:t.usciteTotal||0, notes:t.notes };
}
function dbToTx(r) {
  return { id:r.id, type:r.type, date:r.date, serviceMonth:r.service_month,
    invoice:r.invoice_num, counterparty:r.counterparty, category:r.category,
    country:r.country, vatId:r.vat_id, address:r.address, description:r.description,
    entrateNet:parseFloat(r.entrate_net)||0, entrateVat:parseFloat(r.entrate_vat)||0,
    entrateTotal:parseFloat(r.entrate_total)||0, usciteNet:parseFloat(r.uscite_net)||0,
    usciteVat:parseFloat(r.uscite_vat)||0, usciteTotal:parseFloat(r.uscite_total)||0, notes:r.notes };
}

// ── DATA FUNCTIONS ────────────────────────────────────────────────────────────
function loadInvoices() {
  return sb.from('invoices').select('*').order('date',{ascending:true}).then(function(r) {
    if (r.error) { console.error(r.error); return; }
    txs = (r.data||[]).map(dbToTx);
    populateYearFilters();
    renderTable(); renderStats('stats-a'); updateCount();
  });
}
function saveTransaction() {
  var t = { type:v('f-type'), date:v('f-date'), serviceMonth:v('f-service-month'),
    invoice:v('f-invoice'), counterparty:v('f-counterparty'), category:v('f-category'),
    country:v('f-country'), vatId:v('f-vatid'), address:v('f-address'), description:v('f-description'),
    entrateNet:num('f-en-net'), entrateVat:num('f-en-vat'), entrateTotal:num('f-en-tot'),
    usciteNet:num('f-us-net'), usciteVat:num('f-us-vat'), usciteTotal:num('f-us-tot'), notes:v('f-notes') };
  if (!t.counterparty) { showMsg('Inserisci il Counterparty.','error'); return; }
  sb.from('invoices').insert(txToDb(t)).select().then(function(r) {
    if (r.error) { showMsg('Errore: '+r.error.message,'error'); return; }
    var newId = r.data[0].id;
    if (driveCurrentFile) {
      var fc=driveCurrentFile;
      toB64(fc).then(function(b64){ try{localStorage.setItem('inv_file_'+newId,JSON.stringify({name:fc.name,type:fc.type||'application/octet-stream',b64:b64}));}catch(e){} });
      if (driveIsReady()) {
        var fname=t.date+'_'+(t.invoice||'fattura').replace(/[\/\:*?"<>|]/g,'-')+'_'+t.counterparty.slice(0,25).replace(/[\/\:*?"<>|]/g,'-')+'.'+fc.name.split('.').pop();
        setDriveUploadStatus(true,'Upload Drive...',null);
        driveUploadFile(fc,fname,function(ok,info){ok?setDriveUploadStatus(true,'Drive OK',true):setDriveUploadStatus(true,'Drive errore: '+info,false);});
      }
    }
    driveCurrentFile=null; loadInvoices(); showMsg('Transazione salvata!','success');
    setState('upload'); document.getElementById('file-input').value='';
  });
}
function delTx(id) {
  if (!confirm('Eliminare?')) return;
  sb.from('invoices').delete().eq('id',id).then(function(r) {
    if (r.error) { alert('Errore: '+r.error.message); return; }
    try{localStorage.removeItem('inv_file_'+id);}catch(e){} loadInvoices();
  });
}
function saveEdit() {
  var id=editingId; if(!id) return;
  var cp=eV('e-counterparty'); if(!cp){alert('Inserisci il Counterparty.');return;}
  var t={id:id,type:eV('e-type'),date:eV('e-date'),serviceMonth:eV('e-service-month'),
    invoice:eV('e-invoice'),counterparty:cp,category:eV('e-category'),country:eV('e-country'),
    vatId:eV('e-vatid'),address:eV('e-address'),description:eV('e-description'),
    entrateNet:eNum('e-en-net'),entrateVat:eNum('e-en-vat'),entrateTotal:eNum('e-en-tot'),
    usciteNet:eNum('e-us-net'),usciteVat:eNum('e-us-vat'),usciteTotal:eNum('e-us-tot'),notes:eV('e-notes')};
  var row=txToDb(t); delete row.user_id;
  sb.from('invoices').update(row).eq('id',id).then(function(r) {
    if(r.error){alert('Errore: '+r.error.message);return;}
    closeEditModal(); loadInvoices();
    var m=document.getElementById('msg-area');
    if(m){m.innerHTML='<div class="msg msg-success">Fattura aggiornata!</div>';setTimeout(function(){m.innerHTML='';},4000);}
  });
}
function clearAll() {
  if(!confirm('Cancellare TUTTE le transazioni? Irreversibile!')) return;
  sb.from('invoices').delete().eq('user_id',currentUser.id).then(function(r) {
    if(r.error){alert('Errore: '+r.error.message);return;}
    txs=[]; renderTable(); renderStats('stats-a'); updateCount();
  });
}

// ── IMPORT CSV ────────────────────────────────────────────────────────────────
function importCSV(input) {
  var file = input.files[0]; if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var lines = e.target.result.split('\n').filter(function(l){return l.trim();});
    if (lines.length < 2) { alert('CSV vuoto o non valido.'); return; }
    var headers = lines[0].split(',').map(function(h){return h.replace(/"/g,'').trim().toLowerCase();});
    var rows = [];
    for (var i=1; i<lines.length; i++) {
      var cols = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)||[];
      cols = cols.map(function(c){return c.replace(/^"|"$/g,'').trim();});
      var row = {};
      headers.forEach(function(h,j){row[h]=cols[j]||'';});
      var t = {
        user_id:currentUser.id,
        date: row['date']||row['data']||'',
        service_month: row['service month']||row['service_month']||'',
        type: row['type']||row['tipo']||'Received',
        invoice_num: row['invoice #']||row['invoice_num']||row['fattura #']||'',
        counterparty: row['counterparty']||row['controparte']||'',
        category: row['category']||row['categoria']||'Other',
        country: row['country']||row['paese']||'',
        vat_id: row['vat / tax id']||row['vat_id']||'',
        address: row['address']||row['address']||'',
        description: row['description']||row['descrizione']||'',
        entrate_net:   parseFloat(row['entrate net']||row['entrate_net']||0)||0,
        entrate_vat:   parseFloat(row['entrate vat']||row['entrate_vat']||0)||0,
        entrate_total: parseFloat(row['entrate total']||row['entrate_total']||0)||0,
        uscite_net:    parseFloat(row['uscite net']||row['uscite_net']||0)||0,
        uscite_vat:    parseFloat(row['uscite vat']||row['uscite_vat']||0)||0,
        uscite_total:  parseFloat(row['uscite total']||row['uscite_total']||0)||0,
        notes: row['notes']||row['note']||''
      };
      if (t.date && t.counterparty) rows.push(t);
    }
    if (!rows.length) { alert('Nessuna riga valida trovata. Controlla che il CSV abbia colonne Date e Counterparty.'); return; }
    if (!confirm('Importare '+rows.length+' transazioni?')) return;
    sb.from('invoices').insert(rows).then(function(r) {
      if (r.error) { alert('Errore import: '+r.error.message); return; }
      loadInvoices(); showTab('registro');
      showMsg(rows.length+' transazioni importate!','success');
    });
  };
  reader.readAsText(file, 'UTF-8');
  input.value='';
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function loadSettings() {
  return sb.from('profile').select('*').maybeSingle().then(function(r) {
    if(r.data){
      settings.name=r.data.name||''; settings.vat=r.data.vat_number||'';
      var sn=document.getElementById('s-name'); if(sn)sn.value=settings.name;
      var sv=document.getElementById('s-vat');  if(sv)sv.value=settings.vat;
    }
    settings.key=localStorage.getItem('inv_key')||'';
    settings.gclientid=localStorage.getItem('inv_gcid')||'';
    settings.gfolderid=localStorage.getItem('inv_gfid')||'';
    var sk=document.getElementById('s-key');       if(sk&&settings.key)sk.value=settings.key;
    var gi=document.getElementById('s-gclientid'); if(gi&&settings.gclientid)gi.value=settings.gclientid;
    var gf=document.getElementById('s-gfolderid'); if(gf&&settings.gfolderid)gf.value=settings.gfolderid;
  });
}
function saveSettings() {
  settings.name=v('s-name'); settings.vat=v('s-vat'); settings.key=v('s-key');
  settings.gclientid=v('s-gclientid'); settings.gfolderid=v('s-gfolderid');
  sb.from('profile').upsert({user_id:currentUser.id,name:settings.name,vat_number:settings.vat},{onConflict:'user_id'});
  localStorage.setItem('inv_key',settings.key); localStorage.setItem('inv_gcid',settings.gclientid); localStorage.setItem('inv_gfid',settings.gfolderid);
}
function cfg(k){return settings[k]||'';}
function updateCount(){var el=document.getElementById('tx-count');if(el)el.textContent=txs.length+' transazioni';}

// ── TAB NAVIGATION ────────────────────────────────────────────────────────────
function showTab(t) {
  ['carica','registro','summary','settings'].forEach(function(id) {
    document.getElementById('tab-'+id).style.display=id===t?'':'none';
    var btn=document.getElementById('tab-btn-'+id); if(btn)btn.classList.toggle('active',id===t);
  });
  if(t==='registro'){renderTable();renderStats('stats-a');}
  if(t==='summary'){renderStats('stats-b');renderCat();renderTax();renderSimulator();}
}

// ── PERIOD FILTER (Registro) ──────────────────────────────────────────────────
function populateYearFilters() {
  var years = {};
  txs.forEach(function(t){ var y=(t.date||'').slice(0,4); if(y) years[y]=1; });
  var yArr = Object.keys(years).sort();
  ['year-filter','year-filter-s'].forEach(function(id){
    var el=document.getElementById(id); if(!el) return;
    var cur=el.value;
    el.innerHTML='<option value="all">Tutti</option>';
    yArr.forEach(function(y){el.innerHTML+='<option value="'+y+'">'+y+'</option>';});
    if(cur) el.value=cur;
  });
}
function togglePeriod(p, btn) {
  if (p==='all') {
    filterPeriods = new Set(['all']);
  } else {
    filterPeriods.delete('all');
    if (filterPeriods.has(p)) filterPeriods.delete(p);
    else filterPeriods.add(p);
    if (filterPeriods.size===0) filterPeriods.add('all');
  }
  document.querySelectorAll('#period-pills .period-pill').forEach(function(b){
    b.classList.toggle('active', filterPeriods.has(b.dataset.p));
  });
  renderTable();
}
function setFilterYear(y) { filterYear=y; renderTable(); }

function togglePeriodS(p, btn) {
  if (p==='all') { filterPeriodsS=new Set(['all']); }
  else {
    filterPeriodsS.delete('all');
    if(filterPeriodsS.has(p)) filterPeriodsS.delete(p); else filterPeriodsS.add(p);
    if(filterPeriodsS.size===0) filterPeriodsS.add('all');
  }
  document.querySelectorAll('#period-pills-s .period-pill').forEach(function(b){
    b.classList.toggle('active', filterPeriodsS.has(b.dataset.p));
  });
  renderCat(); renderTax(); renderSimulator(); renderStats('stats-b');
}
function setFilterYearS(y) { filterYearS=y; renderCat(); renderTax(); renderSimulator(); renderStats('stats-b'); }

function matchesPeriodMulti(t, periods, year) {
  var d = getRefDate(t);
  if (year!=='all' && d.slice(0,4)!==year) return false;
  if (periods.has('all')) return true;
  var m=d.slice(5,7);
  var qMap={Q1:['01','02','03'],Q2:['04','05','06'],Q3:['07','08','09'],Q4:['10','11','12']};
  for (var p of periods) {
    if (qMap[p] && qMap[p].indexOf(m)>=0) return true;
    if (p===m) return true;
  }
  return false;
}
function getFilteredTxs() {
  return txs.filter(function(t){ return (filter==='all'||t.type===filter) && matchesPeriodMulti(t,filterPeriods,filterYear); });
}
function getFilteredSummaryTxs() {
  return txs.filter(function(t){ return matchesPeriodMulti(t,filterPeriodsS,filterYearS); });
}

// ── GOOGLE DRIVE ──
var driveToken=null, driveTokenExpiry=0;
var driveCurrentFile=null; // {name, blob} set when a file is picked

function driveIsReady(){
  return driveToken && Date.now()<driveTokenExpiry && cfg('gclientid') && cfg('gfolderid');
}
function driveReset(){driveToken=null;driveTokenExpiry=0;driveBadge('idle');}
function driveBadge(state,txt){
  var badge=document.getElementById('drive-badge');
  var btxt=document.getElementById('drive-badge-txt');
  var dot=badge?badge.querySelector('.drive-dot'):null;
  if(!badge) return;
  badge.className='drive-status';
  if(dot) dot.className='drive-dot';
  if(state==='connected'){badge.classList.add('connected');if(btxt)btxt.textContent=txt||'Connesso';}
  else if(state==='uploading'){badge.classList.add('uploading');if(dot)dot.classList.add('pulse');if(btxt)btxt.textContent=txt||'Upload...';}
  else if(state==='error'){badge.classList.add('error');if(btxt)btxt.textContent=txt||'Errore';}
  else{if(btxt)btxt.textContent=txt||'Non configurato';}
  var cb=document.getElementById('drive-connect-btn');
  var db=document.getElementById('drive-disconnect-btn');
  if(cb) cb.style.display=state==='connected'?'none':'';
  if(db) db.style.display=state==='connected'?'':'none';
}
function driveConnect(){
  var clientId=cfg('gclientid');
  if(!clientId){alert('Inserisci prima il Client ID Google.');return;}
  if(!window.google||!window.google.accounts){alert('Libreria Google non caricata. Assicurati di aprire il file via http://localhost:8080');return;}
  window.google.accounts.oauth2.initTokenClient({
    client_id:clientId,
    scope:'https://www.googleapis.com/auth/drive.file',
    callback:function(resp){
      if(resp.error){driveBadge('error','Errore auth');document.getElementById('drive-connect-msg').textContent='Errore: '+resp.error;return;}
      driveToken=resp.access_token;
      driveTokenExpiry=Date.now()+(parseInt(resp.expires_in,10)||3599)*1000;
      driveBadge('connected','Drive connesso ✓');
      document.getElementById('drive-connect-msg').textContent='';
      document.getElementById('drive-setup-guide').style.display='none';
    }
  }).requestAccessToken();
}
function driveDisconnect(){
  if(driveToken && window.google && window.google.accounts){
    try{window.google.accounts.oauth2.revoke(driveToken);}catch(e){}
  }
  driveToken=null;driveTokenExpiry=0;
  driveBadge('idle','Non configurato');
  var db=document.getElementById('drive-disconnect-btn');
  var cb=document.getElementById('drive-connect-btn');
  if(db)db.style.display='none';
  if(cb)cb.style.display='';
  document.getElementById('drive-setup-guide').style.display='';
}

function driveUploadFile(file,invoiceName,onDone){
  if(!driveIsReady()){if(onDone)onDone(false,'Drive non connesso o non configurato');return;}
  var folderId=cfg('gfolderid');
  var meta={name:invoiceName||file.name,parents:[folderId]};
  var form=new FormData();
  form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
  form.append('file',file);
  fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
    method:'POST',
    headers:{Authorization:'Bearer '+driveToken},
    body:form
  }).then(function(r){return r.json();}).then(function(d){
    if(d.id){if(onDone)onDone(true,d.id);}
    else{if(onDone)onDone(false,JSON.stringify(d.error||d));}
  }).catch(function(e){if(onDone)onDone(false,e.message);});
}

function setDriveUploadStatus(show,msg,ok){
  var el=document.getElementById('drive-upload-status');
  if(!el)return;
  if(!show){el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=(ok===true?'<span style="color:var(--green)">☁️ '+esc(msg)+'</span>'
    :ok===false?'<span style="color:var(--red)">⚠️ '+esc(msg)+'</span>'
    :'<span style="color:var(--accent)">⏳ '+esc(msg)+'</span>');
}
function handleFile(file){
  if(!file) return;
  var key=cfg('key');
  if(!key){showMsg('Inserisci la API key in Impostazioni.','error');return;}
  driveCurrentFile=file; // capture for Drive upload
  setState('processing');
  toB64(file).then(function(b64){
    var isPdf=file.type==='application/pdf';
    var mt=isPdf?'application/pdf':(file.type||'image/jpeg');
    var cb=isPdf
      ?{type:'document',source:{type:'base64',media_type:mt,data:b64}}
      :{type:'image',source:{type:'base64',media_type:mt,data:b64}};
    var prompt='Analizza questa fattura ed estrai i dati come JSON puro (senza backtick).\n'+
      'Struttura ESATTA:\n'+
      '{"type":"Issued|Received","date":"YYYY-MM-DD","serviceMonth":"YYYY-MM","invoice":"","counterparty":"","category":"Revenue - Consultancy|Revenue - Other|Professional Services - Accountant|Professional Services - Consultancy|Travel - Flights|Travel - Accommodation|Travel - Local Transport|Utilities - Internet/Mobile|Utilities - Other|Equipment - Office|Equipment - Other|Other","country":"","vatId":"","address":"","description":"","entrateNet":0,"entrateVat":0,"entrateTotal":0,"usciteNet":0,"usciteVat":0,"usciteTotal":0,"notes":""}\n'+
      'Issued=fattura emessa/attiva, Received=ricevuta/passiva. Solo uno tra entrate/uscite deve avere valori >0.';
    return fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-opus-4-5',max_tokens:1200,messages:[{role:'user',content:[cb,{type:'text',text:prompt}]}]})
    });
  }).then(function(r){return r.json();}).then(function(data){
    if(data.error) throw new Error(data.error.message);
    var txt=data.content&&data.content.find(function(b){return b.type==='text';});
    var raw=(txt?txt.text:'').replace(/```json|```/g,'').trim();
    var d=JSON.parse(raw);
    fillForm(d);
    setState('form');
  }).catch(function(err){
    showMsg('Errore: '+err.message+'. Compila manualmente.','error');
    fillForm({});
    setState('form');
  });
}

function openManualForm(){driveCurrentFile=null;fillForm({});setState('form');}

function toB64(file){
  return new Promise(function(res,rej){
    var r=new FileReader();
    r.onload=function(){res(r.result.split(',')[1]);};
    r.onerror=rej;
    r.readAsDataURL(file);
  });
}

function fillForm(d){
  set('f-type',d.type||'Received');
  set('f-date',d.date||today());
  set('f-service-month',d.serviceMonth||(d.date?d.date.slice(0,7):today().slice(0,7)));
  set('f-invoice',d.invoice||'');
  set('f-counterparty',d.counterparty||'');
  var cats=Array.from(document.getElementById('f-category').options).map(function(o){return o.value;});
  set('f-category',cats.indexOf(d.category)>=0?d.category:'Other');
  set('f-country',d.country||'');
  set('f-vatid',d.vatId||'—');
  set('f-address',d.address||'');
  set('f-description',d.description||'');
  set('f-en-net',d.entrateNet||'');
  set('f-en-vat',d.entrateVat||'');
  set('f-en-tot',d.entrateTotal||'');
  set('f-us-net',d.usciteNet||'');
  set('f-us-vat',d.usciteVat||'');
  set('f-us-tot',d.usciteTotal||'');
  set('f-notes',d.notes||'');
  updateAmountSections();
}

function updateAmountSections(){
  var t=v('f-type');
  document.getElementById('sec-entrate').style.opacity=t==='Issued'?'1':'0.35';
  document.getElementById('sec-uscite').style.opacity=t==='Received'?'1':'0.35';
}
function calcE(){var n=num('f-en-net'),vt=num('f-en-vat');if(n||vt)set('f-en-tot',(n+vt).toFixed(2));}
function calcU(){var n=num('f-us-net'),vt=num('f-us-vat');if(n||vt)set('f-us-tot',(n+vt).toFixed(2));}

function openManualForm(){driveCurrentFile=null;fillForm({});setState('form');}

function toB64(file){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});}

function editTx(id){
  var t=txs.find(function(x){return x.id===id;});
  if(!t) return;
  editingId=id;
  eSet('e-type',t.type);
  eSet('e-date',t.date);
  eSet('e-service-month',t.serviceMonth);
  eSet('e-invoice',t.invoice);
  eSet('e-counterparty',t.counterparty);
  var cats=Array.from(document.getElementById('e-category').options).map(function(o){return o.value;});
  eSet('e-category',cats.indexOf(t.category)>=0?t.category:'Other');
  eSet('e-country',t.country);
  eSet('e-vatid',t.vatId);
  eSet('e-address',t.address);
  eSet('e-description',t.description);
  eSet('e-en-net',t.entrateNet||'');
  eSet('e-en-vat',t.entrateVat||'');
  eSet('e-en-tot',t.entrateTotal||'');
  eSet('e-us-net',t.usciteNet||'');
  eSet('e-us-vat',t.usciteVat||'');
  eSet('e-us-tot',t.usciteTotal||'');
  eSet('e-notes',t.notes);
  updateEditSections();
  document.getElementById('edit-modal').style.display='flex';
}

function closeEditModal(evt){
  if(evt && evt.target!==document.getElementById('edit-modal')) return;
  document.getElementById('edit-modal').style.display='none';
  editingId=null;
}

function updateEditSections(){
  var t=eV('e-type');
  document.getElementById('e-sec-entrate').style.opacity=t==='Issued'?'1':'0.35';
  document.getElementById('e-sec-uscite').style.opacity=t==='Received'?'1':'0.35';
}
function calcEditE(){var n=eNum('e-en-net'),vt=eNum('e-en-vat');if(n||vt)eSet('e-en-tot',(n+vt).toFixed(2));}
function calcEditU(){var n=eNum('e-us-net'),vt=eNum('e-us-vat');if(n||vt)eSet('e-us-tot',(n+vt).toFixed(2));}
function eV(id){return document.getElementById(id).value;}
function eSet(id,val){var el=document.getElementById(id);if(el)el.value=val;}
function eNum(id){return parseFloat(eV(id))||0;}
function setState(s){
  document.getElementById('state-upload').style.display=s==='upload'?'':'none';
  document.getElementById('state-processing').style.display=s==='processing'?'':'none';
  document.getElementById('state-form').style.display=s==='form'?'':'none';
}
function resetUpload(){setState('upload');document.getElementById('file-input').value='';document.getElementById('msg-area').innerHTML='';}
function showMsg(txt,type){
  document.getElementById('msg-area').innerHTML='<div class="msg msg-'+type+'">'+txt+'</div>';
  setTimeout(function(){var el=document.getElementById('msg-area');if(el)el.innerHTML='';},5000);
}
function setTypeFilter(f,btn){
  filter=f;
  var btns=['ftype-all','ftype-issued','ftype-received'];
  btns.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderTable();
}
function setFilter(f,btn){setTypeFilter(f,btn);}

function setDateRef(ref,btn){
  dateRef=ref;
  var db=document.getElementById('ref-date-btn');
  var sb=document.getElementById('ref-svc-btn');
  if(db)db.classList.toggle('active',ref==='date');
  if(sb)sb.classList.toggle('active',ref==='serviceMonth');
  renderTable();
}


function setTypeFilter(f,btn){
  filter=f;
  ['ftype-all','ftype-issued','ftype-received'].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderTable();
}
function setFilter(f,btn){setTypeFilter(f,btn);}
function setDateRef(ref,btn){
  dateRef=ref;
  var db=document.getElementById('ref-date-btn'); var sb2=document.getElementById('ref-svc-btn');
  if(db)db.classList.toggle('active',ref==='date'); if(sb2)sb2.classList.toggle('active',ref==='serviceMonth');
  renderTable();
}
function getRefDate(t){return dateRef==='serviceMonth'?(t.serviceMonth||t.date):t.date;}

function renderTable(){
  var arr=getFilteredTxs();
  var tbody=document.getElementById('tbody'); var empty=document.getElementById('empty');
  if(!tbody) return;
  renderFilteredStats(arr);
  if(!arr.length){tbody.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  tbody.innerHTML=arr.map(function(t){
    var isIn=t.type==='Issued';
    return '<tr>'+
      '<td><span class="badge '+(isIn?'badge-in':'badge-out')+'">'+(isIn?'Issued':'Received')+'</span></td>'+
      '<td>'+esc(t.date)+'</td><td style="color:var(--text2)">'+esc(t.serviceMonth)+'</td>'+
      '<td style="color:var(--text2);white-space:nowrap">'+esc(t.invoice)+'</td>'+
      '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(t.counterparty)+'</td>'+
      '<td style="color:var(--text2);font-size:10.5px;white-space:nowrap">'+esc(t.category)+'</td>'+
      '<td style="color:var(--text2)">'+esc(t.country)+'</td>'+
      '<td class="'+(t.entrateNet?'amount-in':'')+'">'+fmtN(t.entrateNet)+'</td>'+
      '<td class="'+(t.entrateVat?'amount-in':'')+'">'+fmtN(t.entrateVat)+'</td>'+
      '<td class="'+(t.entrateTotal?'amount-in':'')+'"><b>'+fmtN(t.entrateTotal)+'</b></td>'+
      '<td class="'+(t.usciteNet?'amount-out':'')+'">'+fmtN(t.usciteNet)+'</td>'+
      '<td class="'+(t.usciteVat?'amount-out':'')+'">'+fmtN(t.usciteVat)+'</td>'+
      '<td class="'+(t.usciteTotal?'amount-out':'')+'"><b>'+fmtN(t.usciteTotal)+'</b></td>'+
      '<td style="color:var(--text2);font-size:10.5px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(t.notes)+'</td>'+
      '<td style="white-space:nowrap"><span title="File allegato" style="color:var(--text3);font-size:12px;margin-right:4px">'+(localStorage.getItem('inv_file_'+t.id)?'\u{1F4CE}':'')+'</span>'+
      '<button class="btn btn-edit" onclick="editTx('+t.id+')" title="Modifica">\u270F</button>'+
      '<button class="btn btn-danger" onclick="delTx('+t.id+')">\u00D7</button></td>'+
      '</tr>';
  }).join('');
}
function renderFilteredStats(arr){
  var el=document.getElementById('stats-a');if(!el)return;
  var tIn=arr.reduce(function(s,t){return s+(t.entrateTotal||0);},0);
  var tOut=arr.reduce(function(s,t){return s+(t.usciteTotal||0);},0);
  var nIn=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var nOut=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  el.innerHTML=stat('Entrate Totali',fmt(tIn),'var(--green)')+stat('Uscite Totali',fmt(tOut),'var(--red)')+
    stat('Saldo Netto',fmt(nIn-nOut),nIn>=nOut?'var(--green)':'var(--red)')+stat('N Fatture',arr.length,'var(--accent)');
}
function renderStats(id){
  var el=document.getElementById(id);if(!el)return;
  var arr=id==='stats-b'?getFilteredSummaryTxs():txs;
  var tIn=arr.reduce(function(s,t){return s+(t.entrateTotal||0);},0);
  var tOut=arr.reduce(function(s,t){return s+(t.usciteTotal||0);},0);
  var nIn=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var nOut=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  el.innerHTML=stat('Entrate Totali',fmt(tIn),'var(--green)')+stat('Uscite Totali',fmt(tOut),'var(--red)')+
    stat('Saldo Netto',fmt(nIn-nOut),nIn>=nOut?'var(--green)':'var(--red)')+stat('N Fatture',arr.length,'var(--accent)');
}
function stat(label,val,color){return '<div class="stat"><div class="stat-label">'+label+'</div><div class="stat-value" style="color:'+color+'">'+val+'</div></div>';}

// ── CATEGORY SUMMARY (split entrate/uscite) ───────────────────────────────────
function renderCat(){
  var cats=['Revenue - Consultancy','Revenue - Other','Professional Services - Accountant',
    'Professional Services - Consultancy','Travel - Flights','Travel - Accommodation',
    'Travel - Local Transport','Utilities - Internet/Mobile','Utilities - Other',
    'Equipment - Office','Equipment - Other','Other'];
  var mapIn={}, mapOut={};
  cats.forEach(function(c){mapIn[c]={n:0,v:0,t:0};mapOut[c]={n:0,v:0,t:0};});
  var arr=getFilteredSummaryTxs();
  arr.forEach(function(t){
    var c=t.category||'Other';
    if(!mapIn[c])mapIn[c]={n:0,v:0,t:0};
    if(!mapOut[c])mapOut[c]={n:0,v:0,t:0};
    if(t.type==='Issued'){mapIn[c].n+=t.entrateNet;mapIn[c].v+=t.entrateVat;mapIn[c].t+=t.entrateTotal;}
    else{mapOut[c].n+=t.usciteNet;mapOut[c].v+=t.usciteVat;mapOut[c].t+=t.usciteTotal;}
  });
  // All categories present in data
  var allCats=Array.from(new Set(arr.map(function(t){return t.category||'Other';}))).sort();
  function buildRows(map,allC){
    var tN=0,tV=0,tT=0;
    var rows=allC.filter(function(c){return map[c]&&map[c].t!==0;}).map(function(c){
      tN+=map[c].n;tV+=map[c].v;tT+=map[c].t;
      return '<tr><td style="color:var(--text2);font-size:11px">'+c+'</td><td>'+fmt(map[c].n)+'</td><td>'+fmt(map[c].v)+'</td><td>'+fmt(map[c].t)+'</td></tr>';
    }).join('');
    if(!rows) return '<tr><td colspan="4" style="color:var(--text3);text-align:center;padding:16px">Nessun dato</td></tr>';
    return rows+'<tr><td>TOTAL</td><td>'+fmt(tN)+'</td><td>'+fmt(tV)+'</td><td>'+fmt(tT)+'</td></tr>';
  }
  var bi=document.getElementById('cat-tbody-in');   if(bi) bi.innerHTML=buildRows(mapIn,allCats);
  var bo=document.getElementById('cat-tbody-out');  if(bo) bo.innerHTML=buildRows(mapOut,allCats);
}

// ── TAX CALCULATIONS ──────────────────────────────────────────────────────────
function maltaTaxSingle(c){
  if(c<=9100)return 0; if(c<=14500)return(c-9100)*.15;
  if(c<=19500)return 810+(c-14500)*.25; if(c<=60000)return 2060+(c-19500)*.25;
  return 12235+(c-60000)*.35;
}
function calcMaltaSE(gRev,dExp){
  var ci=Math.max(0,gRev-dExp), tax=maltaTaxSingle(ci), ssc=Math.min(ci,33984)*.15;
  return {label:'Malta Self-Employed',ci:ci,tax:tax,ssc:ssc,total:tax+ssc,net:ci-tax-ssc,eff:ci>0?(tax+ssc)/ci*100:0,
    rows:[['Gross Revenue (net VAT)',fmt(gRev),'var(--green)'],['Spese Deducibili (net VAT)',fmt(dExp),'var(--red)'],
      ['Reddito Imponibile',fmt(ci),'var(--orange)'],['IRPEF (aliquote single 2026)',fmt(tax),''],
      ['SSC Class 2 (15%)',fmt(ssc),''],['Totale Tasse',fmt(tax+ssc),'var(--orange)'],
      ['Aliquota Effettiva',(ci>0?(tax+ssc)/ci*100:0).toFixed(1)+'%',''],['Netto dopo tasse',fmt(ci-tax-ssc),'var(--green)']]};
}
function calcMaltaLtd(gRev,dExp){
  var profit=Math.max(0,gRev-dExp), corpTax=profit*.35, refund=corpTax*(6/7), netTax=corpTax-refund;
  return {label:'Malta Ltd (imputation system)',ci:profit,tax:netTax,ssc:0,total:netTax,net:profit-netTax,eff:profit>0?netTax/profit*100:0,
    rows:[['Gross Revenue (net VAT)',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Utile Aziendale',fmt(profit),'var(--orange)'],['Corporate Tax (35%)',fmt(corpTax),''],
      ['Rimborso Azionista (6/7)','-'+fmt(refund),'var(--green)'],['Tax Effettiva Netta (≈5%)',fmt(netTax),'var(--orange)'],
      ['Aliquota Effettiva',(profit>0?netTax/profit*100:0).toFixed(1)+'%',''],['Netto dopo tasse',fmt(profit-netTax),'var(--green)']]};
}
function calcDubaiSE(gRev,dExp){
  var profit=Math.max(0,gRev-dExp), threshold=93750, taxable=Math.max(0,profit-threshold), tax=taxable*.09;
  return {label:'Dubai Self-Employed (UAE CT)',ci:profit,tax:tax,ssc:0,total:tax,net:profit-tax,eff:profit>0?tax/profit*100:0,
    rows:[['Gross Revenue (net VAT)',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Profitto Netto',fmt(profit),'var(--orange)'],['Soglia esente (AED 375k)',fmt(threshold),''],
      ['Imponibile CT 9%',fmt(taxable),''],['UAE Corporate Tax (9%)',fmt(tax),'var(--orange)'],
      ['No Personal Income Tax','0%','var(--green)'],['Netto dopo tasse',fmt(profit-tax),'var(--green)']]};
}
function calcDubaiLtdFZ(gRev,dExp){
  var profit=Math.max(0,gRev-dExp);
  return {label:'Dubai Ltd Free Zone (0% CT)',ci:profit,tax:0,ssc:0,total:0,net:profit,eff:0,
    rows:[['Gross Revenue (net VAT)',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Profitto Netto',fmt(profit),'var(--orange)'],['CT Free Zone (Qualifying)',fmt(0),'var(--green)'],
      ['No Personal Income Tax','0%','var(--green)'],['Aliquota Effettiva','0%','var(--green)'],
      ['Costo annuo struttura FZ','~€3.000-8.000','var(--text2)'],['Netto dopo tasse',fmt(profit),'var(--green)']]};
}
function calcItalyPIVA(gRev,dExp){
  if(gRev>85000){
    var irpef=0; var b=gRev-dExp;
    if(b<=15000)irpef=b*.23; else if(b<=28000)irpef=3450+(b-15000)*.25;
    else if(b<=50000)irpef=6700+(b-28000)*.35; else irpef=14400+(b-50000)*.43;
    var inps=(gRev-dExp)*.2607, irap=(gRev-dExp)*.039;
    var total=irpef+inps+irap;
    return {label:'IT P.IVA Ordinaria',ci:gRev-dExp,tax:irpef,ssc:inps+irap,total:total,net:gRev-dExp-total,eff:(gRev-dExp)>0?total/(gRev-dExp)*100:0,
      rows:[['Gross Revenue',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
        ['Reddito Netto',fmt(gRev-dExp),'var(--orange)'],['IRPEF (progressiva)',fmt(irpef),''],
        ['INPS Gestione Separata (26%)',fmt(inps),''],['IRAP (3.9%)',fmt(irap),''],
        ['Totale Tasse+Contributi',fmt(total),'var(--orange)'],['Netto dopo tasse',fmt(gRev-dExp-total),'var(--green)']]};
  }
  var coeff=.78, base=gRev*coeff, inps=base*.2607, irpefBase=base-inps*.5, irpef=irpefBase*.15, total=irpef+inps;
  return {label:'IT P.IVA Forfettaria (15%)',ci:base,tax:irpef,ssc:inps,total:total,net:gRev-total,eff:gRev>0?total/gRev*100:0,
    rows:[['Gross Revenue (no deduzione spese)',fmt(gRev),'var(--green)'],['Coefficiente redditività (78%)',fmt(base),''],
      ['INPS Gestione Separata (26%)',fmt(inps),'var(--red)'],['Base IRPEF (dopo ded. 50% INPS)',fmt(irpefBase),''],
      ['IRPEF Forfettaria (15%)',fmt(irpef),'var(--orange)'],['Totale Tasse+Contributi',fmt(total),'var(--orange)'],
      ['Aliquota su fatturato',gRev>0?(total/gRev*100).toFixed(1)+'%':'0%',''],['Netto',fmt(gRev-total),'var(--green)']]};
}
function getRegimeCalc(regime,gRev,dExp){
  if(regime==='malta-se') return calcMaltaSE(gRev,dExp);
  if(regime==='malta-ltd') return calcMaltaLtd(gRev,dExp);
  if(regime==='dubai-se') return calcDubaiSE(gRev,dExp);
  if(regime==='dubai-ltd') return calcDubaiLtdFZ(gRev,dExp);
  return calcItalyPIVA(gRev,dExp);
}
function setRegime(r,btn){
  currentRegime=r;
  document.querySelectorAll('.regime-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');
  renderTax();
}
function renderTax(){
  var arr=getFilteredSummaryTxs();
  var gRev=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var dExp=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  var el=document.getElementById('tax-rows'); if(!el) return;
  var calc=getRegimeCalc(currentRegime,gRev,dExp);
  el.innerHTML=calc.rows.map(function(r){return taxRow(r[0],r[1],r[2]);}).join('');
}
function taxRow(lbl,val,color){return '<div class="tax-row"><span class="tax-label">'+lbl+'</span><span class="tax-value" style="'+(color?'color:'+color:'')+'">'+val+'</span></div>';}

// ── SIMULATOR ─────────────────────────────────────────────────────────────────
function renderSimulator(){
  var arr=getFilteredSummaryTxs();
  var baseIn=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var baseOut=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  var extraIn=parseFloat(document.getElementById('sim-extra-in').value)||0;
  var extraOut=parseFloat(document.getElementById('sim-extra-out').value)||0;
  var gRev=baseIn+extraIn, dExp=baseOut+extraOut;
  var regimes=['malta-se','malta-ltd','dubai-se','dubai-ltd','italy-piva'];
  var colors=['var(--accent)','var(--accent2)','var(--orange)','var(--green)','var(--red)'];
  var el=document.getElementById('sim-results'); if(!el) return;
  el.innerHTML='<div class="sim-grid">'+regimes.map(function(r,i){
    var c=getRegimeCalc(r,gRev,dExp);
    return '<div class="sim-col">'+
      '<div class="sim-regime" style="background:'+colors[i]+'20;color:'+colors[i]+'">'+c.label.split(' ').slice(0,2).join(' ')+'</div>'+
      '<div class="sim-row"><span style="color:var(--text2)">Totale tasse</span><span style="color:var(--red);font-weight:600">'+fmt(c.total)+'</span></div>'+
      '<div class="sim-row"><span style="color:var(--text2)">Aliquota eff.</span><span style="font-weight:600">'+c.eff.toFixed(1)+'%</span></div>'+
      '<div class="sim-row"><span style="color:var(--text2)">Netto</span><span style="color:var(--green);font-weight:600">'+fmt(c.net)+'</span></div>'+
      '</div>';
  }).join('')+'</div>';
}


function exportXLSX(){
  if(!txs.length){alert('Nessuna transazione.');return;}
  var wb=XLSX.utils.book_new();
  var name=cfg('name'), vatN=cfg('vat');
  var h1='Invoice Register'+(name?' - '+name:'')+(vatN?' (VAT '+vatN+')':'');
  var rows=[];
  rows.push([h1]);
  rows.push(['Period: all transactions. All amounts in EUR.']);
  rows.push([]);
  rows.push(['Date','Service Month','Type','Invoice #','Counterparty','Category','Country','VAT / Tax ID','Address','Description','Entrate Net (EUR)','Entrate VAT (EUR)','Entrate Total (EUR)','Uscite Net (EUR)','Uscite VAT (EUR)','Uscite Total (EUR)','Notes']);
  var sorted=[].concat(txs).sort(function(a,b){return a.date.localeCompare(b.date);});
  sorted.forEach(function(t){
    rows.push([t.date,t.serviceMonth,t.type,t.invoice,t.counterparty,t.category,t.country,t.vatId,t.address,t.description,
      t.entrateNet||'',t.entrateVat||'',t.entrateTotal||'',
      t.usciteNet||'',t.usciteVat||'',t.usciteTotal||'',t.notes]);
  });
  var tEN=sum('entrateNet'),tEV=sum('entrateVat'),tET=sum('entrateTotal');
  var tUN=sum('usciteNet'),tUV=sum('usciteVat'),tUT=sum('usciteTotal');
  rows.push([]);
  rows.push(['','','','','','Total Issued (Revenue)','','','','',tEN,tEV,tET,'','','','']);
  rows.push(['','','','','','Total Received (Expenses)','','','','','','','',tUN,tUV,tUT,'']);
  rows.push(['','','','','','Net (Revenue - Expenses)','','','','','','',tET-tUT,'','','','']);
  var ch=Math.max(0,tEN-tUN), tax=maltaTax(ch), ssc=Math.min(ch,33984)*0.15;
  rows.push([]);
  rows.push(['','','','','','','','','Malta Tax Estimate (Self-Employed 2026)']);
  rows.push(['','','','','','','','','Gross Revenue (Net of VAT)','',tEN]);
  rows.push(['','','','','','','','','Deductible Expenses (Net of VAT)','',tUN]);
  rows.push(['','','','','','','','','Chargeable Income','',ch]);
  rows.push(['','','','','','','','','Income Tax (Single rates 2026)','',tax]);
  rows.push(['','','','','','','','','Class 2 SSC (15%)','',ssc]);
  rows.push(['','','','','','','','','Total Tax + SSC','',tax+ssc]);
  rows.push(['','','','','','','','','Net After Tax & SSC','',ch-tax-ssc]);
  var ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[10,12,10,14,24,26,10,14,32,42,14,14,14,14,14,14,42].map(function(w){return{wch:w};});
  XLSX.utils.book_append_sheet(wb,ws,'Invoices 2026');

  // Cat summary sheet
  var cats=['Revenue - Consultancy','Revenue - Other','Professional Services - Accountant','Professional Services - Consultancy','Travel - Flights','Travel - Accommodation','Travel - Local Transport','Utilities - Internet/Mobile','Utilities - Other','Equipment - Office','Equipment - Other','Other'];
  var map={};cats.forEach(function(c){map[c]={n:0,v:0,t:0};});
  txs.forEach(function(t){
    var c=t.category||'Other';if(!map[c])map[c]={n:0,v:0,t:0};
    if(t.type==='Issued'){map[c].n+=t.entrateNet;map[c].v+=t.entrateVat;map[c].t+=t.entrateTotal;}
    else{map[c].n+=t.usciteNet;map[c].v+=t.usciteVat;map[c].t+=t.usciteTotal;}
  });
  var cr=[['Summary by Category'],['Category','Net (EUR)','VAT (EUR)','Total (EUR)']];
  var tn=0,tv=0,tt=0;
  cats.forEach(function(c){cr.push([c,map[c].n,map[c].v,map[c].t]);tn+=map[c].n;tv+=map[c].v;tt+=map[c].t;});
  cr.push(['TOTAL',tn,tv,tt]);
  var ws2=XLSX.utils.aoa_to_sheet(cr);
  ws2['!cols']=[{wch:32},{wch:14},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws2,'Category Summary');

  var yr=new Date().getFullYear();
  XLSX.writeFile(wb,'Invoice_Register_'+(name.replace(/\s+/g,'_')||'export')+'_'+yr+'.xlsx');
}

function exportCSV(){
  if(!txs.length){alert('Nessuna transazione.');return;}
  var h=['Date','Service Month','Type','Invoice #','Counterparty','Category','Country','VAT / Tax ID','Address','Description','Entrate Net','Entrate VAT','Entrate Total','Uscite Net','Uscite VAT','Uscite Total','Notes'];
  var rows=txs.map(function(t){
    return [t.date,t.serviceMonth,t.type,t.invoice,t.counterparty,t.category,t.country,t.vatId,t.address,t.description,t.entrateNet,t.entrateVat,t.entrateTotal,t.usciteNet,t.usciteVat,t.usciteTotal,t.notes]
      .map(function(x){return '"'+String(x||'').replace(/"/g,'""')+'"';}).join(',');
  });
  var blob=new Blob(['\uFEFF'+[h.join(',')].concat(rows).join('\n')],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='invoice_register.csv';a.click();
  URL.revokeObjectURL(url);
}

// helpers
function v(id){return document.getElementById(id).value;}
function set(id,val){var el=document.getElementById(id);if(el)el.value=val;}
function num(id){return parseFloat(v(id))||0;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}
function sum(field){return txs.reduce(function(s,t){return s+(t[field]||0);},0);}
function fmt(n){return (n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtN(n){return n?fmt(n):'—';}
function today(){return new Date().toISOString().split('T')[0];}
function maltaTax(c){
  if(c<=9100)return 0;
  if(c<=14500)return(c-9100)*.15;
  if(c<=19500)return 810+(c-14500)*.25;
  if(c<=60000)return 2060+(c-19500)*.25;
  return 12235+(c-60000)*.35;
}


// ── INIT ─────────────────────────────────────────────────────────────────────
sb.auth.getSession().then(function(r) {
  if(r.data&&r.data.session){currentUser=r.data.session.user;showApp();}
  else{document.getElementById('lock-screen').style.display='flex';document.getElementById('app-content').style.display='none';}
});
sb.auth.onAuthStateChange(function(event,session){
  if(event==='SIGNED_IN'&&session)currentUser=session.user;
  if(event==='SIGNED_OUT')currentUser=null;
});
document.addEventListener('DOMContentLoaded',function(){
  updateAmountSections();
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeEditModal();});
  var dz=document.getElementById('dropzone');
  if(dz){
    dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('drag');});
    dz.addEventListener('dragleave',function(){dz.classList.remove('drag');});
    dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('drag');var f=e.dataTransfer.files[0];if(f)handleFile(f);});
  }
});