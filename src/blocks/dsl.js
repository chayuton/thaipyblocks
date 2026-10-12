/* ThaiPyBlocks: block definition DSL, custom fields, Python-code helpers. Requires Blockly + python generator. */
(function () {
  const BK = (PB.blocks = { defs: {}, order: [] });
  const Py = (PB.py = {});

  /* ---------------- category colours (block styles) ---------------- */
  BK.CATS = {
    data: { colour: '#0E7C86', th: TR('ข้อมูล (pandas)') },
    clean: { colour: '#4D7C0F', th: TR('ทำความสะอาด & ปรับสเกล') },
    prep: { colour: '#A5561A', th: TR('เตรียมข้อมูล') },
    cls: { colour: '#6D4BC3', th: TR('โมเดลจำแนกประเภท') },
    reg: { colour: '#2E62B8', th: TR('โมเดลพยากรณ์ค่า') },
    clu: { colour: '#1B7D52', th: TR('จัดกลุ่ม / ลดมิติ') },
    other: { colour: '#A23B72', th: TR('ข้อความ / ค่าผิดปกติ') },
    train: { colour: '#4E5BC2', th: TR('ฝึกและทำนาย') },
    metric: { colour: '#B04A2F', th: TR('วัดผล') },
    viz: { colour: '#7A5C1F', th: TR('กราฟ') },
    pybasic: { colour: '#546273', th: TR('Python พื้นฐาน') },
  };

  /* ---------------- Python string / value literals ---------------- */
  Py.str = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  Py.num = (v) => {
    if (typeof v === 'string') v = Number(v);
    if (!Number.isFinite(v)) return 'None';
    return PB.floatRepr(v).replace(/\.0$/, Number.isInteger(v) ? '' : '.0');
  };
  Py.float = (v) => PB.floatRepr(Number(v));
  Py.list = (items) => '[' + items.map(Py.str).join(', ') + ']';

  /* ---------------- import registry (reset for every code generation) ---------------- */
  Py.reset = () => { Py.imports = new Map(); Py.modules = new Set(); Py.helpers = new Map(); };
  Py.reset();
  Py.need = (mod, name) => {
    if (!name) { Py.modules.add(mod); return; }
    if (!Py.imports.has(mod)) Py.imports.set(mod, new Set());
    Py.imports.get(mod).add(name);
  };
  Py.helper = (key, code, deps) => { if (deps) deps.forEach(([m, n]) => Py.need(m, n)); if (!Py.helpers.has(key)) Py.helpers.set(key, code); };
  const MOD_ORDER = ['import numpy as np', 'import pandas as pd', 'import matplotlib.pyplot as plt', 'import seaborn as sns'];
  Py.importLines = () => {
    const out = [];
    const std = Array.from(Py.modules).filter((m) => !MOD_ORDER.includes(m)).sort();
    std.forEach((m) => out.push(m));
    if (std.length) out.push('');
    MOD_ORDER.forEach((m) => { if (Py.modules.has(m)) out.push(m); });
    const mods = Array.from(Py.imports.keys()).sort();
    for (const m of mods) out.push(`from ${m} import ${Array.from(Py.imports.get(m)).sort().join(', ')}`);
    return out;
  };

  /* ---------------- custom fields ---------------- */
  function sourceVarName(field, ofName) {
    const b = field.getSourceBlock && field.getSourceBlock();
    if (!b || !ofName) return null;
    const f = b.getField(ofName);
    if (!f) return null;
    const v = f.getVariable ? f.getVariable() : null;
    return v ? (v.getName ? v.getName() : v.name) : null;
  }
  function buildPicker(field, items, { multi, current, onPick, emptyText, typeOwn, title, note }) {
    /* Blockly 13: clearContent() replaces the dropdown's elements, so the content div is fetched afterwards */
    Blockly.DropDownDiv.clearContent();
    const div = Blockly.DropDownDiv.getContentDiv();
    const wrap = document.createElement('div');
    wrap.className = 'pb-picker';
    if (title) { const t = document.createElement('div'); t.className = 'pb-picker-title'; t.textContent = title; wrap.appendChild(t); }
    if (note) { const t = document.createElement('div'); t.className = 'pb-picker-note'; t.textContent = note; wrap.appendChild(t); }
    const sel = new Set(multi ? current : [current]);
    if (!items.length) { const p = document.createElement('div'); p.className = 'pb-picker-empty'; p.textContent = emptyText; wrap.appendChild(p); }
    const list = document.createElement('div'); list.className = 'pb-picker-list';
    const names = items.map((x) => (typeof x === 'string' ? x : x.name)), boxes = [];
    const emit = () => onPick(names.filter((x) => sel.has(x)), false);
    items.forEach((it) => {
      const name = typeof it === 'string' ? it : it.name, hint = typeof it === 'string' ? '' : it.hint || '';
      const btn = document.createElement(multi ? 'label' : 'button');
      btn.className = 'pb-picker-item' + (sel.has(name) ? ' is-on' : '');
      if (multi) {
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.has(name);
        cb.addEventListener('change', () => { if (cb.checked) sel.add(name); else sel.delete(name); btn.classList.toggle('is-on', cb.checked); emit(); });
        btn.appendChild(cb); boxes.push([cb, btn, name]);
      } else {
        btn.type = 'button';
        btn.addEventListener('click', () => { onPick(name, true); });
      }
      const t = document.createElement('span'); t.className = 'pb-picker-name'; t.textContent = name; btn.appendChild(t);
      if (hint) { const h = document.createElement('span'); h.className = 'pb-picker-hint'; h.textContent = hint; btn.appendChild(h); }
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    const foot = document.createElement('div'); foot.className = 'pb-picker-foot';
    if (multi && items.length > 1) {
      /* one tap for every column, or none */
      const all = document.createElement('button'); all.type = 'button'; all.className = 'pb-picker-link pb-picker-all';
      const label = () => { all.textContent = boxes.every(([cb]) => cb.checked) ? TR('ไม่เลือกทั้งหมด') : TR('เลือกทั้งหมด'); };
      all.addEventListener('click', () => { const on = !boxes.every(([cb]) => cb.checked); boxes.forEach(([cb, btn, name]) => { cb.checked = on; btn.classList.toggle('is-on', on); if (on) sel.add(name); else sel.delete(name); }); label(); emit(); });
      boxes.forEach(([cb]) => cb.addEventListener('change', label)); label();
      foot.appendChild(all);
    }
    if (typeOwn) { const own = document.createElement('button'); own.type = 'button'; own.className = 'pb-picker-link'; own.textContent = TR('พิมพ์ชื่อเอง'); own.addEventListener('click', () => { Blockly.DropDownDiv.hideWithoutAnimation(); typeOwn(); }); foot.appendChild(own); }
    if (multi) { const done = document.createElement('button'); done.type = 'button'; done.className = 'pb-picker-done'; done.textContent = TR('เสร็จ'); done.addEventListener('click', () => Blockly.DropDownDiv.hideIfOwner(field)); foot.appendChild(done); }
    if (foot.childNodes.length) wrap.appendChild(foot);
    div.appendChild(wrap);
    Blockly.DropDownDiv.setColour(getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fff', getComputedStyle(document.documentElement).getPropertyValue('--line').trim() || '#ccc');
    Blockly.DropDownDiv.showPositionedByField(field);
  }
  class FieldColumn extends Blockly.FieldTextInput {
    constructor(value, opts = {}) { super(value || ''); this.of_ = opts.of || null; this.multi_ = !!opts.multi; this.placeholder_ = opts.placeholder || (this.multi_ ? TR('เลือกคอลัมน์') : TR('คอลัมน์')); }
    static fromJson(o) { return new this(o.text, { of: o.of, multi: o.multi, placeholder: o.placeholder }); }
    getText_() { const v = this.getValue(); return v ? (this.multi_ ? v.split(',').map((s) => s.trim()).filter(Boolean).join(', ') : v) : this.placeholder_; }
    showEditor_(e) {
      const varName = sourceVarName(this, this.of_), block = this.getSourceBlock();
      /* the columns this table has at this point of the program, worked out from the blocks (no run needed) */
      const info = PB.schema && varName ? PB.schema.columns(block, varName) : null;
      const cols = info && info.cols.length ? info.cols.map(({ name, hint }) => ({ name, hint })) : (PB.ui && PB.ui.columnsFor) ? PB.ui.columnsFor(varName, block) : [];
      if (!cols.length) return super.showEditor_(e);
      const cur = this.multi_ ? (this.getValue() || '').split(',').map((s) => s.trim()).filter(Boolean) : this.getValue();
      const known = new Set(cols.map((c) => c.name));
      const missing = (this.multi_ ? cur : cur ? [cur] : []).filter((c) => !known.has(c));
      const title = info ? TR`คอลัมน์ของ ${varName}${info.src ? ' · ' + info.src : ''}${info.from === 'run' ? TR(' · จากการรันล่าสุด') : ''}` : TR('คอลัมน์ที่รู้จัก');
      buildPicker(this, cols, {
        multi: this.multi_, current: cur, emptyText: TR('ยังไม่รู้จักคอลัมน์ — กดรันก่อน'), title,
        note: missing.length ? TR`ไม่พบ ${missing.join(', ')} ใน ${varName || TR('ตารางนี้')}` : '',
        onPick: (v, close) => { this.setValue(this.multi_ ? v.join(', ') : v); if (close) Blockly.DropDownDiv.hideIfOwner(this); },
        typeOwn: () => super.showEditor_(e),
      });
    }
  }
  /* a variable menu that marks which variables hold tables (and, for table fields, lists them first) */
  class FieldPbVar extends Blockly.FieldVariable {
    constructor(name, validator, types, defType, config) {
      super(name, validator, types, defType, config);
      this.menuGenerator_ = FieldPbVar.menu;
    }
    static fromJson(o) { const f = new this(Blockly.utils.parsing.replaceMessageReferences(o.variable), undefined, undefined, undefined, o); f.tables_ = !!o.tables; return f; }
    showEditor_(e) { this.menuOpen_ = true; try { super.showEditor_(e); } finally { this.menuOpen_ = false; } }
    static menu() {
      const opts = Blockly.FieldVariable.dropdownCreate.call(this);
      /* labels are worked out only while the menu opens (option lists are also built while blocks load) */
      if (!this.menuOpen_ || !PB.schema || !PB.ui || !PB.ui.ws) return opts;
      let tables;
      try { tables = PB.schema.tablesAt(this.getSourceBlock()); } catch (err) { return opts; }
      if (!tables.size) return opts;
      const ws = this.getSourceBlock().workspace;
      const nameOf = (id) => { const v = ws.getVariableMap ? ws.getVariableMap().getVariableById(id) : ws.getVariableById(id); return v ? v.getName() : null; };
      const vars = [], acts = [];
      for (const o of opts) (/_VARIABLE_ID$/.test(o[1]) ? acts : vars).push(o);
      const label = (o) => { const t = tables.get(nameOf(o[1])); return t ? [TR`${o[0]}  · ตาราง ${t.cols.length} คอลัมน์${t.src ? ' (' + t.src + ')' : ''}`, o[1]] : o; };
      if (!this.tables_) return vars.map(label).concat(acts);
      const isT = (o) => tables.has(nameOf(o[1]));
      const first = vars.filter(isT).map(label), rest = vars.filter((o) => !isT(o));
      return first.concat(first.length && rest.length ? [Blockly.FieldDropdown.SEPARATOR || 'separator'] : [], rest, acts);
    }
  }
  class FieldFile extends Blockly.FieldTextInput {
    constructor(value) { super(value || ''); }
    static fromJson(o) { return new this(o.text); }
    getText_() { return this.getValue() || TR('เลือกไฟล์…'); }
    showEditor_(e) {
      const files = (PB.ui && PB.ui.uploadedFiles) ? PB.ui.uploadedFiles() : [];
      const items = files.map((f) => ({ name: f.name, hint: f.rows + TR(' แถว') }));
      buildPicker(this, items, {
        multi: false, current: this.getValue(), emptyText: TR('ยังไม่มีไฟล์ที่อัปโหลด'),
        onPick: (v) => { this.setValue(v); Blockly.DropDownDiv.hideIfOwner(this); },
        typeOwn: null,
      });
      const div = Blockly.DropDownDiv.getContentDiv();
      const up = document.createElement('button'); up.type = 'button'; up.className = 'pb-picker-upload'; up.textContent = TR('อัปโหลดไฟล์ใหม่ (.csv .xlsx .json)');
      up.addEventListener('click', () => { Blockly.DropDownDiv.hideWithoutAnimation(); if (PB.ui && PB.ui.pickFile) PB.ui.pickFile((name) => this.setValue(name)); });
      div.firstChild.prepend(up);
    }
  }
  /* ---------- value pickers (version 3.8) ----------
     The number / text block in the value slots of "แทนค่า" (old and new value), "กรองแถว" and "เติมค่าว่างด้วยค่า"
     lists the values the chosen column holds at that point of the program (with how many rows each), so values
     are picked rather than typed; typing stays possible. A pick of another kind (text for a number slot) swaps the
     block for the right kind, so the Python code compares like with like. */
  const VALUE_SLOTS = { pb_replace_val: ['OLD', 'NEW'], pb_filter: ['VAL'], pb_fill_value: ['VAL'] };
  const MAX_VALUES = 60;
  function valueSlot(field) {
    const b = field.getSourceBlock && field.getSourceBlock();
    if (!b || b.isInFlyout || !((b.type === 'text' && field.name === 'TEXT') || (b.type === 'math_number' && field.name === 'NUM'))) return null;
    const parent = b.getParent(), slots = parent && VALUE_SLOTS[parent.type];
    if (!slots) return null;
    const input = parent.getInputWithBlock(b);
    if (!input || !slots.includes(input.name)) return null;
    if (parent.type === 'pb_filter' && ['isnull', 'notnull'].includes(parent.getFieldValue('OP'))) return null;
    const col = parent.getFieldValue('COL'), df = sourceVarName(parent.getField('COL') || field, 'DF');
    return col && df ? { parent, input: input.name, col, df } : null;
  }
  function putValue(slot, v) {
    const conn = slot.parent.getInput(slot.input).connection, cur = conn.targetBlock(), ws = slot.parent.workspace;
    const type = typeof v === 'number' ? 'math_number' : typeof v === 'boolean' ? 'logic_boolean' : 'text';
    const field = { math_number: 'NUM', logic_boolean: 'BOOL', text: 'TEXT' }[type];
    const val = type === 'math_number' ? PB.numStr(v) : type === 'logic_boolean' ? (v ? 'TRUE' : 'FALSE') : String(v);
    Blockly.Events.setGroup(true);
    try {
      if (cur && cur.type === type) cur.setFieldValue(val, field);
      else {
        /* a block of the other kind goes over the shadow (one undo takes it away and the shadow is back) */
        if (cur && !cur.isShadow()) cur.dispose(false);
        const nb = Blockly.serialization.blocks.append({ type, fields: { [field]: val } }, ws);
        conn.connect(nb.outputConnection);
      }
    } finally { Blockly.Events.setGroup(false); }
  }
  function showValuePicker(field, slot, typeOwn) {
    const info = PB.schema && PB.schema.valuesAt ? PB.schema.valuesAt(slot.parent, slot.df, slot.col) : null;
    if (!info || !info.items.length) return false;
    const shown = info.items.slice(0, MAX_VALUES), byLabel = new Map(shown.map((it) => [it.label, it.value]));
    const where = info.from === 'here' ? TR(' · ณ จุดนี้ของโปรแกรม') : info.from === 'run' ? TR(' · จากการรันล่าสุด') : TR` · จากข้อมูลต้นทาง${info.src ? ' ' + info.src : ''}`;
    const notes = [];
    if (info.items.length > MAX_VALUES) notes.push(TR`แสดง ${MAX_VALUES} ค่าที่พบบ่อยที่สุด จาก ${info.items.length} ค่า`);
    if (info.missing) notes.push(TR`ค่าว่าง ${info.missing} แถว`);
    buildPicker(field, shown.map((it) => ({ name: it.label, hint: TR`${it.n} แถว` })), {
      multi: false, current: byLabel.has(field.getText()) ? field.getText() : '', emptyText: '',
      title: TR`ค่าในคอลัมน์ ${slot.col} ของ ${slot.df}${where}`, note: notes.join(' · '),
      onPick: (label) => { Blockly.DropDownDiv.hideIfOwner(field); putValue(slot, byLabel.get(label)); },
      typeOwn,
    });
    const own = Blockly.DropDownDiv.getContentDiv().querySelector('.pb-picker-link');
    if (own) own.textContent = TR('พิมพ์ค่าเอง');
    return true;
  }
  /* FieldTextInput and FieldNumber share the parent class that opens the text editor */
  const FieldInputProto = Object.getPrototypeOf(Blockly.FieldTextInput.prototype);
  const openEditor = FieldInputProto.showEditor_;
  FieldInputProto.showEditor_ = function (e, quiet) {
    const slot = this instanceof FieldColumn || this instanceof FieldFile ? null : valueSlot(this);
    if (slot && !quiet) {
      let shown = false;
      try { shown = showValuePicker(this, slot, () => openEditor.call(this, e, quiet)); } catch (err) { shown = false; }
      if (shown) return;
    }
    return openEditor.call(this, e, quiet);
  };
  BK.valueSlot = valueSlot;

  Blockly.fieldRegistry.register('field_pbcol', FieldColumn);
  Blockly.fieldRegistry.register('field_pbvar', FieldPbVar);
  Blockly.fieldRegistry.register('field_pbfile', FieldFile);
  BK.FieldColumn = FieldColumn; BK.FieldFile = FieldFile; BK.FieldPbVar = FieldPbVar;

  /* Keep Thai (and other Unicode) variable names as-is in Python output. */
  const origSafe = Blockly.Names.prototype.safeName;
  Blockly.Names.prototype.safeName = function (name) {
    if (name && /^[\p{L}_][\p{L}\p{N}\p{Mn}\p{Mc}_]*$/u.test(name)) return name;
    return origSafe.call(this, name);
  };

  /* ---------------- DSL ---------------- */
  /* f specs: {t:'var',def} {t:'num',def,min,max,prec} {t:'dd',opts} {t:'text',def} {t:'col',of} {t:'cols',of} {t:'file'} {t:'in'} */
  function fieldJson(name, s) {
    switch (s.t) {
      case 'var': return { type: 'field_pbvar', name, variable: s.def, tables: s.def === 'df' };
      case 'num': { const o = { type: 'field_number', name, value: s.def }; if (s.min !== undefined) o.min = s.min; if (s.max !== undefined) o.max = s.max; if (s.prec !== undefined) o.precision = s.prec; return o; }
      case 'dd': return { type: 'field_dropdown', name, options: typeof s.opts === 'function' ? s.opts() : s.opts };
      case 'text': return { type: 'field_input', name, text: s.def ?? '', spellcheck: false };
      case 'col': return { type: 'field_pbcol', name, text: s.def || '', of: s.of || 'DF' };
      case 'cols': return { type: 'field_pbcol', name, text: s.def || '', of: s.of || 'DF', multi: true };
      case 'file': return { type: 'field_pbfile', name, text: s.def || '' };
      case 'in': return { type: 'input_value', name, check: s.check || null };
      case 'stmt': return { type: 'input_statement', name };
      case 'label': return { type: 'field_label_serializable', name, text: s.def || '', class: 'pb-py' };
      default: throw new Error('field type ' + s.t);
    }
  }
  function toJson(spec) {
    const json = { type: spec.type, style: 'pb_' + spec.cat, tooltip: spec.tip || '', inputsInline: true, helpUrl: '' };
    if (spec.out) json.output = null; else { json.previousStatement = null; json.nextStatement = null; }
    let message = '', args = [];
    const push = (a) => { args.push(a); message += ' %' + args.length; };
    if (spec.th) { push({ type: 'field_label', text: spec.th, class: 'pb-th' }); if (spec.thBreak) push({ type: 'input_end_row', name: '_TH' }); }
    const lines = spec.py.split('\n');
    lines.forEach((line, li) => {
      const re = /\{(@?)([A-Z0-9_]+)\}/g; let last = 0, m;
      while ((m = re.exec(line))) {
        const lit = line.slice(last, m.index);
        if (lit.trim()) push({ type: 'field_label', text: lit.trim(), class: 'pb-py' });
        const fs = spec.f[m[2]] || (m[1] ? { t: 'in' } : null);
        if (!fs) throw new Error(spec.type + ': no field ' + m[2]);
        push(fieldJson(m[2], m[1] ? Object.assign({ t: 'in' }, fs) : fs));
        last = re.lastIndex;
      }
      const tail = line.slice(last);
      if (tail.trim()) push({ type: 'field_label', text: tail.trim(), class: 'pb-py' });
      if (li < lines.length - 1) push({ type: 'input_end_row', name: '_ROW' + li });
    });
    if (spec.stmt) { push({ type: 'input_end_row', name: '_ROWS' }); push({ type: 'input_statement', name: spec.stmt }); }
    json.message0 = message.trim();
    json.args0 = args;
    return json;
  }
  BK.def = (type, spec) => {
    spec.type = type;
    BK.defs[type] = spec;
    BK.order.push(type);
  };
  BK.install = () => {
    for (const type of BK.order) {
      const spec = BK.defs[type];
      const json = toJson(spec);
      Blockly.Blocks[type] = {
        init() {
          this.jsonInit(json);
          if (spec.init) spec.init.call(this);
        },
        onchange: spec.onchange || undefined,
      };
      python.pythonGenerator.forBlock[type] = function (block, generator) {
        const r = spec.gen(block, G(generator));
        if (spec.out) return Array.isArray(r) ? r : [r, python.Order.FUNCTION_CALL];
        return r.endsWith('\n') ? r : r + '\n';
      };
    }
  };

  /* ---------------- generator helper bound to a block ---------------- */
  const G = (gen) => ({
    gen,
    v: (b, name) => gen.getVariableName(b.getFieldValue(name)),
    f: (b, name) => b.getFieldValue(name),
    in: (b, name, order = python.Order.NONE, dflt = 'None') => gen.valueToCode(b, name, order) || dflt,
    stmt: (b, name) => gen.statementToCode(b, name) || gen.INDENT + 'pass\n',
    cols: (b, name) => BK.splitCols(b.getFieldValue(name)),
    col: (b, name) => Py.str(b.getFieldValue(name) || ''),
    need: Py.need, helper: Py.helper, str: Py.str, num: Py.num,
  });
  BK.splitCols = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  BK.G = G;
})();
