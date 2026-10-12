# Reference results from real pandas / scikit-learn for test/engine_cases.js
import json, warnings, os, io
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor, IsolationForest
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.naive_bayes import GaussianNB, MultinomialNB
from sklearn.svm import SVC, SVR
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, AgglomerativeClustering, DBSCAN
from sklearn.decomposition import PCA
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import make_pipeline
from sklearn import metrics
from sklearn.datasets import load_digits

D = os.path.join(os.path.dirname(__file__), "..", "data")
rd = lambda n: pd.read_csv(os.path.join(D, n + ".csv"))
out = {}
def run(name, fn):
    try: out[name] = fn()
    except Exception as e: out[name] = {"error": repr(e)}
r = lambda x, d=10: (np.round(np.asarray(x, dtype=float), d).tolist())

run("perm", lambda: np.random.RandomState(42).permutation(150)[:20].tolist())
iris = rd("iris"); Xi = iris.drop(columns=["species"]); yi = iris["species"]
Xtr, Xte, ytr, yte = train_test_split(Xi, yi, test_size=0.2, random_state=42)
run("iris_split_idx", lambda: Xte.index[:30].tolist())
sXtr, sXte, sytr, syte = train_test_split(Xi, yi, test_size=0.2, random_state=42, stratify=yi)
run("iris_strat_idx", lambda: sXte.index.tolist())
run("iris_strat_train_idx", lambda: sXtr.index[:40].tolist())
cls = {
    "logreg": lambda: LogisticRegression(max_iter=1000),
    "dtree": lambda: DecisionTreeClassifier(random_state=42),
    "dtree_d3": lambda: DecisionTreeClassifier(random_state=0, max_depth=3),
    "rf": lambda: RandomForestClassifier(n_estimators=100, random_state=42),
    "gb": lambda: GradientBoostingClassifier(random_state=42),
    "knn": lambda: KNeighborsClassifier(n_neighbors=5),
    "gnb": lambda: GaussianNB(),
    "svc": lambda: SVC(),
    "mlp": lambda: MLPClassifier(max_iter=300, random_state=42),
}
for k, mk in cls.items():
    def f(k=k, mk=mk):
        m = mk().fit(sXtr, sytr); p = m.predict(sXte)
        res = {"acc": metrics.accuracy_score(syte, p), "pred": p.tolist()}
        if k.startswith("dtree"):
            res["feature"] = m.tree_.feature.tolist(); res["threshold"] = r(m.tree_.threshold, 6); res["imp"] = r(m.feature_importances_, 8)
        if k in ("rf", "gb"): res["imp"] = r(m.feature_importances_, 6)
        if k == "logreg": res["coef"] = r(m.coef_, 3)
        if k == "mlp": res["n_iter"] = m.n_iter_
        return res
    run("iris_" + k, f)

def titanic():
    df = rd("titanic")[["survived", "pclass", "sex", "age", "sibsp", "parch", "fare", "embarked"]]
    df["age"] = df["age"].fillna(df["age"].median())
    df = df.dropna()
    df = pd.get_dummies(df, columns=["sex", "embarked"], drop_first=True)
    X = df.drop(columns=["survived"]); y = df["survived"]
    a, b, c, d = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    res = {"cols": list(X.columns), "shape": list(X.shape), "test_idx": b.index[:20].tolist()}
    for k, mk in {"logreg": lambda: LogisticRegression(max_iter=1000), "dtree": lambda: DecisionTreeClassifier(random_state=42), "rf": lambda: RandomForestClassifier(random_state=42), "gb": lambda: GradientBoostingClassifier(random_state=42), "knn": lambda: KNeighborsClassifier(), "gnb": lambda: GaussianNB()}.items():
        m = mk().fit(a, c); p = m.predict(b)
        res[k] = metrics.accuracy_score(d, p); res[k + "_f1"] = round(metrics.f1_score(d, p, average="macro"), 8)
    sc = StandardScaler().set_output(transform="pandas"); a2 = sc.fit_transform(a); b2 = sc.transform(b)
    for k, mk in {"svc": lambda: SVC(), "mlp": lambda: MLPClassifier(max_iter=300, random_state=42)}.items():
        m = mk().fit(a2, c); res[k] = metrics.accuracy_score(d, m.predict(b2))
    return res
run("titanic", titanic)

def mpg():
    df = rd("mpg")[["mpg", "cylinders", "displacement", "horsepower", "weight", "acceleration", "model_year", "origin"]].dropna()
    df = pd.get_dummies(df, columns=["origin"])
    X = df.drop(columns=["mpg"]); y = df["mpg"]
    a, b, c, d = train_test_split(X, y, test_size=0.2, random_state=42)
    res = {"cols": list(X.columns)}
    lr = LinearRegression().fit(a, c); res["lr_coef"] = r(lr.coef_, 6); res["lr_int"] = round(float(lr.intercept_), 6); res["lr_r2"] = round(metrics.r2_score(d, lr.predict(b)), 8)
    ms = {"ridge": lambda: Ridge(), "lasso": lambda: Lasso(alpha=0.1), "enet": lambda: ElasticNet(alpha=0.1), "dtr": lambda: DecisionTreeRegressor(random_state=42), "rfr": lambda: RandomForestRegressor(random_state=42), "gbr": lambda: GradientBoostingRegressor(random_state=42), "knr": lambda: KNeighborsRegressor()}
    for k, mk in ms.items():
        m = mk().fit(a, c); p = m.predict(b)
        res[k] = round(metrics.r2_score(d, p), 8); res[k + "_mae"] = round(metrics.mean_absolute_error(d, p), 6)
        if k in ("lasso", "ridge", "enet"): res[k + "_coef"] = r(m.coef_, 5)
    sc = StandardScaler().set_output(transform="pandas"); a2 = sc.fit_transform(a); b2 = sc.transform(b)
    for k, mk in {"svr": lambda: SVR(), "mlpr": lambda: MLPRegressor(max_iter=500, random_state=42)}.items():
        m = mk().fit(a2, c); res[k] = round(metrics.r2_score(d, m.predict(b2)), 6)
    return res
run("mpg", mpg)

def cluster():
    Xs = StandardScaler().set_output(transform="pandas").fit_transform(Xi)
    res = {}
    km = KMeans(n_clusters=3, random_state=42).fit(Xs); res["km_labels"] = km.labels_.tolist(); res["km_inertia"] = round(km.inertia_, 6)
    km4 = KMeans(n_clusters=4, random_state=0, n_init=10).fit(Xs); res["km4_inertia"] = round(km4.inertia_, 6)
    res["ag_labels"] = AgglomerativeClustering(n_clusters=3).fit(Xs).labels_.tolist()
    res["agc_labels"] = AgglomerativeClustering(n_clusters=3, linkage="average").fit(Xs).labels_.tolist()
    res["db_labels"] = DBSCAN(eps=0.5, min_samples=5).fit(Xs).labels_.tolist()
    pca = PCA(n_components=2); Z = pca.fit_transform(Xs); res["pca_ratio"] = r(pca.explained_variance_ratio_, 8); res["pca_comp"] = r(pca.components_, 6); res["pca_first"] = r(Z[0], 6)
    res["sil"] = round(metrics.silhouette_score(Xs, km.labels_), 8)
    res["ari"] = round(metrics.adjusted_rand_score(yi, km.labels_), 8)
    lab = IsolationForest(random_state=42, contamination=0.05).fit_predict(Xi); res["iso_n_out"] = int((lab == -1).sum())
    return res
run("cluster", cluster)

def text():
    df = rd("thai_reviews")
    a, b, c, d = train_test_split(df["text"], df["label"], test_size=0.25, random_state=42, stratify=df["label"])
    res = {}
    v = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 3)); A = v.fit_transform(a); B = v.transform(b)
    res["vocab"] = len(v.vocabulary_); res["first_terms"] = list(v.get_feature_names_out()[:8])
    row = A[0]; order = np.argsort(row.indices); res["row0"] = r(row.data[order][:6], 8); res["row0_idx"] = row.indices[order][:6].tolist()
    nb = MultinomialNB().fit(A, c); res["nb_acc"] = metrics.accuracy_score(d, nb.predict(B))
    lg = LogisticRegression(max_iter=1000).fit(A, c); res["lg_acc"] = metrics.accuracy_score(d, lg.predict(B))
    w = TfidfVectorizer().fit(a); res["word_vocab"] = len(w.vocabulary_); res["word_terms"] = list(w.get_feature_names_out()[:10])
    pipe = make_pipeline(TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 3)), MultinomialNB()).fit(a, c)
    res["pipe_pred"] = pipe.predict(["อาหารอร่อยมาก บริการดี", "ส่งช้ามาก ของเสียหาย"]).tolist()
    return res
run("text", text)

def mets():
    m = LogisticRegression(max_iter=1000).fit(sXtr, sytr); p = m.predict(sXte)
    res = {"cm": metrics.confusion_matrix(syte, p).tolist(), "f1": round(metrics.f1_score(syte, p, average="macro"), 10), "prec_w": round(metrics.precision_score(syte, p, average="weighted"), 10)}
    res["cv_lr"] = r(cross_val_score(LogisticRegression(max_iter=1000), Xi, yi, cv=5), 8)
    res["cv_tree"] = r(cross_val_score(DecisionTreeClassifier(random_state=0), Xi, yi, cv=5), 8)
    mp = rd("mpg").dropna()
    res["cv_reg"] = r(cross_val_score(LinearRegression(), mp[["weight", "horsepower"]], mp["mpg"], cv=5), 8)
    res["report"] = metrics.classification_report(syte, p)
    yt2 = ["งอก"] * 41 + ["ไม่งอก"] * 59; yp2 = ["งอก"] * 37 + ["ไม่งอก"] * 4 + ["งอก"] * 2 + ["ไม่งอก"] * 57
    yt3 = ["x"] * 6 + ["y"] * 10; yp3 = ["x"] * 5 + ["y"] + ["x"] * 3 + ["y"] * 7
    res["report_tie"] = metrics.classification_report(yt2, yp2)
    res["report_tie2"] = metrics.classification_report(yt3, yp3)
    res["f1_tie"] = [float(metrics.f1_score(yt3, yp3, average=a)) for a in ("macro", "micro", "weighted")]
    res["df_tie"] = str(pd.DataFrame({"a": [0.0078125, 55.0078125], "b": [2.5, 0.125]}))
    return res
run("metrics", mets)

def pandas_():
    t = rd("titanic")
    vc = t["embark_town"].value_counts()
    g = t.groupby("class")["fare"].mean()
    return {
        "describe": r(t.describe()["age"], 8),
        "vc": [vc.index.tolist(), vc.values.tolist()],
        "gb": r(g.values, 8), "gb_idx": g.index.tolist(),
        "nulls": t.isnull().sum().tolist(),
        "corr": r(rd("iris").drop(columns=["species"]).corr()["petal_length"], 10),
        "dummies": list(pd.get_dummies(t[["pclass", "sex", "embarked", "alone"]], columns=["pclass", "embarked", "alone"]).columns),
        "sample_idx": t.sample(5, random_state=42).index.tolist(),
        "head_str": str(rd("iris").head(3)),
    }
run("pandas", pandas_)

def digits():
    dg = load_digits(as_frame=True).frame
    X = dg.drop(columns=["target"]); y = dg["target"]
    a, b, c, d = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    res = {}
    for k, mk in {"svc": lambda: SVC(), "knn": lambda: KNeighborsClassifier(), "rf": lambda: RandomForestClassifier(random_state=42), "logreg": lambda: LogisticRegression(max_iter=1000)}.items():
        res[k] = metrics.accuracy_score(d, mk().fit(a, c).predict(b))
    return res
run("digits", digits)

# ---------- feature selection (SelectKBest, version 3.8) ----------
from sklearn.feature_selection import SelectKBest, f_classif, f_regression, chi2
def select():
    lp = lambda p: [round(float(-np.log10(x)), 6) for x in p]
    res = {}
    a = SelectKBest(f_classif, k=2).fit(Xi, yi)
    res.update(fc_scores=r(a.scores_, 8), fc_logp=lp(a.pvalues_), fc_support=a.get_support().tolist(), fc_names=a.get_feature_names_out().tolist())
    c = SelectKBest(chi2, k=3).fit(Xi, yi)
    res.update(chi_scores=r(c.scores_, 8), chi_logp=lp(c.pvalues_), chi_support=c.get_support().tolist())
    mp = rd("mpg").dropna(); Xm = mp[["cylinders", "displacement", "horsepower", "weight", "acceleration", "model_year"]]; ym = mp["mpg"]
    f = SelectKBest(f_regression, k=3).fit(Xm, ym)
    res.update(fr_scores=r(f.scores_, 8), fr_logp=lp(f.pvalues_), fr_names=f.get_feature_names_out().tolist())
    t = rd("titanic")[["survived", "pclass", "sex", "age", "sibsp", "parch", "fare", "embarked"]].dropna()
    t = pd.get_dummies(t, columns=["sex", "embarked"], drop_first=True)
    tx, ty = t.drop(columns=["survived"]), t["survived"]
    ti = SelectKBest(f_classif, k=4).fit(tx, ty)
    res.update(ti_scores=r(ti.scores_, 8), ti_names=ti.get_feature_names_out().tolist(), ti_logp=lp(ti.pvalues_))
    tc = SelectKBest(chi2, k=3).fit(tx, ty)
    res.update(tc_scores=r(tc.scores_, 8), tc_names=tc.get_feature_names_out().tolist())
    return res
run("select", select)
print(json.dumps(out, ensure_ascii=False, default=str))
