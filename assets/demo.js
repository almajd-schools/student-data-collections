// معاينة تجريبية: خادم وهمي داخل المتصفح. يُفعَّل بوضع APPS_SCRIPT_URL = 'DEMO' في config.js (الدخول: demo / demo)
(function () {
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
const stageOf = k => STAGES.find(s => s.key === k), store = {}, cp = o => JSON.parse(JSON.stringify(o));
const pay = (k) => { const s = stageOf(k), m = store[k] || {};
  return {ok: true, token: 'tok-' + k, editable: true, min: 3, max: 15, stage: cp({key: s.key, complex: s.complex, name: s.name, grades: s.grades, notype: s.notype}),
    data: cp(m.data || {grades: s.grades.map(() => ({classes: []})), stats: {}}), teachers: cp(m.teachers || [])}; };
let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, ri = (a, n) => a + Math.floor(rnd() * n);
const SPECS = ['رياضيات', 'لغة عربية', 'علوم', 'لغة إنجليزية', 'تربية إسلامية', 'حاسب آلي', 'اجتماعيات', 'فيزياء', 'كيمياء', 'أحياء'];
function adminData() {  // بيانات تجريبية مولَّدة، وتُستبدل ببيانات المرحلة إن أدخلتها في المعاينة
  seed = 7; const classes = [], teachers = [], stats = [];
  STAGES.forEach(s => { const m = store[s.key] || {};
    s.grades.forEach((g, i) => { let cl = m.data && m.data.grades[i] ? m.data.grades[i].classes : null;
      if (!cl) cl = Array.from({length: ri(3, 3)}, () => ({type: g.types[ri(0, g.types.length)], students: ri(12, 20), newReg: ri(0, 4), withdrawn: ri(0, 2)}));
      cl.forEach(c => classes.push({c: s.complex, s: s.name, g: g.label, t: c.type || g.types[0], n: +c.students || 0, nw: +c.newReg || 0, wd: +c.withdrawn || 0})); });
    const sl = m.data && m.data.stats ? +m.data.stats.studentsLast || 0 : 0; stats.push({c: s.complex, s: s.name, studentsLast: sl || ri(150, 200), classesLast: ri(8, 6)});
    (m.teachers || Array.from({length: ri(4, 5)}, (_, j) => ({name: 'معلم ' + (j + 1), spec: SPECS[ri(0, SPECS.length)], lessons: ri(12, 12)})))
      .forEach(t => teachers.push({c: s.complex, s: s.name, name: t.name, spec: t.spec, lessons: +t.lessons || 0})); });
  return {complexes: COMPLEXES, classes, teachers, stats};
}
window.mockApi = async function (b) {
  await new Promise(r => setTimeout(r, 250));
  if (b.action === 'catalog') return {ok: true, complexes: COMPLEXES, stages: STAGES.map(s => ({key: s.key, complex: s.complex, name: s.name}))};
  if (b.action === 'adminLogin') return b.username === 'admin' && b.password === 'admin' ? Object.assign({ok: true, admin: true, token: 'tok-admin'}, adminData()) : {ok: false, error: 'للمعاينة استخدم: admin / admin'};
  if (b.token === 'tok-admin') return b.action === 'logout' ? {ok: true} : Object.assign({ok: true, admin: true, token: 'tok-admin'}, adminData());
  if (b.action === 'login') return b.username === 'demo' && b.password === 'demo' && stageOf(b.stageKey) ? pay(b.stageKey) : {ok: false, error: 'للمعاينة استخدم: demo / demo'};
  const k = String(b.token || '').replace('tok-', '');
  if (!stageOf(k)) return {ok: false, expired: true, error: 'انتهت الجلسة'};
  store[k] = store[k] || {};
  if (b.action === 'load') return pay(k);
  if (b.action === 'save') { store[k].data = cp(b.data); return {ok: true}; }
  if (b.action === 'saveTeachers') { store[k].teachers = cp(b.rows); return {ok: true}; }
  return {ok: true};
};
})();
