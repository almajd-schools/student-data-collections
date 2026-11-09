const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let cat, pick = {complex: null, key: null}, tok = sessionStorage.getItem('tok'), P, D, editable = true, dirty = false;
const num = v => (v === '' || v == null ? 0 : Number(v) || 0);

async function api(body) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('PASTE')) throw new Error('لم يتم ضبط رابط الخادم في config.js');
  const r = await fetch(APPS_SCRIPT_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(body)});
  return r.json();
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.className = 'on'; setTimeout(() => t.className = '', 2600); }

async function init() {
  try {
    cat = await api({action: 'catalog'});
    if (tok) { const r = await api({action: 'load', token: tok}); if (r.ok) return openForm(r); sessionStorage.removeItem('tok'); tok = null; }
    viewLogin();
  } catch (e) { $('#app').innerHTML = `<div class="card err">تعذّر الاتصال بالخادم: ${esc(e.message)}</div>`; }
}

function viewLogin() {
  $('#app').innerHTML = `<section class="card login"><h2>تسجيل الدخول</h2>
  <label class="l">١. اختر المجمع</label><div class="chips" id="cx">${cat.complexes.map(c => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <label class="l">٢. اختر المرحلة</label><div class="chips" id="sx"><span class="hint">اختر المجمع أولاً</span></div>
  <label class="l">٣. بيانات الدخول الخاصة بالمرحلة</label>
  <input id="u" placeholder="اسم المستخدم" autocomplete="username"><input id="p" type="password" placeholder="كلمة المرور" autocomplete="current-password">
  <button class="btn" id="go">دخول</button><div class="err" id="err"></div></section>`;
  $('#cx').onclick = e => { const c = e.target.dataset.c; if (!c) return; pick = {complex: c, key: null};
    document.querySelectorAll('#cx .chip').forEach(b => b.classList.toggle('on', b.dataset.c === c));
    $('#sx').innerHTML = cat.stages.filter(s => s.complex === c).map(s => `<button class="chip" data-k="${s.key}">${esc(s.name)}</button>`).join(''); };
  $('#sx').onclick = e => { const k = e.target.dataset.k; if (!k) return; pick.key = k;
    document.querySelectorAll('#sx .chip').forEach(b => b.classList.toggle('on', b.dataset.k === k)); $('#u').focus(); };
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
  tok = r.token; sessionStorage.setItem('tok', tok); P = r; editable = r.editable; D = r.data; dirty = false;
  const min = r.min;
  D.grades = r.stage.grades.map((g, i) => { const cl = (D.grades[i] && D.grades[i].classes) || [];
    while (cl.length < min) cl.push({name: g.label + ' / ' + (cl.length + 1), type: g.types[0], students: '', newReg: '', withdrawn: '', notes: ''});
    return {classes: cl}; });
  const dis = editable ? '' : 'disabled', st = D.stats || {};
  const gradeHtml = r.stage.grades.map((g, gi) => `<section class="card grade"><h3>${esc(g.label)}<span id="gs${gi}"></span></h3><div class="tw"><table>
    <tr><th>الفصل</th><th>نوع التعليم</th><th>عدد الطلاب</th><th>المسجلون جدد</th><th>المنسحبون</th><th>ملاحظات</th></tr>
    <tbody id="g${gi}">${D.grades[gi].classes.map((c, ci) => rowHtml(gi, ci, c, g, dis)).join('')}</tbody></table></div>
    ${editable ? `<button class="btn ghost" data-add="${gi}" style="margin-top:10px">+ إضافة فصل</button>` : ''}</section>`).join('');
  const f = (k, l) => `<div><span>${l}</span><input class="num" type="number" min="0" inputmode="numeric" data-s="${k}" value="${st[k] ?? ''}" ${dis}></div>`;
  $('#app').innerHTML = `<div class="card top"><div><h2 style="margin:0">${esc(r.stage.complex)} — ${esc(r.stage.name)}</h2><span class="hint" id="saved"></span></div>
    <button class="btn ghost" id="out">تسجيل الخروج</button></div>
    ${editable ? '' : '<div class="warn">التعديل مغلق على هذه المرحلة من قِبل الإدارة، البيانات للعرض فقط.</div>'}
    <div class="kpis"><div class="kpi"><b id="k1">0</b>إجمالي الطلاب</div><div class="kpi"><b id="k2">0</b>عدد الفصول</div><div class="kpi"><b id="k3">0</b>المسجلون الجدد</div><div class="kpi"><b id="k4">0</b>المنسحبون</div></div>
    ${gradeHtml}
    <section class="card"><h2>بيان الإحصاء</h2><div class="stats">${f('studentsLast', 'عدد الطلاب العام الماضي')}${f('classesLast', 'عدد الفصول العام الماضي')}
    ${f('teachers', 'عدد المعلمين (العام الحالي)')}${f('teachersLast', 'عدد المعلمين (العام الماضي)')}${f('admins', 'عدد الإداريين (العام الحالي)')}${f('adminsLast', 'عدد الإداريين (العام الماضي)')}</div></section>
    ${editable ? '<div class="savebar"><button class="btn" id="save">حفظ البيانات</button><span class="hint" id="state"></span></div>' : ''}`;
  totals();
  $('#out').onclick = async () => { api({action: 'logout', token: tok}); sessionStorage.removeItem('tok'); tok = null; viewLogin(); };
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
  return `<tr data-g="${gi}" data-c="${ci}"><td>${esc(c.name)}</td><td><select data-f="type" ${dis}>${g.types.map(t => `<option ${t === c.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></td>
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
window.onbeforeunload = e => dirty ? (e.preventDefault(), e.returnValue = '') : undefined;
init();
