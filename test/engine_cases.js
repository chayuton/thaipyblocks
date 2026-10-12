// Runs the engine on reference experiments and prints JSON (compared against test/sk_ref.py).
const PB = require('./load_engine');
const R = PB.runMaybe;
const out = {};
const t0 = Date.now();
const time = {};
function run(name, fn) {
  const s = Date.now();
  try { out[name] = fn(); } catch (e) { out[name] = { error: (e.pyType || e.name) + ': ' + e.message + (e.thai ? ' | ' + e.thai : ''), stack: e.pyType ? undefined : String(e.stack).split('\n').slice(0, 4).join(' / ') }; }
  time[name] = Date.now() - s;
}
const arr = (a) => (a instanceof PB.NDArray ? a.tolist() : a instanceof PB.Series ? a.values : a);
const round = (x, d = 10) => (typeof x === 'number' ? Number(x.toFixed(d)) : Array.isArray(x) ? x.map((v) => round(v, d)) : x);

run('perm', () => new PB.RandomState(42).permutation(150).slice(0, 20));

// ---------- iris ----------
const iris = PB.loadSample('iris');
const Xi = iris.drop(['species']), yi = iris.col('species');
const [Xtr, Xte, ytr, yte] = PB.trainTestSplit([Xi, yi], { test_size: 0.2, random_state: 42 });
run('iris_split_idx', () => Xte.index.slice(0, 30));
const [sXtr, sXte, sytr, syte] = PB.trainTestSplit([Xi, yi], { test_size: 0.2, random_state: 42, stratify: yi });
run('iris_strat_idx', () => sXte.index);
run('iris_strat_train_idx', () => sXtr.index.slice(0, 40));
const clsModels = {
  logreg: () => new PB.LogisticRegression({ max_iter: 1000 }),
  dtree: () => new PB.DecisionTreeClassifier({ random_state: 42 }),
  dtree_d3: () => new PB.DecisionTreeClassifier({ random_state: 0, max_depth: 3 }),
  rf: () => new PB.RandomForestClassifier({ n_estimators: 100, random_state: 42 }),
  gb: () => new PB.GradientBoostingClassifier({ random_state: 42 }),
  knn: () => new PB.KNeighborsClassifier({ n_neighbors: 5 }),
  gnb: () => new PB.GaussianNB(),
  svc: () => new PB.SVC(),
  mlp: () => new PB.MLPClassifier({ max_iter: 300, random_state: 42 }),
};
for (const [k, mk] of Object.entries(clsModels)) {
  run('iris_' + k, () => {
    const m = mk(); R(m.fit(sXtr, sytr));
    const p = m.predict(sXte);
    const res = { acc: PB.metrics.accuracy_score(syte, p), pred: arr(p) };
    if (k.startsWith('dtree')) { res.feature = m.tree_.feature; res.threshold = round(m.tree_.threshold, 6); res.imp = round(arr(m.feature_importances_), 8); }
    if (k === 'rf' || k === 'gb') res.imp = round(arr(m.feature_importances_), 6);
    if (k === 'logreg') res.coef = round(arr(m.coef_), 3);
    if (k === 'mlp') res.n_iter = m.n_iter_;
    return res;
  });
}

// ---------- titanic ----------
run('titanic', () => {
  let df = PB.loadSample('titanic');
  df = df.select(['survived', 'pclass', 'sex', 'age', 'sibsp', 'parch', 'fare', 'embarked']);
  df.set('age', df.col('age').fillna(df.col('age').median()));
  df = df.dropna();
  df = PB.getDummies(df, ['sex', 'embarked'], true);
  const X = df.drop(['survived']), y = df.col('survived');
  const [a, b, c, d] = PB.trainTestSplit([X, y], { test_size: 0.2, random_state: 42, stratify: y });
  const res = { cols: X.columns, shape: X.shape.items, test_idx: b.index.slice(0, 20) };
  for (const [k, mk] of Object.entries({ logreg: () => new PB.LogisticRegression({ max_iter: 1000 }), dtree: () => new PB.DecisionTreeClassifier({ random_state: 42 }), rf: () => new PB.RandomForestClassifier({ random_state: 42 }), gb: () => new PB.GradientBoostingClassifier({ random_state: 42 }), knn: () => new PB.KNeighborsClassifier(), gnb: () => new PB.GaussianNB() })) {
    const s = Date.now(); const m = mk(); R(m.fit(a, c)); const p = m.predict(b);
    res[k] = PB.metrics.accuracy_score(d, p); res[k + '_f1'] = round(PB.metrics.f1_score(d, p, 'macro'), 8); res[k + '_ms'] = Date.now() - s;
  }
  const sc = new PB.StandardScaler(); sc.set_output('pandas');
  const a2 = sc.fit_transform(a), b2 = sc.transform(b);
  for (const [k, mk] of Object.entries({ svc: () => new PB.SVC(), mlp: () => new PB.MLPClassifier({ max_iter: 300, random_state: 42 }) })) {
    const s = Date.now(); const m = mk(); R(m.fit(a2, c)); const p = m.predict(b2); res[k] = PB.metrics.accuracy_score(d, p); res[k + '_ms'] = Date.now() - s;
  }
  return res;
});

// ---------- mpg regression ----------
run('mpg', () => {
  let df = PB.loadSample('mpg');
  df = df.select(['mpg', 'cylinders', 'displacement', 'horsepower', 'weight', 'acceleration', 'model_year', 'origin']).dropna();
  df = PB.getDummies(df, ['origin'], false);
  const X = df.drop(['mpg']), y = df.col('mpg');
  const [a, b, c, d] = PB.trainTestSplit([X, y], { test_size: 0.2, random_state: 42 });
  const res = { cols: X.columns };
  const lr = new PB.LinearRegression(); lr.fit(a, c); res.lr_coef = round(arr(lr.coef_), 6); res.lr_int = round(lr.intercept_, 6); res.lr_r2 = round(PB.metrics.r2_score(d, lr.predict(b)), 8);
  const ms = { ridge: () => new PB.Ridge(), lasso: () => new PB.Lasso({ alpha: 0.1 }), enet: () => new PB.ElasticNet({ alpha: 0.1 }), dtr: () => new PB.DecisionTreeRegressor({ random_state: 42 }), rfr: () => new PB.RandomForestRegressor({ random_state: 42 }), gbr: () => new PB.GradientBoostingRegressor({ random_state: 42 }), knr: () => new PB.KNeighborsRegressor() };
  for (const [k, mk] of Object.entries(ms)) { const s = Date.now(); const m = mk(); R(m.fit(a, c)); const p = m.predict(b); res[k] = round(PB.metrics.r2_score(d, p), 8); res[k + '_mae'] = round(PB.metrics.mean_absolute_error(d, p), 6); res[k + '_ms'] = Date.now() - s; if (k === 'lasso' || k === 'ridge' || k === 'enet') res[k + '_coef'] = round(arr(m.coef_), 5); }
  const sc = new PB.StandardScaler(); sc.set_output('pandas'); const a2 = sc.fit_transform(a), b2 = sc.transform(b);
  for (const [k, mk] of Object.entries({ svr: () => new PB.SVR(), mlpr: () => new PB.MLPRegressor({ max_iter: 500, random_state: 42 }) })) { const s = Date.now(); const m = mk(); R(m.fit(a2, c)); const p = m.predict(b2); res[k] = round(PB.metrics.r2_score(d, p), 6); res[k + '_ms'] = Date.now() - s; }
  return res;
});

// ---------- clustering / pca ----------
run('cluster', () => {
  const sc = new PB.StandardScaler(); sc.set_output('pandas');
  const Xs = sc.fit_transform(Xi);
  const res = {};
  const km = new PB.KMeans({ n_clusters: 3, random_state: 42 }); R(km.fit(Xs)); res.km_labels = arr(km.labels_); res.km_inertia = round(km.inertia_, 6);
  const km4 = new PB.KMeans({ n_clusters: 4, random_state: 0, n_init: 10 }); R(km4.fit(Xs)); res.km4_inertia = round(km4.inertia_, 6);
  const ag = new PB.AgglomerativeClustering({ n_clusters: 3 }); R(ag.fit(Xs)); res.ag_labels = arr(ag.labels_);
  const agc = new PB.AgglomerativeClustering({ n_clusters: 3, linkage: 'average' }); R(agc.fit(Xs)); res.agc_labels = arr(agc.labels_);
  const db = new PB.DBSCAN({ eps: 0.5, min_samples: 5 }); db.fit(Xs); res.db_labels = arr(db.labels_);
  const pca = new PB.PCA({ n_components: 2 }); const Z = pca.fit_transform(Xs); res.pca_ratio = round(arr(pca.explained_variance_ratio_), 8); res.pca_comp = round(arr(pca.components_), 6); res.pca_first = round(Z.data[0], 6);
  res.sil = round(PB.metrics.silhouette_score(Xs, km.labels_), 8);
  res.ari = round(PB.metrics.adjusted_rand_score(yi, km.labels_), 8);
  const iso = new PB.IsolationForest({ random_state: 42, contamination: 0.05 }); const lab = R(iso.fit_predict(Xi)); res.iso_n_out = arr(lab).filter((v) => v === -1).length;
  return res;
});

// ---------- text ----------
run('text', () => {
  const df = PB.loadSample('thai_reviews');
  const [a, b, c, d] = PB.trainTestSplit([df.col('text'), df.col('label')], { test_size: 0.25, random_state: 42, stratify: df.col('label') });
  const res = {};
  const v = new PB.TfidfVectorizer({ analyzer: 'char_wb', ngram_range: new PB.Tuple([2, 3]) });
  const A = v.fit_transform(a), B = v.transform(b);
  res.vocab = v.vocabulary_.size; res.first_terms = Array.from(v.vocabulary_.keys()).slice(0, 8);
  res.row0 = round(A.rows[0].val.slice(0, 6), 8); res.row0_idx = A.rows[0].idx.slice(0, 6);
  const nb = new PB.MultinomialNB(); nb.fit(A, c); res.nb_acc = PB.metrics.accuracy_score(d, nb.predict(B));
  const lg = new PB.LogisticRegression({ max_iter: 1000 }); lg.fit(A, c); res.lg_acc = PB.metrics.accuracy_score(d, lg.predict(B));
  const w = new PB.TfidfVectorizer(); w.fit(a); res.word_vocab = w.vocabulary_.size; res.word_terms = Array.from(w.vocabulary_.keys()).slice(0, 10);
  const pipe = new PB.Pipeline([new PB.TfidfVectorizer({ analyzer: 'char_wb', ngram_range: new PB.Tuple([2, 3]) }), new PB.MultinomialNB()]);
  R(pipe.fit(a, c)); res.pipe_pred = arr(pipe.predict(['อาหารอร่อยมาก บริการดี', 'ส่งช้ามาก ของเสียหาย']));
  return res;
});

// ---------- metrics / cv ----------
run('metrics', () => {
  const m = new PB.LogisticRegression({ max_iter: 1000 }); m.fit(sXtr, sytr); const p = m.predict(sXte);
  const res = { cm: arr(PB.metrics.confusion_matrix(syte, p)), f1: round(PB.metrics.f1_score(syte, p, 'macro'), 10), prec_w: round(PB.metrics.precision_score(syte, p, 'weighted'), 10) };
  res.cv_lr = round(arr(R(PB.crossValScore(new PB.LogisticRegression({ max_iter: 1000 }), Xi, yi, 5))), 8);
  res.cv_tree = round(arr(R(PB.crossValScore(new PB.DecisionTreeClassifier({ random_state: 0 }), Xi, yi, 5))), 8);
  const mp = PB.loadSample('mpg').dropna();
  res.cv_reg = round(arr(R(PB.crossValScore(new PB.LinearRegression(), mp.select(['weight', 'horsepower']), mp.col('mpg'), 5))), 8);
  res.report = PB.metrics.classification_report(syte, p).__str__();
  /* F1 from counts (2·tp / (true + predicted)) and halfway values printed like Python: f1 0.925 → 0.93, precision 0.625 → 0.62 */
  const yt2 = Array(41).fill('งอก').concat(Array(59).fill('ไม่งอก')), yp2 = Array(37).fill('งอก').concat(Array(4).fill('ไม่งอก'), Array(2).fill('งอก'), Array(57).fill('ไม่งอก'));
  const yt3 = Array(6).fill('x').concat(Array(10).fill('y')), yp3 = Array(5).fill('x').concat(['y'], Array(3).fill('x'), Array(7).fill('y'));
  res.report_tie = PB.metrics.classification_report(yt2, yp2).__str__();
  res.report_tie2 = PB.metrics.classification_report(yt3, yp3).__str__();
  res.f1_tie = [PB.metrics.f1_score(yt3, yp3, 'macro'), PB.metrics.f1_score(yt3, yp3, 'micro'), PB.metrics.f1_score(yt3, yp3, 'weighted')];
  res.df_tie = PB.DataFrame.fromRows([[0.0078125, 2.5], [55.0078125, 0.125]], ['a', 'b']).__str__();
  return res;
});

// ---------- pandas ----------
run('pandas', () => {
  const t = PB.loadSample('titanic');
  return {
    describe: round(t.describe().col('age').values, 8),
    vc: [t.col('embark_town').value_counts().index, t.col('embark_town').value_counts().values],
    gb: round(t.groupby('class').agg('fare', 'mean').values, 8), gb_idx: t.groupby('class').agg('fare', 'mean').index,
    nulls: t.nullCounts().values,
    corr: round(PB.loadSample('iris').drop(['species']).corr().col('petal_length').values, 10),
    dummies: PB.getDummies(t.select(['pclass', 'sex', 'embarked', 'alone']), ['pclass', 'embarked', 'alone'], false).columns,
    sample_idx: t.sample(5, 42).index,
    head_str: PB.loadSample('iris').head(3).__str__(),
  };
});

// ---------- digits ----------
run('digits', () => {
  const dg = PB.loadSample('digits');
  const X = dg.drop(['target']), y = dg.col('target');
  const [a, b, c, d] = PB.trainTestSplit([X, y], { test_size: 0.2, random_state: 42, stratify: y });
  const res = {};
  for (const [k, mk] of Object.entries({ svc: () => new PB.SVC(), knn: () => new PB.KNeighborsClassifier(), rf: () => new PB.RandomForestClassifier({ random_state: 42 }), logreg: () => new PB.LogisticRegression({ max_iter: 1000 }) })) {
    const s = Date.now(); const m = mk(); R(m.fit(a, c)); res[k] = PB.metrics.accuracy_score(d, m.predict(b)); res[k + '_ms'] = Date.now() - s;
  }
  return res;
});

// ---------- feature selection (SelectKBest, version 3.8) ----------
run('select', () => {
  const lp = (a) => arr(a).map((p) => Number((-Math.log10(p)).toFixed(6)));
  const res = {};
  const a = new PB.SelectKBest({ score_func: 'f_classif', k: 2 }); a.fit(Xi, yi);
  Object.assign(res, { fc_scores: round(arr(a.scores_), 8), fc_logp: lp(a.pvalues_), fc_support: arr(a.get_support()), fc_names: arr(a.get_feature_names_out()) });
  const c = new PB.SelectKBest({ score_func: 'chi2', k: 3 }); c.fit(Xi, yi);
  Object.assign(res, { chi_scores: round(arr(c.scores_), 8), chi_logp: lp(c.pvalues_), chi_support: arr(c.get_support()) });
  const mp = PB.loadSample('mpg').dropna(), Xm = mp.select(['cylinders', 'displacement', 'horsepower', 'weight', 'acceleration', 'model_year']), ym = mp.col('mpg');
  const r = new PB.SelectKBest({ score_func: 'f_regression', k: 3 }); r.fit(Xm, ym);
  Object.assign(res, { fr_scores: round(arr(r.scores_), 8), fr_logp: lp(r.pvalues_), fr_names: arr(r.get_feature_names_out()) });
  let t = PB.loadSample('titanic').select(['survived', 'pclass', 'sex', 'age', 'sibsp', 'parch', 'fare', 'embarked']).dropna();
  t = PB.getDummies(t, ['sex', 'embarked'], true);
  const tx = t.drop(['survived']), ty = t.col('survived');
  const ti = new PB.SelectKBest({ score_func: 'f_classif', k: 4 }); ti.fit(tx, ty);
  Object.assign(res, { ti_scores: round(arr(ti.scores_), 8), ti_names: arr(ti.get_feature_names_out()), ti_logp: lp(ti.pvalues_) });
  const tc = new PB.SelectKBest({ score_func: 'chi2', k: 3 }); tc.fit(tx, ty);
  Object.assign(res, { tc_scores: round(arr(tc.scores_), 8), tc_names: arr(tc.get_feature_names_out()) });
  return res;
});

out._time = time;
out._total_ms = Date.now() - t0;
console.log(JSON.stringify(out));
