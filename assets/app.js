const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let cat, pick = {complex: null, key: null}, tok = sessionStorage.getItem('tok'), P, D, T = [], editable = true, dirty = false;
const num = v => (v === '' || v == null ? 0 : Number(v) || 0);

async function api(body) {
  if (APPS_SCRIPT_URL === 'DEMO') return mockApi(body);
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE')) throw new Error('لم يتم ضبط رابط الخادم في config.js');
  const r = await fetch(APPS_SCRIPT_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)});
  return r.json();
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.className = 'on'; setTimeout(() => t.className = '', 2600); }

async function init() {
  try {
    cat = await api({action: 'catalog'});
    if (tok) { const r = await api({action: 'load', token: tok}); if (r.ok) return r.admin ? openAdmin(r) : openForm(r); sessionStorage.removeItem('tok'); tok = null; }
    viewLogin();
  } catch (e) { $('#app').innerHTML = `<div class="card err">تعذّر الاتصال بالخادم: ${esc(e.message)}</div>`; }
}

function viewLogin() {
  $('#app').innerHTML = demoBanner() + `<section class="card login"><h2>تسجيل الدخول</h2>
  <div class="pair"><div><label class="l">اختر المجمع من القائمة</label>
    <select id="cs"><option value="">— اختر المجمع —</option>${cat.complexes.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
  <div><label class="l">اختر المرحلة المراد إدخال بياناتها</label><select id="ss" disabled><option value="">— اختر المجمع أولاً —</option></select></div></div>
  <div class="cred"><h3>بيانات الدخول للمرحلة</h3>
  <input id="u" placeholder="اسم المستخدم" autocomplete="username"><input id="p" type="password" placeholder="كلمة المرور" autocomplete="current-password">
  <button class="btn" id="go">دخول</button><div class="err" id="err"></div></div><p class="alink"><a href="#" id="adm">دخول الإدارة ←</a></p></section>`;
  $('#cs').onchange = e => { pick = {complex: e.target.value, key: null}; const ssel = $('#ss');
    ssel.disabled = !pick.complex; ssel.innerHTML = '<option value="">— اختر المرحلة —</option>' + cat.stages.filter(x => x.complex === pick.complex).map(x => `<option value="${x.key}">${esc(x.name)}</option>`).join(''); };
  $('#ss').onchange = e => { pick.key = e.target.value || null; if (pick.key) $('#u').focus(); };
  $('#adm').onclick = e => { e.preventDefault(); viewAdminLogin(); };
  const go = async () => {
    if (!pick.key) return $('#err').textContent = 'اختر المجمع والمرحلة أولاً';
    $('#go').disabled = true; $('#err').textContent = '';
    try { const r = await api({action: 'login', stageKey: pick.key, username: $('#u').value, password: $('#p').value});
      if (!r.ok) $('#err').textContent = r.error; else openForm(r); }
    catch (e) { $('#err').textContent = e.message; }
    $('#go').disabled = false; };
  $('#go').onclick = go; $('#p').onkeydown = e => e.key === 'Enter' && go();
}

function openForm(r) {
  tok = r.token; sessionStorage.setItem('tok', tok); P = r; editable = r.editable; D = r.data; T = r.teachers || []; dirty = false;
  const min = r.min;
  D.grades = r.stage.grades.map((g, i) => { const cl = (D.grades[i] && D.grades[i].classes) || [];
    while (cl.length < min) cl.push({name: g.label + ' / ' + (cl.length + 1), type: g.types[0], students: '', newReg: '', withdrawn: '', notes: ''});
    return {classes: cl}; });
  viewHome();
}
const demoBanner = () => APPS_SCRIPT_URL === 'DEMO' ? '<div class="warn">نسخة معاينة تجريبية: ادخل بالاسم demo وكلمة المرور demo في أي مرحلة (وللإدارة: admin / admin)، ولا تُحفظ البيانات في شيت حقيقي.</div>' : '';
const savebar = '<div class="savebar"><button class="btn" id="save">حفظ البيانات</button><span class="hint" id="state"></span></div>';
function logout() { api({action: 'logout', token: tok}); sessionStorage.removeItem('tok'); tok = null; viewLogin(); }
function goHome() { if (dirty && !confirm('توجد تغييرات غير محفوظة، هل تريد المتابعة بدون حفظ؟')) return; dirty = false; viewHome(); }
function viewHome() {
  $('#app').oninput = $('#app').onclick = null;
  $('#app').innerHTML = `${demoBanner()}<div class="card top"><div><h2 style="margin:0">${esc(P.stage.complex)} — ${esc(P.stage.name)}</h2><span class="hint">ماذا تريد أن تُدخل؟</span></div><button class="btn ghost" id="out">تسجيل الخروج</button></div>
  <div class="choice"><button class="pick" id="ps"><i>🎓</i><b>بيانات الطلاب</b><span>الصفوف والفصول وأعداد الطلاب</span></button>
  <button class="pick" id="pt"><i>👩‍🏫</i><b>بيانات المعلمين</b><span>الاسم والتخصص وعدد الحصص</span></button></div>`;
  $('#ps').onclick = viewStudents; $('#pt').onclick = viewTeachers; $('#out').onclick = logout;
}
function viewStudents() {
  const r = P, nt = r.stage.notype;
  const dis = editable ? '' : 'disabled', st = D.stats || {};
  const gradeHtml = r.stage.grades.map((g, gi) => `<section class="card grade"><h3>${esc(g.label)}<span id="gs${gi}"></span></h3><div class="tw"><table>
    <tr><th>الفصل</th>${nt ? '' : '<th>نوع التعليم</th>'}<th>عدد الطلاب</th><th>المسجلون جدد</th><th>المنسحبون</th><th>ملاحظات</th></tr>
    <tbody id="g${gi}">${D.grades[gi].classes.map((c, ci) => rowHtml(gi, ci, c, g, dis)).join('')}</tbody></table></div>
    ${editable ? `<button class="btn ghost" data-add="${gi}" style="margin-top:10px">+ إضافة فصل</button>` : ''}</section>`).join('');
  const f = (k, l) => `<div><span>${l}</span><input class="num" type="number" min="0" inputmode="numeric" data-s="${k}" value="${st[k] ?? ''}" ${dis}></div>`;
  $('#app').innerHTML = `<div class="card top"><div><h2 style="margin:0">${esc(r.stage.complex)} — ${esc(r.stage.name)}</h2><span class="hint" id="saved"></span></div>
    <div><button class="btn ghost" id="back">← الرئيسية</button> <button class="btn ghost" id="out">تسجيل الخروج</button></div></div>
    ${demoBanner()}${editable ? '' : '<div class="warn">التعديل مغلق على هذه المرحلة من قِبل الإدارة، البيانات للعرض فقط.</div>'}
    <div class="kpis"><div class="kpi"><b id="k1">0</b>إجمالي الطلاب</div><div class="kpi"><b id="k2">0</b>عدد الفصول</div><div class="kpi"><b id="k3">0</b>المسجلون الجدد</div><div class="kpi"><b id="k4">0</b>المنسحبون</div></div>
    ${gradeHtml}
    <section class="card"><h2>بيان الإحصاء</h2><div class="stats">${f('studentsLast', 'عدد الطلاب العام الماضي')}${f('classesLast', 'عدد الفصول العام الماضي')}
    ${f('teachers', 'عدد المعلمين (العام الحالي)')}${f('teachersLast', 'عدد المعلمين (العام الماضي)')}${f('admins', 'عدد الإداريين (العام الحالي)')}${f('adminsLast', 'عدد الإداريين (العام الماضي)')}</div></section>
    ${editable ? '<div class="savebar"><button class="btn" id="save">حفظ البيانات</button><span class="hint" id="state"></span></div>' : ''}`;
  totals(); $('#back').onclick = goHome; $('#out').onclick = logout;
  $('#app').oninput = e => { const t = e.target, tr = t.closest('tr');
    if (t.dataset.s) D.stats[t.dataset.s] = t.value;
    else if (tr) D.grades[tr.dataset.g].classes[tr.dataset.c][t.dataset.f] = t.value;
    dirty = true; $('#state') && ($('#state').textContent = 'تغييرات غير محفوظة'); totals(); };
  $('#app').onclick = e => { const a = e.target.dataset.add; if (a == null) return;
    const cl = D.grades[a].classes; if (cl.length >= P.max) return toast('الحد الأقصى ' + P.max + ' فصلاً');
    const g = P.stage.grades[a], c = {name: g.label + ' / ' + (cl.length + 1), type: g.types[0], students: '', newReg: '', withdrawn: '', notes: ''};
    cl.push(c); $('#g' + a).insertAdjacentHTML('beforeend', rowHtml(a, cl.length - 1, c, g, '')); dirty = true; };
  if (editable) $('#save').onclick = save;
}
function rowHtml(gi, ci, c, g, dis) {
  const n = (f, v) => `<td><input class="num" type="number" min="0" inputmode="numeric" data-f="${f}" value="${esc(v)}" ${dis}></td>`;
  return `<tr data-g="${gi}" data-c="${ci}"><td>${esc(c.name)}</td>${P.stage.notype ? '' : '<td><select data-f="type" ' + dis + '>' + g.types.map(t => `<option ${t === c.type ? 'selected' : ''}>${esc(t)}</option>`).join('') + '</select></td>'}
  ${n('students', c.students)}${n('newReg', c.newReg)}${n('withdrawn', c.withdrawn)}<td><input data-f="notes" value="${esc(c.notes)}" maxlength="200" ${dis}></td></tr>`;
}
function totals() {
  let s = 0, k = 0, n = 0, w = 0;
  D.grades.forEach((g, i) => { let gs = 0; g.classes.forEach(c => { const v = num(c.students); gs += v; if (v > 0) k++; n += num(c.newReg); w += num(c.withdrawn); });
    s += gs; $('#gs' + i).textContent = gs + ' طالب'; });
  $('#k1').textContent = s; $('#k2').textContent = k; $('#k3').textContent = n; $('#k4').textContent = w;
}
async function save() {
  const b = $('#save'); b.disabled = true; $('#state').textContent = 'جارٍ الحفظ…';
  try { const r = await api({action: 'save', token: tok, data: D});
    if (r.expired) { toast(r.error); return viewLogin(); }
    if (!r.ok) throw new Error(r.error);
    dirty = false; $('#state').textContent = 'تم الحفظ ✓ ' + new Date().toLocaleTimeString('ar-SA'); toast('تم حفظ البيانات بنجاح'); }
  catch (e) { $('#state').textContent = ''; toast('تعذّر الحفظ: ' + e.message); }
  b.disabled = false;
}
// ---------- المعلمون ----------
const blankT = () => ({name: '', spec: '', lessons: ''});
function viewTeachers() {
  if (!T.length) T = [blankT(), blankT(), blankT()];
  const up = editable ? `<div><button class="btn ghost" id="tpl">⬇ تنزيل نموذج Excel</button> <label class="btn ghost">⬆ رفع ملف Excel<input type="file" id="xl" accept=".xlsx,.xls,.csv" hidden></label></div>` : '';
  $('#app').innerHTML = `<div class="card top"><div><h2 style="margin:0">معلمو ${esc(P.stage.complex)} — ${esc(P.stage.name)}</h2></div>
  <div><button class="btn ghost" id="back">← الرئيسية</button> <button class="btn ghost" id="out">تسجيل الخروج</button></div></div>
  ${demoBanner()}${editable ? '' : '<div class="warn">التعديل مغلق على هذه المرحلة من قِبل الإدارة.</div>'}
  <div class="kpis"><div class="kpi"><b id="t1">0</b>عدد المعلمين</div><div class="kpi"><b id="t2">0</b>إجمالي الحصص</div></div>
  <section class="card"><div class="top"><h2 style="margin:0">قائمة المعلمين</h2>${up}</div>
  ${editable ? '<p class="hint">املأ الجدول يدوياً، أو نزّل النموذج وعبّئه ثم ارفعه ليتم إدخال البيانات تلقائياً.</p>' : ''}
  <div class="tw"><table><tr><th>م</th><th>اسم المعلم</th><th>التخصص</th><th>عدد الحصص</th><th></th></tr><tbody id="tb"></tbody></table></div>
  ${editable ? '<button class="btn ghost" id="addt" style="margin-top:10px">+ إضافة معلم</button>' : ''}</section>${editable ? savebar : ''}`;
  trows(); $('#back').onclick = goHome; $('#out').onclick = logout;
  $('#app').oninput = e => { const t = e.target, tr = t.closest('tr'); if (!tr || !t.dataset.t) return;
    T[tr.dataset.i][t.dataset.t] = t.value; dirty = true; $('#state').textContent = 'تغييرات غير محفوظة'; tt(); };
  $('#app').onclick = e => { const d = e.target.dataset.del;
    if (d != null) { T.splice(d, 1); trows(); dirty = true; }
    else if (e.target.id === 'addt') { if (T.length >= 300) return toast('الحد الأقصى 300 معلم'); T.push(blankT()); trows(); $('#tb tr:last-child input').focus(); } };
  if (editable) { $('#tpl').onclick = tplXl; $('#xl').onchange = e => { if (e.target.files[0]) importXl(e.target.files[0]); e.target.value = ''; }; $('#save').onclick = saveT; }
}
function trows() {
  const dis = editable ? '' : 'disabled';
  $('#tb').innerHTML = T.map((r, i) => `<tr data-i="${i}"><td>${i + 1}</td><td><input data-t="name" maxlength="80" value="${esc(r.name)}" ${dis}></td>
  <td><input data-t="spec" maxlength="80" value="${esc(r.spec)}" ${dis}></td><td><input class="num" type="number" min="0" max="100" data-t="lessons" value="${esc(r.lessons)}" ${dis}></td>
  <td>${editable ? `<button class="x" data-del="${i}" title="حذف">✕</button>` : ''}</td></tr>`).join(''); tt();
}
function tt() { $('#t1').textContent = T.filter(r => String(r.name).trim()).length; $('#t2').textContent = T.reduce((a, r) => a + num(r.lessons), 0); }
function tplXl() {
  const ws = XLSX.utils.aoa_to_sheet([['اسم المعلم', 'التخصص', 'عدد الحصص'], ['مثال: أحمد محمد', 'رياضيات', 20]]);
  ws['!cols'] = [{wch: 28}, {wch: 22}, {wch: 14}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'المعلمون'); wb.Workbook = {Views: [{RTL: true}]};
  XLSX.writeFile(wb, 'نموذج_المعلمين.xlsx');
}
function importXl(file) {
  const rd = new FileReader();
  rd.onload = e => { try {
    const wb = XLSX.read(e.target.result, {type: 'array'}), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
    const h = (rows[0] || []).map(x => String(x).trim()), ix = (k, d) => { const i = h.findIndex(x => x.includes(k)); return i >= 0 ? i : d; };
    const a = ix('اسم', 0), b = ix('تخصص', 1), c = ix('حصص', 2);
    const list = rows.slice(1).map(r => ({name: String(r[a] ?? '').trim(), spec: String(r[b] ?? '').trim(), lessons: r[c]}))
      .filter(r => r.name && !r.name.startsWith('مثال'));
    if (!list.length) return toast('لم أجد صفوفاً صالحة في الملف');
    const cur = T.filter(r => String(r.name).trim()), replace = cur.length && confirm('توجد بيانات في القائمة.\nموافق = استبدالها ببيانات الملف\nإلغاء = إضافة بيانات الملف إليها');
    T = (cur.length && !replace ? cur : []).concat(list).slice(0, 300); trows(); dirty = true;
    $('#state').textContent = 'تغييرات غير محفوظة'; toast('تم استيراد ' + list.length + ' معلم، راجع القائمة ثم اضغط حفظ');
  } catch (err) { toast('تعذّر قراءة الملف، تأكد أنه Excel صحيح'); } };
  rd.readAsArrayBuffer(file);
}
async function saveT() {
  const b = $('#save'); b.disabled = true; $('#state').textContent = 'جارٍ الحفظ…';
  try { const r = await api({action: 'saveTeachers', token: tok, rows: T.filter(x => String(x.name).trim())});
    if (r.expired) { toast(r.error); return viewLogin(); }
    if (!r.ok) throw new Error(r.error);
    dirty = false; $('#state').textContent = 'تم الحفظ ✓ ' + new Date().toLocaleTimeString('ar-SA'); toast('تم حفظ بيانات المعلمين'); }
  catch (e) { $('#state').textContent = ''; toast('تعذّر الحفظ: ' + e.message); }
  b.disabled = false;
}
window.onbeforeunload = e => dirty ? (e.preventDefault(), e.returnValue = '') : undefined;
init();
