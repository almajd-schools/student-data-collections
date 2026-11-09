/** مدارس المجد الأهلية – خادم جمع البيانات (Google Apps Script مرتبط بالشيت) */
const CFG = {MIN: 3, MAX: 15, TTL: 21600, YEAR: '1448هـ'};
const COMPLEXES = ['العريجاء', 'نمار', 'البنات'];
const AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
const gr = (labels, types) => labels.map(l => ({label: l, types: types}));
const LV = AR.slice(0, 3).map(x => 'المستوى ' + x), KG = ['KG1', 'KG2', 'KG3'];
const P = (a, b) => AR.slice(a, b).map(x => x + ' الابتدائي');
const M = AR.slice(0, 3).map(x => x + ' المتوسط'), S3 = AR.slice(0, 3).map(x => x + ' الثانوي');
const GR = n => Array.from({length: n}, (_, i) => 'Grade ' + (i + 1));
const AM = ['دبلوما أمريكية'], GEN = ['عام'], GT = ['عام', 'تحفيظ'];
const st = (key, complex, name, grades, notype) => ({key, complex, name, grades, notype: !!notype});
const STAGES = [
  st('ar_kg', 'العريجاء', 'تمهيدي', gr(LV, GEN)),
  st('ar_pri', 'العريجاء', 'ابتدائي', gr(P(0, 6), GT)),
  st('ar_mid', 'العريجاء', 'متوسط', gr(M, GT)),
  st('ar_sec', 'العريجاء', 'ثانوي', gr(S3, GEN), true),
  st('nm_kg', 'نمار', 'تمهيدي', gr(LV, GEN).concat(gr(KG, AM), gr(P(0, 3), GEN), gr(GR(3), AM))),
  st('nm_prig', 'نمار', 'ابتدائي عام', gr(P(0, 6), GEN), true),
  st('nm_prit', 'نمار', 'ابتدائي تحفيظ', gr(P(0, 6), ['تحفيظ']), true),
  st('nm_mid', 'نمار', 'متوسط', gr(M, GT)),
  st('nm_sec', 'نمار', 'ثانوي', gr(S3, GEN), true),
  st('nm_dip', 'نمار', 'دبلوما', gr(GR(12), AM), true),
  st('bn_kg', 'البنات', 'تمهيدي', gr(LV, GEN)),
  st('bn_pri', 'البنات', 'ابتدائي', gr(P(0, 3), ['عام', 'تحفيظ', 'طفولة مبكرة']).concat(gr(P(3, 6), GT))),
  st('bn_mid', 'البنات', 'متوسط', gr(M, GT)),
  st('bn_sec', 'البنات', 'ثانوي', gr(S3, GEN), true),
  st('bn_dip', 'البنات', 'دبلوما', gr(KG.concat(GR(12)), AM), true)
];
const SS = () => SpreadsheetApp.getActiveSpreadsheet();
const tabName = s => s.complex + ' - ' + s.name;
const stageOf = k => STAGES.find(s => s.key === k);
// تخطيط الورقة: الإحصاءات صفوف 5-11 ثابتة، ثم ملخص المستويات، ثم جدول الفصول
const layout = s => ({sum: 14, head: 15 + s.grades.length, rows: 16 + s.grades.length});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('مدارس المجد').addItem('تهيئة النظام (آمنة للتكرار)', 'setupAll')
    .addItem('تحديث لوحة المتابعة', 'buildDashboard').addItem('تصدير كل مرحلة كملف مستقل', 'exportStageFiles').addToUi();
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) { return out(handle({action: (e.parameter || {}).action || 'catalog'})); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return out(handle(p)); }

function handle(p) {
  try {
    if (p.action === 'catalog') return {ok: true, complexes: COMPLEXES, stages: STAGES.map(s => ({key: s.key, complex: s.complex, name: s.name}))};
    if (p.action === 'login') return login(p);
    if (p.action === 'adminLogin') return adminLogin(p);
    const u = session(p.token);
    if (!u) return {ok: false, expired: true, error: 'انتهت الجلسة، سجّل الدخول من جديد'};
    if (u.key === 'admin') {   // حساب الإدارة: قراءة التحليل فقط، ولا يصل لأي حفظ
      if (p.action === 'load' || p.action === 'adminData') return adminPayload(p.token);
      if (p.action === 'logout') { CacheService.getScriptCache().remove('s' + p.token); return {ok: true}; }
      return {ok: false, error: 'غير مسموح لحساب الإدارة'};
    }
    if (p.action === 'load') return payload(u, p.token);
    if (p.action === 'save') return save(u, p.data || {});
    if (p.action === 'saveTeachers') return saveTeachers(u, p.rows || []);
    if (p.action === 'logout') { CacheService.getScriptCache().remove('s' + p.token); return {ok: true}; }
    return {ok: false, error: 'طلب غير معروف'};
  } catch (err) { return {ok: false, error: 'خطأ في الخادم: ' + err.message}; }
}

// ---------- المستخدمون (يتحكم بهم مالك الشيت من ورقة «المستخدمون») ----------
function users() {
  const sh = SS().getSheetByName('المستخدمون');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues().map((r, i) =>
    ({row: i + 2, key: r[0], user: String(r[3]).trim(), pass: String(r[4]), on: r[5] === 'نعم', edit: r[6] === 'نعم'}));
}
const fp = u => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, u.user + '\u0000' + u.pass)).slice(0, 14);

function login(p) {
  if (p.stageKey === 'admin') return {ok: false, error: 'طلب غير صالح'};
  const c = CacheService.getScriptCache(), fk = 'f' + p.stageKey;
  if (Number(c.get(fk) || 0) >= 10) return {ok: false, error: 'محاولات كثيرة خاطئة، حاول بعد ١٥ دقيقة'};
  const u = users().find(x => x.key === p.stageKey);
  const good = u && u.on && u.user.toLowerCase() === String(p.username || '').trim().toLowerCase() && u.pass === String(p.password || '');
  if (!good) { c.put(fk, String(Number(c.get(fk) || 0) + 1), 900); return {ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة لهذه المرحلة'}; }
  c.remove(fk);
  const token = Utilities.getUuid() + Utilities.getUuid();
  c.put('s' + token, u.key + '|' + fp(u), CFG.TTL);
  return payload(u, token);
}
function adminLogin(p) {
  const c = CacheService.getScriptCache(), fk = 'fadmin';
  if (Number(c.get(fk) || 0) >= 10) return {ok: false, error: 'محاولات كثيرة خاطئة، حاول بعد ١٥ دقيقة'};
  const u = users().find(x => x.key === 'admin');
  const good = u && u.on && u.user.toLowerCase() === String(p.username || '').trim().toLowerCase() && u.pass === String(p.password || '');
  if (!good) { c.put(fk, String(Number(c.get(fk) || 0) + 1), 900); return {ok: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة'}; }
  c.remove(fk);
  const token = Utilities.getUuid() + Utilities.getUuid();
  c.put('s' + token, u.key + '|' + fp(u), CFG.TTL);
  return adminPayload(token);
}
function adminPayload(token) { return Object.assign({ok: true, admin: true, token}, adminData()); }
// بيانات خام لكل المراحل؛ الفلترة والتجميع تتم في المتصفح
function adminData() {
  const classes = [], teachers = [], stats = [];
  STAGES.forEach(s => {
    const d = readData(s);
    d.grades.forEach((g, i) => g.classes.forEach(c => classes.push({c: s.complex, s: s.name, g: s.grades[i].label, t: c.type,
      n: Number(c.students) || 0, nw: Number(c.newReg) || 0, wd: Number(c.withdrawn) || 0})));
    stats.push({c: s.complex, s: s.name, studentsLast: Number(d.stats.studentsLast) || 0, classesLast: Number(d.stats.classesLast) || 0});
    readTeachers(s).forEach(t => teachers.push({c: s.complex, s: s.name, name: t.name, spec: String(t.spec || '').trim(), lessons: Number(t.lessons) || 0}));
  });
  return {complexes: COMPLEXES, classes, teachers, stats};
}
function session(token) {
  if (!token) return null;
  const v = CacheService.getScriptCache().get('s' + token);
  if (!v) return null;
  const [k, f] = v.split('|'), u = users().find(x => x.key === k);
  return u && u.on && fp(u) === f ? u : null;   // تغيير كلمة المرور يُنهي الجلسات القديمة
}
function payload(u, token) {
  const s = stageOf(u.key);
  return {ok: true, token, editable: u.edit, min: CFG.MIN, max: CFG.MAX,
    stage: {key: s.key, complex: s.complex, name: s.name, grades: s.grades, notype: s.notype}, data: readData(s), teachers: readTeachers(s)};
}

// ---------- القراءة والحفظ (المرحلة تُحدَّد من الجلسة فقط، لا من الطلب) ----------
function readData(s) {
  const sh = SS().getSheetByName(tabName(s)), L = layout(s);
  const d = {grades: s.grades.map(() => ({classes: []})), stats: {}};
  if (!sh) return d;
  const v = sh.getRange(5, 1, 7, 4).getValues();
  d.stats = {studentsLast: v[0][2], classesLast: v[1][2], teachers: v[2][1], teachersLast: v[2][2], admins: v[3][1], adminsLast: v[3][2]};
  if (sh.getLastRow() >= L.rows)
    sh.getRange(L.rows, 1, sh.getLastRow() - L.rows + 1, 7).getValues().forEach(r => {
      const i = s.grades.findIndex(g => g.label === r[0]);
      if (i >= 0) d.grades[i].classes.push({name: r[1], type: r[2], students: r[3], newReg: r[4], withdrawn: r[5], notes: r[6]});
    });
  return d;
}
function save(u, d) {
  if (!u.edit) return {ok: false, error: 'تم إغلاق التعديل على هذه المرحلة من الإدارة'};
  const s = stageOf(u.key), n = v => { v = Math.round(Number(v)); return isFinite(v) && v >= 0 && v <= 5000 ? v : 0; };
  const blank = v => v === '' || v == null ? '' : n(v), t = (v, m) => String(v == null ? '' : v).slice(0, m);
  const rows = [];
  s.grades.forEach((g, i) => ((d.grades || [])[i] || {classes: []}).classes.slice(0, CFG.MAX).forEach((c, j) =>
    rows.push([g.label, t(c.name, 40) || g.label + ' / ' + (j + 1), g.types.indexOf(c.type) >= 0 ? c.type : g.types[0],
      blank(c.students), blank(c.newReg), blank(c.withdrawn), t(c.notes, 200)])));
  const x = d.stats || {}, stats = {studentsLast: blank(x.studentsLast), classesLast: blank(x.classesLast), teachers: blank(x.teachers),
    teachersLast: blank(x.teachersLast), admins: blank(x.admins), adminsLast: blank(x.adminsLast)};
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    render(s, rows, stats);
    SS().getSheetByName('المستخدمون').getRange(u.row, 8).setValue(new Date());
  } finally { lock.releaseLock(); }
  return {ok: true, savedAt: new Date().toISOString()};
}

// ---------- المعلمون (ورقة مستقلة لكل مرحلة) ----------
const tTab = s => 'معلمو ' + tabName(s);
function readTeachers(s) {
  const sh = SS().getSheetByName(tTab(s));
  if (!sh || sh.getLastRow() < 5) return [];
  return sh.getRange(5, 2, sh.getLastRow() - 4, 3).getValues().filter(r => r[0] !== '').map(r => ({name: r[0], spec: r[1], lessons: r[2]}));
}
function saveTeachers(u, rows) {
  if (!u.edit) return {ok: false, error: 'تم إغلاق التعديل على هذه المرحلة من الإدارة'};
  const t = (v, m) => String(v == null ? '' : v).trim().slice(0, m);
  const clean = rows.slice(0, 300).map(r => [t(r.name, 80), t(r.spec, 80), Math.min(Math.max(Math.round(Number(r.lessons)) || 0, 0), 100)]).filter(r => r[0]);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { renderTeachers(stageOf(u.key), clean); SS().getSheetByName('المستخدمون').getRange(u.row, 8).setValue(new Date()); }
  finally { lock.releaseLock(); }
  return {ok: true, count: clean.length};
}
function renderTeachers(s, rows) {
  const ss = SS(), sh = ss.getSheetByName(tTab(s)) || ss.insertSheet(tTab(s));
  sh.clear(); sh.setRightToLeft(true);
  sh.getRange('A1').setValue('معلمو ' + s.complex + ' — ' + s.name);
  sh.getRange('A2:D2').setValues([['عدد المعلمين', '=COUNTA(B5:B1000)', 'إجمالي الحصص', '=SUM(D5:D1000)']]);
  sh.getRange('A4:D4').setValues([['م', 'اسم المعلم', 'التخصص', 'عدد الحصص']]);
  if (rows.length) { sh.getRange(5, 2, rows.length, 2).setNumberFormat('@');
    sh.getRange(5, 1, rows.length, 4).setValues(rows.map((r, i) => [i + 1].concat(r))); }
  sh.getRange('A1:D1').merge().setBackground('#1d3a82').setFontColor('#fff').setFontSize(13).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A2:D2').setBackground('#fbf4dc').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A4:D4').setBackground('#d9a21b').setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(4, 1, Math.max(rows.length, 1) + 1, 4).setBorder(true, true, true, true, true, true, '#b8c4e0', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(5, 1, Math.max(rows.length, 1), 1).setHorizontalAlignment('center'); sh.getRange(5, 4, Math.max(rows.length, 1), 1).setHorizontalAlignment('center');
  sh.setColumnWidth(1, 80); sh.setColumnWidths(2, 2, 200); sh.setColumnWidth(4, 110); sh.setFrozenRows(4); sh.setTabColor('#6c8fcb');
}

// ---------- رسم ورقة المرحلة ----------
function render(s, rows, x) {
  const ss = SS(), name = tabName(s), L = layout(s), A = L.rows, Z = 1000;
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear(); sh.setRightToLeft(true);
  const col = (c, abs) => `${abs ? '$' : ''}${c}$${A}:${c}$${Z}`;
  sh.getRange('A1').setValue('مدارس المجد الأهلية — نموذج (1) إعداد الطلاب والفصول — العام الدراسي ' + CFG.YEAR);
  sh.getRange('A2:F2').setValues([['المجمع', s.complex, 'المرحلة', s.name, 'آخر تحديث', new Date()]]);
  sh.getRange('F2').setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange('A4:D11').setValues([
    ['البيان', 'العام الحالي', 'العام الماضي', 'الفرق'],
    ['إجمالي عدد الطلاب', `=SUM(${col('D')})`, x.studentsLast, '=B5-C5'],
    ['إجمالي عدد الفصول', `=COUNTIF(${col('D')},">0")`, x.classesLast, '=B6-C6'],
    ['عدد المعلمين', x.teachers, x.teachersLast, '=B7-C7'],
    ['عدد الإداريين', x.admins, x.adminsLast, '=B8-C8'],
    ['مجموع المعلمين + الإداريين', '=B7+B8', '=C7+C8', '=B9-C9'],
    ['المسجلون الجدد (مطابقة)', `=SUM(${col('E')})`, '', ''],
    ['المنسحبون (مطابقة)', `=SUM(${col('F')})`, '', '']]);
  sh.getRange(13, 1, 1, 3).setValues([['المستوى', 'عدد الطلاب', 'عدد الفصول']]);
  const sum = s.grades.map((g, i) => { const r = L.sum + i;
    return [g.label, `=SUMIF(${col('A', 1)},A${r},${col('D', 1)})`, `=COUNTIFS(${col('A', 1)},A${r},${col('D', 1)},">0")`]; });
  sh.getRange(L.sum, 1, sum.length, 3).setValues(sum);
  sh.getRange(L.head, 1, 1, 7).setValues([['المستوى', 'الفصل', 'نوع التعليم', 'عدد الطلاب', 'المسجلون جدد (مطابقة)', 'المنسحبون (مطابقة)', 'ملاحظات']]);
  if (rows.length) { sh.getRange(A, 1, rows.length, 7).setNumberFormat('@'); sh.getRange(A, 4, rows.length, 3).setNumberFormat('0');
    sh.getRange(A, 1, rows.length, 7).setValues(rows); }
  // التنسيق بهوية الشعار: كحلي + ذهبي
  const NAVY = '#1d3a82', GOLD = '#d9a21b', SOFT = '#eef2fb';
  sh.getRange('A1:G1').merge().setBackground(NAVY).setFontColor('#fff').setFontSize(14).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange('A2:F2').setBackground('#fbf4dc').setFontWeight('bold');
  [[4, 4], [13, 3], [L.head, 7]].forEach(([r, w]) => sh.getRange(r, 1, 1, w).setBackground(r === 4 ? GOLD : NAVY).setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center').setWrap(true));
  [[4, 4, 8], [13, 3, sum.length + 1], [L.head, 7, Math.max(rows.length, 1) + 1]].forEach(([r, w, h]) =>
    sh.getRange(r, 1, h, w).setBorder(true, true, true, true, true, true, '#b8c4e0', SpreadsheetApp.BorderStyle.SOLID));
  sh.getRange(5, 2, 2, 1).setBackground(SOFT); sh.getRange(5, 3, 4, 1).setBackground('#fff7d6'); sh.getRange(7, 2, 2, 1).setBackground('#fff7d6');
  sh.getRange(A, 1, Math.max(rows.length, 1), 7).setVerticalAlignment('middle');
  sh.getRange(5, 2, 7, 3).setHorizontalAlignment('center'); sh.getRange(A, 3, Math.max(rows.length, 1), 4).setHorizontalAlignment('center');
  sh.setColumnWidths(1, 1, 190); sh.setColumnWidths(2, 1, 130); sh.setColumnWidths(3, 2, 120); sh.setColumnWidths(5, 2, 150); sh.setColumnWidth(7, 280);
  sh.setFrozenRows(2); sh.setTabColor(s.complex === 'نمار' ? GOLD : s.complex === 'البنات' ? '#6c8fcb' : NAVY);
}

// ---------- التهيئة + لوحة المتابعة ----------
function setupAll() {
  const ss = SS();
  let u = ss.getSheetByName('المستخدمون');
  if (!u) { u = ss.insertSheet('المستخدمون', 0); u.setRightToLeft(true);
    u.getRange(1, 1, 1, 8).setValues([['المفتاح (لا يُعدَّل)', 'المجمع', 'المرحلة', 'اسم المستخدم', 'كلمة المرور', 'مفعّل (نعم/لا)', 'مفتوح للتعديل (نعم/لا)', 'آخر حفظ']])
      .setBackground('#1d3a82').setFontColor('#fff').setFontWeight('bold');
    u.setFrozenRows(1); u.getRange('D:E').setNumberFormat('@'); u.setColumnWidths(1, 8, 150); }
  const have = users().map(x => x.key), al = 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rpw = () => Array.from({length: 10}, () => al[Math.floor(Math.random() * al.length)]).join('');
  STAGES.filter(s => have.indexOf(s.key) < 0).forEach(s => u.appendRow([s.key, s.complex, s.name, s.key.replace('_', '-'), rpw(), 'نعم', 'نعم', '']));
  if (have.indexOf('admin') < 0) u.appendRow(['admin', 'الإدارة', 'مدير النظام (تحليل البيانات)', 'admin', rpw(), 'نعم', 'لا', '']);
  u.getRange('D2:E' + u.getLastRow()).setNumberFormat('@');
  STAGES.forEach(s => { if (!ss.getSheetByName(tabName(s))) render(s, [], {}); if (!ss.getSheetByName(tTab(s))) renderTeachers(s, []); });
  buildDashboard();
  SpreadsheetApp.getUi().alert('تمت التهيئة. عدّل أسماء المستخدمين وكلمات المرور من ورقة «المستخدمون».');
}
function buildDashboard() {
  const ss = SS(), sh = ss.getSheetByName('لوحة المتابعة') || ss.insertSheet('لوحة المتابعة', 1);
  sh.getCharts().forEach(c => sh.removeChart(c)); sh.clear(); sh.setRightToLeft(true); sh.setHiddenGridlines(true);
  const NAVY = '#1d3a82', GOLD = '#d9a21b', CREAM = '#fbf4dc', LINE = '#b8c4e0', n = STAGES.length;
  const types = []; STAGES.forEach(s => s.grades.forEach(g => g.types.forEach(t => { if (types.indexOf(t) < 0) types.push(t); })));
  const T = types.length, tHead = 15, tTot = tHead + T + 1, sTitle = tTot + 2, sHead = sTitle + 1, S0 = sHead + 1, S1 = S0 + n - 1;
  const box = (r, c, h, w) => sh.getRange(r, c, h, w).setBorder(true, true, true, true, true, true, LINE, SpreadsheetApp.BorderStyle.SOLID);
  const head = (r, arr, color) => sh.getRange(r, 1, 1, arr.length).setValues([arr]).setBackground(color || NAVY).setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  const title = (r, t) => sh.getRange(r, 1).setValue(t).setFontSize(13).setFontWeight('bold').setFontColor(NAVY);
  // العنوان
  sh.getRange('A1:N1').merge().setValue('لوحة متابعة بيانات مدارس المجد الأهلية — العام الدراسي ' + CFG.YEAR).setBackground(NAVY).setFontColor('#fff').setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange('A2:N2').merge().setValue('تتحدث الأرقام تلقائياً عند حفظ أي مرحلة لبياناتها').setBackground(GOLD).setFontColor('#fff').setHorizontalAlignment('center');
  sh.setRowHeight(1, 46);
  // البطاقات الرئيسية
  const kp = [['إجمالي الطلاب', '=B12'], ['إجمالي الفصول', '=E12'], ['المعلمون', '=F12'], ['إجمالي الحصص', '=G12'], ['المسجلون الجدد', '=H12'], ['المنسحبون', '=I12']];
  sh.getRange(4, 1, 1, 6).setValues([kp.map(k => k[0])]).setBackground(GOLD).setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(5, 1, 1, 6).setValues([kp.map(k => k[1])]).setBackground(CREAM).setFontColor(NAVY).setFontSize(24).setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(5, 54); box(4, 1, 2, 6);
  // جدول المجمعات
  title(7, 'ملخص المجمعات');
  head(8, ['المجمع', 'الطلاب', 'طلاب العام الماضي', 'الفرق', 'الفصول', 'المعلمون', 'إجمالي الحصص', 'المسجلون جدد', 'المنسحبون']);
  const sc = L => `$${L}$${S0}:$${L}$${S1}`, byC = (r, L) => `=SUMIF(${sc('A')},$A${r},${sc(L)})`;
  sh.getRange(9, 1, 3, 9).setValues(COMPLEXES.map((c, i) => { const r = 9 + i; return [c, byC(r, 'C'), byC(r, 'D'), byC(r, 'E'), byC(r, 'F'), byC(r, 'L'), byC(r, 'M'), byC(r, 'I'), byC(r, 'J')]; }));
  sh.getRange(12, 1, 1, 9).setValues([['الإجمالي'].concat('BCDEFGHI'.split('').slice(0, 8).map(L => `=SUM(${L}9:${L}11)`))]).setBackground(CREAM).setFontWeight('bold');
  box(8, 1, 5, 9);
  // جدول نوع التعليم
  title(14, 'ملخص حسب نوع التعليم');
  head(tHead, ['نوع التعليم'].concat(COMPLEXES, ['الإجمالي', 'عدد الفصول']));
  const rng = (s, L) => `'${tabName(s)}'!$${L}$${layout(s).rows}:$${L}$1000`;
  const trows = types.map((t, i) => { const r = tHead + 1 + i;
    const cx = COMPLEXES.map(c => '=' + STAGES.filter(s => s.complex === c).map(s => `SUMIF(${rng(s, 'C')},"${t}",${rng(s, 'D')})`).join('+'));
    return [t].concat(cx, [`=SUM(B${r}:D${r})`, '=' + STAGES.map(s => `COUNTIFS(${rng(s, 'C')},"${t}",${rng(s, 'D')},">0")`).join('+')]); });
  sh.getRange(tHead + 1, 1, T, 6).setValues(trows);
  sh.getRange(tTot, 1, 1, 6).setValues([['الإجمالي'].concat('BCDEF'.split('').map(L => `=SUM(${L}${tHead + 1}:${L}${tTot - 1})`))]).setBackground(CREAM).setFontWeight('bold');
  box(tHead, 1, T + 2, 6);
  // جدول المراحل
  title(sTitle, 'تفاصيل المراحل');
  head(sHead, ['المجمع', 'المرحلة', 'الطلاب الحاليون', 'طلاب العام الماضي', 'الفرق', 'الفصول', 'المعلمون', 'الإداريون', 'المسجلون جدد', 'المنسحبون', 'آخر تحديث', 'المعلمون (قائمة)', 'إجمالي الحصص', 'التسمية (للمخطط)']);
  sh.getRange(S0, 1, n, 14).setValues(STAGES.map(s => { const q = `'${tabName(s)}'!`, t = `'${tTab(s)}'!`;
    return [s.complex, s.name, `=${q}B5`, `=${q}C5`, `=${q}D5`, `=${q}B6`, `=${q}B7`, `=${q}B8`, `=${q}B10`, `=${q}B11`, `=${q}F2`, `=${t}B2`, `=${t}D2`, `=A${S0 + STAGES.indexOf(s)}&" - "&B${S0 + STAGES.indexOf(s)}`]; }));
  sh.getRange(S0, 11, n, 1).setNumberFormat('yyyy-mm-dd hh:mm'); sh.getRange(S0, 14, n, 1).setFontColor('#9aa7c7');
  box(sHead, 1, n + 1, 14);
  for (let r = S0; r <= S1; r += 2) sh.getRange(r, 1, 1, 13).setBackground('#f4f7fd');
  sh.getRange(9, 2, 4, 8).setHorizontalAlignment('center'); sh.getRange(tHead + 1, 2, T + 1, 5).setHorizontalAlignment('center'); sh.getRange(S0, 3, n, 11).setHorizontalAlignment('center');
  sh.setColumnWidths(1, 14, 112); sh.setColumnWidth(2, 210); sh.setColumnWidth(14, 160);
  // المخططات
  const cr = S1 + 3, opt = (c, t, w, col) => c.setOption('title', t).setOption('width', w).setOption('height', 290).setOption('colors', col).setOption('legend', {position: 'bottom'});
  sh.insertChart(opt(sh.newChart().setChartType(Charts.ChartType.COLUMN).addRange(sh.getRange(8, 1, 4, 2)).setPosition(cr, 1, 0, 0), 'الطلاب حسب المجمع', 430, [NAVY]).build());
  sh.insertChart(opt(sh.newChart().setChartType(Charts.ChartType.PIE).addRange(sh.getRange(tHead, 1, T + 1, 1)).addRange(sh.getRange(tHead, 5, T + 1, 1)).setPosition(cr, 4, 20, 0), 'الطلاب حسب نوع التعليم', 430, [NAVY, GOLD, '#6c8fcb', '#9aa7c7']).build());
  sh.insertChart(opt(sh.newChart().setChartType(Charts.ChartType.BAR).addRange(sh.getRange(sHead, 14, n + 1, 1)).addRange(sh.getRange(sHead, 3, n + 1, 1)).setPosition(cr, 8, 20, 0), 'الطلاب حسب المرحلة', 560, [GOLD]).build());
  sh.setFrozenRows(2); sh.setTabColor(GOLD);
}

// تصدير كل مرحلة كملف Google Sheet مستقل داخل مجلد في Drive (ورقة الطلاب + ورقة المعلمين)
function exportStageFiles() {
  const ss = SS(), folder = DriveApp.createFolder('ملفات مراحل مدارس المجد - ' + Utilities.formatDate(new Date(), 'Asia/Riyadh', 'yyyy-MM-dd'));
  STAGES.forEach(s => {
    const f = SpreadsheetApp.create(tabName(s)), first = f.getSheets()[0];
    [tabName(s), tTab(s)].forEach(n => { const src = ss.getSheetByName(n); if (src) src.copyTo(f).setName(n.slice(0, 99)); });
    f.deleteSheet(first); f.getSheets().forEach(x => x.setRightToLeft(true));
    DriveApp.getFileById(f.getId()).moveTo(folder);
  });
  SpreadsheetApp.getUi().alert('تم إنشاء ملفات المراحل في المجلد: ' + folder.getUrl());
}
