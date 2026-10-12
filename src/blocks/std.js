/* ThaiPyBlocks: Thai labels for standard blocks, Python generator customisation, and the
   step-by-step explanation ("แปลคำสั่ง") engine. */
(function () {
  const BK = PB.blocks, Py = PB.py, gen = python.pythonGenerator;

  /* ---------- clearer Thai labels with Python hints for Blockly's built-in blocks ---------- */
  PB.applyMessages = () => Object.assign(Blockly.Msg, PB.i18n.lang === 'en' && window.PB_MSG_EN ? window.PB_MSG_EN : {}, {
    VARIABLES_SET: TR('ตั้ง %1 = %2'), VARIABLES_SET_CREATE_GET: TR('สร้างบล็อก "อ่านค่า %1"'), VARIABLES_GET_CREATE_SET: TR('สร้างบล็อก "ตั้งค่า %1"'),
    NEW_VARIABLE: TR('สร้างตัวแปร…'), NEW_VARIABLE_TITLE: TR('ชื่อตัวแปรใหม่:'), RENAME_VARIABLE: TR('เปลี่ยนชื่อตัวแปร…'), RENAME_VARIABLE_TITLE: TR('เปลี่ยนชื่อตัวแปร "%1" ทุกจุดเป็น:'),
    DELETE_VARIABLE: TR('ลบตัวแปร "%1"'), DELETE_VARIABLE_CONFIRMATION: TR('ลบตัวแปร "%2" ที่ใช้อยู่ %1 จุดหรือไม่?'), VARIABLE_ALREADY_EXISTS: TR('มีตัวแปรชื่อ "%1" อยู่แล้ว'),
    MATH_CHANGE_TITLE: TR('เพิ่มค่า %1 += %2'), TEXT_PRINT_TITLE: 'print( %1 )', TEXT_APPEND_TITLE: TR('ต่อท้าย %1 += ข้อความ %2'), TEXT_JOIN_TITLE_CREATEWITH: TR('ต่อข้อความ'),
    LISTS_CREATE_WITH_INPUT_WITH: TR('ลิสต์ [ ]'), LISTS_CREATE_EMPTY_TITLE: TR('ลิสต์ว่าง [ ]'), LISTS_CREATE_WITH_CONTAINER_TITLE_ADD: TR('ลิสต์'), LISTS_INLIST: TR('ในลิสต์'),
    LISTS_REPEAT_TITLE: TR('ลิสต์ที่มี %1 ซ้ำ %2 ครั้ง'), LISTS_LENGTH_TITLE: 'len( %1 )', LISTS_ISEMPTY_TITLE: TR('%1 ว่างเปล่า'),
    LISTS_SPLIT_LIST_FROM_TEXT: TR('แยกข้อความเป็นลิสต์'), LISTS_SPLIT_TEXT_FROM_LIST: TR('รวมลิสต์เป็นข้อความ'), LISTS_SORT_TITLE: TR('เรียงลำดับ %1 %2 %3'), LISTS_SORT_TYPE_TEXT: TR('ข้อความ'), LISTS_SORT_TYPE_IGNORECASE: TR('ข้อความ (ไม่สนตัวพิมพ์)'),
    CONTROLS_FOREACH_TITLE: TR('for %1 in ลิสต์ %2'), CONTROLS_FOR_TITLE: TR('นับ %1 จาก %2 ถึง %3 ทีละ %4'), CONTROLS_REPEAT_TITLE: TR('ทำซ้ำ %1 ครั้ง'),
    CONTROLS_WHILEUNTIL_OPERATOR_WHILE: TR('while ทำซ้ำขณะที่'), CONTROLS_WHILEUNTIL_OPERATOR_UNTIL: TR('ทำซ้ำจนกว่า'), CONTROLS_IF_MSG_IF: TR('if ถ้า'), CONTROLS_IF_MSG_ELSEIF: TR('elif ถ้าไม่ใช่ แต่'), CONTROLS_IF_MSG_ELSE: TR('else นอกนั้น'),
    CONTROLS_FLOW_STATEMENTS_OPERATOR_BREAK: TR('break หยุดลูป'), CONTROLS_FLOW_STATEMENTS_OPERATOR_CONTINUE: TR('continue ข้ามไปรอบถัดไป'),
    LOGIC_BOOLEAN_TRUE: 'True', LOGIC_BOOLEAN_FALSE: 'False', LOGIC_NULL: 'None', LOGIC_OPERATION_AND: 'and', LOGIC_OPERATION_OR: 'or', LOGIC_NEGATE_TITLE: 'not %1',
    LOGIC_TERNARY_CONDITION: TR('ถ้า'), LOGIC_TERNARY_IF_TRUE: TR('ได้'), LOGIC_TERNARY_IF_FALSE: TR('ไม่เช่นนั้น'),
    MATH_POWER_SYMBOL: '**', MATH_DIVISION_SYMBOL: '/', MATH_MULTIPLICATION_SYMBOL: '*',
    MATH_RANDOM_INT_TITLE: TR('สุ่มจำนวนเต็ม %1 ถึง %2'), MATH_RANDOM_FLOAT_TITLE_RANDOM: TR('สุ่มทศนิยม 0–1'), MATH_MODULO_TITLE: TR('เศษของ %1 % %2'),
    MATH_ONLIST_OPERATOR_SUM: TR('ผลรวม sum'), MATH_ONLIST_OPERATOR_AVERAGE: TR('ค่าเฉลี่ย'), MATH_ONLIST_OPERATOR_MIN: TR('ค่าน้อยสุด min'), MATH_ONLIST_OPERATOR_MAX: TR('ค่ามากสุด max'), MATH_ONLIST_OPERATOR_MEDIAN: TR('มัธยฐาน'), MATH_ONLIST_OPERATOR_MODE: TR('ฐานนิยม'), MATH_ONLIST_OPERATOR_STD_DEV: TR('ส่วนเบี่ยงเบนมาตรฐาน'), MATH_ONLIST_OPERATOR_RANDOM: TR('สุ่มสมาชิก'),
    PROCEDURES_DEFNORETURN_TITLE: TR('def ฟังก์ชัน'), PROCEDURES_DEFRETURN_TITLE: TR('def ฟังก์ชัน'), PROCEDURES_DEFNORETURN_PROCEDURE: TR('ทำงาน'), PROCEDURES_DEFRETURN_PROCEDURE: TR('คำนวณ'), PROCEDURES_DEFRETURN_RETURN: TR('return คืนค่า'),
    PROCEDURES_BEFORE_PARAMS: TR('รับค่า:'), PROCEDURES_CALL_BEFORE_PARAMS: TR('ส่งค่า:'), PROCEDURES_MUTATORCONTAINER_TITLE: TR('พารามิเตอร์'), PROCEDURES_MUTATORARG_TITLE: TR('ชื่อพารามิเตอร์:'), PROCEDURES_CREATE_DO: TR('สร้างบล็อกเรียก "%1"'),
    PROCEDURES_DEFNORETURN_COMMENT: TR('อธิบายฟังก์ชันนี้…'), PROCEDURES_IFRETURN_WARNING: TR('ใช้บล็อกนี้ได้เฉพาะในฟังก์ชัน'),
    DELETE_BLOCK: TR('ลบบล็อก'), DELETE_X_BLOCKS: TR('ลบ %1 บล็อก'), DELETE_ALL_BLOCKS: TR('ลบบล็อกทั้งหมด %1 บล็อกหรือไม่?'), DUPLICATE_BLOCK: TR('ทำซ้ำบล็อก'), CLEAN_UP: TR('จัดเรียงบล็อก'),
    COLLAPSE_BLOCK: TR('ย่อบล็อก'), EXPAND_BLOCK: TR('ขยายบล็อก'), COLLAPSE_ALL: TR('ย่อทั้งหมด'), EXPAND_ALL: TR('ขยายทั้งหมด'), DISABLE_BLOCK: TR('ปิดการทำงานบล็อก'), ENABLE_BLOCK: TR('เปิดการทำงานบล็อก'),
    INLINE_INPUTS: TR('จัดช่องในบรรทัดเดียว'), EXTERNAL_INPUTS: TR('จัดช่องแยกบรรทัด'), UNDO: TR('ย้อนกลับ'), REDO: TR('ทำซ้ำ'), HELP: TR('ช่วยเหลือ'),
  });

  /* ---------- Python generator customisation ---------- */
  gen.forBlock.math_change = function (block, g) {
    const v = g.getVariableName(block.getFieldValue('VAR'));
    return `${v} += ${g.valueToCode(block, 'DELTA', python.Order.ADDITIVE) || '0'}\n`;
  };
  const origPrint = gen.forBlock.text_print;
  gen.forBlock.text_print = function (block, g) {
    const t = block.getInputTargetBlock('TEXT');
    if (t && t.type === 'pb_df_info' && t.getFieldValue('FN') === 'info') return `${g.getVariableName(t.getFieldValue('DF'))}.info()\n`;
    return origPrint.call(this, block, g);
  };
  const origInit = gen.init;
  gen.init = function (ws) { origInit.call(this, ws); Py.reset(); delete this.definitions_.variables; };
  const origFinish = gen.finish;
  gen.finish = function (code) {
    delete this.definitions_.variables;
    for (const k of Object.keys(this.definitions_)) {
      const v = this.definitions_[k];
      if (/^(from\s+\S+\s+)?import\s+\S+/.test(v)) {
        v.split('\n').forEach((line) => { const m = line.match(/^from\s+(\S+)\s+import\s+(.+)$/); if (m) m[2].split(',').forEach((n) => Py.need(m[1], n.trim())); else if (line.trim()) Py.need(line.trim()); });
        delete this.definitions_[k];
      }
    }
    let body = origFinish.call(this, code).replace(/^\n+/, '');
    const imports = Py.importLines();
    const helpers = Array.from(Py.helpers.values());
    let head = '';
    if (imports.length) head += imports.join('\n') + '\n\n';
    if (helpers.length) head += '\n' + helpers.join('\n\n\n') + '\n\n\n';
    return (head + body).replace(/\n{4,}/g, '\n\n\n');
  };
  gen.scrubNakedValue = function (line) { return TR('# (บล็อกค่าที่ยังไม่ได้ต่อ) ') + line + '\n'; };
  const origScrub = gen.scrub_;
  gen.scrub_ = function (block, code, thisOnly) {
    if (Py.commentLang && Py.commentLang !== 'none' && !block.outputConnection && typeof code === 'string' && !/^procedures_def/.test(block.type) && block.type !== 'pb_comment') {
      const txt = PB.explain.sentence(block, Py.commentLang);
      if (txt) {
        const c = '# ' + txt.replace(/\s*\n\s*/g, ' ') + '\n';
        if (code.startsWith('##BLOCK')) { const nl = code.indexOf('\n'); code = code.slice(0, nl + 1) + c + code.slice(nl + 1); } else code = c + code;
      }
    }
    return origScrub.call(this, block, code, thisOnly);
  };
  gen.INDENT = '    ';
  gen.quote_ = (s) => Py.str(s);

  /* Generate code + a line → block map.  opts: {comments: 'none'|'th'|'en'} */
  PB.genPython = (ws, opts = {}) => {
    Py.commentLang = opts.comments || 'none';
    gen.STATEMENT_PREFIX = '##BLOCK %1\n';
    let raw;
    Py.generating = true;
    try { raw = gen.workspaceToCode(ws); } finally { gen.STATEMENT_PREFIX = null; Py.commentLang = 'none'; Py.generating = false; }
    const lines = raw.split('\n'), out = [], map = [];
    let cur = null;
    for (const ln of lines) {
      const m = ln.match(/^\s*##BLOCK '((?:[^'\\]|\\.)*)'\s*$/);
      if (m) { cur = m[1].replace(/\\(.)/g, '$1'); continue; }
      out.push(ln); map.push(ln.trim() ? cur : null);
    }
    while (out.length && !out[out.length - 1].trim()) { out.pop(); map.pop(); }
    return { code: out.join('\n') + '\n', map };
  };
  PB.blockPython = (block) => {
    if (Py.generating) return '';
    const ws = block.workspace;
    gen.init(ws);
    let c;
    try {
      c = gen.blockToCode(block, true);
      if (Array.isArray(c)) c = c[0];
    } catch (e) { c = ''; }
    gen.finish('');
    return String(c || '').replace(/^#.*\n/gm, '').trim();
  };

  /* ---------- explanation engine ---------- */
  const OPS_TH = { EQ: 'เท่ากับ', NEQ: 'ไม่เท่ากับ', LT: 'น้อยกว่า', LTE: 'น้อยกว่าหรือเท่ากับ', GT: 'มากกว่า', GTE: 'มากกว่าหรือเท่ากับ' }; /* th-en */
  const OPS_EN = { EQ: 'equals', NEQ: 'is not equal to', LT: 'is less than', LTE: 'is at most', GT: 'is greater than', GTE: 'is at least' };
  const AR = { ADD: '+', MINUS: '-', MULTIPLY: '×', DIVIDE: '÷', POWER: '^' };
  const ONLIST_TH = { SUM: 'ผลรวม', MIN: 'ค่าน้อยสุด', MAX: 'ค่ามากสุด', AVERAGE: 'ค่าเฉลี่ย', MEDIAN: 'มัธยฐาน', MODE: 'ฐานนิยม', STD_DEV: 'ส่วนเบี่ยงเบนมาตรฐาน', RANDOM: 'สมาชิกแบบสุ่ม' }; /* th-en */
  function ctx(lang) {
    const X = {
      lang,
      t: (th, en) => (lang === 'en' ? en : th),
      f: (b, n) => { const v = b.getFieldValue(n); return v === null || v === undefined ? '' : String(v); },
      v: (b, n) => { const f = b.getField(n); const vv = f && f.getVariable ? f.getVariable() : null; return vv ? (vv.getName ? vv.getName() : vv.name) : String(b.getFieldValue(n)); },
      in: (b, n) => { const t = b.getInputTargetBlock(n); return t ? ' ' + describe(t, lang) : X.t(' (ช่องว่าง)', ' (empty)'); },
    };
    return X;
  }
  function describe(b, lang = 'th') {
    const X = ctx(lang), T = X.t;
    const spec = BK.defs[b.type];
    if (spec && spec.ex) return spec.ex(b, X).trim();
    const d = (n) => X.in(b, n).trim();
    switch (b.type) {
      case 'variables_get': return T(`ตัวแปร ${X.v(b, 'VAR')}`, `variable ${X.v(b, 'VAR')}`);
      case 'math_number': return X.f(b, 'NUM');
      case 'text': return `"${X.f(b, 'TEXT')}"`;
      case 'logic_boolean': return X.f(b, 'BOOL') === 'TRUE' ? 'True' : 'False';
      case 'logic_null': return 'None';
      case 'math_arithmetic': return `${d('A')} ${AR[X.f(b, 'OP')]} ${d('B')}`;
      case 'logic_compare': return T(`${d('A')} ${OPS_TH[X.f(b, 'OP')]} ${d('B')}`, `${d('A')} ${OPS_EN[X.f(b, 'OP')]} ${d('B')}`);
      case 'logic_operation': return `${d('A')} ${T(X.f(b, 'OP') === 'AND' ? 'และ' : 'หรือ', X.f(b, 'OP') === 'AND' ? 'and' : 'or')} ${d('B')}`;
      case 'logic_negate': return T(`ไม่ใช่ (${d('BOOL')})`, `not (${d('BOOL')})`);
      case 'logic_ternary': return T(`${d('THEN')} ถ้า ${d('IF')} ไม่เช่นนั้น ${d('ELSE')}`, `${d('THEN')} if ${d('IF')} else ${d('ELSE')}`);
      case 'text_join': { const parts = []; for (let i = 0; b.getInput('ADD' + i); i++) parts.push(d('ADD' + i)); return T(`ข้อความที่ต่อจาก ${parts.join(', ')}`, `the text joined from ${parts.join(', ')}`); }
      case 'lists_create_with': { const parts = []; for (let i = 0; b.getInput('ADD' + i); i++) parts.push(d('ADD' + i)); return T(`ลิสต์ [${parts.join(', ')}]`, `the list [${parts.join(', ')}]`); }
      case 'lists_create_empty': return T('ลิสต์ว่าง', 'an empty list');
      case 'math_on_list': return T(`${ONLIST_TH[X.f(b, 'OP')]}ของ ${d('LIST')}`, `the ${X.f(b, 'OP').toLowerCase()} of ${d('LIST')}`);
      case 'text_length': case 'lists_length': return T(`ความยาวของ ${d('VALUE')}`, `the length of ${d('VALUE')}`);
      case 'math_round': return T(`${d('NUM')} ที่ปัดเศษ`, `${d('NUM')} rounded`);
      case 'math_single': return T(`${{ ROOT: 'รากที่สองของ', ABS: 'ค่าสัมบูรณ์ของ', NEG: 'ค่าติดลบของ', LN: 'ln ของ', LOG10: 'log10 ของ', EXP: 'e ยกกำลัง', POW10: '10 ยกกำลัง' }[X.f(b, 'OP')]} ${d('NUM')}`, `${X.f(b, 'OP').toLowerCase()} of ${d('NUM')}`);
      case 'math_random_int': return T(`จำนวนเต็มสุ่มระหว่าง ${d('FROM')} ถึง ${d('TO')}`, `a random integer from ${d('FROM')} to ${d('TO')}`);
      case 'lists_getIndex': return T(`สมาชิกของ ${d('VALUE')}`, `an item of ${d('VALUE')}`);
      case 'procedures_callreturn': return T(`ผลจากฟังก์ชัน ${X.f(b, 'NAME')}`, `the result of ${X.f(b, 'NAME')}()`);
      default: { const c = PB.blockPython(b); return c ? '`' + c + '`' : b.type; }
    }
  }
  function sentence(b, lang = 'th') {
    const X = ctx(lang), T = X.t;
    const spec = BK.defs[b.type];
    const d = (n) => X.in(b, n).trim();
    if (spec && spec.ex) {
      const s = spec.ex(b, X).trim();
      return spec.out ? T(`คำนวณ ${s}`, `compute ${s}`) : s;
    }
    switch (b.type) {
      case 'variables_set': {
        const t = b.getInputTargetBlock('VALUE');
        const dsc = t ? describe(t, lang) : T('ค่าว่าง', 'nothing');
        return T(`เก็บ${/^[\u0E00-\u0E7F]/.test(dsc) ? '' : ' '}${dsc} ไว้ในตัวแปร ${X.v(b, 'VAR')}`, `store ${dsc} in ${X.v(b, 'VAR')}`);
      }
      case 'text_print': return T(`แสดงผล ${d('TEXT')}`, `print ${d('TEXT')}`);
      case 'controls_if': { let s = T(`ถ้า ${d('IF0')}`, `if ${d('IF0')}`); return s; }
      case 'controls_repeat_ext': return T(`ทำซ้ำ ${d('TIMES')} ครั้ง`, `repeat ${d('TIMES')} times`);
      case 'controls_whileUntil': return X.f(b, 'MODE') === 'WHILE' ? T(`ทำซ้ำตราบใดที่ ${d('BOOL')}`, `repeat while ${d('BOOL')}`) : T(`ทำซ้ำจนกว่า ${d('BOOL')}`, `repeat until ${d('BOOL')}`);
      case 'controls_for': return T(`นับ ${X.v(b, 'VAR')} จาก ${d('FROM')} ถึง ${d('TO')} ทีละ ${d('BY')} แล้วทำ`, `count ${X.v(b, 'VAR')} from ${d('FROM')} to ${d('TO')} by ${d('BY')}`);
      case 'controls_forEach': return T(`วนทีละค่า ${X.v(b, 'VAR')} ใน ${d('LIST')}`, `for each ${X.v(b, 'VAR')} in ${d('LIST')}`);
      case 'controls_flow_statements': return X.f(b, 'FLOW') === 'BREAK' ? T('หยุดลูปทันที', 'break out of the loop') : T('ข้ามไปรอบถัดไปของลูป', 'skip to the next iteration');
      case 'math_change': return T(`เพิ่มค่าตัวแปร ${X.v(b, 'VAR')} ทีละ ${d('DELTA')}`, `increase ${X.v(b, 'VAR')} by ${d('DELTA')}`);
      case 'text_append': return T(`ต่อข้อความ ${d('TEXT')} ท้ายตัวแปร ${X.v(b, 'VAR')}`, `append ${d('TEXT')} to ${X.v(b, 'VAR')}`);
      case 'lists_setIndex': return T(`แก้ไขสมาชิกในลิสต์ ${d('LIST')} ให้เป็น ${d('TO')}`, `set an item of ${d('LIST')} to ${d('TO')}`);
      case 'lists_getIndex': return T(`นำสมาชิกออกจาก ${d('VALUE')}`, `remove an item from ${d('VALUE')}`);
      case 'procedures_defnoreturn': case 'procedures_defreturn': { const ps = PB.procParams(b).join(', '); return T(`สร้างฟังก์ชัน ${X.f(b, 'NAME')}(${ps})`, `define the function ${X.f(b, 'NAME')}(${ps})`); }
      case 'procedures_callnoreturn': return T(`เรียกใช้ฟังก์ชัน ${X.f(b, 'NAME')}`, `call ${X.f(b, 'NAME')}()`);
      case 'procedures_ifreturn': return T(`ถ้า ${d('CONDITION')} ให้จบฟังก์ชันและคืนค่า`, `if ${d('CONDITION')}, return`);
      default: { const c = PB.blockPython(b); return c ? T(`ทำคำสั่ง ${c.split('\n')[0]}`, `run ${c.split('\n')[0]}`) : ''; }
    }
  }
  /* Nested step tree for the translation panel. */
  function steps(ws, lang) {
    const walk = (b, depth, out) => {
      while (b) {
        if (!b.isEnabled()) { b = b.getNextBlock(); continue; }
        const compound = b.inputList.some((inp) => inp.type === Blockly.inputs.inputTypes.STATEMENT);
        const full = PB.blockPython(b);
        const node = { id: b.id, type: b.type, depth, text: sentence(b, lang), code: compound ? full.split('\n')[0] : full.split('\n').map((l) => l.trim()).join(' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/,\s*\)/g, ')'), children: [] };
        if (b.type === 'controls_if') {
          node.branches = [];
          for (let i = 0; b.getInput('IF' + i); i++) { const br = { label: i === 0 ? '' : ctx(lang).t(`ถ้าไม่ใช่ แต่ ${ctx(lang).in(b, 'IF' + i).trim()}`, `else if ${ctx(lang).in(b, 'IF' + i).trim()}`), steps: [] }; walk(b.getInputTargetBlock('DO' + i), depth + 1, br.steps); node.branches.push(br); } /* th-en */
          if (b.getInput('ELSE')) { const br = { label: ctx(lang).t('ไม่เช่นนั้น', 'otherwise'), steps: [] }; walk(b.getInputTargetBlock('ELSE'), depth + 1, br.steps); node.branches.push(br); } /* th-en */
        } else {
          for (const inp of b.inputList) if (inp.type === Blockly.inputs.inputTypes.STATEMENT) walk(inp.connection.targetBlock(), depth + 1, node.children);
        }
        out.push(node);
        b = b.getNextBlock();
      }
      return out;
    };
    const tops = ws.getTopBlocks(true).filter((b) => !b.outputConnection);
    const defs = tops.filter((b) => /^procedures_def/.test(b.type)), main = tops.filter((b) => !/^procedures_def/.test(b.type));
    const out = [];
    for (const b of defs.concat(main)) walk(b, 0, out);
    return out;
  }
  PB.explain = { describe, sentence, steps };
})();
