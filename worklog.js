'use strict';
const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'flex-worklogs-v1';
let records = [], client = null, user = null, mode = 'loading', busy = false, readVersion = 0;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const say = message => { $('#message').textContent = message; };
const statuses = ['대기','진행 중','완료'];
function validateRecord(row) {
  return row && typeof row.id === 'string' && typeof row.created_at === 'string' && typeof row.title === 'string' && row.title.trim() && row.title.length <= 120 && typeof row.project === 'string' && row.project.length <= 80 && typeof row.content === 'string' && row.content.length <= 10000 && /^\d{4}-\d{2}-\d{2}$/.test(row.work_date) && statuses.includes(row.status) && (row.deleted_at === null || typeof row.deleted_at === 'string');
}
function readLocal() {
  const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (!Array.isArray(value) || !value.every(validateRecord)) throw new Error('브라우저의 저장 데이터를 읽지 못했습니다. 기존 데이터 보호를 위해 저장을 중단했습니다.');
  return value;
}
function visibleRecords() {
  const query = $('#search').value.trim().toLocaleLowerCase();
  return records.filter(row => !row.deleted_at && (!$('#status-filter').value || row.status === $('#status-filter').value) && (!$('#date-filter').value || row.work_date === $('#date-filter').value) && (!query || [row.title,row.project,row.content].some(text => text.toLocaleLowerCase().includes(query)))).sort((a,b) => b.work_date.localeCompare(a.work_date) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}
function renderCard(row, trash = false) {
  const card = $('#record-template').content.firstElementChild.cloneNode(true);
  const time = card.querySelector('time'); time.dateTime = row.work_date; time.textContent = row.work_date.replaceAll('-','.');
  const badge = card.querySelector('.status-badge'); badge.textContent = row.status; badge.dataset.status = row.status;
  card.querySelector('.project-name').textContent = row.project;
  card.querySelector('h3').textContent = row.title;
  card.querySelector('.record-content').textContent = row.content;
  const edit = card.querySelector('.edit'), remove = card.querySelector('.delete');
  if (trash) { edit.textContent = '복원'; edit.setAttribute('aria-label', `${row.title} 복원`); edit.onclick = () => toggleTrash(row, false); remove.remove(); }
  else { edit.setAttribute('aria-label', `${row.title} 수정`); edit.onclick = () => openRecord(row); remove.setAttribute('aria-label', `${row.title} 삭제`); remove.onclick = () => toggleTrash(row, true); }
  card.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  return card;
}
function render() {
  const active = records.filter(row => !row.deleted_at), filtered = visibleRecords();
  $('#total-count').textContent = active.length;
  $('#progress-count').textContent = active.filter(row=>row.status==='진행 중').length;
  $('#complete-count').textContent = active.filter(row=>row.status==='완료').length;
  $('#waiting-count').textContent = active.filter(row=>row.status==='대기').length;
  $('#result-count').textContent = `${filtered.length}개의 기록 / 전체 ${active.length}개`;
  $('#records').replaceChildren(...filtered.map(row=>renderCard(row)));
  const trash = records.filter(row=>row.deleted_at).sort((a,b)=>b.deleted_at.localeCompare(a.deleted_at));
  $('#trash-count').textContent = trash.length;
  $('#trash-list').replaceChildren(...trash.map(row=>renderCard(row,true)));
  const allowed = mode==='local' || (mode==='cloud' && user);
  $('#empty-state').hidden = !!filtered.length || !allowed;
  $('#empty-title').textContent = active.length ? '검색 결과가 없습니다' : '첫 번째 업무를 기록해 보세요';
  $('#empty-description').textContent = active.length ? '검색어나 날짜, 진행 상태를 바꿔보세요.' : '오늘 한 일, 진행 중인 일, 다음에 할 일을 가볍게 남겨보세요.';
  $('#empty-add').hidden = !!active.length;
  $('#export').disabled = !filtered.length || busy;
  $('#new-record').disabled = busy || !allowed;
  $('#empty-add').disabled = busy || !allowed;
}
function updateStorageUI() {
  const cloud = mode === 'cloud';
  $('#local-info').hidden = mode !== 'local';
  $('#login-form').hidden = !cloud || !!user;
  $('#logged-in').hidden = !cloud || !user;
  $('#account-button').textContent = cloud ? (user ? '내 계정' : '로그인') : '저장 안내';
  $('#user-email').textContent = user?.email || '';
  $('#storage-title').textContent = mode === 'local' ? '브라우저 저장 모드 · 클라우드 연결 전' : cloud ? (user ? '클라우드 저장 · 내 업무기록' : '클라우드 연결됨 · 로그인이 필요합니다') : '저장소에 연결할 수 없습니다';
  $('#storage-description').textContent = mode === 'local' ? '현재 기기의 이 브라우저에만 저장됩니다. 여러 기기에서 사용하려면 데이터베이스 연결이 필요합니다.' : cloud ? (user ? '로그인한 계정의 기록을 저장하고 조회합니다. 다른 기기의 변경 사항은 새로고침으로 불러오세요.' : '상단 로그인 버튼을 눌러 이메일로 로그인하면 기록을 사용할 수 있습니다.') : '연결 설정 또는 브라우저 저장 권한을 확인한 뒤 페이지를 새로고침해 주세요.';
  render();
}
async function loadRecords() {
  const version = ++readVersion, userId = user?.id;
  $('#records').setAttribute('aria-busy','true');
  try {
    let next = [];
    if (mode === 'local') next = readLocal();
    if (mode === 'cloud' && userId) {
      for (let from = 0; ; from += 500) {
        const {data,error} = await client.from('work_logs').select('id,user_id,work_date,title,project,content,status,created_at,deleted_at').eq('user_id',userId).order('id').range(from,from+499);
        if (error) throw error;
        next.push(...data);
        if (data.length < 500) break;
      }
    }
    if (version !== readVersion || userId !== user?.id) return;
    records = next; render();
  } catch (error) {
    if (version !== readVersion) return;
    if (mode === 'local') { mode = 'error'; updateStorageUI(); }
    say(`조회 실패: ${error.message || '연결을 확인해 주세요.'}`);
    throw error;
  } finally { if (version===readVersion) $('#records').setAttribute('aria-busy','false'); }
}
function openRecord(row) {
  if (busy || (mode !== 'local' && !(mode==='cloud' && user))) return;
  $('#record-form').reset(); $('#form-error').textContent='';
  $('#record-id').value = row?.id || ''; $('#work-date').value = row?.work_date || today();
  $('#work-title').value = row?.title || ''; $('#work-project').value = row?.project || '';
  $('#work-content').value = row?.content || ''; $('#work-status').value = row?.status || '진행 중';
  $('#dialog-title').textContent = row ? '업무 기록 수정' : '새 업무 기록';
  $('#record-dialog').showModal(); $('#work-title').focus();
}
function setBusy(value) {
  busy = value;
  $('#record-form').querySelectorAll('input,textarea,select,button').forEach(el=>{el.disabled=value;});
  $('#refresh').disabled=value; render();
}
async function persist(payload, id) {
  if (mode === 'local') {
    const current = readLocal();
    if (id && !current.some(row=>row.id===id)) throw new Error('기록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.');
    const next = id ? current.map(row=>row.id===id ? {...row,...payload} : row) : [...current,{...payload,id:crypto.randomUUID(),created_at:new Date().toISOString(),deleted_at:null}];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(next)); records=next;
  } else if (mode === 'cloud' && user) {
    const query = id ? client.from('work_logs').update(payload).eq('id',id).eq('user_id',user.id) : client.from('work_logs').insert({...payload,user_id:user.id});
    const {data,error} = await query.select('id,user_id,work_date,title,project,content,status,created_at,deleted_at').single();
    if (error || !data) throw error || new Error('기록을 저장하지 못했습니다.');
    records = id ? records.map(row=>row.id===id ? data : row) : [...records,data];
  } else throw new Error('로그인 및 저장소 연결을 확인해 주세요.');
}
$('#record-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const title = $('#work-title').value.trim();
  if (!title) { $('#form-error').textContent='업무 제목을 입력해 주세요.'; return; }
  const id=$('#record-id').value;
  const payload={title,project:$('#work-project').value.trim(),content:$('#work-content').value.trim(),work_date:$('#work-date').value,status:$('#work-status').value};
  setBusy(true);
  try { await persist(payload,id); $('#record-dialog').close(); say(mode==='local' ? '이 브라우저에 기록을 저장했습니다.' : '데이터베이스에 기록을 저장했습니다.'); }
  catch(error) { $('#form-error').textContent=`저장 실패: ${error.message || '다시 시도해 주세요.'}`; }
  finally { setBusy(false); }
});
async function toggleTrash(row, remove) {
  if(busy) return; setBusy(true);
  try { await persist({deleted_at:remove?new Date().toISOString():null},row.id); say(remove?'휴지통으로 이동했습니다. 아래 휴지통에서 복원할 수 있습니다.':'기록을 복원했습니다.'); }
  catch(error) { say(`처리 실패: ${error.message}`); }
  finally { setBusy(false); }
}
$('#new-record').onclick=()=>openRecord(); $('#empty-add').onclick=()=>openRecord();
$('#account-button').onclick=()=>$('#account-dialog').showModal();
document.querySelectorAll('[data-close]').forEach(button=>{button.onclick=()=>{if(!busy) document.getElementById(button.dataset.close).close();};});
$('#record-dialog').addEventListener('cancel',event=>{if(busy) event.preventDefault();});
['#search','#status-filter','#date-filter'].forEach(selector=>$(selector).addEventListener('input',render));
$('#clear-filters').onclick=()=>{['#search','#status-filter','#date-filter'].forEach(selector=>$(selector).value='');render();};
$('#refresh').onclick=async()=>{if(busy)return;setBusy(true);say('불러오는 중…');try{await loadRecords();say('최신 기록을 불러왔습니다.');}catch{}finally{setBusy(false);}};
window.addEventListener('storage',event=>{if(mode==='local' && event.key===STORAGE_KEY && !busy) loadRecords().catch(()=>{});});
$('#export').onclick=()=>{
  const rows=visibleRecords(); if(!rows.length)return;
  const csvCell=value=>'"'+String(/^[=+@\-\t\r\n]/.test(String(value)) ? "'"+value : value).replaceAll('"','""')+'"';
  const csv=[['업무 날짜','업무 제목','프로젝트','상태','상세 내용'],...rows.map(row=>[row.work_date,row.title,row.project,row.status,row.content])].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`업무기록_${today()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  say(`현재 조회 중인 ${rows.length}개 기록을 CSV로 내보냈습니다.`);
};
$('#login-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(!client)return;$('#login-submit').disabled=true;$('#auth-message').textContent='로그인 링크를 요청하고 있습니다…';
  try{const {error}=await client.auth.signInWithOtp({email:$('#login-email').value.trim(),options:{emailRedirectTo:new URL('./',location.href).href}});if(error)throw error;$('#auth-message').textContent='이메일을 확인하고 로그인 링크를 눌러주세요. 메일이 없으면 스팸함을 확인해 주세요.';}
  catch(error){$('#auth-message').textContent=`로그인 요청 실패: ${error.message}`;}
  finally{$('#login-submit').disabled=false;}
});
$('#logout').onclick=async()=>{if(busy)return;const {error}=await client.auth.signOut();if(error){$('#auth-message').textContent=`로그아웃 실패: ${error.message}`;return;}$('#account-dialog').close();};
async function initialize() {
  const config=window.WORKLOG_CONFIG || {};
  if(!config.supabaseUrl && !config.supabasePublishableKey){mode='local';updateStorageUI();await loadRecords();return;}
  try{
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl)||!config.supabasePublishableKey||config.supabasePublishableKey.startsWith('sb_secret_'))throw new Error('공개 프로젝트 URL과 publishable key 설정을 확인해 주세요.');
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';script.onload=resolve;script.onerror=()=>reject(new Error('로그인 모듈을 불러오지 못했습니다.'));document.head.append(script);});
    client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
    const {data,error}=await client.auth.getSession();if(error)throw error;
    user=data.session?.user || null;mode='cloud';updateStorageUI();
    client.auth.onAuthStateChange((_event,session)=>{
      const nextUser=session?.user || null;
      if(nextUser?.id===user?.id)return;
      user=nextUser;records=[];++readVersion;
      $('#record-dialog').close();$('#auth-message').textContent='';updateStorageUI();say('');
      setTimeout(()=>loadRecords().catch(()=>{}),0);
    });
    await loadRecords();
  }catch(error){mode='error';records=[];updateStorageUI();say(`연결 실패: ${error.message}`);}
}
initialize().catch(error=>say(error.message));
