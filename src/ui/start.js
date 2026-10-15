/* ThaiPyBlocks: the start screen — what an empty workspace shows. Opening the app (a new tab or visit) starts
   here on a blank workspace, with four ways in: start a new program, open data, a sample project or an exercise,
   and "continue" when this browser has saved work. Reloading the page or switching language comes back to the
   work that was open instead (this tab remembers it in sessionStorage). */
(function () {
  const U = PB.u, h = U.h, $ = U.$, A = (PB.ui = PB.ui || {});
  const DRAFT = 'pyblocks.draft.v2', EX_ACTIVE = 'pyblocks.ex.active', EX_DONE = 'pyblocks.ex.done.v1', SESSION = 'pyblocks.session';
  /* booted: boot has finished · dismissed: "start new" put the screen away until the workspace is cleared again ·
     pendingEx: the exercise that was open when the app was last closed, offered as "continue" */
  const S = { booted: false, dismissed: false, shown: false, pendingEx: null, el: null, timer: 0 };

  /* this tab's own memory: 'work' while a program or an exercise is open, so a reload or a language switch
     brings it back; a new tab or visit has none and opens on the start screen */
  const session = {
    get() { try { return sessionStorage.getItem(SESSION); } catch (e) { return null; } },
    set(v) { try { if (v) sessionStorage.setItem(SESSION, v); else sessionStorage.removeItem(SESSION); } catch (e) { /* storage unavailable */ } },
  };

  /* ---------------- the saved work, described ---------------- */
  /* number of blocks and the data the program reads, from a saved workspace (no workspace needed) */
  function summary(state) {
    let n = 0; const data = [];
    const walk = (b) => {
      if (!b || typeof b !== 'object') return;
      n++;
      const f = b.fields || {};
      if (b.type === 'pb_dataset' && f.NAME) data.push(PB.DATASETS[f.NAME] ? PB.DATASETS[f.NAME].title : f.NAME);
      if (b.type === 'pb_read_file' && f.FILE) data.push(f.FILE);
      Object.values(b.inputs || {}).forEach((inp) => walk(inp && inp.block));
      if (b.next) walk(b.next.block);
    };
    ((state && state.blocks && state.blocks.blocks) || []).forEach(walk);
    return { n, data: Array.from(new Set(data)) };
  }
  /* "2 hours ago" / "2 ชั่วโมงที่ผ่านมา" in the interface language */
  function ago(ts) {
    const lang = PB.i18n.lang === 'en' ? 'en' : 'th';
    let rtf;
    try { rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }); } catch (e) { return ''; }
    const s = (ts - Date.now()) / 1000, a = Math.abs(s);
    if (a < 60) return rtf.format(0, 'second');
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
    try { return new Date(ts).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }

  /* ---------------- actions ---------------- */
  /* the exercise left open last time is no longer offered once something else is started */
  function forgetEx() {
    if (S.pendingEx && U.store.get(EX_ACTIVE) === S.pendingEx) U.store.del(EX_ACTIVE);
    S.pendingEx = null;
  }
  /* a blank workspace: put the start screen away and open the palette at the blocks that load data */
  function startNew() {
    S.dismissed = true; forgetEx(); update();
    const tb = A.ws.getToolbox();
    if (tb) {
      const items = tb.getToolboxItems(), byName = (n) => items.find((i) => i.getName && i.getName() === n);
      const cat = byName(TR('ข้อมูล')), sub = byName(TR('โหลด & สำรวจ'));
      if (cat && cat.setExpanded) cat.setExpanded(true);
      if (sub && sub.isSelectable()) tb.setSelectedItem(sub);
    }
    U.toast(TR('ลากบล็อกจากแถบซ้ายมาวางบนพื้นที่ทำงาน เริ่มจากบล็อกโหลดข้อมูล แล้วต่อบล็อกถัดไปไว้ด้านล่าง'), 4200);
  }
  /* the program saved in this browser (and, after a reload, the exercise that was open) */
  A.restoreWork = ({ exercise = true } = {}) => {
    const draft = U.store.get(DRAFT);
    let loaded = false;
    if (draft && draft.state && draft.state.blocks && draft.state.blocks.blocks && draft.state.blocks.blocks.length) {
      try { A.loadProgram(draft.state); loaded = true; } catch (e) { loaded = false; }
    }
    const resumed = exercise && A.exResume ? A.exResume() : false;
    const missing = [...new Set(A.ws.getAllBlocks(false).filter((b) => b.type === 'pb_read_file').map((b) => b.getFieldValue('FILE')).filter((n) => n && !PB.files.has(n)))];
    if (resumed || !loaded) { /* exercise mode waits for "ตรวจคำตอบ" */ }
    else if (missing.length) {
      A.out.clear();
      A.out.note(TR`เปิดโครงงานล่าสุดแล้ว โครงงานนี้อ่านไฟล์ ${missing.join(', ')} ซึ่งต้องอัปโหลดใหม่ทุกครั้งที่เปิดหน้า (ไฟล์อยู่ในเครื่องคุณเท่านั้น) กด "ข้อมูลของฉัน" เพื่ออัปโหลด แล้วกด ▶ รัน`);
    } else setTimeout(() => A.run(), 120);
    return loaded || resumed;
  };
  /* the sample projects as a gallery: one click builds the whole program and runs it */
  A.openSampleGallery = () => {
    const grid = h('div', { class: 'opt-grid sample-grid' }, PB.SAMPLES.map((s) => h('button', { type: 'button', class: 'opt', 'data-sample': s.id, onclick: () => { m.close(); A.loadProgram(s.build(), { run: true }); } }, h('b', {}, s.title), h('small', {}, s.sub))));
    const m = U.modal({ title: TR('โครงงานตัวอย่าง'), body: h('div', {}, h('p', { class: 'dlg-lead' }, TR('เลือกโครงงาน แล้วแอปจะต่อบล็อกทั้งโปรแกรมและรันให้ทันที จากนั้นแก้บล็อกต่อได้ตามต้องการ')), grid) });
  };

  /* ---------------- the screen ---------------- */
  /* a start choice drawn as a block: notch on top, tab below, in the colour of the blocks it leads to */
  const choice = (kind, icon, title, desc, run) => h('button', { type: 'button', class: 'sb sb-' + kind, 'data-start': kind, onclick: run },
    h('span', { class: 'sb-icon' }, U.icon(icon)), h('span', { class: 'sb-title' }, title), desc ? h('span', { class: 'sb-desc' }, desc) : null);
  function render() {
    const el = S.el; el.textContent = '';
    const draft = U.store.get(DRAFT), info = draft && draft.state ? summary(draft.state) : { n: 0, data: [] };
    const EX = PB.EXERCISES || [], done = U.store.get(EX_DONE) || {}, nDone = EX.filter((e) => done[e.id]).length;
    const levels = new Set(EX.map((e) => e.level)).size;
    const ex = S.pendingEx ? EX.find((e) => e.id === S.pendingEx) : null;

    const head = h('div', { class: 'start-head' },
      h('h2', { id: 'start-title' }, TR('จะเริ่มจากตรงไหนดี?')),
      h('p', {}, TR('ต่อบล็อกเป็นโปรแกรม Python วิเคราะห์ข้อมูลและสร้างโมเดล Machine Learning พร้อมแปลคำสั่งเป็นภาษาไทย')));
    const resume = [];
    /* only the work of an earlier visit: once this visit has a program of its own, the draft is that program */
    if (A.blankStart && info.n) {
      const shown = info.data.slice(0, 2).join(', ') + (info.data.length > 2 ? ' …' : '');
      const meta = [TR`${info.n} บล็อก`, shown ? TR`ข้อมูล ${shown}` : '', draft.ts ? ago(draft.ts) : ''].filter(Boolean).join(' · ');
      resume.push(choice('resume', 'history', TR('ทำต่อจากครั้งก่อน'), meta, () => A.restoreWork({ exercise: false })));
    }
    if (ex) resume.push(choice('resume', 'task', TR`ทำแบบฝึกหัดต่อ: ข้อ ${ex.n}`, ex.title, () => { S.pendingEx = null; A.exStart(ex.id); }));
    const grid = h('div', { class: 'sb-grid' },
      choice('new', 'plus', TR('เริ่มงานใหม่'), TR('ต่อบล็อกเองตั้งแต่ต้น ลากบล็อกจากแถบซ้ายมาวางบนพื้นที่ทำงาน'), startNew),
      choice('data', 'data', TR('ข้อมูล'), TR('อัปโหลดไฟล์ CSV หรือ Excel ของคุณ หรือเลือกชุดข้อมูลตัวอย่าง'), () => A.openData()),
      choice('samples', 'book', TR('โครงงานตัวอย่าง'), TR`${PB.SAMPLES.length} โครงงานพร้อมรัน ทั้งตาราง ข้อความ อนุกรมเวลา และรูปภาพ`, () => A.openSampleGallery()),
      choice('exercises', 'task', TR('แบบฝึกหัด'), nDone ? TR`ทำผ่านแล้ว ${nDone} จาก ${EX.length} ข้อ` : TR`${EX.length} ข้อ ${levels} ระดับ ต่อบล็อกตามโจทย์ ตรวจคำตอบอัตโนมัติ`, () => A.openExercises()));
    const tool = (icon, label, run) => h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: run }, U.icon(icon), label);
    const tools = h('div', { class: 'start-tools' },
      tool('wand', TR('ตัวช่วยเลือกโมเดล'), () => A.openWizard()),
      tool('broom', TR('ทำความสะอาดข้อมูล'), () => A.openWizard({ task: 'clean' })),
      tool('folder', TR('เปิดโครงงาน'), () => A.openProject()));
    el.appendChild(h('div', { class: 'start-in' }, head, resume.length ? h('div', { class: 'sb-resume-list' }, resume) : null, grid, tools));
  }
  function update() {
    S.timer = 0;
    const ws = A.ws; if (!ws) return;
    const has = ws.getTopBlocks(false).length > 0, ex = !!(A.ex && A.ex.active);
    /* the workspace holds this visit's own program: autosave may now replace the draft of an earlier visit */
    if (has && !ex) { A.blankStart = false; forgetEx(); }
    if (!S.booted) return;
    session.set(has || ex ? 'work' : null);
    if (!S.el) return;
    const show = !has && !ex && !S.dismissed;
    if (show && !S.shown) render();
    S.shown = show;
    S.el.hidden = !show;
    document.body.classList.toggle('on-start', show);
    if (!show) return;
    /* desktop: the screen sits right of the palette, and steps aside while a palette category is open */
    const tb = ws.getToolbox(), fly = tb && tb.getFlyout();
    S.el.style.setProperty('--tbx', (tb ? tb.getWidth() : 0) + 'px');
    S.el.classList.toggle('is-away', !!(fly && fly.isVisible()));
  }
  const later = () => { if (!S.timer) S.timer = setTimeout(update, 0); };
  const EVENTS = () => [Blockly.Events.BLOCK_CREATE, Blockly.Events.BLOCK_DELETE, Blockly.Events.TOOLBOX_ITEM_SELECT, Blockly.Events.FINISHED_LOADING];

  A.start = {
    /* boot: true when this tab already had work open (a reload or a language switch) */
    reopening: () => session.get() === 'work',
    init() {
      S.el = h('section', { class: 'start', id: 'start', 'aria-labelledby': 'start-title', hidden: true });
      $('.pane-blocks').appendChild(S.el);
      window.addEventListener('resize', U.debounce(update, 120));
    },
    boot({ fresh }) {
      S.pendingEx = fresh ? U.store.get(EX_ACTIVE) : null;
      S.booted = true; update();
    },
    onEvent(e) { if (EVENTS().includes(e.type)) later(); },
    update,
    /* the workspace was cleared on purpose (or an exercise left nothing behind): show the screen again */
    reset() { S.dismissed = false; update(); },
  };
})();
