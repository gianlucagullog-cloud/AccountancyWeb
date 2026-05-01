// CONFIG
var SUPABASE_URL = 'https://tabobhdntfnedwjrqboc.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhYm9iaGRudGZuZWR3anJxYm9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTcyMTUsImV4cCI6MjA5MzE5MzIxNX0.Q7p0cd7aseU08JEwrQ2GHpbYQukbctRJlM1A3Y4FTaA';
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

var currentUser=null, txs=[], filter='all', dateRef='date', editingId=null;
var settings={name:'',vat:'',key:'',gclientid:'',gfolderid:''};
var filterPeriods=new Set(['all']), filterYear='all';
var filterPeriodsS=new Set(['all']), filterYearS='all';
var currentRegime='malta-se';
var selectedIds=new Set();
var sortField='date', sortDir=1;
var catFilterSet=null; // null = all
var isGuestMode=false;
var guestPermissions={};
var adminUserId=null;
window.appStarted=false;
var validatedDupIds=new Set(JSON.parse(localStorage.getItem('inv_valid_dups')||'[]'));
var catEntrateExpanded=true;
var catUsciteExpanded=true;

// DATE FORMAT
var MESI=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
function formatDate(d){
  if(!d)return '';
  var p=d.split('-');if(p.length<3)return d;
  return parseInt(p[2])+' '+MESI[parseInt(p[1])-1]+' '+p[0];
}

// SORT
function setSort(field){
  if(sortField===field)sortDir=-sortDir;else{sortField=field;sortDir=1;}
  document.querySelectorAll('.th-sort').forEach(function(th){
    th.classList.remove('asc','desc');
    if(th.id==='th-'+field)th.classList.add(sortDir===1?'asc':'desc');
  });
  renderTable();
}

// AUTH
function doLogin(){
  var email=document.getElementById('lock-email').value.trim();
  var pwd=document.getElementById('lock-input').value;
  var btn=document.getElementById('lock-btn');
  if(!email||!pwd){showLockError('Inserisci email e password.');return;}
  btn.disabled=true;btn.textContent='Accesso...';
  sb.auth.signInWithPassword({email:email,password:pwd}).then(function(r){
    btn.disabled=false;btn.textContent='Accedi';
    if(r.error){showLockError('Email o password errata');return;}
    currentUser=r.data.user;showApp();
  });
}
function doSignUp(e){
  e.preventDefault();
  var email=document.getElementById('lock-email').value.trim();
  var pwd=document.getElementById('lock-input').value;
  if(!email||!pwd){showLockError('Inserisci email e password.');return;}
  sb.auth.signUp({email:email,password:pwd}).then(function(r){
    if(r.error){showLockError('Errore: '+r.error.message);return;}
    showLockError('Account creato! Clicca Accedi.');
  });
}
function doLogout(){
  sb.auth.signOut().then(function(){
    currentUser=null;txs=[];
    document.getElementById('app-content').style.display='none';
    document.getElementById('lock-screen').style.display='flex';
    document.getElementById('lock-email').value='';
    document.getElementById('lock-input').value='';
    ['user-email-badge','logout-btn','hdr-badge'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display='none';});
    window.appStarted=false;
var validatedDupIds=new Set(JSON.parse(localStorage.getItem('inv_valid_dups')||'[]'));
  });
}
function showLockError(msg){var el=document.getElementById('lock-error');el.textContent=msg;el.style.display='';setTimeout(function(){el.style.display='none';},5000);}
async function showApp(){
  if(window.appStarted) return; // prevent recursive/multiple calls
  appStarted=true;
  document.getElementById('lock-screen').style.display='none';
  document.getElementById('app-content').style.display='';
  var b=document.getElementById('user-email-badge');if(b&&currentUser){b.textContent=currentUser.email;b.style.display='';}
  var lb=document.getElementById('logout-btn');if(lb)lb.style.display='';
  var hb=document.getElementById('hdr-badge');if(hb)hb.style.display='';
  // Check guest access (only if migration2 was run)
  try{
    await linkGuestIfNeeded();
    await checkGuestMode();
  } catch(e){ console.log('Guest check skipped (table may not exist yet):', e.message); }
  if(isGuestMode&&adminUserId){
    try{
      await loadSettings();
      var r=await sb.from('invoices').select('*').eq('user_id',adminUserId).order('date',{ascending:true});
      txs=(r.data||[]).map(dbToTx);
      populateYearFilters();renderTable();renderStats('stats-a');updateCount();
    }catch(e){console.error('Guest data load error:',e);}
  } else {
    await loadSettings();
    await loadInvoices();
  }
  updateAmountSections();
  showTab('carica');
}

// DB HELPERS
function txToDb(t){
  return {user_id:currentUser.id,date:t.date,service_month:t.serviceMonth,type:t.type,
    invoice_num:t.invoice,counterparty:t.counterparty,category:t.category,country:t.country,
    vat_id:t.vatId,address:t.address,description:t.description,
    entrate_net:t.entrateNet||0,entrate_vat:t.entrateVat||0,entrate_total:t.entrateTotal||0,
    uscite_net:t.usciteNet||0,uscite_vat:t.usciteVat||0,uscite_total:t.usciteTotal||0,notes:t.notes};
}
function dbToTx(r){
  return {id:r.id,type:r.type,date:r.date,serviceMonth:r.service_month,invoice:r.invoice_num,
    counterparty:r.counterparty,category:r.category,country:r.country,vatId:r.vat_id,
    address:r.address,description:r.description,
    entrateNet:parseFloat(r.entrate_net)||0,entrateVat:parseFloat(r.entrate_vat)||0,
    entrateTotal:parseFloat(r.entrate_total)||0,usciteNet:parseFloat(r.uscite_net)||0,
    usciteVat:parseFloat(r.uscite_vat)||0,usciteTotal:parseFloat(r.uscite_total)||0,
    notes:r.notes,filePath:r.file_path||null,fileName:r.file_name||null};
}

// FILE STORAGE
function uploadInvoiceFile(file,invoiceId){
  var ext=file.name.split('.').pop();
  var path=currentUser.id+'/'+invoiceId+'.'+ext;
  return sb.storage.from('invoice-files').upload(path,file,{upsert:true}).then(function(r){
    if(r.error){console.warn('Storage upload failed:',r.error.message);return null;}
    return sb.from('invoices').update({file_path:path,file_name:file.name}).eq('id',invoiceId);
  });
}
function downloadInvoiceFile(t){
  if(!t.filePath){alert('Nessun file allegato a questa fattura.');return;}
  sb.storage.from('invoice-files').createSignedUrl(t.filePath,3600).then(function(r){
    if(r.error||!r.data){alert('Errore nel recupero del file.');return;}
    var a=document.createElement('a');a.href=r.data.signedUrl;a.download=t.fileName||'fattura';a.target='_blank';a.click();
  });
}

// DATA FUNCTIONS
function loadInvoices(){
  return sb.from('invoices').select('*').order('date',{ascending:true}).then(function(r){
    if(r.error){console.error(r.error);return;}
    txs=(r.data||[]).map(dbToTx);
    populateYearFilters();renderTable();renderStats('stats-a');updateCount();
  });
}
function saveTransaction(){
  var t={type:v('f-type'),date:v('f-date'),serviceMonth:v('f-service-month'),
    invoice:v('f-invoice'),counterparty:v('f-counterparty'),category:v('f-category'),
    country:v('f-country'),vatId:v('f-vatid'),address:v('f-address'),description:v('f-description'),
    entrateNet:num('f-en-net'),entrateVat:num('f-en-vat'),entrateTotal:num('f-en-tot'),
    usciteNet:num('f-us-net'),usciteVat:num('f-us-vat'),usciteTotal:num('f-us-tot'),notes:v('f-notes')};
  if(!t.counterparty){showMsg('Inserisci il Counterparty.','error');return;}
  sb.from('invoices').insert(txToDb(t)).select().then(function(r){
    if(r.error){showMsg('Errore: '+r.error.message,'error');return;}
    var newId=r.data[0].id;
    if(driveCurrentFile){
      var fc=driveCurrentFile;
      uploadInvoiceFile(fc,newId);
      toB64(fc).then(function(b64){try{localStorage.setItem('inv_file_'+newId,JSON.stringify({name:fc.name,type:fc.type||'application/octet-stream',b64:b64}));}catch(e){}});
      if(driveIsReady()){
        var fname=t.date+'_'+(t.invoice||'fattura').replace(/[\/\\:*?"<>|]/g,'-')+'_'+t.counterparty.slice(0,25).replace(/[\/\\:*?"<>|]/g,'-')+'.'+fc.name.split('.').pop();
        setDriveUploadStatus(true,'Upload...',null);
        driveUploadFile(fc,fname,function(ok,info){ok?setDriveUploadStatus(true,'Drive OK',true):setDriveUploadStatus(true,'Err: '+info,false);});
      }
    }
    driveCurrentFile=null;loadInvoices();showMsg('Transazione salvata!','success');
    setState('upload');document.getElementById('file-input').value='';
  });
}
function delTx(id){
  if(!confirm('Eliminare?'))return;
  var t=txs.find(function(x){return x.id===id;});
  var p=t&&t.filePath?sb.storage.from('invoice-files').remove([t.filePath]):Promise.resolve();
  p.then(function(){
    sb.from('invoices').delete().eq('id',id).then(function(r){
      if(r.error){alert('Errore: '+r.error.message);return;}
      try{localStorage.removeItem('inv_file_'+id);}catch(e){}
      loadInvoices();
    });
  });
}
function saveEdit(){
  var id=editingId;if(!id)return;
  var cp=eV('e-counterparty');if(!cp){alert('Inserisci il Counterparty.');return;}
  var t={id:id,type:eV('e-type'),date:eV('e-date'),serviceMonth:eV('e-service-month'),
    invoice:eV('e-invoice'),counterparty:cp,category:eV('e-category'),country:eV('e-country'),
    vatId:eV('e-vatid'),address:eV('e-address'),description:eV('e-description'),
    entrateNet:eNum('e-en-net'),entrateVat:eNum('e-en-vat'),entrateTotal:eNum('e-en-tot'),
    usciteNet:eNum('e-us-net'),usciteVat:eNum('e-us-vat'),usciteTotal:eNum('e-us-tot'),notes:eV('e-notes')};
  var row=txToDb(t);delete row.user_id;
  sb.from('invoices').update(row).eq('id',id).then(function(r){
    if(r.error){alert('Errore: '+r.error.message);return;}
    closeEditModal();loadInvoices();
    var m=document.getElementById('msg-area');
    if(m){m.innerHTML='<div class="msg msg-success">Fattura aggiornata!</div>';setTimeout(function(){m.innerHTML='';},4000);}
  });
}
function clearAll(){
  if(!confirm('Cancellare TUTTE le transazioni?'))return;
  var paths=txs.filter(function(t){return t.filePath;}).map(function(t){return t.filePath;});
  var p=paths.length?sb.storage.from('invoice-files').remove(paths):Promise.resolve();
  p.then(function(){
    sb.from('invoices').delete().eq('user_id',currentUser.id).then(function(r){
      if(r.error){alert('Errore: '+r.error.message);return;}
      txs=[];renderTable();renderStats('stats-a');updateCount();
    });
  });
}

// DUPLICATE DETECTION
function findDuplicates(arr){
  var dups=new Set();
  for(var i=0;i<arr.length;i++){
    for(var j=i+1;j<arr.length;j++){
      var a=arr[i],b=arr[j];
      // Skip if either is validated
      if(validatedDupIds.has(a.id)||validatedDupIds.has(b.id)) continue;
      // Same invoice number (non-empty)
      if(a.invoice&&b.invoice&&a.invoice.trim()===b.invoice.trim()){
        dups.add(a.id);dups.add(b.id);
      }
      // Same date + same total amount
      var aAmt=(a.entrateTotal||0)+(a.usciteTotal||0);
      var bAmt=(b.entrateTotal||0)+(b.usciteTotal||0);
      if(a.date&&b.date&&a.date===b.date&&aAmt>0&&Math.abs(aAmt-bAmt)<0.01){
        dups.add(a.id);dups.add(b.id);
      }
    }
  }
  return dups;
}
function validateDuplicate(id){
  validatedDupIds.add(id);
  try{localStorage.setItem('inv_valid_dups',JSON.stringify(Array.from(validatedDupIds)));}catch(e){}
  renderTable();
}
function validateAllDuplicates(){
  var dups=findDuplicates(txs);
  dups.forEach(function(id){validatedDupIds.add(id);});
  try{localStorage.setItem('inv_valid_dups',JSON.stringify(Array.from(validatedDupIds)));}catch(e){}
  renderTable();
}

// SELECTION
function toggleSelect(id,cb){
  if(cb.checked)selectedIds.add(id);else selectedIds.delete(id);
  updateSelBar();
  var allCb=document.getElementById('cb-all');
  if(allCb){var vis=getFilteredTxs();allCb.checked=vis.length>0&&vis.every(function(t){return selectedIds.has(t.id);});}
}
function toggleSelectAll(cb){
  var arr=getFilteredTxs();
  if(cb.checked)arr.forEach(function(t){selectedIds.add(t.id);});else arr.forEach(function(t){selectedIds.delete(t.id);});
  document.querySelectorAll('.row-cb').forEach(function(c){c.checked=cb.checked;});
  updateSelBar();
}
function clearSelection(){selectedIds.clear();renderTable();}
function updateSelBar(){
  var bar=document.getElementById('sel-bar');var cnt=document.getElementById('sel-count');
  if(bar)bar.style.display=selectedIds.size>0?'flex':'none';
  if(cnt)cnt.textContent=selectedIds.size+' selezionate';
}
function deleteSelected(){
  if(!selectedIds.size)return;
  if(!confirm('Eliminare '+selectedIds.size+' fatture?'))return;
  var ids=Array.from(selectedIds);
  var paths=txs.filter(function(t){return ids.indexOf(t.id)>=0&&t.filePath;}).map(function(t){return t.filePath;});
  var p=paths.length?sb.storage.from('invoice-files').remove(paths):Promise.resolve();
  p.then(function(){
    var done=0;
    ids.forEach(function(id){
      sb.from('invoices').delete().eq('id',id).then(function(){
        try{localStorage.removeItem('inv_file_'+id);}catch(e){}
        done++;if(done===ids.length){selectedIds.clear();loadInvoices();}
      });
    });
  });
}
function exportSelectedZIP(){
  var ids=Array.from(selectedIds);
  if(!ids.length)return;
  _buildZIP(txs.filter(function(t){return ids.indexOf(t.id)>=0;}),'Selezione');
}

// IMPORT CSV
function importCSV(input){
  var file=input.files[0];if(!file)return;
  var reader=new FileReader();
  reader.onload=function(e){
    var lines=e.target.result.split('\n').filter(function(l){return l.trim();});
    if(lines.length<2){alert('CSV vuoto.');return;}
    var headers=lines[0].split(',').map(function(h){return h.replace(/"/g,'').trim().toLowerCase();});
    var rows=[];
    for(var i=1;i<lines.length;i++){
      var cols=lines[i].match(/(".*?"|[^,]+)(?=,|$)/g)||[];
      cols=cols.map(function(c){return c.replace(/^"|"$/g,'').trim();});
      var row={};headers.forEach(function(h,j){row[h]=cols[j]||'';});
      var t={user_id:currentUser.id,
        date:row['date']||row['data']||'',
        service_month:row['service month']||row['service_month']||'',
        type:row['type']||'Received',invoice_num:row['invoice #']||row['invoice_num']||'',
        counterparty:row['counterparty']||row['controparte']||'',
        category:row['category']||row['categoria']||'Other',
        country:row['country']||'',vat_id:row['vat / tax id']||'',
        address:row['address']||'',description:row['description']||row['descrizione']||'',
        entrate_net:parseFloat(row['entrate net']||row['entrate_net']||0)||0,
        entrate_vat:parseFloat(row['entrate vat']||row['entrate_vat']||0)||0,
        entrate_total:parseFloat(row['entrate total']||row['entrate_total']||0)||0,
        uscite_net:parseFloat(row['uscite net']||row['uscite_net']||0)||0,
        uscite_vat:parseFloat(row['uscite vat']||row['uscite_vat']||0)||0,
        uscite_total:parseFloat(row['uscite total']||row['uscite_total']||0)||0,
        notes:row['notes']||row['note']||''};
      if(t.date&&t.counterparty)rows.push(t);
    }
    if(!rows.length){alert('Nessuna riga valida.');return;}
    if(!confirm('Importare '+rows.length+' transazioni?'))return;
    sb.from('invoices').insert(rows).then(function(r){
      if(r.error){alert('Errore import: '+r.error.message);return;}
      loadInvoices();showTab('registro');showMsg(rows.length+' transazioni importate!','success');
    });
  };
  reader.readAsText(file,'UTF-8');input.value='';
}

// SETTINGS
function loadSettings(){
  return sb.from('profile').select('*').maybeSingle().then(function(r){
    if(r.data){settings.name=r.data.name||'';settings.vat=r.data.vat_number||'';
      var sn=document.getElementById('s-name');if(sn)sn.value=settings.name;
      var sv=document.getElementById('s-vat');if(sv)sv.value=settings.vat;}
    settings.key=localStorage.getItem('inv_key')||'';
    settings.gclientid=localStorage.getItem('inv_gcid')||'';
    settings.gfolderid=localStorage.getItem('inv_gfid')||'';
    var sk=document.getElementById('s-key');if(sk&&settings.key)sk.value=settings.key;
    var gi=document.getElementById('s-gclientid');if(gi&&settings.gclientid)gi.value=settings.gclientid;
    var gf=document.getElementById('s-gfolderid');if(gf&&settings.gfolderid)gf.value=settings.gfolderid;
  });
}
function saveSettings(){
  settings.name=v('s-name');settings.vat=v('s-vat');settings.key=v('s-key');
  settings.gclientid=v('s-gclientid');settings.gfolderid=v('s-gfolderid');
  sb.from('profile').upsert({user_id:currentUser.id,name:settings.name,vat_number:settings.vat},{onConflict:'user_id'});
  localStorage.setItem('inv_key',settings.key);localStorage.setItem('inv_gcid',settings.gclientid);localStorage.setItem('inv_gfid',settings.gfolderid);
}
function cfg(k){return settings[k]||'';}
function updateCount(){var el=document.getElementById('tx-count');if(el)el.textContent=txs.length+' transazioni';}

// TABS
function showTab(t){
  // Guest permission check
  if(isGuestMode&&!canSeeSection(t)){
    showMsg('Sezione non disponibile in modalita ospite.','error');return;
  }
  ['carica','registro','summary','trading','utenti','settings'].forEach(function(id){
    var el=document.getElementById('tab-'+id);if(el)el.style.display=id===t?'':'none';
    var btn=document.getElementById('tab-btn-'+id);if(btn)btn.classList.toggle('active',id===t);
  });
  if(t==='registro'){renderTable();renderStats('stats-a');}
  if(t==='summary'){renderStats('stats-b');renderCat();renderTax();renderSimulator();renderAdvisory();}
  if(t==='trading'){loadPositions();}
  if(t==='utenti'){loadUtenti();}
}

// PERIOD FILTERS
function populateYearFilters(){
  var years={};txs.forEach(function(t){var y=(t.date||'').slice(0,4);if(y)years[y]=1;});
  var ya=Object.keys(years).sort();
  ['year-filter','year-filter-s'].forEach(function(id){
    var el=document.getElementById(id);if(!el)return;
    var cur=el.value;el.innerHTML='<option value="all">Tutti gli anni</option>';
    ya.forEach(function(y){el.innerHTML+='<option value="'+y+'">'+y+'</option>';});
    if(cur&&cur!=='all')el.value=cur;
  });
}
function togglePeriod(p,btn){
  if(p==='all'){filterPeriods=new Set(['all']);}else{
    filterPeriods.delete('all');
    if(filterPeriods.has(p))filterPeriods.delete(p);else filterPeriods.add(p);
    if(filterPeriods.size===0)filterPeriods.add('all');
  }
  document.querySelectorAll('#period-pills .period-pill').forEach(function(b){b.classList.toggle('active',filterPeriods.has(b.dataset.p));});
  renderTable();
}
function setFilterYear(y){filterYear=y;renderTable();}
function togglePeriodS(p,btn){
  if(p==='all'){filterPeriodsS=new Set(['all']);}else{
    filterPeriodsS.delete('all');
    if(filterPeriodsS.has(p))filterPeriodsS.delete(p);else filterPeriodsS.add(p);
    if(filterPeriodsS.size===0)filterPeriodsS.add('all');
  }
  document.querySelectorAll('#period-pills-s .period-pill').forEach(function(b){b.classList.toggle('active',filterPeriodsS.has(b.dataset.p));});
  renderCat();renderTax();renderSimulator();renderStats('stats-b');renderAdvisory();
}
function setFilterYearS(y){filterYearS=y;renderCat();renderTax();renderSimulator();renderStats('stats-b');renderAdvisory();}
function matchesPeriodMulti(t,periods,year){
  var d=getRefDate(t);
  if(year!=='all'&&d.slice(0,4)!==year)return false;
  if(periods.has('all'))return true;
  var m=d.slice(5,7);
  var qM={Q1:['01','02','03'],Q2:['04','05','06'],Q3:['07','08','09'],Q4:['10','11','12']};
  for(var p of periods){if(qM[p]&&qM[p].indexOf(m)>=0)return true;if(p===m)return true;}
  return false;
}
function getRefDate(t){return dateRef==='serviceMonth'?(t.serviceMonth||t.date):t.date;}
function getFilteredTxs(){return txs.filter(function(t){return(filter==='all'||t.type===filter)&&matchesPeriodMulti(t,filterPeriods,filterYear);});}
function getFilteredSummaryTxs(){return txs.filter(function(t){return matchesPeriodMulti(t,filterPeriodsS,filterYearS);});}

// TAX CALCULATIONS - Malta 2026 verified rates
// Source: MTCA official + PWC Tax Summaries + Broadwing 2026 payroll guide

// Malta Income Tax 2026 - Single rates (UPDATED from 2026 budget)
// 0-12,000: 0% | 12,001-16,000: 15% | 16,001-60,000: 25% | 60,001+: 35%
function maltaTaxSingle2026(c){
  if(c<=12000)return 0;
  if(c<=16000)return(c-12000)*0.15;
  if(c<=60000)return 600+(c-16000)*0.25;
  return 600+11000+(c-60000)*0.35;
}

// Malta SSC Class 2 (Self-Occupied) 2026 - CORRECTED
// Source: MTCA 2026 rates + PWC Malta Tax Summaries 2026
// Rate: 15% of prior year net income, min ~EUR 31.97/week, MAX EUR 83.89/week (born >= 1962)
// Threshold for max: ~EUR 29,100 net income (83.89*52/0.15)
function maltaSSC2026(ci){
  if(ci<910)return 0;
  var weekly=ci*0.15/52;
  weekly=Math.max(31.97,Math.min(83.89,weekly));
  return Math.round(weekly*52*100)/100;
}

function calcMaltaSE(gRev,dExp){
  var ci=Math.max(0,gRev-dExp);
  var tax=maltaTaxSingle2026(ci);
  var ssc=maltaSSC2026(ci);
  var sscWeekly=ci<910?0:Math.max(31.97,Math.min(83.89,ci*0.15/52));
  return {label:'Malta Self-Employed',eff:ci>0?(tax+ssc)/ci*100:0,net:ci-tax-ssc,total:tax+ssc,ci:ci,
    rows:[['Gross Revenue (net VAT)',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Reddito Imponibile',fmt(ci),'var(--orange)'],
      ['IRPEF 2026 (0%/<12k, 15%/16k, 25%/60k, 35%)',fmt(tax),''],
      ['SSC Class 2 (15% reddito, max 83.89/sett)',sscWeekly.toFixed(2)+'/sett = '+fmt(ssc)+'/anno',''],
      ['Totale IRPEF + SSC',fmt(tax+ssc),'var(--orange)'],
      ['Aliquota Effettiva',ci>0?((tax+ssc)/ci*100).toFixed(1)+'%':'0%',''],
      ['Netto',fmt(ci-tax-ssc),'var(--green)']]};
}
function calcMaltaLtd(gRev,dExp){
  var p=Math.max(0,gRev-dExp),ct=p*0.35,ref=ct*(6/7),net=ct-ref;
  return {label:'Malta Ltd',eff:p>0?net/p*100:0,net:p-net,total:net,ci:p,
    rows:[['Gross Revenue',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Utile Aziendale',fmt(p),'var(--orange)'],['Corporate Tax 35%',fmt(ct),''],
      ['Rimborso Azionista 6/7','-'+fmt(ref),'var(--green)'],
      ['Tax Netta effettiva (~5%)',fmt(net),'var(--orange)'],
      ['Aliquota Effettiva',p>0?(net/p*100).toFixed(1)+'%':'0%',''],
      ['Netto dopo tasse',fmt(p-net),'var(--green)']]};
}
function calcDubaiSE(gRev,dExp){
  var p=Math.max(0,gRev-dExp),thr=93750,tax=Math.max(0,p-thr)*0.09;
  return {label:'Dubai SE (UAE CT)',eff:p>0?tax/p*100:0,net:p-tax,total:tax,ci:p,
    rows:[['Gross Revenue',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Profitto Netto',fmt(p),'var(--orange)'],['Soglia esente CT (AED 375k ~ EUR 93.750)',fmt(thr),''],
      ['UAE Corporate Tax 9% su eccedenza',fmt(tax),'var(--orange)'],['Personal Income Tax','0%','var(--green)'],
      ['Nessun SSC/NI obbligatorio','0 EUR','var(--green)'],
      ['Aliquota Effettiva',p>0?(tax/p*100).toFixed(1)+'%':'0%',''],
      ['Netto',fmt(p-tax),'var(--green)']]};
}
function calcDubaiFZ(gRev,dExp){
  var p=Math.max(0,gRev-dExp);
  return {label:'Dubai Ltd Free Zone',eff:0,net:p,total:0,ci:p,
    rows:[['Gross Revenue',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
      ['Profitto Netto',fmt(p),'var(--orange)'],['CT Qualifying Free Zone (0%)','0 EUR','var(--green)'],
      ['Personal Income Tax','0 EUR','var(--green)'],['SSC/NI','0 EUR','var(--green)'],
      ['Costo annuo struttura FZ (stima)','4.000-10.000 EUR','var(--text2)'],
      ['Aliquota Effettiva','0% (+ costo FZ)','var(--green)'],
      ['Netto (ante costo FZ)',fmt(p),'var(--green)']]};
}
function calcItalyPIVA(gRev,dExp){
  if(gRev>85000){
    var rb=Math.max(0,gRev-dExp);
    var irpef=0;
    if(rb<=15000)irpef=rb*0.23;else if(rb<=28000)irpef=3450+(rb-15000)*0.25;
    else if(rb<=50000)irpef=6700+(rb-28000)*0.35;else irpef=14400+(rb-50000)*0.43;
    var inps=rb*0.2607,irap=rb*0.039,tot=irpef+inps+irap;
    return {label:'IT P.IVA Ordinaria',eff:rb>0?tot/rb*100:0,net:rb-tot,total:tot,ci:rb,
      rows:[['Gross Revenue',fmt(gRev),'var(--green)'],['Spese Deducibili',fmt(dExp),'var(--red)'],
        ['Reddito Netto',fmt(rb),'var(--orange)'],['IRPEF progressiva',fmt(irpef),''],
        ['INPS Gest. Separata 26%',fmt(inps),''],['IRAP 3.9%',fmt(irap),''],
        ['Totale oneri fiscali',fmt(tot),'var(--orange)'],['Netto',fmt(rb-tot),'var(--green)']]};
  }
  var coeff=0.78,base=gRev*coeff,inps=base*0.2607,irpef=(base-inps*0.5)*0.15,tot=irpef+inps;
  return {label:'IT P.IVA Forfettaria',eff:gRev>0?tot/gRev*100:0,net:gRev-tot,total:tot,ci:base,
    rows:[['Gross Revenue (no deduzione spese)',fmt(gRev),'var(--green)'],
      ['Coefficiente redditivita 78%',fmt(base),''],['INPS Gest. Separata 26%',fmt(inps),'var(--red)'],
      ['Base IRPEF (ded. 50% INPS)',fmt(base-inps*0.5),''],['IRPEF Forfettaria 15%',fmt(irpef),'var(--orange)'],
      ['Totale Tasse+Contributi',fmt(tot),'var(--orange)'],
      ['Aliquota su fatturato',gRev>0?(tot/gRev*100).toFixed(1)+'%':'0%',''],
      ['Netto',fmt(gRev-tot),'var(--green)']]};
}
function getCalc(regime,gRev,dExp){
  if(regime==='malta-se')return calcMaltaSE(gRev,dExp);
  if(regime==='malta-ltd')return calcMaltaLtd(gRev,dExp);
  if(regime==='dubai-se')return calcDubaiSE(gRev,dExp);
  if(regime==='dubai-fz')return calcDubaiFZ(gRev,dExp);
  return calcItalyPIVA(gRev,dExp);
}
function setRegime(r,btn){
  currentRegime=r;
  document.querySelectorAll('.regime-tab').forEach(function(b){b.classList.remove('active');});
  if(btn)btn.classList.add('active');renderTax();
}
function getTaxInputs(){
  var arr=getFilteredSummaryTxs();
  var gRev=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var dExp=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  var lumpIn=parseFloat((document.getElementById('tax-lump-in')||{}).value)||0;
  var lumpOut=parseFloat((document.getElementById('tax-lump-out')||{}).value)||0;
  return {gRev:gRev+lumpIn, dExp:dExp+lumpOut, hasLump:lumpIn>0||lumpOut>0};
}
function renderTax(){
  var inp=getTaxInputs();
  var el=document.getElementById('tax-rows');if(!el)return;
  var c=getCalc(currentRegime,inp.gRev,inp.dExp);
  var lumpNote=inp.hasLump?'<div style="font-size:10px;color:var(--orange);margin-bottom:8px;padding:5px 10px;background:rgba(217,119,6,0.08);border-radius:4px">Simulazione con lump sum aggiuntiva attiva</div>':'';
  el.innerHTML=lumpNote+c.rows.map(function(r){return '<div class="tax-row"><span class="tax-label">'+r[0]+'</span><span class="tax-value" style="'+(r[2]?'color:'+r[2]:'')+'">'+r[1]+'</span></div>';}).join('');
}

// SIMULATOR
function renderSimulator(){
  var arr=getFilteredSummaryTxs();
  var bIn=arr.reduce(function(s,t){return s+(t.entrateNet||0);},0);
  var bOut=arr.reduce(function(s,t){return s+(t.usciteNet||0);},0);
  var eIn=parseFloat(document.getElementById('sim-extra-in').value)||0;
  var eOut=parseFloat(document.getElementById('sim-extra-out').value)||0;
  var gRev=bIn+eIn,dExp=bOut+eOut;
  var regimes=[['malta-se','#4f46e5'],['malta-ltd','#0891b2'],['dubai-se','#d97706'],['dubai-fz','#16a34a'],['italy-piva','#dc2626']];
  var el=document.getElementById('sim-results');if(!el)return;
  el.innerHTML='<div class="sim-grid">'+regimes.map(function(rp){
    var c=getCalc(rp[0],gRev,dExp);
    return '<div class="sim-col">'+
      '<div class="sim-regime" style="background:'+rp[1]+'18;color:'+rp[1]+'">'+c.label+'</div>'+
      '<div class="sim-row"><span style="color:var(--text2)">Tasse</span><b style="color:var(--red)">'+fmt(c.total)+'</b></div>'+
      '<div class="sim-row"><span style="color:var(--text2)">Aliquota</span><b>'+c.eff.toFixed(1)+'%</b></div>'+
      '<div class="sim-row"><span style="color:var(--text2)">Netto</span><b style="color:var(--green)">'+fmt(c.net)+'</b></div>'+
      '</div>';
  }).join('')+'</div>';
}

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
      driveBadge('connected','Drive connesso \u2713');
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
  el.innerHTML=(ok===true?'<span style="color:var(--green)">\u2601\uFE0F '+esc(msg)+'</span>'
    :ok===false?'<span style="color:var(--red)">\u26A0\uFE0F '+esc(msg)+'</span>'
    :'<span style="color:var(--accent)">\u23F3 '+esc(msg)+'</span>');
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
  set('f-vatid',d.vatId||'\u2014');
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
  filter=f;['ftype-all','ftype-issued','ftype-received'].forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('active');});
  if(btn)btn.classList.add('active');renderTable();
}
function setFilter(f,btn){setTypeFilter(f,btn);}
function setDateRef(ref,btn){
  dateRef=ref;var db=document.getElementById('ref-date-btn');var sb2=document.getElementById('ref-svc-btn');
  if(db)db.classList.toggle('active',ref==='date');if(sb2)sb2.classList.toggle('active',ref==='serviceMonth');
  renderTable();
}

function renderTable(){
  var arr=getFilteredTxs().slice().sort(function(a,b){
    var va=a[sortField]||'',vb=b[sortField]||'';
    if(typeof va==='number'||typeof vb==='number')return((parseFloat(va)||0)-(parseFloat(vb)||0))*sortDir;
    return String(va).localeCompare(String(vb))*sortDir;
  });
  var tbody=document.getElementById('tbody');var empty=document.getElementById('empty');
  if(!tbody)return;
  renderFilteredStats(arr);
  var dups=findDuplicates(txs);
  if(!arr.length){tbody.innerHTML='';empty.style.display='';updateSelBar();return;}
  empty.style.display='none';
  tbody.innerHTML=arr.map(function(t){
    var isIn=t.type==='Issued';var sel=selectedIds.has(t.id);
    var hasFile=t.filePath||localStorage.getItem('inv_file_'+t.id);
    var net=((t.entrateTotal||0)-(t.usciteTotal||0));
    var netCls=net>0?'net-pos':net<0?'net-neg':'';
    var netStr=net!==0?(net>0?'+':'')+fmt(net):'--';
    var isDup=dups.has(t.id);
    var dupBadge=isDup?'<span title="Possibile duplicato" style="color:var(--orange);font-size:10px;margin-right:3px">&#9888;</span>':'';
    var dupValidateBtn=isDup?'<button class="btn" style="font-size:9px;padding:2px 7px;background:rgba(251,146,60,0.15);color:var(--orange);border-color:var(--orange);white-space:nowrap" onclick="validateDuplicate('+t.id+')" title="Segna come non duplicato">Valida</button>':'';
    var rowBg=isDup?'background:rgba(251,146,60,0.08)':sel?'background:var(--accent-light)':'';
    return '<tr style="'+rowBg+'">'+
      '<td class="cb-cell"><input type="checkbox" class="row-cb" '+(sel?'checked':'')+' onchange="toggleSelect('+t.id+',this)"></td>'+
      '<td>'+dupBadge+'<span class="badge '+(isIn?'badge-in':'badge-out')+'">'+(isIn?'Issued':'Received')+'</span></td>'+
      '<td style="white-space:nowrap;font-weight:500">'+formatDate(t.date)+'</td>'+
      '<td style="color:var(--text2)">'+esc(t.serviceMonth)+'</td>'+
      '<td style="color:var(--text2);white-space:nowrap">'+esc(t.invoice)+'</td>'+
      '<td class="'+netCls+'">'+netStr+'</td>'+
      '<td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(t.counterparty)+'</td>'+
      '<td style="color:var(--text2);font-size:10.5px;white-space:nowrap">'+esc(t.category)+'</td>'+
      '<td style="color:var(--text2)">'+esc(t.country)+'</td>'+
      '<td class="'+(t.entrateNet?'amount-in':'')+'">'+fmtN(t.entrateNet)+'</td>'+
      '<td class="'+(t.entrateVat?'amount-in':'')+'">'+fmtN(t.entrateVat)+'</td>'+
      '<td class="'+(t.entrateTotal?'amount-in':'')+'"><b>'+fmtN(t.entrateTotal)+'</b></td>'+
      '<td class="'+(t.usciteNet?'amount-out':'')+'">'+fmtN(t.usciteNet)+'</td>'+
      '<td class="'+(t.usciteVat?'amount-out':'')+'">'+fmtN(t.usciteVat)+'</td>'+
      '<td class="'+(t.usciteTotal?'amount-out':'')+'"><b>'+fmtN(t.usciteTotal)+'</b></td>'+
      '<td style="color:var(--text2);font-size:10.5px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(t.notes)+'</td>'+
      '<td style="white-space:nowrap">'+
        dupValidateBtn+
        (hasFile?'<button class="btn btn-edit" style="font-size:10px;padding:4px 7px" onclick="downloadInvoiceFile(txs.find(function(x){return x.id==='+t.id+'}))" title="Scarica">&#128229;</button>':'')+
        '<button class="btn btn-edit" onclick="editTx('+t.id+')" title="Modifica">&#9998;</button>'+
        '<button class="btn btn-danger" onclick="delTx('+t.id+')">&#215;</button>'+
      '</td></tr>';
  }).join('');
  // Duplicate warning banner
  if(dups.size>0){
    var dupCount=arr.filter(function(t){return dups.has(t.id);}).length;
    if(dupCount>0){
      var warn=document.getElementById('dup-warning');
      if(!warn){warn=document.createElement('div');warn.id='dup-warning';tbody.parentElement.parentElement.insertBefore(warn,tbody.parentElement);}
      warn.innerHTML='<div style="background:rgba(251,146,60,0.12);border:1px solid var(--orange);border-radius:var(--radius-sm);padding:8px 14px;font-size:12px;color:var(--orange);margin-bottom:8px;display:flex;align-items:center;gap:10px">'+
        '<span>&#9888; <b>'+dupCount+' transazioni potrebbero essere duplicate</b> (stesso n. fattura o stesso importo+data). Righe evidenziate in arancione.</span>'+
        '<button class="btn" style="font-size:10px;padding:3px 10px;background:rgba(251,146,60,0.2);color:var(--orange);border-color:var(--orange);margin-left:auto;white-space:nowrap" onclick="validateAllDuplicates()">Valida tutte</button>'+
        '</div>';
    }
  } else {
    var warn=document.getElementById('dup-warning');if(warn)warn.innerHTML='';
  }
  updateSelBar();
  var allCb=document.getElementById('cb-all');
  if(allCb)allCb.checked=arr.length>0&&arr.every(function(t){return selectedIds.has(t.id);});
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

// CATEGORY SUMMARY with expand/collapse + group filter
var catGroupMap={
  'Travel':['Travel - Flights','Travel - Accommodation','Travel - Local Transport','Travel - Taxi','Travel - Car Rental','Travel - Other'],
  'Revenue':['Revenue - Consultancy','Revenue - Other','Revenue - Services'],
  'Professional Services':['Professional Services - Accountant','Professional Services - Consultancy','Professional Services - Legal','Professional Services - Other'],
  'Utilities':['Utilities - Internet/Mobile','Utilities - Office','Utilities - Other'],
  'Equipment':['Equipment - Office','Equipment - Other','Equipment - Software']
};

function groupCatName(cat){
  if(catMergeMode==='detail')return cat;
  for(var g in catGroupMap){if(catGroupMap[g].indexOf(cat)>=0)return g;}
  return cat;
}
function selectAllCats(all){
  var chips=document.querySelectorAll('.cat-chip');
  chips.forEach(function(c){
    var active=all;
    c.dataset.active=active?'1':'0';
    c.style.background=active?'var(--accent)':'var(--surface2)';
    c.style.color=active?'#fff':'var(--text2)';
    c.style.borderColor=active?'var(--accent)':'var(--border)';
  });
  if(all){catFilterSet=null;}else{catFilterSet=new Set();}
  renderCat();
}
function toggleCatChip(idx,el){
  // idx is the index into allCatsArr, cat name stored in chip text
  var cat=el.textContent.trim();
  if(catFilterSet===null){
    // was "all" - now deselect this one
    var allChips=Array.from(document.querySelectorAll('.cat-chip'));
    catFilterSet=new Set(allChips.map(function(c){return c.textContent.trim();}));
    catFilterSet.delete(cat);
    allChips.forEach(function(c){
      var on=catFilterSet.has(c.textContent.trim());
      c.dataset.active=on?'1':'0';
      c.style.background=on?'var(--accent)':'var(--surface2)';
      c.style.color=on?'#fff':'var(--text2)';
      c.style.borderColor=on?'var(--accent)':'var(--border)';
    });
  } else {
    if(catFilterSet.has(cat)){catFilterSet.delete(cat);}else{catFilterSet.add(cat);}
    var on=catFilterSet.has(cat);
    el.dataset.active=on?'1':'0';
    el.style.background=on?'var(--accent)':'var(--surface2)';
    el.style.color=on?'#fff':'var(--text2)';
    el.style.borderColor=on?'var(--accent)':'var(--border)';
  }
  renderCat();
}
function groupCatName(cat){return cat;} // kept for compatibility
function toggleCatSection(which){
  if(which==='in'){
    catEntrateExpanded=!catEntrateExpanded;
    var sec=document.getElementById('cat-section-in');
    var btn=document.getElementById('cat-toggle-in');
    if(sec)sec.style.display=catEntrateExpanded?'':'none';
    if(btn)btn.textContent=catEntrateExpanded?'Riduci':'Espandi';
  } else {
    catUsciteExpanded=!catUsciteExpanded;
    var sec=document.getElementById('cat-section-out');
    var btn=document.getElementById('cat-toggle-out');
    if(sec)sec.style.display=catUsciteExpanded?'':'none';
    if(btn)btn.textContent=catUsciteExpanded?'Riduci':'Espandi';
  }
}
function renderCat(){
  var arr=getFilteredSummaryTxs();
  var allCatsArr=Array.from(new Set(arr.map(function(t){return t.category||'Other';}))).sort();

  // Build filter chips
  var chipsEl=document.getElementById('cat-filter-chips');
  if(chipsEl){
    chipsEl.innerHTML='';
    allCatsArr.forEach(function(c){
      var on=catFilterSet===null||catFilterSet.has(c);
      var btn=document.createElement('button');
      btn.className='cat-chip';
      btn.textContent=c||'Other';
      btn.dataset.active=on?'1':'0';
      btn.style.padding='3px 10px';
      btn.style.borderRadius='20px';
      btn.style.border='1.5px solid '+(on?'var(--accent)':'var(--border)');
      btn.style.background=on?'var(--accent)':'var(--surface2)';
      btn.style.color=on?'#fff':'var(--text2)';
      btn.style.fontSize='11px';
      btn.style.cursor='pointer';
      btn.style.fontWeight=on?'600':'400';
      btn.addEventListener('click',function(){toggleCatChip(btn);});
      chipsEl.appendChild(btn);
    });
  }

  // Filter by catFilterSet
  var filteredArr=catFilterSet===null?arr:arr.filter(function(t){return catFilterSet.has(t.category||'Other');});
  var mapIn={},mapOut={};
  filteredArr.forEach(function(t){
    var c=t.category||'Other';
    if(!mapIn[c])mapIn[c]={n:0,v:0,t:0};
    if(!mapOut[c])mapOut[c]={n:0,v:0,t:0};
    if(t.type==='Issued'){mapIn[c].n+=t.entrateNet;mapIn[c].v+=t.entrateVat;mapIn[c].t+=t.entrateTotal;}
    else{mapOut[c].n+=t.usciteNet;mapOut[c].v+=t.usciteVat;mapOut[c].t+=t.usciteTotal;}
  });
  var usedCats=Array.from(new Set(Object.keys(mapIn).concat(Object.keys(mapOut)))).sort();
  function buildRows(map,cats){
    var tN=0,tV=0,tT=0;
    var r=cats.filter(function(c){return map[c]&&map[c].t!==0;}).map(function(c){
      tN+=map[c].n;tV+=map[c].v;tT+=map[c].t;
      return '<tr><td style="color:var(--text2);font-size:11px">'+c+'</td><td>'+fmt(map[c].n)+'</td><td>'+fmt(map[c].v)+'</td><td>'+fmt(map[c].t)+'</td></tr>';
    }).join('');
    if(!r)return '<tr><td colspan="4" style="color:var(--text3);text-align:center;padding:14px">Nessun dato</td></tr>';
    return r+'<tr style="font-weight:700"><td>TOTAL</td><td>'+fmt(tN)+'</td><td>'+fmt(tV)+'</td><td>'+fmt(tT)+'</td></tr>';
  }
  var bi=document.getElementById('cat-tbody-in');if(bi)bi.innerHTML=buildRows(mapIn,usedCats);
  var bo=document.getElementById('cat-tbody-out');if(bo)bo.innerHTML=buildRows(mapOut,usedCats);
}


function toggleCatChip(idx,el){
  // idx is the index into allCatsArr, cat name stored in chip text
  var cat=el.textContent.trim();
  if(catFilterSet===null){
    // was "all" - now deselect this one
    var allChips=Array.from(document.querySelectorAll('.cat-chip'));
    catFilterSet=new Set(allChips.map(function(c){return c.textContent.trim();}));
    catFilterSet.delete(cat);
    allChips.forEach(function(c){
      var on=catFilterSet.has(c.textContent.trim());
      c.dataset.active=on?'1':'0';
      c.style.background=on?'var(--accent)':'var(--surface2)';
      c.style.color=on?'#fff':'var(--text2)';
      c.style.borderColor=on?'var(--accent)':'var(--border)';
    });
  } else {
    if(catFilterSet.has(cat)){catFilterSet.delete(cat);}else{catFilterSet.add(cat);}
    var on=catFilterSet.has(cat);
    el.dataset.active=on?'1':'0';
    el.style.background=on?'var(--accent)':'var(--surface2)';
    el.style.color=on?'#fff':'var(--text2)';
    el.style.borderColor=on?'var(--accent)':'var(--border)';
  }
  renderCat();
}
function groupCatName(cat){return cat;} // kept for compatibility
function toggleCatSection(which){
  if(which==='in'){
    catEntrateExpanded=!catEntrateExpanded;
    var sec=document.getElementById('cat-section-in');
    var btn=document.getElementById('cat-toggle-in');
    if(sec)sec.style.display=catEntrateExpanded?'':'none';
    if(btn)btn.textContent=catEntrateExpanded?'Riduci':'Espandi';
  } else {
    catUsciteExpanded=!catUsciteExpanded;
    var sec=document.getElementById('cat-section-out');
    var btn=document.getElementById('cat-toggle-out');
    if(sec)sec.style.display=catUsciteExpanded?'':'none';
    if(btn)btn.textContent=catUsciteExpanded?'Riduci':'Espandi';
  }
}

function selectAllCats(all){
  var chips=document.querySelectorAll('.cat-chip');
  chips.forEach(function(c){
    var active=all;
    c.dataset.active=active?'1':'0';
    c.style.background=active?'var(--accent)':'var(--surface2)';
    c.style.color=active?'#fff':'var(--text2)';
    c.style.borderColor=active?'var(--accent)':'var(--border)';
  });
  if(all){catFilterSet=null;}else{catFilterSet=new Set();}
  renderCat();
}
function toggleCatChip(idx,el){
  // idx is the index into allCatsArr, cat name stored in chip text
  var cat=el.textContent.trim();
  if(catFilterSet===null){
    // was "all" - now deselect this one
    var allChips=Array.from(document.querySelectorAll('.cat-chip'));
    catFilterSet=new Set(allChips.map(function(c){return c.textContent.trim();}));
    catFilterSet.delete(cat);
    allChips.forEach(function(c){
      var on=catFilterSet.has(c.textContent.trim());
      c.dataset.active=on?'1':'0';
      c.style.background=on?'var(--accent)':'var(--surface2)';
      c.style.color=on?'#fff':'var(--text2)';
      c.style.borderColor=on?'var(--accent)':'var(--border)';
    });
  } else {
    if(catFilterSet.has(cat)){catFilterSet.delete(cat);}else{catFilterSet.add(cat);}
    var on=catFilterSet.has(cat);
    el.dataset.active=on?'1':'0';
    el.style.background=on?'var(--accent)':'var(--surface2)';
    el.style.color=on?'#fff':'var(--text2)';
    el.style.borderColor=on?'var(--accent)':'var(--border)';
  }
  renderCat();
}
function groupCatName(cat){return cat;} // kept for compatibility
function toggleCatSection(which){
  if(which==='in'){
    catEntrateExpanded=!catEntrateExpanded;
    var sec=document.getElementById('cat-section-in');
    var btn=document.getElementById('cat-toggle-in');
    if(sec)sec.style.display=catEntrateExpanded?'':'none';
    if(btn)btn.textContent=catEntrateExpanded?'Riduci':'Espandi';
  } else {
    catUsciteExpanded=!catUsciteExpanded;
    var sec=document.getElementById('cat-section-out');
    var btn=document.getElementById('cat-toggle-out');
    if(sec)sec.style.display=catUsciteExpanded?'':'none';
    if(btn)btn.textContent=catUsciteExpanded?'Riduci':'Espandi';
  }
}
function renderCat(){
  var arr=getFilteredSummaryTxs();
  var mapIn={},mapOut={};
  arr.forEach(function(t){
    var c=groupCatName(t.category||'Other');
    if(!mapIn[c])mapIn[c]={n:0,v:0,t:0};
    if(!mapOut[c])mapOut[c]={n:0,v:0,t:0};
    if(t.type==='Issued'){mapIn[c].n+=t.entrateNet;mapIn[c].v+=t.entrateVat;mapIn[c].t+=t.entrateTotal;}
    else{mapOut[c].n+=t.usciteNet;mapOut[c].v+=t.usciteVat;mapOut[c].t+=t.usciteTotal;}
  });
  var allCats=Array.from(new Set(Object.keys(mapIn).concat(Object.keys(mapOut)))).sort();
  function buildRows(map,cats){
    var tN=0,tV=0,tT=0;
    var r=cats.filter(function(c){return map[c]&&map[c].t!==0;}).map(function(c){
      tN+=map[c].n;tV+=map[c].v;tT+=map[c].t;
      return '<tr><td style="color:var(--text2);font-size:11px">'+c+'</td><td>'+fmt(map[c].n)+'</td><td>'+fmt(map[c].v)+'</td><td>'+fmt(map[c].t)+'</td></tr>';
    }).join('');
    if(!r)return '<tr><td colspan="4" style="color:var(--text3);text-align:center;padding:14px">Nessun dato</td></tr>';
    return r+'<tr><td><b>TOTAL</b></td><td><b>'+fmt(tN)+'</b></td><td><b>'+fmt(tV)+'</b></td><td><b>'+fmt(tT)+'</b></td></tr>';
  }

  var bi=document.getElementById('cat-tbody-in');if(bi)bi.innerHTML=buildRows(mapIn,allCats);
  var bo=document.getElementById('cat-tbody-out');if(bo)bo.innerHTML=buildRows(mapOut,allCats);

  // Expand/collapse
  var secIn=document.getElementById('cat-section-in');
  var secOut=document.getElementById('cat-section-out');
  var togIn=document.getElementById('cat-toggle-in');
  var togOut=document.getElementById('cat-toggle-out');
  if(secIn)secIn.style.display=catEntrateExpanded?'':'none';
  if(secOut)secOut.style.display=catUsciteExpanded?'':'none';
  if(togIn)togIn.textContent=catEntrateExpanded?'Riduci':'Espandi';
  if(togOut)togOut.textContent=catUsciteExpanded?'Riduci':'Espandi';
}

// SMART ADVISORY - detailed with costs
function renderAdvisory(){
  var panel=document.getElementById('advisory-panel');
  var content=document.getElementById('advisory-content');
  if(!panel||!content)return;
  var inp=getTaxInputs();
  var gRev=inp.gRev, dExp=inp.dExp;
  var ci=Math.max(0,gRev-dExp);
  var tips=[];
  if(ci===0&&gRev===0){
    tips.push({type:'ok',title:'Nessun dato nel periodo',body:'Seleziona un periodo con transazioni.'});
    showAdv(tips,panel,content);return;
  }

  // Malta 2026 bracket alerts
  var brackets=[
    {lim:12000,nextRate:0.15,prevRate:0,label:'12.000'},
    {lim:16000,nextRate:0.25,prevRate:0.15,label:'16.000'},
    {lim:60000,nextRate:0.35,prevRate:0.25,label:'60.000'}
  ];
  brackets.forEach(function(b){
    var over=ci-b.lim;
    if(over>0&&over<=3000){
      var saving=over*(b.nextRate-b.prevRate);
      tips.push({type:b.lim===60000?'danger':'warn',
        title:'Sei appena sopra il bracket '+b.label+' EUR (aliquota '+Math.round(b.nextRate*100)+'%)',
        body:'Reddito imponibile: <b>'+fmt(ci)+' EUR</b>, supera '+b.label+' EUR di <b>'+fmt(over)+' EUR</b>. '+
          'Questo ti costa <b>'+fmt(saving)+' EUR extra di IRPEF</b> rispetto a restare sotto la soglia.<br>'+
          '<b>Azione concreta:</b> Effettua almeno '+fmt(over)+' EUR di spese aziendali deducibili entro fine anno '+
          '(es. attrezzatura informatica, abbonamenti software, formazione professionale, home office, viaggi business) '+
          'per rientrare sotto '+b.label+' EUR e risparmiare '+fmt(saving)+' EUR di tasse.'
      });
    }
    if(ci<b.lim&&ci>=b.lim-2000){
      tips.push({type:'info',
        title:'Prossimo al bracket '+b.label+' EUR',
        body:'Sei a <b>'+fmt(b.lim-ci)+' EUR</b> dalla soglia dove scatta il '+Math.round(b.nextRate*100)+'% di IRPEF. '+
          'Puoi ancora fatturare circa '+fmt(b.lim-ci)+' EUR netti prima di entrare nel bracket superiore. '+
          'Tieni monitorato il reddito negli ultimi mesi di anno fiscale.'
      });
    }
  });

  // SSC Class 2 bracket (Malta) - corretto 2026
  var sscThreshold=29100; // at this income, 15% = 83.89/week
  if(ci>sscThreshold-2000&&ci<sscThreshold){
    tips.push({type:'warn',
      title:'Vicino al massimale SSC Class 2 (circa 29.000 EUR)',
      body:'Oltre circa 29.000 EUR di reddito netto la SSC raggiunge il massimale di <b>83.89 EUR/settimana (4.362 EUR/anno)</b>. '+
        'Attualmente paghi '+fmt(maltaSSC2026(ci))+' EUR/anno di SSC. '+
        'Sei a '+fmt(sscThreshold-ci)+' EUR dalla soglia del massimale.'
    });
  }

  // Regime comparison - detailed
  if(ci>15000){
    var se=calcMaltaSE(gRev,dExp);
    var ltd=calcMaltaLtd(gRev,dExp);
    var dse=calcDubaiSE(gRev,dExp);
    var dfz=calcDubaiFZ(gRev,dExp);
    var options=[
      {name:'Malta Ltd',calc:ltd,
       details:'<ul style="margin:6px 0 0 16px;font-size:11.5px">'+
         '<li>Tasse azienda: ~5% effettivo (35% CT con rimborso 6/7 agli azionisti)</li>'+
         '<li>Costo costituzione Ltd: circa 1.500-3.000 EUR una tantum</li>'+
         '<li>Costo annuo contabilita + compliance: circa 3.000-6.000 EUR/anno</li>'+
         '<li>Direttore residente (se richiesto): 2.000-5.000 EUR/anno</li>'+
         '<li>Ideale da: circa 80.000 EUR/anno di fatturato</li>'+
         '<li>Pro: rimborso imposta, struttura per crescita, credibilita B2B</li>'+
         '<li>Contro: complessita gestione, costi fissi annui</li>'+
         '</ul>'},
      {name:'Dubai SE (Freelancer License)',calc:dse,
       details:'<ul style="margin:6px 0 0 16px;font-size:11.5px">'+
         '<li>UAE CT 9% solo su utile eccedente AED 375.000 (~93.750 EUR)</li>'+
         '<li>Nessuna personal income tax, nessun SSC obbligatorio</li>'+
         '<li>Costo Freelancer License (es. IFZA, Meydan): 4.000-7.000 EUR/anno</li>'+
         '<li>Visto UAE: 3.000-4.000 EUR prima emissione, rinnovo ~2.000 EUR</li>'+
         '<li>Conto bancario UAE: richiede presenza fisica, ~500-1.000 EUR setup</li>'+
         '<li>Obbligo residenza UAE: minimo 183 giorni/anno per evitare tassazione Malta</li>'+
         '<li>Pro: aliquota bassissima, nessun SSC, hub internazionale</li>'+
         '<li>Contro: necessita cambio residenza effettivo, costi di vita Dubai</li>'+
         '</ul>'},
      {name:'Dubai Ltd Free Zone',calc:dfz,
       details:'<ul style="margin:6px 0 0 16px;font-size:11.5px">'+
         '<li>Corporate Tax 0% se Qualifying Free Zone Person (QFZP)</li>'+
         '<li>Costo costituzione FZ (es. IFZA, DIFC, DMCC): 5.000-12.000 EUR</li>'+
         '<li>Rinnovo annuo licenza: 3.000-8.000 EUR/anno</li>'+
         '<li>Visto UAE per socio/direttore: 3.000-4.000 EUR</li>'+
         '<li>Conto bancario UAE per la societa: 1.000-2.000 EUR setup</li>'+
         '<li>Necessita agente registrato + segretaria societaria: ~2.000 EUR/anno</li>'+
         '<li>Obbligo di non svolgere attivita con persone UAE (regola QFZP)</li>'+
         '<li>Pro: 0% tasse se strutturato correttamente, massima flessibilita</li>'+
         '<li>Contro: costi fissi elevati, complessita compliance, cambio residenza necessario</li>'+
         '</ul>'}
    ];
    options.sort(function(a,b){return a.calc.total-b.calc.total;});
    var best=options[0];
    var saving=se.total-best.calc.total;
    if(saving>1000){
      tips.push({type:'info',
        title:'Risparmio potenziale con '+best.name+': '+fmt(saving)+' EUR/anno',
        body:'Con <b>'+best.name+'</b> pagheresti circa <b>'+fmt(best.calc.total)+' EUR/anno</b> di tasse '+
          'invece di <b>'+fmt(se.total)+' EUR</b> (Malta SE attuale). '+
          'Risparmio stimato: <b>'+fmt(saving)+' EUR/anno</b>.'+best.details+
          '<div style="margin-top:8px;font-size:11px;color:var(--text3)">* Stima indicativa. Consulta un commercialista specializzato prima di procedere.</div>'
      });
    }
    // Show all options comparison
    if(options.length>1){
      var altSaving=se.total-options[1].calc.total;
      if(altSaving>500&&altSaving<saving){
        tips.push({type:'info',
          title:'Alternativa: '+options[1].name+' (risparmio '+fmt(altSaving)+' EUR/anno)',
          body:'Con <b>'+options[1].name+'</b> pagheresti circa <b>'+fmt(options[1].calc.total)+' EUR/anno</b> di tasse.'+options[1].details+
            '<div style="margin-top:8px;font-size:11px;color:var(--text3)">* Stima indicativa. Consulta un commercialista specializzato prima di procedere.</div>'
        });
      }
    }
  }

  // Expenses optimization
  if(gRev>20000&&dExp/gRev<0.10){
    tips.push({type:'info',
      title:'Spese deducibili basse ('+Math.round(dExp/gRev*100)+'%)',
      body:'Le spese aziendali sono solo il '+Math.round(dExp/gRev*100)+'% del fatturato. '+
        'Ogni 1.000 EUR di spese deducibili aggiuntive riduce le tasse di circa '+fmt(1000*0.25)+'-'+fmt(1000*0.35)+' EUR (aliquota corrente).<br>'+
        '<b>Spese deducibili tipiche per freelance a Malta:</b>'+
        '<ul style="margin:6px 0 0 16px;font-size:11.5px">'+
        '<li>Home office: % del canone/mutuo proporzionale ai m2 usati</li>'+
        '<li>Telefono e internet: 50-100% se uso professionale</li>'+
        '<li>Attrezzatura IT: laptop, monitor, periferiche</li>'+
        '<li>Software e abbonamenti professionali</li>'+
        '<li>Viaggi e trasferte di lavoro (voli, hotel, trasporti)</li>'+
        '<li>Formazione e corsi professionali</li>'+
        '<li>Consulenza contabile e legale</li>'+
        '</ul>'
    });
  }

  // Italian forfettario warning
  if(gRev>=80000&&gRev<=90000){
    tips.push({type:'warn',
      title:'Attenzione: vicino al limite forfettario italiano (85.000 EUR)',
      body:'Superare 85.000 EUR esclude dal regime forfettario (15% flat). '+
        'Sopra questa soglia si applica il regime ordinario: IRPEF progressiva + INPS 26% + IRAP 3.9%. '+
        'Il salto di regime puo aumentare il carico fiscale di 10-20% sul fatturato marginale.'
    });
  }

  if(tips.length===0){
    tips.push({type:'ok',
      title:'Situazione fiscale sotto controllo',
      body:'Nessuna soglia critica imminente nel periodo selezionato. '+
        'Continua a monitorare le spese deducibili e usa il simulatore per proiettare scenari futuri.'
    });
  }
  showAdv(tips,panel,content);
}
function showAdv(tips,panel,content){
  var typeMap={danger:'adv-danger',warn:'adv-warn',info:'adv-info',ok:'adv-ok'};
  var iconMap={danger:'&#9888;',warn:'&#128161;',info:'&#128202;',ok:'&#9989;'};
  panel.style.display='';
  content.innerHTML=tips.map(function(t){
    return '<div class="adv-card '+typeMap[t.type]+'">'+
      '<div class="adv-icon">'+iconMap[t.type]+'</div>'+
      '<div style="flex:1"><div class="adv-title">'+t.title+'</div><div>'+t.body+'</div></div></div>';
  }).join('');
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
function fmtN(n){return n?fmt(n):'\u2014';}
function today(){return new Date().toISOString().split('T')[0];}
function maltaTax(c){
  if(c<=9100)return 0;
  if(c<=14500)return(c-9100)*.15;
  if(c<=19500)return 810+(c-14500)*.25;
  if(c<=60000)return 2060+(c-19500)*.25;
  return 12235+(c-60000)*.35;
}

// ZIP
function _buildZIP(arr,label){
  if(!arr.length){alert('Nessuna fattura.');return;}
  var zip=new JSZip();var folder=zip.folder('Fatture_'+label);
  var wb=XLSX.utils.book_new();
  var rows=[['Data','Svc Month','Tipo','Fattura #','Controparte','Categoria','Paese','Net EUR','VAT EUR','Tot EUR','Note']];
  arr.forEach(function(t){rows.push([t.date,t.serviceMonth,t.type,t.invoice,t.counterparty,t.category,t.country,
    t.type==='Issued'?t.entrateNet:t.usciteNet,t.type==='Issued'?t.entrateVat:t.usciteVat,
    t.type==='Issued'?t.entrateTotal:t.usciteTotal,t.notes]);});
  var ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[10,12,10,16,28,28,10,12,12,12,40].map(function(w){return{wch:w};});
  XLSX.utils.book_append_sheet(wb,ws,'Registro');
  folder.file('Registro_'+label+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}));
  var missing=[];
  arr.forEach(function(t){
    var stored=localStorage.getItem('inv_file_'+t.id);
    if(stored){try{
      var f=JSON.parse(stored);
      var inv=(t.invoice||'fattura').replace(/[\/\\:*?"<>|]/g,'-');
      var cp=t.counterparty.slice(0,20).replace(/[\/\\:*?"<>|]/g,'-');
      var bin=atob(f.b64);var bytes=new Uint8Array(bin.length);
      for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      folder.file(t.date+'_'+inv+'_'+cp+'.'+f.name.split('.').pop(),bytes);
    }catch(e){missing.push(t.invoice||t.counterparty);}}
    else missing.push(t.invoice||t.counterparty);
  });
  if(missing.length)folder.file('_FILE_MANCANTI.txt','File non allegati:\n'+missing.join('\n'));
  zip.generateAsync({type:'blob'}).then(function(blob){
    var url=URL.createObjectURL(blob);var a=document.createElement('a');
    a.href=url;a.download='Fatture_'+label+'.zip';a.click();URL.revokeObjectURL(url);
    showMsg('ZIP generato: '+arr.length+' fatture','success');
  });
}
function exportZIP(){
  var q=document.getElementById('zip-quarter').value;
  var qM={Q1:['01','02','03'],Q2:['04','05','06'],Q3:['07','08','09'],Q4:['10','11','12']};
  var arr=txs.filter(function(t){if(q==='all')return true;var m=t.date.slice(5,7);return qM[q].indexOf(m)>=0;});
  _buildZIP(arr,q==='all'?'Anno':q);
}

// INIT — tutto dentro DOMContentLoaded per garantire che le variabili siano pronte
document.addEventListener('DOMContentLoaded', function(){
  updateAmountSections();
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeEditModal(); });
  var dz=document.getElementById('dropzone');
  if(dz){
    dz.addEventListener('dragover',  function(e){ e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', function(){ dz.classList.remove('drag'); });
    dz.addEventListener('drop',      function(e){ e.preventDefault(); dz.classList.remove('drag'); var f=e.dataTransfer.files[0]; if(f) handleFile(f); });
  }

  // Auth — inizializzato dopo il DOM per garantire scope corretto
  sb.auth.onAuthStateChange(function(event, session){
    if(event==='SIGNED_IN' && session){
      currentUser = session.user;
      if(!window.appStarted) showApp();
    }
    if(event==='SIGNED_OUT'){ currentUser=null; window.appStarted=false;
var validatedDupIds=new Set(JSON.parse(localStorage.getItem('inv_valid_dups')||'[]')); }
  });

  sb.auth.getSession().then(function(r){
    if(r.data && r.data.session){
      currentUser = r.data.session.user;
      showApp();
    } else {
      document.getElementById('lock-screen').style.display='flex';
      document.getElementById('app-content').style.display='none';
    }
  });
});


// ============================================================
// UTENTI (USER MANAGEMENT) - Tab dedicato
// ============================================================

function openInviteModal(){
  document.getElementById('invite-email').value='';
  document.getElementById('inv-period-from').value='';
  document.getElementById('inv-period-to').value='';
  // Reset checkboxes to defaults
  document.querySelectorAll('.inv-sec').forEach(function(cb){
    cb.checked=['registro','summary'].indexOf(cb.dataset.key)>=0;
  });
  document.querySelectorAll('.inv-act').forEach(function(cb){
    cb.checked=['export','download'].indexOf(cb.dataset.key)>=0;
  });
  document.getElementById('invite-modal').style.display='flex';
  setTimeout(function(){document.getElementById('invite-email').focus();},100);
}
function closeInviteModal(){
  document.getElementById('invite-modal').style.display='none';
}

async function submitInvite(){
  var email=(document.getElementById('invite-email').value||'').trim();
  if(!email){alert('Inserisci la email dell utente.');return;}

  // Build permissions from checkboxes
  var sections={};
  document.querySelectorAll('.inv-sec').forEach(function(cb){sections[cb.dataset.key]=cb.checked;});
  var actions={};
  document.querySelectorAll('.inv-act').forEach(function(cb){actions[cb.dataset.key]=cb.checked;});
  var periodFrom=document.getElementById('inv-period-from').value||null;
  var periodTo=document.getElementById('inv-period-to').value||null;

  var perms={sections:sections,actions:actions,period_from:periodFrom,period_to:periodTo};

  // Check for existing invite
  var {data:existing}=await sb.from('guest_access').select('id').eq('admin_user_id',currentUser.id).eq('guest_email',email);
  if(existing&&existing.length){alert('Utente gia invitato con questa email.');return;}

  var {error}=await sb.from('guest_access').insert({
    admin_user_id:currentUser.id, guest_email:email, permissions:perms
  });
  if(error){alert('Errore: '+error.message);return;}

  closeInviteModal();
  showMsg('Utente invitato! Si registri con questa email su '+window.location.origin+window.location.pathname,'success');
  loadUtenti();
}

async function loadUtenti(){
  if(isGuestMode)return; // guests can't see user management
  var {data,error}=await sb.from('guest_access').select('*').eq('admin_user_id',currentUser.id).order('created_at');
  var el=document.getElementById('utenti-list');
  if(!el)return;
  if(error||!data||!data.length){
    el.innerHTML='<div style="text-align:center;padding:40px;color:var(--text3)"><div style="font-size:32px;margin-bottom:10px">&#128101;</div><p>Nessun utente invitato. Clicca "+ Invita utente" per iniziare.</p></div>';
    return;
  }

  var secLabels={carica:'Carica fattura',registro:'Registro',summary:'Summary & Tax',trading:'Trading',settings:'Impostazioni'};
  var actLabels={export:'Esporta',download:'Scarica allegati',edit:'Modifica',delete:'Elimina',import:'Importa CSV'};

  el.innerHTML=data.map(function(g){
    var p=g.permissions||{};
    var secs=p.sections||{};
    var acts=p.actions||{};
    var linked=!!g.guest_user_id;
    var statusColor=g.active?'var(--green)':'var(--text3)';
    var statusBg=g.active?'var(--green-light)':'var(--surface2)';
    var statusLabel=!linked?'In attesa registrazione':g.active?'Attivo':'Disattivato';

    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 20px;margin-bottom:12px;box-shadow:var(--shadow)">'+
      // Header
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'+
        '<div style="font-size:32px;line-height:1">&#128100;</div>'+
        '<div>'+
          '<div style="font-weight:700;font-size:14px">'+g.guest_email+'</div>'+
          '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+
            (p.period_from||p.period_to?'Periodo: '+(p.period_from||'inizio')+' → '+(p.period_to||'oggi'):'Accesso: tutti i periodi')+
          '</div>'+
        '</div>'+
        '<span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:'+statusBg+';color:'+statusColor+';border:1px solid '+statusColor+';margin-left:auto">'+statusLabel+'</span>'+
      '</div>'+

      // Permissions grid
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">'+
        // Sections
        '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px">'+
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">Sezioni</div>'+
          Object.keys(secLabels).map(function(k){
            var on=secs[k]!==false&&secs[k]!==undefined?secs[k]:false;
            if(secs[k]===undefined&&(k==='registro'||k==='summary'))on=true;
            var gid=g.id;
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:12px">'+
              '<span>'+secLabels[k]+'</span>'+
              '<label style="position:relative;display:inline-block;width:34px;height:18px;cursor:pointer">'+
                '<input type="checkbox" '+(on?'checked':'')+' style="opacity:0;width:0;height:0" '+
                  'data-gid="'+gid+'" data-sec="sections" data-key="'+k+'" onchange="handlePermChange(this)">'+
                '<span style="position:absolute;inset:0;border-radius:9px;background:'+(on?'var(--accent)':'var(--border)')+';transition:.2s">'+
                  '<span style="position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:2px;left:'+(on?'18px':'2px')+';transition:.2s"></span>'+
                '</span>'+
              '</label>'+
            '</div>';
          }).join('')+
        '</div>'+
        // Actions
        '<div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px">'+
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:8px">Azioni</div>'+
          Object.keys(actLabels).map(function(k){
            var on=acts[k]!==undefined?acts[k]:['export','download'].indexOf(k)>=0;
            var gid=g.id;
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:12px">'+
              '<span>'+actLabels[k]+'</span>'+
              '<label style="position:relative;display:inline-block;width:34px;height:18px;cursor:pointer">'+
                '<input type="checkbox" '+(on?'checked':'')+' style="opacity:0;width:0;height:0" '+
                  'data-gid="'+gid+'" data-sec="actions" data-key="'+k+'" onchange="handlePermChange(this)">'+
                '<span style="position:absolute;inset:0;border-radius:9px;background:'+(on?'var(--accent)':'var(--border)')+';transition:.2s">'+
                  '<span style="position:absolute;width:14px;height:14px;border-radius:50%;background:#fff;top:2px;left:'+(on?'18px':'2px')+';transition:.2s"></span>'+
                '</span>'+
              '</label>'+
            '</div>';
          }).join('')+
        '</div>'+
      '</div>'+

      // Period limit
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:10px 14px;background:var(--surface2);border-radius:var(--radius-sm)">'+
        '<span style="font-size:11px;color:var(--text2);font-weight:600;min-width:60px">Periodo:</span>'+
        '<input type="date" value="'+(p.period_from||'')+ '" style="font-size:11px;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text)" '+
          'data-gid="'+g.id+'" data-field="period_from" onchange="handlePeriodChange(this)" placeholder="Inizio">'+
        '<span style="color:var(--text3)">→</span>'+
        '<input type="date" value="'+(p.period_to||'')+ '" style="font-size:11px;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface);color:var(--text)" '+
          'data-gid="'+g.id+'" data-field="period_to" onchange="handlePeriodChange(this)" placeholder="Fine">'+
        '<span style="font-size:10px;color:var(--text3)">(vuoto = tutti)</span>'+
      '</div>'+

      // Actions
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<button class="btn '+(g.active?'btn-secondary':'btn-primary')+'" style="font-size:11px" '+
          'onclick="toggleUtenteActive('+g.id+','+(g.active?'false':'true')+')">'+(g.active?'Disattiva accesso':'Riattiva accesso')+'</button>'+
        (!linked?'<span style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:4px">Condividi il link del sito con questo utente</span>':'')+
        '<button class="btn btn-danger" style="font-size:11px;margin-left:auto" onclick="removeUtente('+g.id+')">Rimuovi</button>'+
      '</div>'+
    '</div>';
  }).join('');
}

function handlePermChange(cb){
  var id=parseInt(cb.dataset.gid);
  var section=cb.dataset.sec;
  var key=cb.dataset.key;
  updateUtentePerm(id,section,key,cb.checked);
}
async function updateUtentePerm(id,section,key,val){
  var {data}=await sb.from('guest_access').select('permissions').eq('id',id).single();
  if(!data)return;
  var p=data.permissions||{};
  if(!p[section])p[section]={};
  p[section][key]=val;
  await sb.from('guest_access').update({permissions:p}).eq('id',id);
  // Re-render to update toggle visuals
  loadUtenti();
}

function handlePeriodChange(el){
  updateUtentePeriod(parseInt(el.dataset.gid), el.dataset.field, el.value);
}
async function updateUtentePeriod(id,field,val){
  var {data}=await sb.from('guest_access').select('permissions').eq('id',id).single();
  if(!data)return;
  var p=data.permissions||{};
  p[field]=val||null;
  await sb.from('guest_access').update({permissions:p}).eq('id',id);
}

async function toggleUtenteActive(id,active){
  await sb.from('guest_access').update({active:active}).eq('id',id);
  loadUtenti();
}

async function removeUtente(id){
  if(!confirm('Rimuovere questo utente? Perdera immediatamente l accesso.'))return;
  await sb.from('guest_access').delete().eq('id',id);
  loadUtenti();
}

// Keep backward compatibility aliases
async function inviteGuest(){ submitInvite(); }
async function loadGuestList(){ loadUtenti(); }


// ============================================================
// TRADING SECTION
// ============================================================

var positions = [];       // loaded from DB
var priceCache = {};      // {ticker: {price, change, changePct, high52, low52, ts}}
var txType = 'buy';

// Trading tab handled in main showTab

// ── DB: positions ─────────────────────────────────────────────────────────────
async function loadPositions(){
  var uid = isGuestMode ? adminUserId : currentUser.id;
  var {data,error} = await sb.from('trading_positions').select('*').eq('user_id', uid).order('created_at');
  if(error){ console.error(error); return; }
  positions = data || [];
  renderPositions();
  if(positions.length > 0) refreshAllPrices();
}

async function savePosition(){
  var id = document.getElementById('pos-edit-id').value;
  var row = {
    user_id:   currentUser.id,
    ticker:    document.getElementById('pos-ticker').value.trim().toUpperCase(),
    name:      document.getElementById('pos-name').value.trim(),
    asset_type:document.getElementById('pos-type').value,
    quantity:  parseFloat(document.getElementById('pos-qty').value)||0,
    avg_buy_price: parseFloat(document.getElementById('pos-avgprice').value)||0,
    currency:  document.getElementById('pos-currency').value,
    notes:     document.getElementById('pos-notes').value.trim()
  };
  if(!row.ticker){ alert('Inserisci il Ticker Symbol.'); return; }
  var {error} = id
    ? await sb.from('trading_positions').update(row).eq('id', id)
    : await sb.from('trading_positions').insert(row);
  if(error){ alert('Errore: '+error.message); return; }
  closePosModal();
  await loadPositions();
}

async function deletePosition(id){
  if(!confirm('Eliminare questa posizione e tutte le sue transazioni?')) return;
  await sb.from('trading_transactions').delete().eq('position_id', id);
  await sb.from('trading_positions').delete().eq('id', id);
  await loadPositions();
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openAddPosition(){
  document.getElementById('pos-edit-id').value='';
  document.getElementById('pos-ticker').value='';
  document.getElementById('pos-name').value='';
  document.getElementById('pos-type').value='stock';
  document.getElementById('pos-qty').value='';
  document.getElementById('pos-avgprice').value='';
  document.getElementById('pos-currency').value='USD';
  document.getElementById('pos-notes').value='';
  document.getElementById('pos-modal-title').textContent='Aggiungi posizione';
  var m=document.getElementById('pos-modal'); m.style.display='flex';
}
function openEditPosition(id){
  var p=positions.find(function(x){return x.id===id;}); if(!p) return;
  document.getElementById('pos-edit-id').value=p.id;
  document.getElementById('pos-ticker').value=p.ticker;
  document.getElementById('pos-name').value=p.name||'';
  document.getElementById('pos-type').value=p.asset_type||'stock';
  document.getElementById('pos-qty').value=p.quantity;
  document.getElementById('pos-avgprice').value=p.avg_buy_price;
  document.getElementById('pos-currency').value=p.currency||'USD';
  document.getElementById('pos-notes').value=p.notes||'';
  document.getElementById('pos-modal-title').textContent='Modifica posizione';
  var m=document.getElementById('pos-modal'); m.style.display='flex';
}
function closePosModal(){ document.getElementById('pos-modal').style.display='none'; }

function openTxModal(posId){
  document.getElementById('tx-pos-id').value=posId;
  document.getElementById('tx-qty').value='';
  document.getElementById('tx-price').value='';
  document.getElementById('tx-fees').value='0';
  document.getElementById('tx-notes').value='';
  var today=new Date().toISOString().slice(0,10);
  document.getElementById('tx-date').value=today;
  setTxType('buy');
  var p=positions.find(function(x){return x.id===posId;});
  document.getElementById('tx-modal-title').textContent='Transazione — '+(p?p.ticker:'');
  document.getElementById('tx-modal').style.display='flex';
  updateTxSummary();
}
function closeTxModal(){ document.getElementById('tx-modal').style.display='none'; }
function setTxType(type){
  txType=type;
  document.getElementById('tx-type').value=type;
  var bb=document.getElementById('tx-buy-btn'); var sb2=document.getElementById('tx-sell-btn');
  if(bb){bb.className=type==='buy'?'btn btn-primary':'btn btn-secondary';}
  if(sb2){sb2.className=type==='sell'?'btn btn-primary':'btn btn-secondary';}
  updateTxSummary();
}
function updateTxSummary(){
  var qty=parseFloat(document.getElementById('tx-qty').value)||0;
  var price=parseFloat(document.getElementById('tx-price').value)||0;
  var fees=parseFloat(document.getElementById('tx-fees').value)||0;
  var total=qty*price+(txType==='buy'?fees:-fees);
  var el=document.getElementById('tx-summary');
  if(!el) return;
  if(qty>0&&price>0){
    el.style.display='';
    el.innerHTML=(txType==='buy'?'Acquisto: ':'Vendita: ')+qty+' x '+price.toFixed(2)+' + commissioni '+fees.toFixed(2)+' = <b>'+(total).toFixed(2)+'</b>';
  } else { el.style.display='none'; }
}

async function saveTransaction2(){
  var posId=parseInt(document.getElementById('tx-pos-id').value);
  var qty=parseFloat(document.getElementById('tx-qty').value)||0;
  var price=parseFloat(document.getElementById('tx-price').value)||0;
  var fees=parseFloat(document.getElementById('tx-fees').value)||0;
  var date=document.getElementById('tx-date').value;
  if(!qty||!price||!date){ alert('Completa tutti i campi obbligatori.'); return; }
  // Save transaction
  var {error}=await sb.from('trading_transactions').insert({
    user_id:currentUser.id, position_id:posId, type:txType,
    quantity:qty, price:price, fees:fees, date:date,
    notes:document.getElementById('tx-notes').value
  });
  if(error){ alert('Errore: '+error.message); return; }
  // Recalculate position avg price & quantity
  var {data:txs2}=await sb.from('trading_transactions').select('*').eq('position_id',posId).order('date');
  if(txs2){
    var totalQty=0, totalCost=0;
    txs2.forEach(function(t){
      if(t.type==='buy'){totalQty+=parseFloat(t.quantity);totalCost+=parseFloat(t.quantity)*parseFloat(t.price)+parseFloat(t.fees||0);}
      else{totalQty-=parseFloat(t.quantity);totalCost-=parseFloat(t.quantity)*parseFloat(t.price);}
    });
    totalQty=Math.max(0,totalQty);
    var newAvg=totalQty>0?totalCost/totalQty:0;
    await sb.from('trading_positions').update({quantity:totalQty,avg_buy_price:newAvg}).eq('id',posId);
  }
  closeTxModal();
  await loadPositions();
}

// ── PRICE FETCHING (Yahoo Finance) ────────────────────────────────────────────
async function fetchPrice(ticker){
  if(priceCache[ticker]&&Date.now()-priceCache[ticker].ts<300000) return priceCache[ticker]; // 5min cache
  try{
    var url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker)+'?interval=1d&range=3mo&events=div';
    var r=await fetch(url);
    if(!r.ok) throw new Error('HTTP '+r.status);
    var d=await r.json();
    var meta=d.result[0].meta;
    var closes=d.result[0].indicators.quote[0].close;
    var timestamps=d.result[0].timestamp;
    var currentPrice=meta.regularMarketPrice||meta.chartPreviousClose;
    var prevClose=meta.chartPreviousClose||currentPrice;
    var change=currentPrice-prevClose;
    var changePct=prevClose>0?change/prevClose*100:0;
    // 52w high/low from 3mo data (approximate)
    var validCloses=closes.filter(function(c){return c!==null;});
    var high52=Math.max.apply(null,validCloses);
    var low52=Math.min.apply(null,validCloses);
    var result={price:currentPrice,change:change,changePct:changePct,high52:high52,low52:low52,
      closes:closes,timestamps:timestamps,currency:meta.currency||'USD',ts:Date.now()};
    priceCache[ticker]=result;
    return result;
  } catch(e){
    console.warn('Price fetch failed for '+ticker+':', e.message);
    return null;
  }
}

async function refreshAllPrices(){
  var btn=document.getElementById('refresh-btn');
  if(btn){btn.disabled=true;btn.textContent='Aggiornamento...';}
  var tickers=positions.map(function(p){return p.ticker;});
  var unique=[...new Set(tickers)];
  for(var i=0;i<unique.length;i++){
    await fetchPrice(unique[i]);
    // Yield to UI
    await new Promise(function(r){setTimeout(r,200);});
  }
  if(btn){btn.disabled=false;btn.textContent='\u21BB Aggiorna prezzi';}
  var upd=document.getElementById('last-update');
  if(upd)upd.textContent='Aggiornato: '+new Date().toLocaleTimeString('it-IT');
  renderPositions();
  generateRecommendations();
}

// ── SPARKLINE ─────────────────────────────────────────────────────────────────
function drawSparkline(closes, width, height, color){
  if(!closes||closes.length<2) return '';
  var valid=closes.filter(function(c){return c!==null;}).slice(-30);
  if(valid.length<2) return '';
  var mn=Math.min.apply(null,valid);
  var mx=Math.max.apply(null,valid);
  var range=mx-mn||1;
  var pts=valid.map(function(c,i){
    var x=i/(valid.length-1)*width;
    var y=height-(c-mn)/range*height;
    return x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
  return '<svg class="sparkline" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
    '<polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.5" stroke-linejoin="round"/>'+
    '</svg>';
}

// ── RENDER POSITIONS ──────────────────────────────────────────────────────────
function renderPositions(){
  var filterType=document.getElementById('pos-filter-type');
  var ftype=filterType?filterType.value:'all';
  var arr=ftype==='all'?positions:positions.filter(function(p){return p.asset_type===ftype;});
  var grid=document.getElementById('pos-grid');
  var empty=document.getElementById('pos-empty');
  var recPanel=document.getElementById('ai-rec-panel');
  if(!arr.length){
    if(grid)grid.innerHTML='';if(empty)empty.style.display='';if(recPanel)recPanel.style.display='none';return;
  }
  if(empty)empty.style.display='none';if(recPanel)recPanel.style.display='';

  var totalValue=0,totalCost=0;
  var cards=arr.map(function(p){
    var data=priceCache[p.ticker];
    var qty=parseFloat(p.quantity)||0;
    var avgCost=parseFloat(p.avg_buy_price)||0;
    var currentPrice=data?data.price:null;
    var cost=qty*avgCost;
    var value=currentPrice?qty*currentPrice:cost;
    var pnl=currentPrice?value-cost:null;
    var pnlPct=cost>0&&pnl!==null?pnl/cost*100:null;
    totalValue+=value; totalCost+=cost;
    var badgeClass='pos-badge-'+(p.asset_type||'other');
    var priceStr=currentPrice?currentPrice.toFixed(2)+'<small style="font-size:11px;color:var(--text2);margin-left:4px">'+(p.currency||'USD')+'</small>':'<span style="color:var(--text3);font-size:13px">N/D</span>';
    var changeStr=data?'<span class="'+(data.change>=0?'price-up':'price-down')+'">'+
      (data.change>=0?'+':'')+data.change.toFixed(2)+' ('+data.changePct.toFixed(2)+'%)</span>':'';
    var pnlStr=pnl!==null?'<span class="'+(pnl>=0?'pnl-pos':'pnl-neg')+'">'+
      (pnl>=0?'+':'')+pnl.toFixed(2)+' ('+pnlPct.toFixed(1)+'%)</span>':'<span style="color:var(--text3)">--</span>';
    var spark=data?drawSparkline(data.closes,80,28,pnlPct>=0?'#16a34a':'#dc2626'):'';
    return '<div class="pos-card">'+
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">'+
        '<div>'+
          '<div style="font-size:16px;font-weight:700;color:var(--text)">'+p.ticker+'</div>'+
          '<div style="font-size:11.5px;color:var(--text2);margin-top:1px">'+(p.name||'')+'</div>'+
        '</div>'+
        '<span class="pos-badge '+badgeClass+'">'+(p.asset_type||'other')+'</span>'+
      '</div>'+
      '<div style="margin-bottom:8px">'+
        '<span class="price-tag">'+priceStr+'</span> '+spark+
        '<div style="margin-top:2px">'+changeStr+'</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11.5px;margin-bottom:10px">'+
        '<div><div style="color:var(--text3);font-size:10px">QUANTITA</div><b>'+qty.toLocaleString('it-IT',{maximumFractionDigits:6})+'</b></div>'+
        '<div><div style="color:var(--text3);font-size:10px">PREZZO MEDIO</div><b>'+avgCost.toFixed(2)+'</b></div>'+
        '<div><div style="color:var(--text3);font-size:10px">VALORE</div><b>'+value.toFixed(2)+'</b></div>'+
        '<div><div style="color:var(--text3);font-size:10px">P&amp;L</div>'+pnlStr+'</div>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
        '<button class="btn btn-primary" style="font-size:10.5px;padding:5px 10px" onclick="openTxModal('+p.id+')">+ Transazione</button>'+
        '<button class="btn btn-secondary" style="font-size:10.5px;padding:5px 10px" onclick="openEditPosition('+p.id+')">&#9998; Modifica</button>'+
        '<button class="btn btn-danger" style="font-size:10.5px;padding:5px 10px" onclick="deletePosition('+p.id+')">&#215;</button>'+
      '</div>'+
    '</div>';
  }).join('');

  if(grid)grid.innerHTML=cards;

  // Stats bar
  var totalPnl=totalValue-totalCost;
  var totalPnlPct=totalCost>0?totalPnl/totalCost*100:0;
  var statsEl=document.getElementById('trading-stats');
  if(statsEl){
    statsEl.innerHTML=
      stat('Valore Portfolio',totalValue.toFixed(2),'var(--accent)')+
      stat('Costo Totale',totalCost.toFixed(2),'var(--text2)')+
      stat('P&L Totale',(totalPnl>=0?'+':'')+totalPnl.toFixed(2)+'  ('+totalPnlPct.toFixed(1)+'%)',totalPnl>=0?'var(--green)':'var(--red)')+
      stat('Posizioni',positions.length,'var(--accent)');
  }
}

// ── AI RECOMMENDATIONS ────────────────────────────────────────────────────────
async function generateRecommendations(){
  var el=document.getElementById('ai-rec-content');
  if(!el) return;
  el.innerHTML='<div class="ai-thinking"><div style="animation:spin 1s linear infinite;display:inline-block">&#9654;</div>Analisi AI in corso...</div>';

  // Build context for Claude
  var positionsSummary=positions.map(function(p){
    var data=priceCache[p.ticker];
    var qty=parseFloat(p.quantity)||0;
    var avg=parseFloat(p.avg_buy_price)||0;
    var curr=data?data.price:null;
    var pnlPct=curr&&avg>0?(curr-avg)/avg*100:null;
    var recentCloses=data&&data.closes?data.closes.filter(function(c){return c!==null;}).slice(-10):[];
    var trend=recentCloses.length>=2?(recentCloses[recentCloses.length-1]-recentCloses[0])/recentCloses[0]*100:null;
    return {
      ticker:p.ticker, name:p.name||p.ticker, type:p.asset_type,
      qty:qty, avgCost:avg, currentPrice:curr,
      pnlPct:pnlPct?pnlPct.toFixed(1)+'%':null,
      dayChange:data?data.changePct.toFixed(2)+'%':null,
      trend10d:trend?trend.toFixed(1)+'%':null,
      high3m:data?data.high52.toFixed(2):null,
      low3m:data?data.low52.toFixed(2):null,
      currency:p.currency
    };
  });

  var prompt='Sei un consulente finanziario esperto. Analizza questo portafoglio e fornisci consigli specifici su QUANDO e PERCHE\' comprare di piu o vendere per ciascuna posizione. Rispondi SOLO con un JSON array, nessun testo fuori dal JSON.\n\nPortafoglio:\n'+JSON.stringify(positionsSummary,null,2)+'\n\nRispondi ESATTAMENTE in questo formato JSON:\n[{"ticker":"AAPL","action":"buy|sell|hold|watch","urgency":"high|medium|low","title":"Titolo breve del consiglio","reason":"Spiegazione dettagliata in italiano (2-4 frasi) con riferimento ai numeri specifici","detail":"Dettaglio tecnico: livelli di prezzo target, percentuali, contesto di mercato","warning":"Eventuali rischi o avvertenze (opzionale, puo essere null)"}]';

  try{
    var response=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:2000,
        messages:[{role:'user',content:prompt}]
      })
    });
    var data=await response.json();
    var text=data.content[0].text;
    // Parse JSON from response
    var jsonMatch=text.match(/\[[\s\S]*\]/);
    if(!jsonMatch) throw new Error('No JSON found');
    var recs=JSON.parse(jsonMatch[0]);

    var typeMap={buy:'rec-buy',sell:'rec-sell',hold:'rec-hold',watch:'rec-watch'};
    var iconMap={buy:'&#128200;',sell:'&#128201;',hold:'&#128336;',watch:'&#128270;'};
    var urgencyMap={high:'&#128308;',medium:'&#128992;',low:'&#9899;'};
    var titleColorMap={buy:'var(--green)',sell:'var(--red)',hold:'#854d0e',watch:'var(--accent)'};

    el.innerHTML='<div style="font-size:10.5px;color:var(--text3);margin-bottom:12px">Analisi generata da Claude AI. Non costituisce consulenza finanziaria professionale.</div>'+
      recs.map(function(r){
        return '<div class="rec-card '+typeMap[r.action]+'">'+
          '<div class="rec-icon">'+iconMap[r.action]+'</div>'+
          '<div style="flex:1">'+
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'+
              '<span style="font-weight:800;font-size:13px">'+r.ticker+'</span>'+
              (urgencyMap[r.urgency]||'')+
              '<span class="rec-title" style="color:'+titleColorMap[r.action]+';margin-left:4px">'+r.title+'</span>'+
            '</div>'+
            '<div style="margin-bottom:5px">'+r.reason+'</div>'+
            '<div style="font-size:11px;color:var(--text2);background:rgba(0,0,0,0.04);padding:6px 10px;border-radius:4px">'+r.detail+'</div>'+
            (r.warning?'<div style="font-size:10.5px;color:var(--orange);margin-top:5px">&#9888; '+r.warning+'</div>':'')+
          '</div>'+
        '</div>';
      }).join('');

  } catch(e){
    el.innerHTML='<div style="color:var(--red);font-size:12px;padding:12px">Errore analisi AI: '+e.message+'. Assicurati che i prezzi siano stati aggiornati.</div>';
  }
}

