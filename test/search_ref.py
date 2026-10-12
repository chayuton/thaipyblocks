# Reference results from scikit-learn / PyThaiNLP for test/search_cases.js
import json, os, sys, warnings
import numpy as np, pandas as pd
warnings.filterwarnings("ignore")
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from pythainlp.tokenize import word_tokenize
from pythainlp.corpus import thai_stopwords

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
sys.path.insert(0, DATA)
from thai_reviews_src import rows as review_rows  # noqa: E402

out = {}
def rep(v):
    if v is None: return 'None'
    if isinstance(v, str): return repr(v)
    return repr(v)
def grid_out(g, Xte=None, yte=None):
    r = g.cv_results_
    return {'means': r['mean_test_score'].tolist(), 'stds': r['std_test_score'].tolist(), 'ranks': r['rank_test_score'].tolist(),
            'best': {k: rep(v) for k, v in g.best_params_.items()}, 'best_score': float(g.best_score_),
            'test': float(g.score(Xte, yte)) if Xte is not None else None, 'cand': [{k: rep(v) for k, v in p.items()} for p in r['params']]}

iris = pd.read_csv(os.path.join(DATA, 'iris.csv'))
Xi, yi = iris.drop(columns=['species']), iris['species']
Xtr, Xte, ytr, yte = train_test_split(Xi, yi, test_size=0.2, random_state=42, stratify=yi)
g = GridSearchCV(KNeighborsClassifier(), {"weights": ["uniform", "distance"], "n_neighbors": [1, 3, 5, 7, 9, 11, 13, 15]}, cv=5).fit(Xtr, ytr)
out['knn_grid'] = grid_out(g, Xte, yte)
g = GridSearchCV(make_pipeline(StandardScaler(), SVC()), {"svc__C": [0.1, 1.0, 10], "svc__kernel": ["linear", "rbf"]}, cv=5).fit(Xtr, ytr)
out['svc_pipe_grid'] = grid_out(g, Xte, yte)
g = GridSearchCV(DecisionTreeClassifier(random_state=42), {"max_depth": [1, 2, 3, None], "min_samples_leaf": [1, 5]}, cv=4, scoring='f1_macro').fit(Xtr, ytr)
out['dtree_f1'] = grid_out(g, Xte, yte)
s10 = cross_val_score(KNeighborsClassifier(), Xi, yi, cv=10)
out['cv_scores'] = {'knn': cross_val_score(KNeighborsClassifier(), Xi, yi, cv=5).tolist(), 'knn10': s10.tolist(), 'knn10_mean': float(s10.mean()), 'knn10_std': float(s10.std()),
                    'f1': cross_val_score(DecisionTreeClassifier(random_state=0), Xi, yi, cv=5, scoring='f1_macro').tolist()}

mpg = pd.read_csv(os.path.join(DATA, 'mpg.csv'))[['mpg', 'cylinders', 'displacement', 'horsepower', 'weight', 'acceleration']].dropna().reset_index(drop=True)
Xm, ym = mpg.drop(columns=['mpg']), mpg['mpg']
mXtr, mXte, mytr, myte = train_test_split(Xm, ym, test_size=0.2, random_state=42)
g = GridSearchCV(DecisionTreeRegressor(random_state=42), {"max_depth": [2, 3, 4, 5, None]}, cv=5).fit(mXtr, mytr)
out['dtr_grid'] = grid_out(g, mXte, myte)
g = GridSearchCV(make_pipeline(StandardScaler(), Ridge()), {"ridge__alpha": [0.1, 1, 10, 100]}, cv=5, scoring='neg_mean_absolute_error').fit(mXtr, mytr)
out['ridge_mae'] = grid_out(g, mXte, myte)
g = GridSearchCV(RandomForestRegressor(random_state=42), {"n_estimators": [50, 100], "max_depth": [3, None]}, cv=3).fit(mXtr, mytr)
out['rf_grid'] = grid_out(g, mXte, myte)

rv = pd.DataFrame(review_rows(), columns=['text', 'label', 'category'])
Xt, yt = rv['text'], rv['label']
tXtr, tXte, tytr, tyte = train_test_split(Xt, yt, test_size=0.25, random_state=42, stratify=yt)
def thai_tokenize(text):
    return word_tokenize(text, engine="newmm", keep_whitespace=False)
STOP = thai_stopwords()
def thai_tokenize_nostop(text):
    return [w for w in thai_tokenize(text) if w not in STOP]
v = TfidfVectorizer(analyzer="word", tokenizer=thai_tokenize, token_pattern=None, ngram_range=(1, 2))
M = v.fit_transform(Xt)
out['thai_tfidf'] = {'vocab': len(v.vocabulary_), 'first': sorted(v.vocabulary_)[:15], 'nnz': int(M.nnz)}
g = GridSearchCV(make_pipeline(TfidfVectorizer(analyzer="word", tokenizer=thai_tokenize_nostop, token_pattern=None, ngram_range=(1, 2)), MultinomialNB()), {"multinomialnb__alpha": [0.1, 0.5, 1.0]}, cv=5).fit(tXtr, tytr)
out['thai_nb_grid'] = grid_out(g, tXte, tyte)
toks = rv['text'].head(20).apply(thai_tokenize).tolist()
vc = rv['text'].apply(thai_tokenize_nostop).rename('tokens').explode().value_counts().head(15)
out['tokens_col'] = {'toks': toks, 'vc_index': vc.index.tolist(), 'vc_vals': vc.tolist()}
r = {}
try: GridSearchCV(KNeighborsClassifier(), {"n_neighbor": [3]}, cv=3).fit(Xtr, ytr)
except ValueError as e: r['bad_name'] = str(e).split('.')[0]
r['syntax'] = 'SyntaxError'
r['not_list'] = 'TypeError'
out['param_errors'] = r
print(json.dumps(out, ensure_ascii=False))
