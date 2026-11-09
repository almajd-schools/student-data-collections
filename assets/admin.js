// صفحة الإدارة: تحليل بيانات الطلاب والمعلمين لكل المجمعات بفلاتر (تُحسب في المتصفح)
let A = null, F = {c: '', s: '', g: '', t: '', l: '', m: 'n'};
function viewAdminLogin() {
  $('#app').innerHTML = demoBanner() + `<section class="card login"><h2>دخول الإدارة</h2><div class="cred"><h3>بيانات حساب الإدارة</h3>
  <input id="au" placeholder="اسم المستخدم" autocomplete="username"><input id="ap" type="password" placeholder="كلمة المرور" autocomplete="current-password">
  <button class="btn" id="ago">دخول</button><div class="err" id="aerr"></div></div><p class="alink"><a href="#" id="back0">← العودة لدخول المراحل</a></p></section>`;
  const go = async () => { $('#ago').disabled = true; $('#aerr').textContent = '';
    try { const r = await api({action: 'adminLogin', username: $('#au').value, password: $('#ap').value}); if (r.ok) openAdmin(r); else $('#aerr').textContent = r.error; }
    catch (e) { $('#aerr').textContent = e.message; } $('#ago').disabled = false; };
  $('#ago').onclick = go; $('#ap').onkeydown = e => e.key === 'Enter' && go();
  $('#back0').onclick = e => { e.preventDefault(); viewLogin(); };
}
function openAdmin(r) { tok = r.token; sessionStorage.setItem('tok', tok); A = r; F = {c: '', s: '', g: '', t: '', l: '', m: 'n'}; dirty = false; renderAdmin(); }
// تصنيف المراحل الدراسية (يمكن تعديله هنا): الدبلوما كلها دبلوما، وصفوف الابتدائي/Grade داخل تمهيدي نمار تُحسب ابتدائي
const LEVELS = ['رياض الأطفال (تمهيدي)', 'ابتدائي', 'متوسط', 'ثانوي', 'دبلوما'];
const stageLevel = n => n.includes('دبلوما') ? LEVELS[4] : n.includes('ثانوي') ? LEVELS[3] : n.includes('متوسط') ? LEVELS[2] : n.includes('ابتدائي') ? LEVELS[1] : LEVELS[0];
const level = x => x.s.includes('دبلوما') ? LEVELS[4] : (x.s.includes('تمهيدي') && /الابتدائي|^Grade/.test(x.g)) ? LEVELS[1] : stageLevel(x.s);
const uniq = a => [...new Set(a)];
function renderAdmin() {
  const sk = x => x.c + '|' + x.s, byCS = x => (!F.c || x.c === F.c) && (!F.s || sk(x) === F.s);
  const gt = x => (!F.g || x.g === F.g) && (!F.t || x.t === F.t), base = A.classes.filter(byCS).filter(x => !F.l || level(x) === F.l), rows = base.filter(gt),
    noLv = A.classes.filter(byCS).filter(gt), tr = A.teachers.filter(byCS).filter(x => !F.l || stageLevel(x.s) === F.l);
  const stages = uniq(A.stats.filter(x => !F.c || x.c === F.c).map(sk)), grades = uniq(base.map(x => x.g)), types = uniq(base.map(x => x.t));
  const met = F.m, lab = met === 'n' ? 'طلاب' : 'فصول';
  const val = rs => met === 'n' ? rs.reduce((a, x) => a + x.n, 0) : rs.filter(x => x.n > 0).length;
  const group = (rs, kf) => { const m = new Map(); rs.forEach(x => { const k = kf(x); (m.get(k) || m.set(k, []).get(k)).push(x); }); return [...m].map(([k, v]) => [k, val(v)]); };
  const sum = (rs, f) => rs.reduce((a, x) => a + x[f], 0), students = sum(rows, 'n'), classes = rows.filter(x => x.n > 0).length;
  const full = !F.g && !F.t && !F.l, st = A.stats.filter(byCS), last = st.reduce((a, x) => a + x.studentsLast, 0), lastC = st.reduce((a, x) => a + x.classesLast, 0);
  const lvCards = LEVELS.map(l => { const rs = noLv.filter(x => level(x) === l);
    return `<button class="kpi lv ${F.l === l ? 'on' : ''}" data-l="${esc(l)}"><b>${sum(rs, 'n')}</b>${esc(l)}<small>${rs.filter(x => x.n > 0).length} فصل</small></button>`; }).join('');
  const bars = (t, arr) => { const tot = arr.reduce((a, x) => a + x[1], 0), mx = Math.max(1, ...arr.map(x => x[1]));
    return `<section class="card"><h3>${t}</h3>${arr.length ? arr.map(([k, v]) => `<div class="bar"><span class="bl">${esc(k)}</span><div class="bt"><i style="width:${v / mx * 100}%"></i></div><b>${v}</b><em>${tot ? Math.round(v / tot * 100) : 0}%</em></div>`).join('') : '<p class="hint">لا توجد بيانات</p>'}</section>`; };
  const opt = (arr, cur, all, lbl) => `<option value="">${all}</option>` + arr.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(lbl ? lbl(v) : v)}</option>`).join('');
  const kpi = (v, l) => `<div class="kpi"><b>${v}</b>${l}</div>`;
  const specs = [...group2(tr, x => x.spec || 'غير محدد')].sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  function group2(rs, kf) { const m = new Map(); rs.forEach(x => { const k = kf(x), o = m.get(k) || m.set(k, {n: 0, l: 0}).get(k); o.n++; o.l += x.lessons; }); return m; }
  const tl = sum(tr, 'lessons');
  $('#app').oninput = $('#app').onclick = null;
  $('#app').innerHTML = `${demoBanner()}<div class="card top"><div><h2 style="margin:0">لوحة الإدارة — تحليل البيانات</h2><span class="hint">جميع المجمعات والمراحل</span></div>
  <div><button class="btn ghost" id="xp">⬇ تصدير Excel</button> <button class="btn ghost" id="rf">↻ تحديث</button> <button class="btn ghost" id="out">تسجيل الخروج</button></div></div>
  <section class="card"><div class="filters">
    <div><label class="l">المرحلة الدراسية</label><select id="fl">${opt(LEVELS, F.l, 'كل المراحل الدراسية')}</select></div>
    <div><label class="l">المجمع</label><select id="fc">${opt(A.complexes, F.c, 'كل المجمعات')}</select></div>
    <div><label class="l">المرحلة</label><select id="fs">${opt(stages, F.s, 'كل المراحل', v => (F.c ? '' : v.split('|')[0] + ' - ') + v.split('|')[1])}</select></div>
    <div><label class="l">الصف</label><select id="fg">${opt(grades, F.g, 'كل الصفوف')}</select></div>
    <div><label class="l">نوع التعليم</label><select id="ft">${opt(types, F.t, 'كل الأنواع')}</select></div>
    <div><label class="l">التحليل بحسب</label><div class="seg"><button data-m="n" class="${met === 'n' ? 'on' : ''}">عدد الطلاب</button><button data-m="k" class="${met === 'k' ? 'on' : ''}">عدد الفصول</button></div></div>
  </div></section>
  <section class="card"><h3>إجمالي الطلاب في كل مرحلة دراسية <span class="hint">(اضغط على مرحلة لتصفية التحليل بها)</span></h3><div class="kpis lvs">${lvCards}</div></section>
  <div class="kpis">${kpi(students, 'إجمالي الطلاب')}${kpi(classes, 'عدد الفصول')}${kpi(classes ? (students / classes).toFixed(1) : 0, 'متوسط الطلاب/الفصل')}${kpi(sum(rows, 'nw'), 'المسجلون الجدد')}${kpi(sum(rows, 'wd'), 'المنسحبون')}
  ${full ? kpi(last ? (students - last > 0 ? '+' : '') + (students - last) : '—', 'الفرق عن العام الماضي') : ''}${kpi(tr.length, 'المعلمون')}${kpi(tl, 'إجمالي الحصص')}</div>
  ${bars('حسب المرحلة الدراسية (' + lab + ')', group(rows, level).sort((a, b) => LEVELS.indexOf(a[0]) - LEVELS.indexOf(b[0])))}
  <div class="two">${bars('حسب المجمع (' + lab + ')', group(rows, x => x.c))}${bars('حسب نوع التعليم (' + lab + ')', group(rows, x => x.t))}</div>
  ${bars('حسب المرحلة (' + lab + ')', group(rows, x => (F.c ? '' : x.c + ' - ') + x.s))}
  ${bars('حسب الصف (' + lab + ')', group(rows, x => (F.s || F.c ? '' : x.c + ' - ') + (F.s ? '' : x.s + ' - ') + x.g))}
  <section class="card"><h3>المعلمون حسب التخصص <span class="hint">(يتأثر بفلاتر المجمع والمرحلة والمرحلة الدراسية فقط)</span></h3><div class="tw"><table><tr><th>التخصص</th><th>عدد المعلمين</th><th>إجمالي الحصص</th><th>متوسط الحصص</th></tr>
  ${specs.map(([k, o]) => `<tr><td>${esc(k)}</td><td class="num">${o.n}</td><td class="num">${o.l}</td><td class="num">${(o.l / o.n).toFixed(1)}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">لا توجد بيانات معلمين</td></tr>'}</table></div></section>`;
  const set = (id, k, reset) => $(id).onchange = e => { F[k] = e.target.value; reset.forEach(r => F[r] = ''); renderAdmin(); };
  set('#fl', 'l', ['g', 't']); set('#fc', 'c', ['s', 'g', 't']); set('#fs', 's', ['g', 't']); set('#fg', 'g', []); set('#ft', 't', []);
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { F.m = b.dataset.m; renderAdmin(); });
  document.querySelectorAll('.lv').forEach(b => b.onclick = () => { F.l = F.l === b.dataset.l ? '' : b.dataset.l; F.g = ''; F.t = ''; renderAdmin(); });
  $('#out').onclick = logout;
  $('#rf').onclick = async () => { const r = await api({action: 'adminData', token: tok}); if (r.ok) { A = r; renderAdmin(); toast('تم تحديث البيانات'); } else { toast(r.error); viewLogin(); } };
  $('#xp').onclick = () => { const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(x => ({'المجمع': x.c, 'المرحلة': x.s, 'المرحلة الدراسية': level(x), 'الصف': x.g, 'نوع التعليم': x.t, 'عدد الطلاب': x.n, 'المسجلون جدد': x.nw, 'المنسحبون': x.wd}))), 'الفصول');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tr.map(x => ({'المجمع': x.c, 'المرحلة': x.s, 'المعلم': x.name, 'التخصص': x.spec, 'عدد الحصص': x.lessons}))), 'المعلمون');
    wb.Workbook = {Views: [{RTL: true}]}; XLSX.writeFile(wb, 'تحليل_بيانات_المجد.xlsx'); };
}
