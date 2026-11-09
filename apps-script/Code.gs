/** مدارس المجد الأهلية – خادم جمع البيانات (Google Apps Script مرتبط بالشيت) */
const CFG = {MIN: 6, MAX: 15, TTL: 21600, YEAR: '1448هـ'};
const COMPLEXES = ['العريجاء', 'نمار', 'البنات'];
const AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
const gr = (labels, types) => labels.map(l => ({label: l, types: types}));
const LV = AR.slice(0, 3).map(x => 'المستوى ' + x), KG = ['KG1', 'KG2', 'KG3'];
const P = (a, b) => AR.slice(a, b).map(x => x + ' الابتدائي');
const M = AR.slice(0, 3).map(x => x + ' المتوسط'), S3 = AR.slice(0, 3).map(x => x + ' الثانوي');
const GR = n => Array.from({length: n}, (_, i) => 'Grade ' + (i + 1));
const AM = ['دبلوما أمريكية'], GEN = ['عام'], GT = ['عام', 'تحفيظ'];
const st = (key, complex, name, grades) => ({key, complex, name, grades});
const STAGES = [
  st('ar_kg', 'العريجاء', 'تمهيدي', gr(LV, GEN)),
  st('ar_pri', 'العريجاء', 'ابتدائي', gr(P(0, 6), GT)),
  st('ar_mid', 'العريجاء', 'متوسط', gr(M, GT)),
  st('ar_sec', 'العريجاء', 'ثانوي', gr(S3, GEN)),
  st('nm_kg', 'نمار', 'تمهيدي', gr(LV, GEN).concat(gr(KG, AM))),
  st('nm_p12', 'نمار', 'أول وثاني وثالث ابتدائي (Grade 1, 2, 3)', gr(P(0, 3), GEN).concat(gr(GR(3), AM))),
  st('nm_prig', 'نمار', 'ابتدائي عام', gr(P(0, 6), GEN)),
  st('nm_prit', 'نمار', 'ابتدائي تحفيظ', gr(P(0, 6), ['تحفيظ'])),
  st('nm_mid', 'نمار', 'متوسط', gr(M, GT)),
  st('nm_sec', 'نمار', 'ثانوي', gr(S3, GEN)),
  st('nm_dip', 'نمار', 'دبلوما', gr(GR(12), AM)),
  st('bn_kg', 'البنات', 'تمهيدي', gr(LV, GEN)),
  st('bn_pri', 'البنات', 'ابتدائي', gr(P(0, 3), ['عام', 'تحفيظ', 'طفولة مبكرة']).concat(gr(P(3, 6), GT))),
  st('bn_mid', 'البنات', 'متوسط', gr(M, GT)),
  st('bn_sec', 'البنات', 'ثانوي', gr(S3, GEN)),
  st('bn_dip', 'البنات', 'دبلوما', gr(KG.concat(GR(12)), AM))
];
const SS = () => SpreadsheetApp.getActiveSpreadsheet();
const tabName = s => s.complex + ' - ' + s.name;
const stageOf = k => STAGES.find(s => s.key === k);
// تخطيط الورقة: الإحصاءات صفوف 5-11 ثابتة، ثم ملخص المستويات، ثم جدول الفصول
const layout = s => ({sum: 14, head: 15 + s.grades.length, rows: 16 + s.grades.length});

function onOpen() {
  SpreadsheetApp.getUi().createMenu('مدارس المجد').addItem('تهيئة النظام (آمنة للتكرار)', 'setupAll')
    .addItem('تحديث لوحة المتابعة', 'buildDashboard').addToUi();
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) { return out(handle({action: (e.parameter || {}).action || 'catalog'})); }
function doPost(e) { let p = {}; try { p = JSON.parse(e.postData.contents); } catch (x) {} return out(handle(p)); }

function handle(p) {
  try {
    if (p.action === 'catalog') return {ok: true, complexes: COMPLEXES, stages: STAGES.map(s => ({key: s.key, complex: s.complex, name: s.name}))};
    if (p.action === 'login') return login(p);
    const u = session(p.token);
    if (!u) return {ok: false, expired: true, error: 'انتهت الجلسة، سجّل الدخول من جديد'};
    if (p.action === 'load') return payload(u, p.token);
    if (p.action === 'save') return save(u, p.data || {});
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
    stage: {key: s.key, complex: s.complex, name: s.name, grades: s.grades}, data: readData(s)};
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
  STAGES.filter(s => have.indexOf(s.key) < 0).forEach(s => {
    const pw = Array.from({length: 10}, () => al[Math.floor(Math.random() * al.length)]).join('');
    u.appendRow([s.key, s.complex, s.name, s.key.replace('_', '-'), pw, 'نعم', 'نعم', '']);
  });
  u.getRange('D2:E' + u.getLastRow()).setNumberFormat('@');
  STAGES.forEach(s => { if (!ss.getSheetByName(tabName(s))) render(s, [], {}); });
  buildDashboard();
  SpreadsheetApp.getUi().alert('تمت التهيئة. عدّل أسماء المستخدمين وكلمات المرور من ورقة «المستخدمون».');
}
function buildDashboard() {
  const ss = SS(), sh = ss.getSheetByName('لوحة المتابعة') || ss.insertSheet('لوحة المتابعة', 1);
  sh.clear(); sh.setRightToLeft(true);
  const H = ['المجمع', 'المرحلة', 'الطلاب الحاليون', 'طلاب العام الماضي', 'الفرق', 'الفصول', 'المعلمون', 'الإداريون', 'المسجلون جدد', 'المنسحبون', 'آخر تحديث'];
  const rows = STAGES.map(s => { const q = `'${tabName(s)}'!`;
    return [s.complex, s.name, `=${q}B5`, `=${q}C5`, `=${q}D5`, `=${q}B6`, `=${q}B7`, `=${q}B8`, `=${q}B10`, `=${q}B11`, `=${q}F2`]; });
  const n = rows.length, last = n + 1;
  sh.getRange('A1:K1').setValues([H]).setBackground('#1d3a82').setFontColor('#fff').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(2, 1, n, 11).setValues(rows); sh.getRange(2, 11, n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  const sums = (f) => [3, 4, 5, 6, 7, 8, 9, 10].map(k => f(String.fromCharCode(64 + k)));
  const tot = COMPLEXES.map(c => ['إجمالي ' + c, ''].concat(sums(L => `=SUMIF($A$2:$A$${last},"${c}",${L}$2:${L}$${last})`)));
  tot.push(['الإجمالي العام', ''].concat(sums(L => `=SUM(${L}2:${L}${last})`)));
  sh.getRange(last + 2, 1, 4, 10).setValues(tot).setFontWeight('bold').setBackground('#fbf4dc');
  sh.getRange(1, 1, last, 11).setBorder(true, true, true, true, true, true, '#b8c4e0', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(2, 3, n + 5, 8).setHorizontalAlignment('center'); sh.setColumnWidths(1, 11, 120); sh.setColumnWidth(2, 220); sh.setFrozenRows(1);
}
