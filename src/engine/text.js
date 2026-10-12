/* ThaiPyBlocks engine: CountVectorizer / TfidfVectorizer (scikit-learn semantics). */
(function () {
  const { Estimator, NDArray, SparseMatrix, Series } = PB;
  const WORD_RE = /[\p{L}\p{N}_]{2,}/gu;

  function docsOf(raw) {
    let vals;
    if (raw instanceof Series) vals = raw.values;
    else if (raw instanceof NDArray && raw.shape.length === 1) vals = Array.from(raw.data);
    else if (Array.isArray(raw)) vals = raw;
    else if (typeof raw === 'string') throw PB.err('ValueError', 'Iterable over raw text documents expected, string object received.', TR('ต้องส่งคอลัมน์ข้อความ (หลายแถว) ไม่ใช่ข้อความเดียว'), TR('ห่อข้อความด้วยลิสต์ เช่น ["ข้อความ"]'));
    else throw PB.err('TypeError', 'Expected a column of text', TR('Vectorizer ต้องรับคอลัมน์ข้อความ เช่น df["text"]'), TR('ถ้าส่ง DataFrame ทั้งตาราง ให้เลือกเฉพาะคอลัมน์ข้อความ'));
    return vals.map((v) => {
      if (v === null || (typeof v === 'number' && Number.isNaN(v))) throw PB.err('ValueError', 'np.nan is an invalid document, expected byte or unicode string.', TR('มีข้อความว่าง (NaN) ในข้อมูล'), TR('ใช้ dropna() หรือ fillna("") ก่อน'));
      return String(v);
    });
  }
  class CountVectorizer extends Estimator {
    static pyName = 'CountVectorizer'; static kind = 'transformer'; static module = 'sklearn.feature_extraction.text';
    static defaults = { analyzer: 'word', ngram_range: new PB.Tuple([1, 1]), lowercase: true, max_features: null, min_df: 1, max_df: 1.0, binary: false, tokenizer: null };
    _range() { const r = this.params.ngram_range; const a = r instanceof PB.Tuple ? r.items : Array.isArray(r) ? r : [1, 1]; return [a[0], a[1]]; }
    _analyze(doc) {
      if (this.params.lowercase) doc = doc.toLowerCase();
      const [mn, mx] = this._range(), an = this.params.analyzer;
      const out = [];
      if (an === 'word') {
        /* tokenizer=thai_tokenize / thai_tokenize_nostop (PyThaiNLP newmm), otherwise token_pattern r"(?u)\b\w\w+\b" */
        const tk = this.params.tokenizer;
        const toks = tk ? (tk === 'thai_tokenize_nostop' ? PB.thai.removeStopwords(PB.thai.wordTokenize(doc, { keepWhitespace: false })) : PB.thai.wordTokenize(doc, { keepWhitespace: false })) : doc.match(WORD_RE) || [];
        if (mx === 1) return toks;
        for (let n = mn; n <= mx; n++) for (let i = 0; i + n <= toks.length; i++) out.push(toks.slice(i, i + n).join(' '));
        return out;
      }
      const text = doc.replace(/\s\s+/g, ' ');
      if (an === 'char') {
        const ch = Array.from(text);
        for (let n = mn; n <= Math.min(mx, ch.length); n++) for (let i = 0; i + n <= ch.length; i++) out.push(ch.slice(i, i + n).join(''));
        return out;
      }
      for (const w0 of text.split(/\s+/).filter(Boolean)) {
        const w = Array.from(' ' + w0 + ' '), L = w.length;
        for (let n = mn; n <= mx; n++) {
          let off = 0; out.push(w.slice(off, off + n).join(''));
          while (off + n < L) { off++; out.push(w.slice(off, off + n).join('')); }
          if (off === 0) break;
        }
      }
      return out;
    }
    _counts(docs) { return docs.map((d) => { const c = new Map(); for (const t of this._analyze(d)) c.set(t, (c.get(t) || 0) + 1); return c; }); }
    fit(raw) {
      const docs = docsOf(raw), counts = this._counts(docs), n = docs.length;
      const df = new Map(), tf = new Map();
      for (const c of counts) for (const [t, v] of c) { df.set(t, (df.get(t) || 0) + 1); tf.set(t, (tf.get(t) || 0) + v); }
      const { min_df, max_df, max_features } = this.params;
      const lo = min_df < 1 && !Number.isInteger(min_df) ? min_df * n : min_df, hi = max_df <= 1 && !Number.isInteger(max_df) ? max_df * n : max_df === 1 ? n : max_df;
      let terms = Array.from(df.keys()).filter((t) => df.get(t) >= lo && df.get(t) <= hi);
      if (!terms.length) throw PB.err('ValueError', 'empty vocabulary; perhaps the documents only contain stop words', TR('ไม่พบคำศัพท์ในข้อความ'), TR('ภาษาไทยใช้ analyzer="char_wb" หรือ "word" + ตัดคำไทย'));
      if (max_features && terms.length > max_features) {
        terms.sort((a, b) => tf.get(b) - tf.get(a) || (a < b ? -1 : 1));
        terms = terms.slice(0, max_features);
      }
      terms.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      this.vocabulary_ = new Map(terms.map((t, i) => [t, i]));
      this._df = terms.map((t) => df.get(t)); this._n = n;
      this.fitted = true; return this;
    }
    _matrix(docs, weightFn) {
      const counts = this._counts(docs);
      const rows = counts.map((c) => {
        const pairs = [];
        for (const [t, v] of c) { const j = this.vocabulary_.get(t); if (j !== undefined) pairs.push([j, this.params.binary ? 1 : v]); }
        pairs.sort((a, b) => a[0] - b[0]);
        return { idx: pairs.map((x) => x[0]), val: pairs.map((x) => x[1]) };
      });
      if (weightFn) rows.forEach(weightFn);
      return new SparseMatrix(rows, this.vocabulary_.size);
    }
    transform(raw) { this._needFit('transform'); return this._matrix(docsOf(raw)); }
    fit_transform(raw) { this.fit(raw); return this.transform(raw); }
    get_feature_names_out() { this._needFit('get_feature_names_out'); return new NDArray(Array.from(this.vocabulary_.keys()), undefined, 'object'); }
  }
  class TfidfVectorizer extends CountVectorizer {
    static pyName = 'TfidfVectorizer';
    static defaults = Object.assign({}, CountVectorizer.defaults, { norm: 'l2', use_idf: true, smooth_idf: true, sublinear_tf: false });
    fit(raw) {
      super.fit(raw);
      const n = this._n, sm = this.params.smooth_idf ? 1 : 0;
      this._idf = this._df.map((d) => Math.log((n + sm) / (d + sm)) + 1);
      this.idf_ = PB.floatArray(this._idf);
      return this;
    }
    transform(raw) {
      this._needFit('transform');
      return this._matrix(docsOf(raw), (r) => {
        for (let k = 0; k < r.val.length; k++) { let v = r.val[k]; if (this.params.sublinear_tf) v = 1 + Math.log(v); if (this.params.use_idf) v *= this._idf[r.idx[k]]; r.val[k] = v; }
        if (this.params.norm === 'l2') { const s = Math.sqrt(r.val.reduce((a, b) => a + b * b, 0)); if (s > 0) r.val = r.val.map((v) => v / s); }
        else if (this.params.norm === 'l1') { const s = r.val.reduce((a, b) => a + Math.abs(b), 0); if (s > 0) r.val = r.val.map((v) => v / s); }
      });
    }
  }
  /* Vectorizers take raw text, so estimators downstream must accept them inside pipelines. */
  Object.assign(PB, { CountVectorizer, TfidfVectorizer });
})();
