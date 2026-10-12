/* ThaiPyBlocks engine core: namespace, Python-style errors, value formatting, numpy RandomState. */
var PB = (typeof globalThis !== 'undefined' ? globalThis : window).PB || {};
(typeof globalThis !== 'undefined' ? globalThis : window).PB = PB;
/* the application's name in one place (exports, reports, notebooks); the page title and top bar are in src/index.html.
   ThaiPyBlocks was called PyBlocks Studio until 5 Oct 2026 (and Swift Block Studio for a few hours on 3 Oct 2026).
   Internal names keep the old spelling on purpose: the PB namespace, pb_* block types inside saved projects and the
   'pyblocks.' browser-storage keys, so projects, drafts and exercise progress saved under the old names still open. */
PB.APP = Object.freeze({ name: 'ThaiPyBlocks', slug: 'thaipyblocks' });

/* ---------------- interface language ----------------
   The sources are written in Thai. Every text people see goes through TR: TR('ข้อความ') or, with values,
   TR`ตัวแปร ${name} ยังไม่มีค่า`. In the Thai interface TR returns the text unchanged; in the English one it
   looks the text up in PB.I18N_EN (src/i18n_en.js, keys like 'ตัวแปร {0} ยังไม่มีค่า'). The language is chosen
   once when the page opens (switching saves the blocks and reloads), so texts built while the scripts load are
   already in the right language. Thai strings that are data (Thai reviews, the coffee shop's place names, the
   placeholder words the cleaner looks for) are not wrapped; test/i18n_tool.py checks that nothing is missed. */
PB.i18n = (function () {
  const G = typeof globalThis !== 'undefined' ? globalThis : window;
  let lang = 'th';
  try {
    const m = /[#&?]lang=(th|en)\b/.exec(((G.location && G.location.hash) || '') + '&' + ((G.location && G.location.search) || ''));
    const saved = G.localStorage && G.localStorage.getItem('pyblocks.lang');
    lang = m ? m[1] : saved === '"en"' || saved === 'en' ? 'en' : 'th';
  } catch (e) { lang = 'th'; }
  return { lang, missing: new Set() };
})();
function TR(s) {
  const en = PB.i18n.lang === 'en' && PB.I18N_EN;
  if (Array.isArray(s) && s.raw) {
    const vals = Array.prototype.slice.call(arguments, 1);
    if (en) {
      let key = s[0];
      for (let i = 0; i < vals.length; i++) key += '{' + i + '}' + s[i + 1];
      const tpl = PB.I18N_EN[key];
      if (tpl !== undefined) return tpl.replace(/\{(\d+)\}/g, (m, i) => String(vals[+i]));
      PB.i18n.missing.add(key);
    }
    let out = s[0];
    for (let i = 0; i < vals.length; i++) out += String(vals[i]) + s[i + 1];
    return out;
  }
  if (!en) return s;
  const r = PB.I18N_EN[s];
  if (r === undefined) { PB.i18n.missing.add(s); return s; }
  return r;
}

/* ---------------- errors ---------------- */
class PyError extends Error {
  constructor(pyType, message, thai, hint) {
    super(message);
    this.pyType = pyType || 'Error';
    this.thai = thai || '';
    this.hint = hint || '';
  }
}
PB.PyError = PyError;
PB.err = (pyType, message, thai, hint) => new PyError(pyType, message, thai, hint);

/* ---------------- small utils ---------------- */
PB.range = (n) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; };
PB.isNum = (v) => typeof v === 'number';
PB.isMissing = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
PB.argsortStable = (vals, cmp) => {
  const idx = PB.range(vals.length);
  idx.sort((a, b) => { const c = cmp(vals[a], vals[b]); return c !== 0 ? c : a - b; });
  return idx;
};
/* Python/numpy ordering: numbers ascending, strings by code point, booleans as numbers. */
PB.cmpPy = (a, b) => {
  if (a instanceof PB.PyFloat) a = a.v; if (b instanceof PB.PyFloat) b = b.v;
  const ta = typeof a, tb = typeof b;
  if (ta === 'boolean') a = +a; if (tb === 'boolean') b = +b;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};
/* np.unique semantics (sorted unique values). */
PB.uniqueSorted = (arr) => {
  const seen = new Map();
  for (let v of arr) { if (v instanceof PB.PyFloat) v = v.v; const k = (typeof v) + ':' + v; if (!seen.has(k)) seen.set(k, v); }
  return Array.from(seen.values()).sort(PB.cmpPy);
};
PB.keyOf = (v) => { if (v instanceof PB.PyFloat) v = v.v; return (typeof v) + ':' + v; };

/* ---------------- value formatting (Python repr / str) ---------------- */
function floatRepr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const s = x.toExponential();
  const m = s.match(/^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/);
  const sign = m[1], digits = m[2] + (m[3] || ''), exp = parseInt(m[4], 10);
  if (exp >= -4 && exp < 16) {
    let ip, fp;
    if (exp >= 0) {
      if (digits.length <= exp + 1) { ip = digits + '0'.repeat(exp + 1 - digits.length); fp = '0'; }
      else { ip = digits.slice(0, exp + 1); fp = digits.slice(exp + 1); }
    } else { ip = '0'; fp = '0'.repeat(-exp - 1) + digits; }
    return sign + ip + '.' + fp;
  }
  const mant = digits.length > 1 ? digits[0] + '.' + digits.slice(1) : digits[0];
  const ae = Math.abs(exp);
  return sign + mant + 'e' + (exp < 0 ? '-' : '+') + (ae < 10 ? '0' + ae : String(ae));
}
PB.floatRepr = floatRepr;
/* Numbers whose Python type we do not track: integral values print like ints. */
PB.numStr = (x) => {
  if (typeof x !== 'number') return String(x);
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return String(x);
  return floatRepr(x);
};
PB.strRepr = (s) => {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = '';
  for (const ch of s) {
    if (ch === '\\') out += '\\\\';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\r') out += '\\r';
    else if (ch === q) out += '\\' + q;
    else out += ch;
  }
  return q + out + q;
};
PB.repr = (v) => {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return PB.numStr(v);
  if (typeof v === 'string') return PB.strRepr(v);
  if (v instanceof PB.Tuple) return '(' + v.items.map(PB.repr).join(', ') + (v.items.length === 1 ? ',)' : ')');
  if (Array.isArray(v)) return '[' + v.map(PB.repr).join(', ') + ']';
  if (v && typeof v.__repr__ === 'function') return v.__repr__();
  if (v instanceof Map) return '{' + Array.from(v.entries()).map(([k, x]) => PB.repr(k) + ': ' + PB.repr(x)).join(', ') + '}';
  return String(v);
};
PB.str = (v) => {
  if (typeof v === 'string') return v;
  if (v && typeof v.__str__ === 'function') return v.__str__();
  return PB.repr(v);
};
/* Python type name, used in messages and in the variable inspector. */
PB.typeName = (v) => {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'str';
  if (v instanceof PB.Tuple) return 'tuple';
  if (Array.isArray(v)) return 'list';
  if (v && v.pyType) return typeof v.pyType === 'function' ? v.pyType() : v.pyType;
  if (v instanceof Map) return 'dict';
  return 'object';
};

class Tuple {
  constructor(items) { this.items = items; }
  get length() { return this.items.length; }
  __repr__() { return PB.repr(this); }
}
PB.Tuple = Tuple;

/* A Python float whose value happens to be whole (1.0, 5.0). Plain JS numbers print whole values
   like ints, so values that Python would print as floats are boxed until they are printed.
   Only the interpreter's value plumbing ever sees these; engine code works on plain numbers. */
class PyFloat {
  constructor(v) { this.v = v; }
  valueOf() { return this.v; }
  toString() { return floatRepr(this.v); }
  pyType() { return 'float'; }
  __repr__() { return floatRepr(this.v); }
}
PB.PyFloat = PyFloat;
PB.unbox = (x) => (x instanceof PyFloat ? x.v : x);
/* mark a numeric result as a Python float (only whole values need the box) */
PB.toFloat = (x) => {
  if (x instanceof PyFloat) return x;
  return typeof x === 'number' && Number.isInteger(x) ? new PyFloat(x) : x;
};
/* is this value a Python float? (boxed whole float, or any non-integral / non-finite number) */
PB.isFloat = (x) => x instanceof PyFloat || (typeof x === 'number' && !Number.isInteger(x));

/* ---------------- numpy legacy RandomState (MT19937) ---------------- */
class RandomState {
  constructor(seed) { this.mt = new Uint32Array(624); this.idx = 624; this.seed(seed == null ? (Date.now() >>> 0) : seed); }
  seed(s) {
    if (!Number.isInteger(s) || s < 0 || s > 4294967295) throw PB.err('ValueError', 'Seed must be between 0 and 2**32 - 1', TR('random_state ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป'));
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.idx = 624;
  }
  _twist() {
    const mt = this.mt;
    for (let i = 0; i < 624; i++) {
      const y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
      let v = mt[(i + 397) % 624] ^ (y >>> 1);
      if (y & 1) v ^= 0x9908b0df;
      mt[i] = v >>> 0;
    }
    this.idx = 0;
  }
  nextU32() {
    if (this.idx >= 624) this._twist();
    let y = this.mt[this.idx++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }
  /* random_sample(): 53-bit double in [0, 1) */
  random() { const a = this.nextU32() >>> 5, b = this.nextU32() >>> 6; return (a * 67108864 + b) / 9007199254740992; }
  /* random_interval(max): uniform integer in [0, max] (masked rejection, 32-bit path) */
  interval(max) {
    if (max === 0) return 0;
    let mask = max;
    mask |= mask >>> 1; mask |= mask >>> 2; mask |= mask >>> 4; mask |= mask >>> 8; mask |= mask >>> 16;
    mask >>>= 0;
    let v;
    do { v = (this.nextU32() & mask) >>> 0; } while (v > max);
    return v;
  }
  /* randint(low, high) exclusive high (legacy masked) */
  randint(low, high) { if (high === undefined) { high = low; low = 0; } return low + this.interval(high - low - 1); }
  uniform(low, high) { return low + (high - low) * this.random(); }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.interval(i); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  permutation(n) { return this.shuffle(PB.range(n)); }
  /* choice(n, size, replace=False) without p: permutation(n)[:size] */
  choiceNoReplace(n, size) { return this.permutation(n).slice(0, size); }
  /* legacy gauss (polar Box-Muller with cache) */
  normal(mu = 0, sigma = 1) {
    if (this._hasGauss) { this._hasGauss = false; return mu + sigma * this._gauss; }
    let x1, x2, r2;
    do { x1 = 2 * this.random() - 1; x2 = 2 * this.random() - 1; r2 = x1 * x1 + x2 * x2; } while (r2 >= 1 || r2 === 0);
    const f = Math.sqrt(-2 * Math.log(r2) / r2);
    this._gauss = f * x1; this._hasGauss = true;
    return mu + sigma * f * x2;
  }
}
PB.RandomState = RandomState;
PB.checkRandomState = (rs) => {
  if (rs instanceof RandomState) return rs;
  if (rs === null || rs === undefined) return new RandomState((Math.random() * 4294967295) >>> 0);
  return new RandomState(rs);
};

/* ---------------- numpy's float summation ---------------- */
/* np.add.reduce on float64 uses pairwise summation (8 accumulators, blocks of 128); reproducing it
   keeps means and standard deviations identical to numpy down to the last bit. */
function npPairwise(a, lo, n) {
  if (n < 8) { let res = 0; for (let i = 0; i < n; i++) res += a[lo + i]; return res; }
  if (n <= 128) {
    const r = [a[lo], a[lo + 1], a[lo + 2], a[lo + 3], a[lo + 4], a[lo + 5], a[lo + 6], a[lo + 7]];
    let i;
    for (i = 8; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += a[lo + i + j];
    let res = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) res += a[lo + i];
    return res;
  }
  let n2 = Math.floor(n / 2); n2 -= n2 % 8;
  return npPairwise(a, lo, n2) + npPairwise(a, lo + n2, n - n2);
}
PB.npSum = (a) => (a.length ? 0 + npPairwise(a, 0, a.length) : 0);
PB.npMean = (a) => PB.npSum(a) / a.length;
PB.npStd = (a, ddof = 0) => { const m = PB.npMean(a); const d = a.map((x) => (x - m) * (x - m)); return Math.sqrt(PB.npSum(d) / (a.length - ddof)); };

/* ---------------- progress / cooperative yielding ---------------- */
/* Long computations are generator functions that yield {progress} objects.
   PB.runSync drives such a generator to completion (used in tests / small jobs). */
PB.runSync = (gen) => { let r = gen.next(); while (!r.done) r = gen.next(); return r.value; };
PB.isGen = (g) => g && typeof g.next === 'function' && typeof g[Symbol.iterator] === 'function';

/* ---------------- warnings (shown in the output panel) ---------------- */
PB.warnings = [];
PB.warn = (message, thai) => { PB.warnings.push({ message, thai }); if (PB.onWarn) PB.onWarn({ message, thai }); };
