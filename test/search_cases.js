// GridSearchCV / cross_val_score / TF-IDF with the Thai tokenizer on the engine; compared with test/search_ref.py
const PB = require('./load_engine');
const R = PB.runMaybe;
const out = {}, time = {};
function run(name, fn) {
  const s = Date.now();
  try { out[name] = fn(); } catch (e) { out[name] = { error: (e.pyType || e.name) + ': ' + e.message + (e.thai ? ' | ' + e.thai : ''), stack: e.pyType ? undefined : String(e.stack).split('\n').slice(0, 5).join(' / ') }; }
  time[name] = Date.now() - s;
}
const arr = (a) => (a instanceof PB.NDArray ? a.tolist() : a instanceof PB.Series ? a.values : a);
const params = (m) => Object.fromEntries(Array.from(m.entries()).map(([k, v]) => [k, PB.repr(v)]));
const gridOut = (g, Xte, yte) => ({
  means: g._means, stds: g._stds, ranks: g._ranks, best: params(g.best_params_), best_score: g.best_score_,
  test: Xte ? g.score(Xte, yte) : null, cand: g._candidates.map(params),
});
const iris = PB.loadSample('iris');
const Xi = iris.drop(['species']), yi = iris.col('species');
const [Xtr, Xte, ytr, yte] = PB.trainTestSplit([Xi, yi], { test_size: 0.2, random_state: 42, stratify: yi });

run('knn_grid', () => {
  const g = new PB.GridSearchCV(new PB.KNeighborsClassifier({}), PB.pyLiteral('{"weights": ["uniform", "distance"], "n_neighbors": [1, 3, 5, 7, 9, 11, 13, 15]}'), { cv: 5 });
  R(g.fit(Xtr, ytr)); return gridOut(g, Xte, yte);
});
run('svc_pipe_grid', () => {
  const pipe = new PB.Pipeline([new PB.StandardScaler(), new PB.SVC({})]);
  const g = new PB.GridSearchCV(pipe, PB.pyLiteral('{"svc__C": [0.1, 1.0, 10], "svc__kernel": ["linear", "rbf"]}'), { cv: 5 });
  R(g.fit(Xtr, ytr)); return gridOut(g, Xte, yte);
});
run('dtree_f1', () => {
  const g = new PB.GridSearchCV(new PB.DecisionTreeClassifier({ random_state: 42 }), PB.pyLiteral('{"max_depth": [1, 2, 3, None], "min_samples_leaf": [1, 5]}'), { cv: 4, scoring: 'f1_macro' });
  R(g.fit(Xtr, ytr)); return gridOut(g, Xte, yte);
});
run('cv_scores', () => {
  const r = {};
  r.knn = arr(R(PB.crossValScore(new PB.KNeighborsClassifier({}), Xi, yi, 5)));
  r.knn10 = arr(R(PB.crossValScore(new PB.KNeighborsClassifier({}), Xi, yi, 10)));
  r.knn10_mean = R(PB.crossValScore(new PB.KNeighborsClassifier({}), Xi, yi, 10)).mean();
  r.knn10_std = R(PB.crossValScore(new PB.KNeighborsClassifier({}), Xi, yi, 10)).std();
  r.f1 = arr(R(PB.crossValScore(new PB.DecisionTreeClassifier({ random_state: 0 }), Xi, yi, 5, 'f1_macro')));
  return r;
});
// regression
let mpg = PB.loadSample('mpg').select(['mpg', 'cylinders', 'displacement', 'horsepower', 'weight', 'acceleration']).dropna().reset_index(true);
const Xm = mpg.drop(['mpg']), ym = mpg.col('mpg');
const [mXtr, mXte, mytr, myte] = PB.trainTestSplit([Xm, ym], { test_size: 0.2, random_state: 42 });
run('dtr_grid', () => {
  const g = new PB.GridSearchCV(new PB.DecisionTreeRegressor({ random_state: 42 }), PB.pyLiteral('{"max_depth": [2, 3, 4, 5, None]}'), { cv: 5 });
  R(g.fit(mXtr, mytr)); return gridOut(g, mXte, myte);
});
run('ridge_mae', () => {
  const pipe = new PB.Pipeline([new PB.StandardScaler(), new PB.Ridge({})]);
  const g = new PB.GridSearchCV(pipe, PB.pyLiteral('{"ridge__alpha": [0.1, 1, 10, 100]}'), { cv: 5, scoring: 'neg_mean_absolute_error' });
  R(g.fit(mXtr, mytr)); return gridOut(g, mXte, myte);
});
run('rf_grid', () => {
  const g = new PB.GridSearchCV(new PB.RandomForestRegressor({ random_state: 42 }), PB.pyLiteral('{"n_estimators": [50, 100], "max_depth": [3, None]}'), { cv: 3 });
  R(g.fit(mXtr, mytr)); return gridOut(g, mXte, myte);
});
// Thai text: TF-IDF over PyThaiNLP words + MultinomialNB
const rv = PB.loadSample('thai_reviews');
const Xt = rv.col('text'), yt = rv.col('label');
const [tXtr, tXte, tytr, tyte] = PB.trainTestSplit([Xt, yt], { test_size: 0.25, random_state: 42, stratify: yt });
run('thai_tfidf', () => {
  const v = new PB.TfidfVectorizer({ analyzer: 'word', tokenizer: 'thai_tokenize', ngram_range: new PB.Tuple([1, 2]) });
  const M = v.fit_transform(Xt);
  return { vocab: v.vocabulary_.size, first: Array.from(v.vocabulary_.keys()).slice(0, 15), nnz: M.rows.reduce((s, r) => s + r.idx.length, 0) };
});
run('thai_nb_grid', () => {
  const pipe = new PB.Pipeline([new PB.TfidfVectorizer({ analyzer: 'word', tokenizer: 'thai_tokenize_nostop', ngram_range: new PB.Tuple([1, 2]) }), new PB.MultinomialNB({})]);
  const g = new PB.GridSearchCV(pipe, PB.pyLiteral('{"multinomialnb__alpha": [0.1, 0.5, 1.0]}'), { cv: 5 });
  R(g.fit(tXtr, tytr)); return gridOut(g, tXte, tyte);
});
run('tokens_col', () => {
  const s = rv.col('text');
  const toks = s.values.slice(0, 20).map((t) => PB.thai.wordTokenize(t, { keepWhitespace: false }));
  const ser = s.iloc(PB.range(120))._new(s.values.map((t) => PB.thai.removeStopwords(PB.thai.wordTokenize(t, { keepWhitespace: false }))), { dtype: 'object', name: 'tokens' });
  const vc = ser.explode().value_counts().head(15);
  return { toks, vc_index: vc.index, vc_vals: vc.values };
});
run('param_errors', () => {
  const r = {};
  try { R(new PB.GridSearchCV(new PB.KNeighborsClassifier({}), PB.pyLiteral('{"n_neighbor": [3]}'), { cv: 3 }).fit(Xtr, ytr)); } catch (e) { r.bad_name = e.message.split('.')[0]; }
  try { PB.pyLiteral('{"C": [1, 2'); } catch (e) { r.syntax = e.pyType; }
  try { PB.parameterGrid(PB.pyLiteral('{"C": 1}')); } catch (e) { r.not_list = e.pyType; }
  return r;
});
process.stdout.write(JSON.stringify(Object.assign(out, { _ms: time })));
