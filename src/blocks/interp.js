/* ThaiPyBlocks: block interpreter. Executes the block tree directly (no eval), with Python semantics,
   as a generator so the UI can step, highlight, show progress and stop. */
(function () {
  const BK = PB.blocks;
  class BreakSig { } class ContinueSig { }
  class ReturnSig { constructor(v) { this.value = v; } }

  /* ---------- Python semantics helpers ---------- */
  const isFrame = (v) => v instanceof PB.DataFrame || v instanceof PB.Series || v instanceof PB.NDArray;
  const F = PB.PyFloat, unbox = PB.unbox;
  function truthy(v) {
    if (v === null || v === undefined) return false;
    if (v instanceof F) return v.v !== 0;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (isFrame(v)) {
      if (v instanceof PB.NDArray && v.data.length === 1) return truthy(v.data[0]);
      throw PB.err('ValueError', `The truth value of a ${PB.typeName(v)} is ambiguous. Use a.empty, a.bool(), a.item(), a.any() or a.all().`, TR`ใช้ ${PB.typeName(v)} เป็นเงื่อนไข ถ้า/ขณะที่ โดยตรงไม่ได้`, TR('เปรียบเทียบเป็นค่าเดียวก่อน เช่น len(df) > 0'));
    }
    if (v instanceof PB.Tuple) return v.items.length > 0;
    return true;
  }
  function pyEq(a, b) {
    a = unbox(a); b = unbox(b);
    if (typeof a === 'boolean') a = +a; if (typeof b === 'boolean') b = +b;
    if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
    return a === b;
  }
  function pyCmp(op, a, b) {
    if (op === 'EQ') return pyEq(a, b);
    if (op === 'NEQ') return !pyEq(a, b);
    a = unbox(a); b = unbox(b);
    if (typeof a === 'boolean') a = +a; if (typeof b === 'boolean') b = +b;
    const ok = (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string') || (Array.isArray(a) && Array.isArray(b));
    if (!ok) {
      const sym = { LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[op];
      throw PB.err('TypeError', `'${sym}' not supported between instances of '${PB.typeName(a)}' and '${PB.typeName(b)}'`, TR`เปรียบเทียบ ${PB.typeName(a)} กับ ${PB.typeName(b)} ด้วย ${sym} ไม่ได้`);
    }
    const c = Array.isArray(a) ? listCmp(a, b) : a < b ? -1 : a > b ? 1 : 0;
    return { LT: c < 0, LTE: c <= 0, GT: c > 0, GTE: c >= 0 }[op];
  }
  function listCmp(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) { if (pyEq(a[i], b[i])) continue; return pyCmp('LT', a[i], b[i]) ? -1 : 1; } return a.length - b.length; }
  function num(v, what) {
    if (v instanceof F) return v.v;
    if (typeof v === 'boolean') return +v;
    if (typeof v === 'number') return v;
    throw PB.err('TypeError', `unsupported operand type: '${PB.typeName(v)}'`, TR`${what || TR('ค่านี้')} ต้องเป็นตัวเลข แต่ได้ ${PB.typeName(v)}`);
  }
  function arith(op, a, b) {
    const sym = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/', POWER: '**' }[op];
    /* Python: true division always gives a float; any float operand gives a float */
    const floatOut = op === 'DIVIDE' || PB.isFloat(a) || PB.isFloat(b);
    a = unbox(a); b = unbox(b);
    if (a instanceof PB.Series) return a.arith(sym, b instanceof PB.Series || b instanceof PB.NDArray ? b : num(b, TR('ตัวคูณ')), floatOut);
    if (b instanceof PB.Series) {
      if (op === 'ADD' || op === 'MULTIPLY') return b.arith(sym, num(a), floatOut);
      const vals = b.values.map((v) => (PB.isMissing(v) ? NaN : PB.ARITH[sym](num(a), +v)));
      return b._new(vals, { dtype: floatOut || b.dtype === 'float64' ? 'float64' : PB.inferDtype(vals) });
    }
    if (a instanceof PB.NDArray && a.shape.length === 1) return PB.floatArray(Array.from(a.data, (v, i) => PB.ARITH[sym](v, b instanceof PB.NDArray ? b.data[i] : num(b))));
    if (op === 'ADD') {
      if (typeof a === 'string' && typeof b === 'string') return a + b;
      if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
      if (typeof a === 'string' || typeof b === 'string') throw PB.err('TypeError', `can only concatenate str (not "${PB.typeName(typeof a === 'string' ? b : a)}") to str`, TR('บวกข้อความกับตัวเลขไม่ได้'), TR('ใช้บล็อก "สร้างข้อความจาก" หรือแปลงด้วย str()'));
    }
    if (op === 'MULTIPLY') {
      if (typeof a === 'string' && Number.isInteger(b)) return a.repeat(Math.max(0, b));
      if (Array.isArray(a) && Number.isInteger(b)) return [].concat(...Array(Math.max(0, b)).fill(a));
    }
    a = num(a); b = num(b);
    if (op === 'DIVIDE' && b === 0) throw PB.err('ZeroDivisionError', 'division by zero', TR('หารด้วยศูนย์ไม่ได้'));
    if (op === 'POWER' && a === 0 && b < 0) throw PB.err('ZeroDivisionError', '0.0 cannot be raised to a negative power', TR('ยกกำลังติดลบของศูนย์ไม่ได้'));
    const r = PB.ARITH[sym](a, b);
    return floatOut || (op === 'POWER' && b < 0) ? PB.toFloat(r) : r;
  }
  function toList(v, what) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return Array.from(v);
    if (v instanceof PB.Series) return v.values.slice();
    if (v instanceof PB.NDArray) return v.tolist();
    if (v instanceof PB.Tuple || v instanceof PB.Index) return v.items.slice();
    if (v instanceof PB.DataFrame) return v.columns;
    throw PB.err('TypeError', `'${PB.typeName(v)}' object is not iterable`, TR`${what || TR('ค่านี้')} ต้องเป็นลิสต์ แต่ได้ ${PB.typeName(v)}`);
  }
  function pyLen(v) {
    if (typeof v === 'string' || Array.isArray(v)) return Array.isArray(v) ? v.length : Array.from(v).length;
    if (v instanceof PB.DataFrame) return v.nrows;
    if (v instanceof PB.Series) return v.length;
    if (v instanceof PB.NDArray) return v.shape[0];
    if (v instanceof PB.Tuple || v instanceof PB.Index) return v.items.length;
    if (v instanceof PB.SparseMatrix) return v.rows.length;
    if (false) throw PB.err('TypeError', 'sparse array length is ambiguous; use getnnz() or shape[0]', TR('ใช้ len กับเมทริกซ์ข้อความไม่ได้'));
    throw PB.err('TypeError', `object of type '${PB.typeName(v)}' has no len()`, TR`หาความยาวของ ${PB.typeName(v)} ไม่ได้`);
  }
  function pyRound(x, n = 0) { const f = Math.pow(10, n); return PB.roundHalfEven(unbox(x) * f) / f; }
  PB.py.truthy = truthy; PB.py.len = pyLen; PB.py.toList = toList; PB.py.arith = arith; PB.py.round = pyRound;

  const idxFrom = (where, at, len) => {
    if (where === 'FIRST') return 0;
    if (where === 'LAST') return len - 1;
    if (where === 'FROM_START') return Math.trunc(at) - 1;
    if (where === 'FROM_END') return len - Math.trunc(at);
    if (where === 'RANDOM') return Math.floor(Math.random() * len);
    return 0;
  };
  const idxErr = (what) => PB.err('IndexError', `${what} index out of range`, TR('ลำดับที่เลือกเกินขอบเขตของลิสต์/ข้อความ'), TR('ลำดับใน Blockly เริ่มที่ 1'));

  /* ---------- standard Blockly statement blocks ---------- */
  const STMT = {
    *variables_set(b, I) { I.set(I.vname(b, 'VAR'), yield* I.valRaw(b, 'VALUE', null)); },
    *text_print(b, I) { const v = yield* I.valRaw(b, 'TEXT', ''); I.out.print([v], b); },
    *controls_if(b, I) {
      let n = 0;
      while (b.getInput('IF' + n)) {
        if (truthy(yield* I.val(b, 'IF' + n, false))) { yield* I.stmts(b, 'DO' + n); return; }
        n++;
      }
      if (b.getInput('ELSE')) yield* I.stmts(b, 'ELSE');
    },
    *controls_repeat_ext(b, I) {
      const t = Math.floor(num(yield* I.val(b, 'TIMES', 0), TR('จำนวนรอบ')));
      for (let i = 0; i < t; i++) { if (yield* I.loopBody(b, 'DO')) break; }
    },
    *controls_whileUntil(b, I) {
      const until = b.getFieldValue('MODE') === 'UNTIL';
      for (;;) {
        const c = truthy(yield* I.val(b, 'BOOL', false));
        if (until ? c : !c) break;
        if (yield* I.loopBody(b, 'DO')) break;
        I.tick();
      }
    },
    *controls_for(b, I) {
      const name = I.vname(b, 'VAR');
      const from = num(yield* I.val(b, 'FROM', 0), TR('ค่าเริ่ม')), to = num(yield* I.val(b, 'TO', 0), TR('ค่าสุดท้าย'));
      let step = Math.abs(num(yield* I.val(b, 'BY', 1), TR('ค่าที่เพิ่ม')));
      if (step === 0) throw PB.err('ValueError', 'range() arg 3 must not be zero', TR('ค่าที่เพิ่มแต่ละรอบต้องไม่เป็น 0'));
      if (from <= to) { for (let i = from; i <= to; i += step) { I.set(name, i); if (yield* I.loopBody(b, 'DO')) break; } }
      else { for (let i = from; i >= to; i -= step) { I.set(name, i); if (yield* I.loopBody(b, 'DO')) break; } }
    },
    *controls_forEach(b, I) {
      const name = I.vname(b, 'VAR');
      const list = toList(yield* I.val(b, 'LIST', []), TR('ข้อมูลที่วนซ้ำ'));
      for (const item of list.slice()) { I.set(name, item); if (yield* I.loopBody(b, 'DO')) break; }
    },
    *controls_flow_statements(b) { if (b.getFieldValue('FLOW') === 'BREAK') throw new BreakSig(); throw new ContinueSig(); },
    *math_change(b, I) { const name = I.vname(b, 'VAR'); const cur = I.get(name); I.set(name, arith('ADD', cur, yield* I.valRaw(b, 'DELTA', 0))); },
    *text_append(b, I) { const name = I.vname(b, 'VAR'); const cur = I.get(name); I.set(name, PB.str(cur) + PB.str(yield* I.valRaw(b, 'TEXT', ''))); },
    *lists_setIndex(b, I) {
      const list = yield* I.val(b, 'LIST', null);
      if (!Array.isArray(list)) throw PB.err('TypeError', `'${PB.typeName(list)}' object does not support item assignment`, TR('ต้องเป็นลิสต์'));
      const mode = b.getFieldValue('MODE'), where = b.getFieldValue('WHERE');
      const at = b.getInput('AT') ? num(yield* I.val(b, 'AT', 1)) : 1;
      const v = yield* I.valRaw(b, 'TO', null);
      let i = idxFrom(where, at, list.length);
      if (mode === 'SET') { if (i < 0 || i >= list.length) throw idxErr('list assignment'); list[i] = v; }
      else { if (where === 'LAST') i = list.length; if (where === 'FROM_END') i += 1; list.splice(Math.max(0, Math.min(i, list.length)), 0, v); }
    },
    *lists_getIndex(b, I) { yield* VALUE.lists_getIndex(b, I); },
    *procedures_callnoreturn(b, I) { yield* I.call(b); },
    *procedures_ifreturn(b, I) {
      if (truthy(yield* I.val(b, 'CONDITION', false))) throw new ReturnSig(b.hasReturnValue_ ? yield* I.valRaw(b, 'VALUE', null) : null);
    },
  };

  /* ---------- standard Blockly value blocks ---------- */
  const VALUE = {
    *variables_get(b, I) { return I.get(I.vname(b, 'VAR')); },
    *math_number(b) { return Number(b.getFieldValue('NUM')); },
    *text(b) { return b.getFieldValue('TEXT'); },
    *logic_boolean(b) { return b.getFieldValue('BOOL') === 'TRUE'; },
    *logic_null() { return null; },
    *logic_compare(b, I) {
      const a = yield* I.val(b, 'A', null), c = yield* I.val(b, 'B', null);
      if (a instanceof PB.Series) return a.compare({ EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[b.getFieldValue('OP')], c);
      return pyCmp(b.getFieldValue('OP'), a, c);
    },
    *logic_operation(b, I) {
      const a = yield* I.valRaw(b, 'A', false);
      if (b.getFieldValue('OP') === 'AND') return truthy(a) ? yield* I.valRaw(b, 'B', false) : a;
      return truthy(a) ? a : yield* I.valRaw(b, 'B', false);
    },
    *logic_negate(b, I) { return !truthy(yield* I.val(b, 'BOOL', true)); },
    *logic_ternary(b, I) { return truthy(yield* I.val(b, 'IF', false)) ? yield* I.valRaw(b, 'THEN', null) : yield* I.valRaw(b, 'ELSE', null); },
    *math_arithmetic(b, I) { const a = yield* I.valRaw(b, 'A', 0), c = yield* I.valRaw(b, 'B', 0); return arith(b.getFieldValue('OP'), a, c); },
    *math_single(b, I) {
      const raw = yield* I.valRaw(b, 'NUM', 0), x = num(raw), op = b.getFieldValue('OP');
      if (op === 'ROOT' && x < 0) throw PB.err('ValueError', 'math domain error', TR('หารากที่สองของจำนวนติดลบไม่ได้'));
      if ((op === 'LN' || op === 'LOG10') && x <= 0) throw PB.err('ValueError', 'math domain error', TR('หา log ของจำนวนที่ไม่เป็นบวกไม่ได้'));
      const r = { ROOT: Math.sqrt(x), ABS: Math.abs(x), NEG: -x, LN: Math.log(x), LOG10: Math.log10(x), EXP: Math.exp(x), POW10: Math.pow(10, x) }[op];
      /* math.sqrt / math.fabs / math.log ... always return float; unary minus keeps the type */
      return op === 'NEG' ? (PB.isFloat(raw) ? PB.toFloat(r) : r) : PB.toFloat(r);
    },
    *math_trig(b, I) {
      const x = num(yield* I.val(b, 'NUM', 0)), op = b.getFieldValue('OP'), r = (x / 180) * Math.PI;
      return PB.toFloat({ SIN: Math.sin(r), COS: Math.cos(r), TAN: Math.tan(r), ASIN: (Math.asin(x) / Math.PI) * 180, ACOS: (Math.acos(x) / Math.PI) * 180, ATAN: (Math.atan(x) / Math.PI) * 180 }[op]);
    },
    *math_atan2(b, I) { const x = num(yield* I.val(b, 'X', 0)), y = num(yield* I.val(b, 'Y', 0)); return PB.toFloat((Math.atan2(y, x) / Math.PI) * 180); },
    *math_constant(b) { return PB.toFloat({ PI: Math.PI, E: Math.E, GOLDEN_RATIO: (1 + Math.sqrt(5)) / 2, SQRT2: Math.SQRT2, SQRT1_2: Math.SQRT1_2, INFINITY: Infinity }[b.getFieldValue('CONSTANT')]); },
    *math_number_property(b, I) {
      const x = num(yield* I.val(b, 'NUMBER_TO_CHECK', 0)), p = b.getFieldValue('PROPERTY');
      if (p === 'EVEN') return x % 2 === 0; if (p === 'ODD') return Math.abs(x % 2) === 1; if (p === 'WHOLE') return x % 1 === 0;
      if (p === 'POSITIVE') return x > 0; if (p === 'NEGATIVE') return x < 0;
      if (p === 'DIVISIBLE_BY') { const d = num(yield* I.val(b, 'DIVISOR', 1)); if (d === 0) throw PB.err('ZeroDivisionError', 'integer modulo by zero', TR('หารด้วยศูนย์ไม่ได้')); return x % d === 0; }
      if (p === 'PRIME') { if (x < 2 || x % 1) return false; for (let i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; }
      return false;
    },
    *math_round(b, I) { const x = num(yield* I.val(b, 'NUM', 0)), op = b.getFieldValue('OP'); return op === 'ROUND' ? PB.roundHalfEven(x) : op === 'ROUNDUP' ? Math.ceil(x) : Math.floor(x); },
    *math_on_list(b, I) {
      const raw = yield* I.val(b, 'LIST', []), op = b.getFieldValue('OP');
      const L = toList(raw, TR('ลิสต์')).filter((v) => !(typeof v === 'number' && Number.isNaN(v)));
      if (!L.length && op !== 'SUM') throw PB.err('ValueError', `${op.toLowerCase()}() arg is an empty sequence`, TR('ลิสต์ว่างเปล่า'));
      const nums = () => L.map((v) => num(v, TR('สมาชิกในลิสต์')));
      switch (op) {
        case 'SUM': { const t = nums().reduce((a, c) => a + c, 0); return L.some(PB.isFloat) ? PB.toFloat(t) : t; }
        case 'MIN': return L.reduce((a, c) => (pyCmp('LT', c, a) ? c : a));
        case 'MAX': return L.reduce((a, c) => (pyCmp('GT', c, a) ? c : a));
        case 'AVERAGE': return PB.toFloat(nums().reduce((a, c) => a + c, 0) / L.length);
        case 'MEDIAN': { const srt = L.slice().sort((x, y) => num(x) - num(y)); const n = srt.length; return n % 2 ? srt[(n - 1) / 2] : PB.toFloat((num(srt[n / 2 - 1]) + num(srt[n / 2])) / 2); }
        case 'MODE': { const cnt = new Map(); L.forEach((v) => cnt.set(PB.keyOf(v), (cnt.get(PB.keyOf(v)) || 0) + 1)); const mx = Math.max(...cnt.values()); const seen = new Set(); return L.filter((v) => cnt.get(PB.keyOf(v)) === mx && !seen.has(PB.keyOf(v)) && seen.add(PB.keyOf(v))); }
        case 'STD_DEV': { const a = nums(), m = a.reduce((s, x) => s + x, 0) / a.length; return PB.toFloat(Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length)); }
        case 'RANDOM': return L[Math.floor(Math.random() * L.length)];
      }
      return null;
    },
    *math_modulo(b, I) {
      const ra = yield* I.valRaw(b, 'DIVIDEND', 0), rd = yield* I.valRaw(b, 'DIVISOR', 1), a = num(ra), d = num(rd);
      if (d === 0) throw PB.err('ZeroDivisionError', 'integer modulo by zero', TR('หารเอาเศษด้วยศูนย์ไม่ได้'));
      const r = ((a % d) + d) % d; return PB.isFloat(ra) || PB.isFloat(rd) ? PB.toFloat(r) : r;
    },
    *math_constrain(b, I) { const rv = yield* I.valRaw(b, 'VALUE', 0), rl = yield* I.valRaw(b, 'LOW', 0), rh = yield* I.valRaw(b, 'HIGH', 0); const v = num(rv), lo = num(rl), hi = num(rh); return v < lo ? rl : v > hi ? rh : rv; },
    *math_random_int(b, I) { let a = Math.trunc(num(yield* I.val(b, 'FROM', 0))), c = Math.trunc(num(yield* I.val(b, 'TO', 0))); if (a > c) throw PB.err('ValueError', `empty range in randrange(${a}, ${c + 1})`, TR('ค่าเริ่มต้องไม่มากกว่าค่าสุดท้าย')); return a + Math.floor(Math.random() * (c - a + 1)); },
    *math_random_float() { return PB.toFloat(Math.random()); },
    *text_join(b, I) { let s = ''; for (let i = 0; b.getInput('ADD' + i); i++) s += PB.str(yield* I.valRaw(b, 'ADD' + i, '')); return s; },
    *text_length(b, I) { return pyLen(yield* I.val(b, 'VALUE', '')); },
    *text_isEmpty(b, I) { return pyLen(yield* I.val(b, 'VALUE', '')) === 0; },
    *text_indexOf(b, I) { const t = I.asStr(yield* I.val(b, 'VALUE', '')), f = I.asStr(yield* I.val(b, 'FIND', '')); return (b.getFieldValue('END') === 'FIRST' ? t.indexOf(f) : t.lastIndexOf(f)) + 1; },
    *text_charAt(b, I) {
      const t = Array.from(I.asStr(yield* I.val(b, 'VALUE', ''))), where = b.getFieldValue('WHERE');
      const at = b.getInput('AT') ? num(yield* I.val(b, 'AT', 1)) : 1; const i = idxFrom(where, at, t.length);
      if (i < 0 || i >= t.length) throw idxErr('string'); return t[i];
    },
    *text_getSubstring(b, I) {
      const t = Array.from(I.asStr(yield* I.val(b, 'STRING', '')));
      const w1 = b.getFieldValue('WHERE1'), w2 = b.getFieldValue('WHERE2');
      const a1 = b.getInput('AT1') ? num(yield* I.val(b, 'AT1', 1)) : 1, a2 = b.getInput('AT2') ? num(yield* I.val(b, 'AT2', 1)) : 1;
      const s = w1 === 'FIRST' ? 0 : w1 === 'FROM_START' ? a1 - 1 : t.length - a1;
      const e = w2 === 'LAST' ? t.length : w2 === 'FROM_START' ? a2 : t.length - a2 + 1;
      return t.slice(Math.max(0, s), Math.max(0, e)).join('');
    },
    *text_changeCase(b, I) { const t = I.asStr(yield* I.val(b, 'TEXT', '')), c = b.getFieldValue('CASE'); return c === 'UPPERCASE' ? t.toUpperCase() : c === 'LOWERCASE' ? t.toLowerCase() : t.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, p, ch) => p + ch.toUpperCase()); },
    *text_trim(b, I) { const t = I.asStr(yield* I.val(b, 'TEXT', '')), m = b.getFieldValue('MODE'); return m === 'BOTH' ? t.trim() : m === 'LEFT' ? t.trimStart() : t.trimEnd(); },
    *text_count(b, I) { const t = I.asStr(yield* I.val(b, 'TEXT', '')), s = I.asStr(yield* I.val(b, 'SUB', '')); if (!s) return Array.from(t).length + 1; return t.split(s).length - 1; },
    *text_replace(b, I) { const t = I.asStr(yield* I.val(b, 'TEXT', '')), f = I.asStr(yield* I.val(b, 'FROM', '')), to = I.asStr(yield* I.val(b, 'TO', '')); return f ? t.split(f).join(to) : t; },
    *text_reverse(b, I) { return Array.from(I.asStr(yield* I.val(b, 'TEXT', ''))).reverse().join(''); },
    *lists_create_empty() { return []; },
    *lists_create_with(b, I) { const out = []; for (let i = 0; b.getInput('ADD' + i); i++) out.push(yield* I.valRaw(b, 'ADD' + i, null)); return out; },
    *lists_repeat(b, I) { const v = yield* I.valRaw(b, 'ITEM', null), n = Math.trunc(num(yield* I.val(b, 'NUM', 0))); return Array(Math.max(0, n)).fill(v); },
    *lists_length(b, I) { return pyLen(yield* I.val(b, 'VALUE', [])); },
    *lists_isEmpty(b, I) { return pyLen(yield* I.val(b, 'VALUE', [])) === 0; },
    *lists_indexOf(b, I) {
      const L = toList(yield* I.val(b, 'VALUE', []), TR('ลิสต์')), f = yield* I.val(b, 'FIND', null);
      if (b.getFieldValue('END') === 'FIRST') return L.findIndex((x) => pyEq(x, f)) + 1;
      for (let i = L.length - 1; i >= 0; i--) if (pyEq(L[i], f)) return i + 1; return 0;
    },
    *lists_getIndex(b, I) {
      const raw = yield* I.val(b, 'VALUE', []);
      const mode = b.getFieldValue('MODE'), where = b.getFieldValue('WHERE');
      const L = Array.isArray(raw) ? raw : toList(raw, TR('ลิสต์'));
      const at = b.getInput('AT') ? num(yield* I.val(b, 'AT', 1)) : 1;
      const i = idxFrom(where, at, L.length);
      if (i < 0 || i >= L.length) throw idxErr('list');
      const v = L[i];
      if (mode !== 'GET') { if (!Array.isArray(raw)) throw PB.err('TypeError', 'object does not support item deletion', TR('ลบสมาชิกได้เฉพาะลิสต์')); raw.splice(i, 1); }
      return v;
    },
    *lists_getSublist(b, I) {
      const L = toList(yield* I.val(b, 'LIST', []), TR('ลิสต์'));
      const w1 = b.getFieldValue('WHERE1'), w2 = b.getFieldValue('WHERE2');
      const a1 = b.getInput('AT1') ? num(yield* I.val(b, 'AT1', 1)) : 1, a2 = b.getInput('AT2') ? num(yield* I.val(b, 'AT2', 1)) : 1;
      const s = w1 === 'FIRST' ? 0 : w1 === 'FROM_START' ? a1 - 1 : L.length - a1;
      const e = w2 === 'LAST' ? L.length : w2 === 'FROM_START' ? a2 : L.length - a2 + 1;
      return L.slice(Math.max(0, s), Math.max(0, e));
    },
    *lists_split(b, I) {
      const input = yield* I.val(b, 'INPUT', b.getFieldValue('MODE') === 'SPLIT' ? '' : []), d = I.asStr(yield* I.val(b, 'DELIM', ','));
      if (b.getFieldValue('MODE') === 'SPLIT') return I.asStr(input).split(d);
      return toList(input, TR('ลิสต์')).map((x) => { if (typeof x !== 'string') throw PB.err('TypeError', `sequence item: expected str instance, ${PB.typeName(x)} found`, TR('รวมเป็นข้อความได้เฉพาะลิสต์ของข้อความ')); return x; }).join(d);
    },
    *lists_sort(b, I) {
      const L = toList(yield* I.val(b, 'LIST', []), TR('ลิสต์')).slice(), type = b.getFieldValue('TYPE'), dir = Number(b.getFieldValue('DIRECTION'));
      const key = type === 'NUMERIC' ? (x) => num(Number(x)) : type === 'IGNORE_CASE' ? (x) => String(x).toLowerCase() : (x) => String(x);
      L.sort((x, y) => { const a = key(x), c = key(y); return (a < c ? -1 : a > c ? 1 : 0) * dir; });
      return L;
    },
    *lists_reverse(b, I) { return toList(yield* I.val(b, 'LIST', []), TR('ลิสต์')).slice().reverse(); },
    *procedures_callreturn(b, I) { return yield* I.call(b); },
  };

  /* ---------- the interpreter ---------- */
  class Interp {
    constructor(ws, out) {
      this.ws = ws; this.out = out; this.globals = new Map(); this.frames = []; this.steps = 0; this.maxSteps = 3000000; this.procs = new Map(); this.depth = 0;
    }
    vname(b, field) { const f = b.getField(field); const v = f && f.getVariable ? f.getVariable() : null; return v ? (v.getName ? v.getName() : v.name) : b.getFieldValue(field); }
    get(name) {
      const f = this.frames[this.frames.length - 1];
      if (f && f.has(name)) return f.get(name);
      if (this.globals.has(name)) return this.globals.get(name);
      throw PB.err('NameError', `name '${name}' is not defined`, TR`ตัวแปร ${name} ยังไม่มีค่า`, TR`กำหนดค่าให้ ${name} ก่อนใช้งาน (ดูลำดับบล็อกจากบนลงล่าง)`);
    }
    set(name, v) { const f = this.frames[this.frames.length - 1]; if (f && f.has(name)) f.set(name, v); else this.globals.set(name, v); }
    asStr(v) { return typeof v === 'string' ? v : PB.str(v); }
    tick() { if (++this.steps > this.maxSteps) throw PB.err('RuntimeError', 'program ran too long', TR('โปรแกรมทำงานนานเกินไป อาจมีลูปไม่รู้จบ'), TR('ตรวจสอบเงื่อนไขของลูป')); }
    /* valRaw keeps Python floats boxed (print, variables, lists, arithmetic); val gives plain numbers */
    *valRaw(b, name, dflt) {
      const t = b.getInputTargetBlock(name);
      if (!t || !t.isEnabled()) {
        if (dflt === PB.REQUIRED) throw PB.err('SyntaxError', 'missing input', TR`ช่อง "${name}" ยังว่าง ต้องใส่บล็อกค่าลงไป`, TR('ลากบล็อกตัวแปรหรือค่ามาใส่ในช่องที่ว่าง'));
        return dflt;
      }
      return yield* this.eval(t);
    }
    *val(b, name, dflt) { return unbox(yield* this.valRaw(b, name, dflt)); }
    *eval(b) {
      this.tick();
      const fn = VALUE[b.type] || (BK.defs[b.type] && BK.defs[b.type].run);
      if (!fn) throw PB.err('NotImplementedError', 'block ' + b.type, TR`บล็อก ${b.type} ยังไม่รองรับการรันในเบราว์เซอร์`);
      try { return yield* fn.call(this, b, this); }
      catch (e) { if (e instanceof PB.PyError && !e.blockId) e.blockId = b.id; throw e; }
    }
    *stmts(b, name) { let c = b.getInputTargetBlock(name); while (c) { if (c.isEnabled()) yield* this.exec(c); c = c.getNextBlock(); } }
    *loopBody(b, name) {
      try { yield* this.stmts(b, name); } catch (e) { if (e instanceof BreakSig) return true; if (e instanceof ContinueSig) return false; throw e; }
      this.tick();
      return false;
    }
    *exec(b) {
      this.tick();
      yield { block: b };
      const fn = STMT[b.type] || (BK.defs[b.type] && BK.defs[b.type].run);
      if (!fn) {
        if (VALUE[b.type]) { yield* this.eval(b); return; }
        throw PB.err('NotImplementedError', 'block ' + b.type, TR`บล็อก ${b.type} ยังไม่รองรับการรันในเบราว์เซอร์`);
      }
      this.current = b;
      try { yield* fn.call(this, b, this); }
      catch (e) { if (e instanceof PB.PyError && !e.blockId) e.blockId = b.id; throw e; }
    }
    *call(b) {
      const name = b.getFieldValue('NAME');
      const def = this.procs.get(name);
      if (!def) throw PB.err('NameError', `name '${name}' is not defined`, TR`ยังไม่ได้สร้างฟังก์ชัน ${name}`);
      const params = PB.procParams(def);
      const frame = new Map();
      for (let i = 0; i < params.length; i++) frame.set(params[i], yield* this.valRaw(b, 'ARG' + i, null));
      if (++this.depth > 200) throw PB.err('RecursionError', 'maximum recursion depth exceeded', TR('ฟังก์ชันเรียกตัวเองซ้ำลึกเกินไป'));
      this.frames.push(frame);
      try {
        yield* this.stmts(def, 'STACK');
        if (def.type === 'procedures_defreturn') return yield* this.valRaw(def, 'RETURN', null);
        return null;
      } catch (e) {
        if (e instanceof ReturnSig) return e.value;
        if (e instanceof BreakSig || e instanceof ContinueSig) throw PB.err('SyntaxError', "'break' outside loop", TR('ใช้ หยุดลูป นอกลูปไม่ได้'));
        throw e;
      } finally { this.frames.pop(); this.depth--; }
    }
    *run() {
      const tops = this.ws.getTopBlocks(true);
      for (const b of tops) if (b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn') this.procs.set(b.getFieldValue('NAME'), b);
      for (const b of tops) {
        if (this.procs.has(b.getFieldValue && b.getFieldValue('NAME')) && b.type.startsWith('procedures_def')) continue;
        if (b.outputConnection || !b.isEnabled()) continue;
        let c = b;
        try { while (c) { if (c.isEnabled()) yield* this.exec(c); c = c.getNextBlock(); } }
        catch (e) {
          if (e instanceof BreakSig || e instanceof ContinueSig) throw PB.err('SyntaxError', "'break' outside loop", TR('ใช้บล็อกหยุด/ข้ามรอบได้เฉพาะในลูป'));
          if (e instanceof ReturnSig) throw PB.err('SyntaxError', "'return' outside function", TR('ใช้ return ได้เฉพาะในฟังก์ชัน'));
          throw e;
        }
      }
    }
  }
  PB.REQUIRED = Symbol('required');
  PB.procParams = (b) => (b.getProcedureDef ? b.getProcedureDef()[1] : b.arguments_ || []) || [];
  PB.Interp = Interp;
  PB.STMT = STMT; PB.VALUE = VALUE;
})();
