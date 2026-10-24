/* ThaiPyBlocks: application core — workspace, theme, run engine, output, inspector, layout. */
(function () {
  const U = PB.u, h = U.h, $ = U.$;
  const A = (PB.ui = PB.ui || {});
  A.knownCols = new Map();
  A.wsVersion = 0; A.lastRunVersion = -1;
  A.stepDelay = 450;
  A.view = 'blocks';
  A.panel = 'out';
  A.caps = { downloads: null, sample: null };
  const isPhone = () => window.matchMedia('(max-width: 899px)').matches;
  A.isPhone = isPhone;

  /* ---------------- theme ---------------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  A.isDark = () => { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : mq.matches; };
  function applyTheme() { if (A.ws && A.themes) A.ws.setTheme(A.isDark() ? A.themes.dark : A.themes.light); }
  mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------------- workspace ---------------- */
  A.initWorkspace = () => {
    PB.applyMessages();
    PB.blocks.install();
    A.themes = PB.makeThemes();
    Blockly.dialog.setPrompt((msg, def, cb) => U.prompt(msg, def, cb));
    Blockly.dialog.setConfirm((msg, cb) => U.confirm(msg, cb));
    Blockly.dialog.setAlert((msg, cb) => U.alert(msg, cb));
    const ws = (A.ws = Blockly.inject($('#blockly'), {
      toolbox: PB.makeToolbox(), theme: A.isDark() ? A.themes.dark : A.themes.light, renderer: 'zelos', media: 'data:,',
      sounds: false, trashcan: false, comments: false, collapse: true, disable: true, oneBasedIndex: true,
      zoom: { controls: false, wheel: false, pinch: true, startScale: isPhone() ? 0.5 : 0.78, maxScale: 2, minScale: 0.25, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 24, length: 2, colour: 'rgba(120,135,155,.28)', snap: false },
    }));
    ws.addChangeListener(onWsChange);
    new ResizeObserver(() => Blockly.svgResize(ws)).observe($('#blockly'));
  };
  /* the workspace autosaves to the main draft, or to the open exercise's own slot in exercise mode. The app opens
     on a blank workspace (the start screen): the draft of an earlier visit stays until this visit has a program of
     its own (A.blankStart is cleared by PB.ui.start when the workspace first holds blocks) */
  const saveDraftNow = () => {
    try {
      const state = Blockly.serialization.workspaces.save(A.ws);
      if (A.ex && A.ex.active) A.ex.saveWork(state);
      else if (!(A.blankStart && !A.ws.getTopBlocks(false).length)) U.store.set('pyblocks.draft.v2', { ts: Date.now(), state });
    } catch (e) { /* ignore */ }
  };
  const saveDraft = U.debounce(saveDraftNow, 700);
  A.saveDraftNow = saveDraftNow;
  const refreshDerived = U.debounce(() => { if (A.refreshCode) A.refreshCode(); if (A.refreshTranslate) A.refreshTranslate(); }, 350);
  /* blocks just taken from the palette: when they are dropped, their table fields follow the program's table
     (PB.schema.adopt) — e.g. data = pd.read_csv(...) makes a new "df.head()" block read data.head() */
  const fresh = new Map(), newVars = new Map();
  function trackFresh(e) {
    if (e.type === Blockly.Events.BLOCK_CREATE && e.recordUndo && !A.loading && !A.appending) {
      const now = Date.now();
      for (const [id, t] of fresh) if (now - t.at > 600000) fresh.delete(id);
      (e.ids || [e.blockId]).forEach((id) => fresh.set(id, { at: now, group: e.group }));
    } else if (e.type === Blockly.Events.VAR_CREATE && e.recordUndo && e.group) {
      if (!newVars.has(e.group)) newVars.set(e.group, []);
      newVars.get(e.group).push(e.varId);
      if (newVars.size > 50) newVars.delete(newVars.keys().next().value);
    } else if (e.type === Blockly.Events.BLOCK_DRAG && !e.isStart && fresh.has(e.blockId)) {
      const info = fresh.get(e.blockId), root = A.ws.getBlockById(e.blockId);
      if (!root) return;
      root.getDescendants(false).forEach((b) => fresh.delete(b.id));
      let changed = [];
      Blockly.Events.setGroup(e.group || info.group || true);
      try {
        changed = PB.schema ? PB.schema.adopt(root) : [];
        /* "df" was created only for this block and nothing uses it any more: remove it from the variable list */
        if (changed.length) for (const id of newVars.get(info.group) || []) {
          const v = A.ws.getVariableMap().getVariableById(id);
          if (v && !Blockly.Variables.getVariableUsesById(A.ws, id).length) A.ws.getVariableMap().deleteVariable(v);
        }
      } catch (err) { console.warn(err); } finally { Blockly.Events.setGroup(false); }
      if (changed.some((c) => c[1] !== 'ROW')) U.toast(TR`ใช้ตาราง ${changed.find((c) => c[1] !== 'ROW')[2]} ที่โหลดไว้ให้แล้ว`, 2200);
    }
  }
  A._fresh = fresh;
  function onWsChange(e) {
    if (A.start) A.start.onEvent(e);
    if (e.type === Blockly.Events.SELECTED) { A.onSelect(e.newElementId); return; }
    trackFresh(e);
    if (e.isUiEvent || e.type === Blockly.Events.VIEWPORT_CHANGE || e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) return;
    if (A.loading) return;
    A.wsVersion++;
    saveDraft(); refreshDerived();
    if (A.selectedId) A.onSelect(A.selectedId, true);
  }
  A.loadProgram = (state, { run = false, keepExercise = false } = {}) => {
    const ws = A.ws;
    /* opening a sample / wizard program / project ends exercise mode (the exercise work stays saved) */
    if (!keepExercise && A.ex && A.ex.active && A.exLeave) A.exLeave({ restore: false });
    A.loading = true; A.wsVersion++;
    Blockly.Events.disable();
    try { ws.clear(); } finally { Blockly.Events.enable(); }
    try { Blockly.serialization.workspaces.load(state, ws); ws.clearUndo(); } finally { A.loading = false; }
    A.scrollToStart();
    A.knownCols.clear(); A.selectedId = null; A.onSelect(null);
    if (A.start) A.start.update();
    saveDraft(); refreshDerived();
    if (run) setTimeout(() => A.run(), 60);
  };
  /* show the first block at the top-left (below the exercise bar in exercise mode); when the canvas is
     hidden (phone, another view) this waits until the blocks view is shown again */
  A.scrollToStart = () => {
    const ws = A.ws;
    if (isPhone() && A.view !== 'blocks') { A.needScrollStart = true; return; }
    A.needScrollStart = false;
    ws.scrollCenter();
    const tb = ws.getTopBlocks(true)[0];
    if (tb) { const xy = tb.getRelativeToSurfaceXY(); ws.scroll(-xy.x * ws.scale + 24, -xy.y * ws.scale + 24 + (A.ex && A.ex.active ? 50 : 0)); }
  };
  A.appendProgram = (state) => {
    const ws = A.ws;
    const bottom = ws.getTopBlocks(false).reduce((m, b) => { const r = b.getBoundingRectangle(); return Math.max(m, r.bottom); }, 0);
    const blocks = state.blocks.blocks;
    blocks.forEach((b, i) => { b.x = 24; b.y = bottom + 60 + i * 400; });
    A.appending = true;
    try { for (const b of blocks) Blockly.serialization.blocks.append(b, ws); } finally { A.appending = false; }
    if (A.start) A.start.update();
    saveDraft(); refreshDerived();
  };

  /* ---------------- known columns (for column pickers) ----------------
     PB.schema works the columns out from the blocks; this is the fallback when a table's source is unknown:
     the variable's columns from the last run, else every column the program could be using */
  A.columnsFor = (varName, block) => {
    const S = PB.schema;
    if (S && varName) { const info = S.columns(block || null, varName); if (info && info.cols.length) return info.cols.map(({ name, hint }) => ({ name, hint })); }
    if (varName && A.knownCols.has(varName)) return A.knownCols.get(varName);
    const seen = new Map();
    if (S) for (const v of S.walk().end.vars.values()) if (v.kind === 'table') v.cols.forEach((c) => { if (!seen.has(c.name)) seen.set(c.name, { name: c.name, hint: c.hint }); });
    for (const list of A.knownCols.values()) list.forEach((c) => { if (!seen.has(c.name)) seen.set(c.name, c); });
    return Array.from(seen.values());
  };
  A.uploadedFiles = () => Array.from(PB.files.entries()).map(([name, f]) => ({ name, rows: f.df.nrows }));

  /* ---------------- output sink ---------------- */
  const outBody = () => $('#out-body');
  let cellNo = 0;
  A.out = {
    /* what the last run produced, for exercise checks and the HTML report */
    log: [],
    clear() { cellNo = 0; outBody().textContent = ''; this.log = []; },
    _cell(kind, block, content, opts = {}) {
      const body = outBody();
      const empty = body.querySelector('.empty-state'); if (empty) empty.remove();
      const n = kind === 'note' ? '' : ++cellNo;
      const gut = h('div', { class: 'cell-gutter' });
      if (block && n) gut.appendChild(h('button', { type: 'button', title: TR('ไปที่บล็อกที่สร้างผลนี้'), onclick: () => A.selectBlock(block.id, true) }, `Out[${n}]`));
      else if (n) gut.textContent = `Out[${n}]`;
      const inner = h('div', { class: 'cell-body' });
      if (opts.src && block) { const code = PB.blockPython(block).split('\n').find((l) => l.trim() && !/^plt\.(figure|show)\(/.test(l)) || ''; if (code) inner.appendChild(h('div', { class: 'cell-src' }, h('code', {}, code.length > 120 ? code.slice(0, 117) + '…' : code))); }
      inner.appendChild(content);
      const cell = h('div', { class: 'cell ' + kind }, gut, inner);
      body.appendChild(cell);
      return cell;
    },
    print(values, block) {
      this.log.push({ kind: 'print', values, text: values.map((v) => (v instanceof PB.InfoResult ? v.__str__() : PB.str(v))).join(' '), block: block ? block.type : null });
      const rich = values.filter((v) => v instanceof PB.DataFrame || v instanceof PB.Series);
      if (rich.length && values.length <= 2) {
        const wrap = h('div');
        const labels = values.filter((v) => !(v instanceof PB.DataFrame || v instanceof PB.Series));
        if (labels.length) wrap.appendChild(h('pre', { class: 'out-text' }, labels.map(PB.str).join(' ')));
        rich.forEach((v) => wrap.appendChild(A.renderTable(v)));
        this._cell('print', block, wrap, { src: true });
      } else {
        const text = values.map((v) => (v instanceof PB.InfoResult ? v.__str__() : PB.str(v))).join(' ');
        this._cell('print', block, h('pre', { class: 'out-text' }, text), { src: true });
      }
      A.bump();
    },
    chart(spec, block) {
      this.log.push({ kind: 'chart', chart: spec.kind, title: spec.title || '', block: block ? block.type : null });
      const box = h('div');
      /* the further panels of one figure (spec.panel ≥ 1, e.g. trend / seasonal / resid of a decomposition) go into the
         cell of its first panel, like the subplots of one matplotlib figure */
      const last = outBody().lastElementChild;
      if (spec.panel && last && last._pbCharts && block && last._pbBlockId === block.id) {
        last.querySelector('.cell-body').appendChild(box);
        last._pbCharts.push(spec);
        PB.charts.render(spec, box); A.bump();
        return;
      }
      const cell = this._cell('chart', block, box, { src: true });
      cell._pbChart = spec;                    /* kept so the PDF export can draw the chart again at page width */
      cell._pbCharts = [spec]; cell._pbBlockId = block ? block.id : null;
      PB.charts.render(spec, box); A.bump();
    },
    note(text, block) { this._cell('note', block, h('div', { class: 'out-text' }, text)); },
    warn(w, block) { this.log.push({ kind: 'warn', message: w.message, thai: w.thai || '' }); this._cell('warn', block, h('div', {}, h('b', {}, TR('คำเตือน ')), w.thai || '', h('div', { class: 'err-py' }, w.message))); },
    download(filename, content, block, shape) {
      const card = h('div', { class: 'dl-card' }, h('span', { class: 'fn' }, filename), h('span', { class: 'meta' }, shape ? TR`${shape.items[0]} แถว × ${shape.items[1]} คอลัมน์` : ''));
      const btn = h('button', { class: 'btn btn-sm', onclick: () => A.saveFile(filename, content) }, U.icon('download'), TR('ดาวน์โหลด'));
      if (A.caps.downloads) card.appendChild(btn);
      else card.appendChild(h('span', { class: 'meta' }, TR('ดาวน์โหลดได้เมื่อเปิดในหน้าแอปเต็ม')));
      this._cell('print', block, card, { src: true });
    },
    error(e) {
      const isPy = e instanceof PB.PyError;
      this.log.push({ kind: 'error', pyType: isPy ? e.pyType : 'Error', message: e && e.message, thai: isPy ? e.thai : '' });
      const box = h('div', { class: 'err-box', role: 'alert' });
      box.appendChild(h('div', { class: 'err-title' }, isPy ? (e.thai || TR('เกิดข้อผิดพลาด')) : TR('เกิดข้อผิดพลาดภายในแอป')));
      box.appendChild(h('div', { class: 'err-py' }, isPy ? `${e.pyType}: ${e.message}` : String(e && e.message || e)));
      if (isPy && e.hint) box.appendChild(h('div', { class: 'err-hint' }, TR('วิธีแก้: ') + e.hint));
      if (e.blockId) box.appendChild(h('button', { class: 'btn btn-sm', onclick: () => A.selectBlock(e.blockId, true) }, TR('ไปที่บล็อกที่ผิดพลาด')));
      const blk = e.blockId && A.ws.getBlockById(e.blockId);
      this._cell('error', blk, box);
      if (!isPy) console.error(e);
    },
  };
  A.bump = () => { if (!A.stepping) return; const b = outBody(); requestAnimationFrame(() => { const p = b.closest('.panel'); if (p) p.scrollTop = p.scrollHeight; }); };

  /* ---------------- pandas-style table ---------------- */
  A.renderTable = (v, maxRows = 60) => {
    const isS = v instanceof PB.Series;
    const df = isS ? PB.DataFrame.fromColumns({ [v.name ?? '0']: { values: v.values, dtype: v.dtype } }, null, { index: v.index, indexName: v.indexName, indexDtype: v.indexDtype }) : v;
    const n = df.nrows, cols = df.columns;
    let pos = PB.range(n), cut = false;
    if (n > maxRows) { pos = PB.range(5).concat(PB.range(5).map((i) => n - 5 + i)); cut = true; }
    const idxStr = PB.formatValues(pos.map((i) => df.index[i]), df.indexDtype || PB.inferDtype(df.index));
    const colStr = cols.map((c) => PB.formatValues(pos.map((i) => df._data.get(c)[i]), df.dtypeOf(c)));
    const thead = h('thead', {}, h('tr', {}, h('th', {}, df.indexName || ''), ...cols.map((c) => h('th', { class: df.dtypeOf(c) === 'object' ? 'str' : null }, isS && v.name === null ? '' : String(c)))));
    const tbody = h('tbody');
    pos.forEach((_, r) => {
      if (cut && r === 5) tbody.appendChild(h('tr', { class: 'ellipsis' }, h('th', {}, '…'), ...cols.map(() => h('td', {}, '…'))));
      tbody.appendChild(h('tr', {}, h('th', {}, idxStr[r]), ...cols.map((c, j) => { const s = colStr[j][r]; const dt = df.dtypeOf(c); return h('td', { class: (s === 'NaN' || s === 'NaT' ? 'nan ' : '') + (dt === 'object' ? 'str' : '') }, s); })));
    });
    const wrap = h('div', {}, h('div', { class: 'tbl-wrap' }, h('table', { class: 'df' }, thead, tbody)));
    const meta = h('div', { class: 'tbl-meta' });
    if (isS) meta.appendChild(h('span', {}, h('code', {}, `${v.name !== null && v.name !== undefined ? 'Name: ' + v.name + ', ' : ''}${cut ? 'Length: ' + n + ', ' : ''}dtype: ${v.dtype}`)));
    else meta.appendChild(h('span', {}, TR`${n.toLocaleString()} แถว × ${cols.length} คอลัมน์`));
    if (!isS && A.caps.downloads && n > 0) meta.appendChild(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => A.saveFile('table.csv', '﻿' + df.toCSV()) }, U.icon('download'), 'CSV'));
    wrap.appendChild(meta);
    return wrap;
  };

  /* ---------------- run engine ---------------- */
  function setRunUI(running) {
    document.body.classList.toggle('is-running', running);
    U.$$('[data-act="run"], [data-act="step"]').forEach((b) => { b.hidden = running; });
    U.$$('[data-act="stop"]').forEach((b) => { b.hidden = !running; });
    const badge = $('#run-badge'); badge.hidden = !running;
  }
  function badge(text, frac) {
    const b = $('#run-badge'); b.querySelector('span').textContent = text;
    const bar = b.querySelector('.bar'); bar.hidden = frac === undefined; if (frac !== undefined) bar.firstChild.style.width = Math.round(frac * 100) + '%';
  }
  function status(kind, text) { const s = $('#run-status'); s.className = 'status ' + kind; s.querySelector('span:last-child').textContent = text; }
  A.setStatus = status;
  A.run = async ({ step = false } = {}) => {
    if (A.running) return;
    const ws = A.ws;
    A.running = true; A.stopReq = false; A.stepping = step; A.lastRunVersion = A.wsVersion;
    { const p = outBody().closest('.panel'); if (p) p.scrollTop = 0; }
    setRunUI(true); badge(step ? TR('รันทีละขั้น…') : TR('กำลังรัน…'));
    const WARN = Blockly.icons && Blockly.icons.IconType && Blockly.icons.IconType.WARNING;
    ws.getAllBlocks(false).forEach((b) => { if (b.warning || (WARN && b.hasIcon && b.hasIcon(WARN))) b.setWarningText(null); });
    A.out.clear(); PB.warnings = [];
    const interp = (A.interp = new PB.Interp(ws, A.out));
    PB.onWarn = (w) => A.out.warn(w, interp.current);
    status('run', TR('กำลังรัน…'));
    if (isPhone() && !step) A.setView('out');
    const t0 = performance.now(); let last = t0, err = null, nOut0 = 0;
    const gen = interp.run();
    try {
      for (;;) {
        if (A.stopReq) throw PB.err('KeyboardInterrupt', 'execution stopped by user', TR('หยุดการทำงานแล้ว'));
        const r = gen.next();
        if (r.done) break;
        const v = r.value;
        if (v && v.block) {
          if (step) { ws.highlightBlock(v.block.id); badge(TR('ขั้นถัดไป: ') + (PB.blockPython(v.block).split('\n')[0] || v.block.type).slice(0, 60)); await U.sleep(A.stepDelay); last = performance.now(); }
        }
        if (v && v.progress) badge(v.progress, v.frac);
        if (performance.now() - last > 40) { await U.frame(); last = performance.now(); }
      }
    } catch (e) { err = e; }
    ws.highlightBlock(null);
    A.lastError = err;
    const secs = ((performance.now() - t0) / 1000).toFixed(2);
    A.lastRunSecs = secs;
    if (err) {
      A.out.error(err);
      const b = err.blockId && ws.getBlockById(err.blockId);
      if (b && err instanceof PB.PyError) { b.setWarningText((err.thai || err.message) + (err.hint ? '\n' + err.hint : '')); A.selectBlock(b.id, false); }
      status('err', err.pyType === 'KeyboardInterrupt' ? TR`หยุดหลัง ${secs} วินาที` : TR`ผิดพลาดหลัง ${secs} วินาที`);
      A.setErrorBadge(true);
    } else {
      status('ok', TR`รันเสร็จใน ${secs} วินาที`);
      A.setErrorBadge(false);
      if (!outBody().children.length) A.out.note(TR('โปรแกรมทำงานเสร็จ แต่ไม่มีคำสั่งแสดงผล — เพิ่มบล็อก print( ) หรือบล็อกกราฟ'), null);
    }
    void nOut0;
    A.vars = interp.globals;
    for (const [name, v] of interp.globals) if (v instanceof PB.DataFrame) A.knownCols.set(name, v.columns.map((c) => ({ name: c, hint: PB.dtypeLabel(v.dtypeOf(c)) })));
    A.running = false; setRunUI(false);
    if (A.refreshVars) A.refreshVars();
    if (A.exRenderBar) A.exRenderBar();
  };
  A.stop = () => { A.stopReq = true; };
  A.setErrorBadge = (on) => { U.$$('[data-err-badge]').forEach((e) => { e.hidden = !on; }); };

  /* ---------------- selection + inspector ---------------- */
  A.selectBlock = (id, reveal) => {
    const b = A.ws.getBlockById(id); if (!b) return;
    if (isPhone() && reveal) A.setView('blocks');
    if (Blockly.common && typeof Blockly.common.setSelected === 'function') Blockly.common.setSelected(b); else b.select();
    A.ws.centerOnBlock(id);
  };
  A.onSelect = (id, keep) => {
    A.selectedId = id || null;
    const ins = $('#inspector'); ins.textContent = '';
    const b = id && A.ws.getBlockById(id);
    if (!b) { ins.appendChild(h('div', { class: 'ins-empty' }, TR('แตะบล็อกเพื่อดูคำสั่ง Python และความหมายภาษาไทย · ลากบล็อกจากแถบซ้ายมาต่อกัน แล้วกด ▶ รัน'))); if (A.highlightCode) A.highlightCode(null); return; }
    let code = PB.blockPython(b);
    if (b.type === 'controls_if' || /^controls_/.test(b.type)) code = code.split('\n')[0];
    const kind = b.outputConnection ? TR('ค่า (expression)') : TR('คำสั่ง (statement)');
    ins.appendChild(h('div', { class: 'prompt' }, '>>>'));
    ins.appendChild(h('div', { class: 'ins-code' }, code || TR('(บล็อกนี้ยังไม่สมบูรณ์)')));
    ins.appendChild(h('span', { class: 'ins-type' }, kind));
    const text = b.outputConnection ? PB.explain.describe(b, PB.i18n.lang) : PB.explain.sentence(b, PB.i18n.lang);
    ins.appendChild(h('div', { class: 'ins-text' }, text));
    if (A.highlightCode && !keep) A.highlightCode(b);
  };

  /* ---------------- views / tabs ---------------- */
  A.setPanel = (p) => {
    A.panel = p;
    U.$$('.tabs .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.panel === p)));
    U.$$('.panel').forEach((el) => { el.hidden = el.dataset.panel !== p; });
    if (p === 'code' && A.refreshCode) A.refreshCode(true);
    if (p === 'translate' && A.refreshTranslate) A.refreshTranslate(true);
    if (p === 'vars' && A.refreshVars) A.refreshVars();
    if (p === 'task' && A.exRender) A.exRender();
  };
  A.setView = (v) => {
    A.view = v;
    $('.studio').dataset.view = v;
    U.$$('.mnav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    if (v !== 'blocks') A.setPanel(v);
    if (v === 'blocks') requestAnimationFrame(() => { Blockly.svgResize(A.ws); if (A.needScrollStart) A.scrollToStart(); });
  };
  A.initLayout = () => {
    U.$$('.tabs .tab').forEach((t) => t.addEventListener('click', () => A.setPanel(t.dataset.panel)));
    U.$$('.mnav button').forEach((b) => b.addEventListener('click', () => A.setView(b.dataset.view)));
    const sp = $('.splitter'), studio = $('.studio');
    const saved = U.store.get('pyblocks.sideW'); if (saved) studio.style.setProperty('--side-w', saved + 'px');
    sp.addEventListener('pointerdown', (e) => {
      e.preventDefault(); sp.classList.add('dragging'); sp.setPointerCapture(e.pointerId);
      const move = (ev) => { const w = Math.min(Math.max(340, window.innerWidth - ev.clientX), window.innerWidth - 380); studio.style.setProperty('--side-w', w + 'px'); Blockly.svgResize(A.ws); };
      const up = () => { sp.classList.remove('dragging'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); const w = parseInt(getComputedStyle(studio).getPropertyValue('--side-w'), 10); if (w) U.store.set('pyblocks.sideW', w); };
      sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
    });
    window.addEventListener('resize', U.debounce(() => { Blockly.svgResize(A.ws); }, 120));
    A.setPanel('out');
    A.setView(isPhone() ? 'blocks' : 'blocks');
  };
  /* outside Claude (GitHub Pages, or the file opened in a browser) files are saved the ordinary way: Blob + <a download> */
  const MIME = { html: 'text/html', csv: 'text/csv', json: 'application/json', zip: 'application/zip', py: 'text/x-python', ipynb: 'application/x-ipynb+json', md: 'text/markdown', txt: 'text/plain', pdf: 'application/pdf' };
  A.browserDownloads = Object.freeze({
    save: async ({ filename, data }) => {
      const type = MIME[(filename.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
      const blob = data instanceof Blob ? data : new Blob([data], { type: typeof data === 'string' ? type + ';charset=utf-8' : type });
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return {};
    },
  });
  A.saveFile = async (filename, data) => {
    const dl = A.caps.downloads;
    if (!dl) { U.toast(TR('การดาวน์โหลดไฟล์ใช้ไม่ได้ในหน้าจอนี้ ลองใช้ปุ่มคัดลอกแทน')); return; }
    try { await dl.save({ filename, data }); U.toast(TR('บันทึก ') + filename + TR(' แล้ว')); }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') return;
      if (code === 'rate_limited') U.toast(TR('มีหน้าต่างบันทึกเปิดอยู่ ลองอีกครั้งในอีกสักครู่'));
      else if (code === 'rejected_extension' || code === 'extension_not_enabled') U.toast(TR('ไฟล์ชนิดนี้ดาวน์โหลดจากหน้านี้ไม่ได้ ใช้ปุ่ม "คัดลอก" โค้ด Python แทน'), 4200);
      else if (code === 'too_large') U.toast(TR('ไฟล์ใหญ่เกินกว่าจะบันทึกได้ในตอนนี้'), 4200);
      else if (['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(code)) {
        A.caps.downloads = null; U.$$('[data-needs="downloads"]').forEach((el) => { el.hidden = true; });
        U.toast(TR('การดาวน์โหลดไฟล์ใช้ไม่ได้ในหน้าจอนี้ ใช้ปุ่ม "คัดลอก" แทน'), 4200);
      } else U.toast(TR('บันทึกไฟล์ไม่สำเร็จ ลองอีกครั้ง') + (code ? ` (${code})` : ''));
    }
  };
  A.copyText = async (text, okMsg = TR('คัดลอกแล้ว')) => {
    try { await navigator.clipboard.writeText(text); U.toast(okMsg); }
    catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', left: '-9999px' } }); ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      U.toast(ok ? okMsg : TR('คัดลอกอัตโนมัติไม่ได้ เลือกข้อความแล้วคัดลอกเองได้เลย'));
    }
  };
})();
