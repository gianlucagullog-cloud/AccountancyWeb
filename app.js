// ══ SUPABASE CONFIG — modifica questi due valori ══════════════════════════════
var SUPABASE_URL = 'https://tabobhdntfnedwjrqboc.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYm9iaGRudGZuZWR3anJxYm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTcyMTUsImV4cCI6MjA5MzE5MzIxNX0.Q7p0cd7aseU08JEwrQ2GHpbYQukbctRJlM1A3Y4FTaA';
// ═════════════════════════════════════════════════════════════════════════════

var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
var currentUser = null;
var txs = [], filter = 'all', dateRef = 'date';
var editingId = null;
var settings = { name:'', vat:'', key:'', gclientid:'', gfolderid:'' };

function doLogin() {
  var email = document.getElementById('lock-email').value.trim();
  var pwd   = document.getElementById('lock-input').value;
  var btn   = document.getElementById('lock-btn');
  if (!email || !pwd) { showLockError('Inserisci email e password.'); return; }
  btn.disabled = true; btn.textContent = 'Accesso...';
  sb.auth.signInWithPassword({ email:email, password:pwd }).then(function(r) {
    btn.disabled = false; btn.textContent = 'Accedi';
    if (r.error) { showLockError('Email o password errata'); return; }
    currentUser = r.data.user;
    showApp();
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

function txToDb(t) {
  return {
    user_id:t.userId||currentUser.id, date:t.date, service_month:t.serviceMonth,
    type:t.type, invoice_num:t.invoice, counterparty:t.counterparty,
    category:t.category, country:t.country, vat_id:t.vatId,
    address:t.address, description:t.description,
    entrate_net:t.entrateNet||0, entrate_vat:t.entrateVat||0, entrate_total:t.entrateTotal||0,
    uscite_net:t.usciteNet||0, uscite_vat:t.usciteVat||0, uscite_total:t.usciteTotal||0,
    notes:t.notes
  };
}

function dbToTx(r) {
  return {
    id:r.id, type:r.type, date:r.date, serviceMonth:r.service_month,
    invoice:r.invoice_num, counterparty:r.counterparty, category:r.category,
    country:r.country, vatId:r.vat_id, address:r.address, description:r.description,
    entrateNet:parseFloat(r.entrate_net)||0, entrateVat:parseFloat(r.entrate_vat)||0,
    entrateTotal:parseFloat(r.entrate_total)||0, usciteNet:parseFloat(r.uscite_net)||0,
    usciteVat:parseFloat(r.uscite_vat)||0, usciteTotal:parseFloat(r.uscite_total)||0,
    notes:r.notes
  };
}

function loadInvoices() {
  return sb.from('invoices').select('*').order('date',{ascending:true}).then(function(r) {
    if (r.error) { console.error(r.error); return; }
    txs = (r.data||[]).map(dbToTx);
    renderTable(); renderStats('stats-a'); updateCount();
  });
}

function saveTransaction() {
  var t = {
    type:v('f-type'), date:v('f-date'), serviceMonth:v('f-service-month'),
    invoice:v('f-invoice'), counterparty:v('f-counterparty'), category:v('f-category'),
    country:v('f-country'), vatId:v('f-vatid'), address:v('f-address'),
    description:v('f-description'),
    entrateNet:num('f-en-net'), entrateVat:num('f-en-vat'), entrateTotal:num('f-en-tot'),
    usciteNet:num('f-us-net'), usciteVat:num('f-us-vat'), usciteTotal:num('f-us-tot'),
    notes:v('f-notes')
  };
  if (!t.counterparty) { showMsg('Inserisci il Counterparty.','error'); return; }
  sb.from('invoices').insert(txToDb(t)).select().then(function(r) {
    if (r.error) { showMsg('Errore: '+r.error.message,'error'); return; }
    var newId = r.data[0].id;
    if (driveCurrentFile) {
      var fc = driveCurrentFile;
      toB64(fc).then(function(b64) {
        try { localStorage.setItem('inv_file_'+newId, JSON.stringify({name:fc.name,type:fc.type||'application/octet-stream',b64:b64})); } catch(e) {}
      });
      if (driveIsReady()) {
        var fname = t.date+'_'+(t.invoice||'fattura').replace(/[/\\:*?"<>|]/g,'-')+'_'+t.counterparty.slice(0,25).replace(/[/\\:*?"<>|]/g,'-')+'.'+fc.name.split('.').pop();
        setDriveUploadStatus(true,'Upload Drive...',null);
        driveUploadFile(fc,fname,function(ok,info){ ok?setDriveUploadStatus(true,'Drive OK '+fname,true):setDriveUploadStatus(true,'Drive errore: '+info,false); });
      }
    }
    driveCurrentFile = null;
    loadInvoices();
    showMsg('Transazione salvata!','success');
    setState('upload');
    document.getElementById('file-input').value='';
  });
}

function delTx(id) {
  if (!confirm('Eliminare questa fattura?')) return;
  sb.from('invoices').delete().eq('id',id).then(function(r) {
    if (r.error) { alert('Errore: '+r.error.message); return; }
    try { localStorage.removeItem('inv_file_'+id); } catch(e) {}
    loadInvoices();
  });
}

function saveEdit() {
  var id = editingId; if (!id) return;
  var cp = eV('e-counterparty'); if (!cp) { alert('Inserisci il Counterparty.'); return; }
  var t = {
    id:id, type:eV('e-type'), date:eV('e-date'), serviceMonth:eV('e-service-month'),
    invoice:eV('e-invoice'), counterparty:cp, category:eV('e-category'),
    country:eV('e-country'), vatId:eV('e-vatid'), address:eV('e-address'),
    description:eV('e-description'),
    entrateNet:eNum('e-en-net'), entrateVat:eNum('e-en-vat'), entrateTotal:eNum('e-en-tot'),
    usciteNet:eNum('e-us-net'), usciteVat:eNum('e-us-vat'), usciteTotal:eNum('e-us-tot'),
    notes:eV('e-notes')
  };
  var row = txToDb(t); delete row.user_id;
  sb.from('invoices').update(row).eq('id',id).then(function(r) {
    if (r.error) { alert('Errore: '+r.error.message); return; }
    closeEditModal(); loadInvoices();
    var m=document.getElementById('msg-area');
    if(m){m.innerHTML='<div class="msg msg-success">Fattura aggiornata!</div>';setTimeout(function(){m.innerHTML='';},4000);}
  });
}

function clearAll() {
  if (!confirm('Cancellare TUTTE le transazioni? Irreversibile!')) return;
  sb.from('invoices').delete().eq('user_id',currentUser.id).then(function(r) {
    if (r.error) { alert('Errore: '+r.error.message); return; }
    txs=[]; renderTable(); renderStats('stats-a'); updateCount();
  });
}

function loadSettings() {
  return sb.from('profile').select('*').maybeSingle().then(function(r) {
    if (r.data) {
      settings.name = r.data.name||''; settings.vat = r.data.vat_number||'';
      var sn=document.getElementById('s-name'); if(sn) sn.value=settings.name;
      var sv=document.getElementById('s-vat');  if(sv) sv.value=settings.vat;
    }
    settings.key=localStorage.getItem('inv_key')||'';
    settings.gclientid=localStorage.getItem('inv_gcid')||'';
    settings.gfolderid=localStorage.getItem('inv_gfid')||'';
    var sk=document.getElementById('s-key');       if(sk&&settings.key) sk.value=settings.key;
    var gi=document.getElementById('s-gclientid'); if(gi&&settings.gclientid) gi.value=settings.gclientid;
    var gf=document.getElementById('s-gfolderid'); if(gf&&settings.gfolderid) gf.value=settings.gfolderid;
  });
}

function saveSettings() {
  settings.name=v('s-name'); settings.vat=v('s-vat');
  settings.key=v('s-key'); settings.gclientid=v('s-gclientid'); settings.gfolderid=v('s-gfolderid');
  sb.from('profile').upsert({user_id:currentUser.id,name:settings.name,vat_number:settings.vat},{onConflict:'user_id'});
  localStorage.setItem('inv_key',settings.key);
  localStorage.setItem('inv_gcid',settings.gclientid);
  localStorage.setItem('inv_gfid',settings.gfolderid);
}

function cfg(k) { return settings[k]||''; }
function updateCount() { var el=document.getElementById('tx-count'); if(el) el.textContent=txs.length+' transazioni'; }

function showTab(t) {
  ['carica','registro','summary','settings'].forEach(function(id) {
    document.getElementById('tab-'+id).style.display=id===t?'':'none';
    var btn=document.getElementById('tab-btn-'+id); if(btn) btn.classList.toggle('active',id===t);
  });
  if(t==='registro'){renderTable();renderStats('stats-a');}
  if(t==='summary'){renderStats('stats-b');renderCat();renderTax();}
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

function toB64(file) {
  return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result.split(',')[1]);};r.onerror=rej;r.readAsDataURL(file);});
}

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

function getRefDate(t){
  return dateRef==='serviceMonth'?(t.serviceMonth||t.date):t.date;
}

function matchesPeriod(t,period){
  if(period==='all') return true;
  var d=getRefDate(t);
  var m=d.slice(5,7);
  var qMap={Q1:['01','02','03'],Q2:['04','05','06'],Q3:['07','08','09'],Q4:['10','11','12']};
  if(qMap[period]) return qMap[period].indexOf(m)>=0;
  return m===period;
}

function renderTable(){
  var pf=document.getElementById('period-filter');
  var period=pf?pf.value:'all';
  var arr=txs.filter(function(t){
    return (filter==='all'||t.type===filter) && matchesPeriod(t,period);
  });
  var tbody=document.getElementById('tbody');
  var empty=document.getElementById('empty');
  if(!tbody) return;
  renderFilteredStats(arr);
  if(!arr.length){tbody.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  tbody.innerHTML=arr.map(function(t){
    var isIn=t.type==='Issued';
    return '<tr>'+
      '<td><span class="badge '+(isIn?'badge-in':'badge-out')+'">'+(isIn?'Issued':'Received')+'</span></td>'+
      '<td>'+esc(t.date)+'</td>'+
      '<td style="color:var(--text2)">'+esc(t.serviceMonth)+'</td>'+
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
      '<td style="white-space:nowrap"><span title="File allegato" style="color:var(--text3);font-size:12px;margin-right:4px">'+(localStorage.getItem('inv_file_'+t.id)?'📎':'')+'</span><button class="btn btn-edit" onclick="editTx('+t.id+')" title="Modifica">✏</button><button class="btn btn-danger" onclick="delTx('+t.id+')">✕</button></td>'+
      '</tr>';
  }).join('');
}

function renderFilteredStats(arr){
  var el=document.getElementById('stats-a');if(!el)return;
  var tIn=arr.reduce(function(s,t){return s+(t.entrateTotal||0);},0);
  var tOut=arr.reduce(function(s,t){return s+(t.usciteTotal||0);},0);
  var nIn=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var nOut=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  el.innerHTML=
    stat('Entrate Totali',fmt(tIn),'var(--green)')+
    stat('Uscite Totali',fmt(tOut),'var(--red)')+
    stat('Saldo Netto',fmt(nIn-nOut),nIn>=nOut?'var(--green)':'var(--red)')+
    stat('N Fatture',arr.length,'var(--accent)');
}

function renderStats(id){
  var el=document.getElementById(id);if(!el) return;
  var tIn=sum('entrateTotal'),tOut=sum('usciteTotal'),nIn=sum('entrateNet'),nOut=sum('usciteNet');
  el.innerHTML=
    stat('Entrate Totali',fmt(tIn),'var(--green)')+
    stat('Uscite Totali',fmt(tOut),'var(--red)')+
    stat('Saldo Netto',fmt(nIn-nOut),nIn>=nOut?'var(--green)':'var(--red)')+
    stat('N Fatture',txs.length,'var(--accent)');
}
function stat(label,val,color){
  return '<div class="stat"><div class="stat-label">'+label+'</div><div class="stat-value" style="color:'+color+'">'+val+'</div></div>';
}

function renderCat(){
  var cats=['Revenue - Consultancy','Revenue - Other','Professional Services - Accountant','Professional Services - Consultancy','Travel - Flights','Travel - Accommodation','Travel - Local Transport','Utilities - Internet/Mobile','Utilities - Other','Equipment - Office','Equipment - Other','Other'];
  var map={};cats.forEach(function(c){map[c]={n:0,v:0,t:0};});
  txs.forEach(function(t){
    var c=t.category||'Other';if(!map[c])map[c]={n:0,v:0,t:0};
    if(t.type==='Issued'){map[c].n+=t.entrateNet;map[c].v+=t.entrateVat;map[c].t+=t.entrateTotal;}
    else{map[c].n+=t.usciteNet;map[c].v+=t.usciteVat;map[c].t+=t.usciteTotal;}
  });
  var tbody=document.getElementById('cat-tbody');if(!tbody) return;
  var tN=0,tV=0,tT=0;
  var rows=cats.filter(function(c){return map[c]&&map[c].t!==0;}).map(function(c){
    tN+=map[c].n;tV+=map[c].v;tT+=map[c].t;
    return '<tr><td style="color:var(--text2);font-size:11px">'+c+'</td><td>'+fmt(map[c].n)+'</td><td>'+fmt(map[c].v)+'</td><td>'+fmt(map[c].t)+'</td></tr>';
  }).join('');
  tbody.innerHTML=rows+'<tr><td>TOTAL</td><td>'+fmt(tN)+'</td><td>'+fmt(tV)+'</td><td>'+fmt(tT)+'</td></tr>';
}

function renderTax(){
  var gRev=sum('entrateNet'), dExp=sum('usciteNet');
  var ch=Math.max(0,gRev-dExp);
  var tax=maltaTax(ch), ssc=Math.min(ch,33984)*0.15;
  var eff=ch>0?tax/ch*100:0;
  var el=document.getElementById('tax-rows');if(!el) return;
  el.innerHTML=
    taxRow('Gross Revenue (Net of VAT)',fmt(gRev),'var(--green)')+
    taxRow('Deductible Expenses (Net of VAT)',fmt(dExp),'var(--red)')+
    taxRow('Chargeable Income',fmt(ch),'var(--orange)')+
    taxRow('Income Tax (Single rates 2026)',fmt(tax),'')+
    taxRow('Effective Tax Rate',eff.toFixed(1)+'%','')+
    taxRow('Class 2 SSC (15%)',fmt(ssc),'')+
    taxRow('Total Tax + SSC',fmt(tax+ssc),'var(--orange)')+
    taxRow('Net After Tax & SSC',fmt(ch-tax-ssc),'var(--green)');
}
function taxRow(lbl,val,color){
  return '<div class="tax-row"><span class="tax-label">'+lbl+'</span><span class="tax-value" style="'+(color?'color:'+color:'')+'">'+val+'</span></div>';
}
function maltaTax(c){
  if(c<=9100) return 0;
  if(c<=14500) return (c-9100)*0.15;
  if(c<=19500) return 810+(c-14500)*0.25;
  if(c<=60000) return 2060+(c-19500)*0.25;
  return 12235+(c-60000)*0.35;
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
  if (r.data && r.data.session) {
    currentUser = r.data.session.user;
    showApp();
  } else {
    document.getElementById('lock-screen').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
  }
});
sb.auth.onAuthStateChange(function(event, session) {
  if (event==='SIGNED_IN' && session) currentUser = session.user;
  if (event==='SIGNED_OUT') currentUser = null;
});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeEditModal();});
var dz=document.getElementById('dropzone');
dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('drag');});
dz.addEventListener('dragleave',function(){dz.classList.remove('drag');});
dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('drag');var f=e.dataTransfer.files[0];if(f)handleFile(f);});