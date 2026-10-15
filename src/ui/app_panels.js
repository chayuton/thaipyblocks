/* ThaiPyBlocks: panels (Python, translation, variables), model wizard, data upload, exports, boot. */
(function () {
  const U = PB.u, h = U.h, $ = U.$, A = PB.ui, BK = PB.blocks;

  /* ======================= Python panel ======================= */
  A.codeOpts = Object.assign({ comments: PB.i18n.lang }, U.store.get('pyblocks.codeOpts') || {});
  let codeDirty = true, codeCache = null;
  A.genCode = (comments) => PB.genPython(A.ws, { comments: comments ?? A.codeOpts.comments });
  /* packages to install: PyThaiNLP only when the program uses Thai word segmentation */
  A.pipPackages = (code) => 'pandas scikit-learn matplotlib seaborn' + (/\bpythainlp\b/.test(code) ? ' pythainlp' : '');
  const header = (code) => TR`# สร้างด้วย ${PB.APP.name} (Python 3 · pandas · scikit-learn)\n# ติดตั้งแพ็กเกจ: pip install ${A.pipPackages(code)}\n\n`;
  A.refreshCode = (force) => {
    codeDirty = true;
    if (!force && A.panel !== 'code') return;
    const box = $('#code-view'); if (!box) return;
    let res;
    try { res = A.genCode(); } catch (e) { box.textContent = TR('สร้างโค้ดไม่ได้: ') + e.message; return; }
    codeCache = res; codeDirty = false;
    box.textContent = '';
    const lines = res.code.replace(/\n$/, '').split('\n');
    const frag = document.createDocumentFragment();
    lines.forEach((ln, i) => {
      const id = res.map[i];
      const row = h('div', { class: 'ln' + (id ? ' has-block' : ''), 'data-block': id || '' });
      const span = h('span', { class: 'code-line' }); span.innerHTML = U.highlightPy(ln) || ' ';
      row.appendChild(span);
      if (id) row.addEventListener('click', () => A.selectBlock(id, true));
      frag.appendChild(row);
    });
    box.appendChild(frag);
    $('#code-lines').textContent = TR`${lines.length} บรรทัด`;
    if (A.selectedId) A.highlightCode(A.ws.getBlockById(A.selectedId));
  };
  A.highlightCode = (block) => {
    const box = $('#code-view'); if (!box) return;
    U.$$('.ln.hl', box).forEach((e) => e.classList.remove('hl'));
    if (!block) return;
    const ids = new Set(); const walk = (b) => { ids.add(b.id); b.getChildren(false).forEach((c) => { if (c.outputConnection || c.getSurroundParent() === b) walk(c); }); };
    walk(block);
    let first = null;
    U.$$('.ln', box).forEach((e) => { if (ids.has(e.dataset.block)) { e.classList.add('hl'); if (!first) first = e; } });
    if (first && A.panel === 'code') { const p = box.closest('.panel'); const top = first.offsetTop - 80; if (first.offsetTop < p.scrollTop + 40 || first.offsetTop > p.scrollTop + p.clientHeight - 60) p.scrollTo({ top, behavior: 'smooth' }); }
  };
  A.fullScript = (comments) => { const code = A.genCode(comments).code; return header(code) + code; };

  /* ---------- notebook ---------- */
  A.notebook = () => {
    const res = A.genCode('none');
    const lines = res.code.split('\n');
    const topOf = (id) => { let b = A.ws.getBlockById(id); if (!b) return null; while (b.getSurroundParent()) b = b.getSurroundParent(); return b; };
    const cells = []; let pre = [], cur = null, buf = [];
    lines.forEach((ln, i) => {
      const id = res.map[i];
      if (!id) { if (cur) buf.push(ln); else pre.push(ln); return; }
      const top = topOf(id);
      if (!cur || top.id !== cur.id) { if (cur) cells.push({ block: cur, code: buf }); cur = top; buf = []; }
      buf.push(ln);
    });
    if (cur) cells.push({ block: cur, code: buf });
    const md = (text) => ({ cell_type: 'markdown', metadata: {}, source: text.split('\n').map((l, i, a) => (i < a.length - 1 ? l + '\n' : l)) });
    const code = (text) => ({ cell_type: 'code', execution_count: null, metadata: {}, outputs: [], source: text.replace(/\n+$/, '').split('\n').map((l, i, a) => (i < a.length - 1 ? l + '\n' : l)) });
    const files = [...new Set(A.ws.getAllBlocks(false).filter((b) => b.type === 'pb_read_file').map((b) => b.getFieldValue('FILE')).filter(Boolean))];
    const fileNote = files.length ? TR`\n\nไฟล์ข้อมูลที่ต้องใช้: ${files.map((f) => '`' + f + '`').join(', ')} — วางไว้โฟลเดอร์เดียวกับโน้ตบุ๊ก (ถ้าใช้ Colab ให้อัปโหลดที่แถบ **Files** ด้านซ้ายก่อนรัน)` : '';
    const nb = [md(TR`# ${PB.APP.name}\nโน้ตบุ๊กนี้สร้างจากบล็อกใน ${PB.APP.name} ทุกเซลล์มีคำอธิบายภาษาไทยกำกับ\n\nเปิดใน Google Colab: ไปที่ **File → Upload notebook** แล้วเลือกไฟล์นี้` + fileNote)];
    if (/\bpythainlp\b/.test(res.code)) { nb.push(md(TR('## ติดตั้ง PyThaiNLP\nโปรแกรมนี้ใช้ตัดคำภาษาไทย ซึ่ง Colab/Jupyter ยังไม่มีให้ จึงติดตั้งก่อน (รันเซลล์นี้ครั้งเดียว)'))); nb.push(code('%pip install -q pythainlp')); }
    const preText = pre.join('\n').trim();
    if (preText) { nb.push(md(TR('## นำเข้าไลบรารีและฟังก์ชันช่วย'))); nb.push(code(preText)); }
    cells.forEach((c, i) => {
      const s = PB.explain.sentence(c.block, PB.i18n.lang);
      nb.push(md(TR`**ขั้นที่ ${i + 1}** — ${s}`));
      nb.push(code(c.code.join('\n')));
    });
    return JSON.stringify({ cells: nb, metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } }, nbformat: 4, nbformat_minor: 5 }, null, 1);
  };
  A.explanationMd = () => {
    const steps = PB.explain.steps(A.ws, PB.i18n.lang);
    const out = [TR('# คำอธิบายโปรแกรมทีละขั้น'), ''];
    let n = 0;
    const walk = (list, depth) => list.forEach((s) => {
      const pad = '   '.repeat(depth);
      out.push(`${pad}${depth ? '-' : (++n) + '.'} ${s.text}${s.code ? `  \n${pad}   \`${s.code}\`` : ''}`);
      s.children.forEach(() => {}); walk(s.children, depth + 1);
      (s.branches || []).forEach((br) => { if (br.label) out.push(`${pad}   - *${br.label}*`); walk(br.steps, depth + 1); });
    });
    walk(steps, 0);
    return out.join('\n') + '\n';
  };
  A.exportZip = async () => {
    const d = new Date(), slug = PB.APP.slug + '_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const files = [
      { name: slug + '.py', data: A.fullScript(A.codeOpts.comments) },
      { name: slug + '.ipynb', data: A.notebook() },
      { name: slug + '.blocks.json', data: JSON.stringify({ app: PB.APP.name, version: 1, workspace: Blockly.serialization.workspaces.save(A.ws) }, null, 1) },
      { name: TR('คำอธิบาย.md'), data: A.explanationMd() },
    ];
    const used = new Set(A.ws.getAllBlocks(false).filter((b) => b.type === 'pb_read_file').map((b) => b.getFieldValue('FILE')));
    for (const n of used) { const f = PB.files.get(n); if (f && f.bytes) files.push({ name: n, data: f.bytes }); }
    const withReport = A.outputsCurrent();
    if (withReport) files.push({ name: slug + '_report.html', data: A.buildReport() });
    files.push({ name: 'README.txt', data: [TR`${PB.APP.name} — วิธีใช้ไฟล์ในชุดนี้`, '', TR`1) ${slug}.py      รันด้วย: python ${slug}.py`, TR`2) ${slug}.ipynb   เปิดใน Jupyter หรือ Google Colab (File > Upload notebook)`, TR`3) ${slug}.blocks.json   เปิดกลับเข้า ${PB.APP.name} ได้ (เมนู ⋯ > เปิดโครงงาน)`, TR('4) คำอธิบาย.md   คำอธิบายทุกขั้นตอนเป็นภาษาไทย'), withReport ? TR`5) ${slug}_report.html   รายงานผลลัพธ์และกราฟจากการรันล่าสุด (เปิดด้วยเบราว์เซอร์)` : TR('5) (กด ▶ รัน ก่อนดาวน์โหลด จะได้รายงานผลลัพธ์ .html มาด้วย)'), '', TR('ติดตั้งแพ็กเกจที่ต้องใช้:'), '  pip install ' + A.pipPackages(A.genCode('none').code), '', TR('ไฟล์ข้อมูลที่อัปโหลดไว้ (ถ้ามี) อยู่ในชุดนี้ด้วย ให้วางไว้โฟลเดอร์เดียวกับโค้ด'), ''].join('\n') });
    await A.saveFile(slug + '.zip', U.zip(files));
  };

  /* ======================= translation panel ======================= */
  A.trMode = 'steps'; A.trLang = PB.i18n.lang;
  A.refreshTranslate = (force) => {
    if (!force && A.panel !== 'translate') return;
    const box = $('#tr-body'); if (!box) return;
    box.textContent = '';
    if (A.trMode === 'steps') box.appendChild(stepsView());
    else if (A.trMode === 'flow') box.appendChild(flowView());
    else box.appendChild(aiView());
  };
  function stepsView() {
    const steps = PB.explain.steps(A.ws, A.trLang);
    if (!steps.length) return h('div', { class: 'empty-state' }, h('h3', {}, TR('ยังไม่มีบล็อก')), TR('ลากบล็อกมาวาง หรือเลือกโครงงานตัวอย่าง แล้วคำอธิบายจะขึ้นที่นี่'));
    let n = 0;
    const list = (items, depth) => {
      const ol = h('ol', { class: depth ? 'substeps' : 'steps' });
      items.forEach((s) => {
        const li = h('li', { class: 'step' + (s.id === A.selectedId ? ' sel' : ''), onclick: (e) => { e.stopPropagation(); A.selectBlock(s.id, true); } });
        li.appendChild(h('span', { class: 'num' }, depth ? '·' : String(++n)));
        const body = h('div', {}, h('div', { class: 'txt' }, s.text));
        if (s.code) body.appendChild(h('div', { class: 'py' }, s.code));
        li.appendChild(body);
        if (s.children.length) li.appendChild(list(s.children, depth + 1));
        if (s.branches) s.branches.forEach((br) => { if (br.label) li.appendChild(h('div', { class: 'branch-label', style: { gridColumn: '2 / 3' } }, br.label)); if (br.steps.length) li.appendChild(list(br.steps, depth + 1)); });
        ol.appendChild(li);
      });
      return ol;
    };
    return list(steps, 0);
  }
  function flowView() {
    const steps = PB.explain.steps(A.ws, A.trLang);
    const wrap = h('div', { class: 'flow-wrap' });
    if (!steps.length) { wrap.appendChild(h('div', { class: 'muted' }, TR('ยังไม่มีบล็อก'))); return wrap; }
    const NS = 'http://www.w3.org/2000/svg';
    const S = (tag, attrs, kids = []) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); kids.forEach((k) => e.appendChild(k)); return e; };
    const width = Math.max(320, Math.min(720, ($('#tr-body').clientWidth || 520) - 32));
    const nodes = []; let y = 10;
    const boxW = (d) => width - 20 - d * 34;
    const wrapText = (t, maxCh) => { const out = []; let cur = ''; for (const w of String(t).split(/(\s+)/)) { if ((cur + w).length > maxCh && cur) { out.push(cur.trim()); cur = w.trimStart(); } else cur += w; } if (cur.trim()) out.push(cur.trim()); return out.slice(0, 3); };
    const add = (kind, text, code, depth, id) => {
      const bw = boxW(depth), lines = wrapText(text, Math.floor(bw / 8.2));
      const hgt = 18 + lines.length * 17 + (code ? 16 : 0);
      nodes.push({ kind, text: lines, code, x: 10 + depth * 34, y, w: bw, h: hgt, id, depth }); y += hgt + 22;
    };
    add('term', A.trLang === 'en' ? 'Start' : TR('เริ่ม'), '', 0);
    const walk = (items, depth) => items.forEach((s) => {
      const loop = /controls_(repeat|whileUntil|for|forEach)/.test(s.type), cond = s.type === 'controls_if';
      add(loop ? 'loop' : cond ? 'cond' : 'step', s.text, s.code, depth, s.id);
      walk(s.children, depth + 1);
      if (s.branches) s.branches.forEach((br) => { if (br.label) add('label', br.label, '', depth + 1); walk(br.steps, depth + 1); });
    });
    walk(steps, 0);
    add('term', A.trLang === 'en' ? 'End' : TR('จบ'), '', 0);
    const svg = S('svg', { viewBox: `0 0 ${width} ${y}`, width: '100%', role: 'img', 'aria-label': TR('ผังงานของโปรแกรม') });
    nodes.forEach((n, i) => {
      if (i > 0) { const p = nodes[i - 1]; const x1 = p.x + 18, x2 = n.x + 18; svg.appendChild(S('path', { d: `M${x1},${p.y + p.h} V${n.y - 8} H${x2} V${n.y - 2}`, style: 'fill:none;stroke:var(--ink-3);stroke-width:1.4' })); svg.appendChild(S('path', { d: `M${x2 - 4},${n.y - 7} L${x2},${n.y - 1} L${x2 + 4},${n.y - 7}`, style: 'fill:none;stroke:var(--ink-3);stroke-width:1.4' })); }
      const g = S('g', { style: n.id ? 'cursor:pointer' : '' });
      const fill = n.kind === 'term' ? 'var(--ink)' : n.kind === 'cond' ? 'var(--warn-soft)' : n.kind === 'loop' ? 'var(--ok-soft)' : n.kind === 'label' ? 'transparent' : 'var(--surface-2)';
      const stroke = n.kind === 'cond' ? 'var(--warn)' : n.kind === 'loop' ? 'var(--ok)' : n.kind === 'label' ? 'transparent' : 'var(--line)';
      if (n.kind === 'term') g.appendChild(S('rect', { x: n.x, y: n.y, width: 96, height: n.h, rx: n.h / 2, style: `fill:${fill}` }));
      else if (n.kind === 'cond') { const hx = 12; g.appendChild(S('path', { d: `M${n.x + hx},${n.y} H${n.x + n.w - hx} L${n.x + n.w},${n.y + n.h / 2} L${n.x + n.w - hx},${n.y + n.h} H${n.x + hx} L${n.x},${n.y + n.h / 2} Z`, style: `fill:${fill};stroke:${stroke};stroke-width:1.4` })); }
      else g.appendChild(S('rect', { x: n.x, y: n.y, width: n.w, height: n.h, rx: n.kind === 'loop' ? 14 : 8, style: `fill:${fill};stroke:${stroke};stroke-width:1.2` }));
      n.text.forEach((t, k) => { const tx = S('text', { x: n.kind === 'term' ? n.x + 48 : n.x + 14, y: n.y + 22 + k * 17, 'text-anchor': n.kind === 'term' ? 'middle' : 'start', style: n.kind === 'term' ? 'fill:var(--surface);font-weight:600' : n.kind === 'label' ? 'fill:var(--ink-2);font-weight:600' : '' }); tx.textContent = t; g.appendChild(tx); });
      if (n.code) { const tx = S('text', { x: n.x + 14, y: n.y + n.h - 9, class: 'small' }); tx.textContent = n.code.length > Math.floor(n.w / 7) ? n.code.slice(0, Math.floor(n.w / 7) - 1) + '…' : n.code; g.appendChild(tx); }
      if (n.id) g.addEventListener('click', () => A.selectBlock(n.id, true));
      svg.appendChild(g);
    });
    wrap.appendChild(svg);
    return wrap;
  }
  const AI_TARGETS = [
    ['r', TR('ภาษา R (tidyverse + tidymodels)'), 'Translate this Python data-science program into idiomatic R using the tidyverse and tidymodels (or base R stats where simpler). Keep every step and keep the Thai comments (translate code only).'],
    ['js', 'JavaScript (Node.js + danfo.js)', 'Translate this Python program into modern JavaScript for Node.js using danfo.js for data frames and a suitable ML library (e.g. ml.js packages). Keep every step and the Thai comments.'],
    ['julia', 'Julia (DataFrames.jl + MLJ)', 'Translate this Python program into Julia using DataFrames.jl, CSV.jl and MLJ.jl. Keep every step and the Thai comments.'],
    ['sql', TR('SQL (ส่วนเตรียมข้อมูล) + Python'), 'Rewrite the data-loading and data-preparation part of this program as standard SQL (assume the CSV is loaded into a table named data), then show the remaining modelling part as short Python. Explain in Thai comments which parts moved to SQL.'],
    ['pseudo', TR('รหัสเทียม (Pseudocode) ภาษาไทย'), 'Rewrite this program as clear numbered pseudocode written in Thai, one line per step, suitable for a lesson handout. No Python syntax.'],
    ['explain', TR('อธิบายละเอียดสำหรับผู้เริ่มต้น (ไทย)'), 'Explain this program to a Thai beginner: what the data is, what each step does and why, what the model learns, and how to read the results. Write in Thai, short sections with headings, include tiny code snippets where useful.'],
    ['en', 'English walkthrough', 'Explain this program step by step in plain English for a beginner, with short headings. Mention what each library call does.'],
  ];
  let aiCtl = null;
  /* drop markdown fence lines (```r … ```) but keep every line of prose and code */
  const unfence = (t) => String(t || '').replace(/^[ \t]*```[\w+.-]*[ \t]*$\n?/gm, '').replace(/^\n+/, '');
  const AI_OFF = {
    not_granted: TR('ยังไม่ได้อนุญาตให้หน้านี้ใช้ Claude จึงแปลด้วย Claude ไม่ได้ในตอนนี้'),
    sampling_disabled: TR('บัญชีหรือองค์กรนี้ใช้ Claude จากหน้านี้ไม่ได้'),
    not_declared: TR('หน้านี้ไม่ได้เปิดให้ใช้ Claude'), capability_disabled: TR('การใช้ Claude ถูกปิดในมุมมองนี้'), capability_removed: TR('แอป Claude รุ่นนี้ยังไม่รองรับการแปลจากหน้านี้'),
  };
  function aiView() {
    const box = h('div', { class: 'ai-box' });
    if (!A.caps.sample || A.aiBlocked) { box.appendChild(h('div', { class: 'muted' }, (A.aiBlocked ? A.aiBlocked + ' ' : TR('การแปลด้วย Claude ใช้ได้เมื่อเปิดแอปนี้ใน Claude เท่านั้น ')) + TR('ระหว่างนี้ใช้มุมมอง "ทีละขั้น" และ "ผังงาน" ได้ตามปกติ'))); return box; }
    const sel = h('select', { class: 'select', id: 'ai-target', 'aria-label': TR('รูปแบบที่ต้องการแปล') }, AI_TARGETS.map(([v, t]) => h('option', { value: v }, t)));
    if (A.aiTarget) sel.value = A.aiTarget;
    const out = h('div', { class: 'ai-out' }, h('div', { class: 'muted', style: { padding: '14px' } }, TR('เลือกรูปแบบแล้วกด "แปล" Claude จะอ่านโค้ด Python ของบล็อกทั้งหมดแล้วแปลให้')));
    const go = h('button', { class: 'btn btn-accent' }, U.icon('translate'), TR('แปล'));
    const stop = h('button', { class: 'btn', hidden: true }, U.icon('stop'), TR('หยุด'));
    const copy = h('button', { class: 'btn', hidden: true }, U.icon('copy'), TR('คัดลอก'));
    let lastText = '';
    go.addEventListener('click', async () => {
      A.aiTarget = sel.value;
      const t = AI_TARGETS.find((x) => x[0] === sel.value);
      const code = A.fullScript('none');
      if (!code.trim() || code.split('\n').length < 4) { U.toast(TR('ยังไม่มีโค้ดให้แปล')); return; }
      aiCtl = new AbortController();
      go.disabled = true; stop.hidden = false; copy.hidden = true; out.textContent = '';
      out.appendChild(h('div', { class: 'thinking' }, h('span', { class: 'spin', style: { width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--accent-soft)', borderTopColor: 'var(--accent)', animation: 'spin .8s linear infinite', display: 'inline-block' } }), TR('Claude กำลังคิด…')));
      const pre = h('pre');
      const prompt = `${t[2]}\n\nReturn only the result (code in a single fenced block when the result is code).\n\nProgram (generated by a block-based editor for teaching Python data science in Thailand):\n\n\`\`\`python\n${code.slice(0, 60000)}\n\`\`\``;
      try {
        const r = await A.caps.sample(prompt, { signal: aiCtl.signal, onText: ({ text }) => { if (!pre.parentNode) { out.textContent = ''; out.appendChild(pre); } lastText = text; pre.textContent = unfence(text); } });
        lastText = r.text; pre.textContent = unfence(r.text); if (!pre.parentNode) { out.textContent = ''; out.appendChild(pre); }
        if (r.truncated) out.appendChild(h('div', { class: 'muted', style: { padding: '0 14px 12px' } }, TR('คำตอบยาวเกินไปจึงถูกตัด ลองแปลทีละส่วน')));
        copy.hidden = false;
      } catch (e) {
        const code2 = e && e.code;
        if (AI_OFF[code2]) { A.aiBlocked = AI_OFF[code2]; A.refreshTranslate(true); return; }
        if (code2 === 'cancelled') {
          if (e.text) { lastText = e.text; copy.hidden = false; pre.textContent = unfence(e.text); if (!pre.parentNode) { out.textContent = ''; out.appendChild(pre); } }
          else if (!pre.parentNode) { out.textContent = ''; out.appendChild(h('div', { class: 'muted', style: { padding: '14px' } }, TR('หยุดการแปลแล้ว'))); }
          return;
        }
        out.textContent = '';
        if (e && e.text && code2 !== 'refused') { pre.textContent = unfence(e.text); out.appendChild(pre); lastText = e.text; copy.hidden = false; }
        out.appendChild(h('div', { class: 'muted', style: { padding: '12px 14px' } }, {
          rate_limited: TR('ใช้งานถี่เกินไปหรือถึงขีดจำกัดการใช้งานแล้ว ลองใหม่ภายหลัง'),
          refused: TR('Claude ไม่สามารถแปลเนื้อหานี้ได้ ลองเลือกรูปแบบอื่น'),
          session_expired: TR('กรุณาเข้าสู่ระบบ Claude อีกครั้ง แล้วกด "แปล" ใหม่'),
          prompt_too_large: TR('โปรแกรมยาวเกินไปสำหรับการแปลครั้งเดียว ลองแบ่งบล็อกเป็นส่วนย่อย'),
          empty_completion: TR('Claude ไม่ได้ส่งคำตอบกลับมา ลองเลือกรูปแบบอื่น'),
        }[code2] || (e && e.text ? TR('การแปลถูกขัดจังหวะ กด "แปล" เพื่อลองอีกครั้ง') : TR('แปลไม่สำเร็จ กด "แปล" เพื่อลองอีกครั้ง'))));
      } finally { go.disabled = false; stop.hidden = true; aiCtl = null; }
    });
    stop.addEventListener('click', () => aiCtl && aiCtl.abort());
    copy.addEventListener('click', () => A.copyText(unfence(lastText)));
    box.appendChild(h('div', { class: 'ai-row' }, h('label', { for: 'ai-target', class: 'muted' }, TR('แปลเป็น')), sel, go, stop, copy));
    box.appendChild(out);
    box.appendChild(h('div', { class: 'muted' }, TR('ใช้โควตาการใช้งาน Claude ของคุณ ผลแปลภาษาอื่นควรตรวจทานก่อนนำไปใช้')));
    return box;
  }

  /* ======================= variables panel ======================= */
  const describeVal = (v) => {
    if (v instanceof PB.DataFrame) return TR`${v.nrows.toLocaleString()} แถว × ${v.ncols} คอลัมน์ · ${v.columns.slice(0, 6).join(', ')}${v.ncols > 6 ? ', …' : ''}`;
    if (v instanceof PB.Series) return TR`${v.length.toLocaleString()} ค่า · dtype ${v.dtype}${v.name !== null ? ' · ' + v.name : ''}`;
    if (v instanceof PB.NDArray) return `shape (${v.shape.join(', ')}${v.shape.length === 1 ? ',' : ''}) · ${PB.str(v).slice(0, 80)}`;
    if (v instanceof PB.SparseMatrix) return TR`sparse ${v.rows.length} × ${v.nCols} · ${v.nnz.toLocaleString()} ค่าไม่เป็นศูนย์`;
    if (v instanceof PB.Estimator) return (v.fitted ? TR('ฝึกแล้ว · ') : TR('ยังไม่ฝึก · ')) + v.__repr__();
    const s = PB.repr(v); return s.length > 120 ? s.slice(0, 117) + '…' : s;
  };
  A.refreshVars = () => {
    const box = $('#vars-body'); if (!box || A.panel !== 'vars') return;
    box.textContent = '';
    const vars = A.vars;
    if (!vars || !vars.size) { box.appendChild(h('div', { class: 'empty-state' }, h('h3', {}, TR('ยังไม่มีตัวแปร')), TR('กด ▶ รัน แล้วตัวแปรทุกตัวที่โปรแกรมสร้างจะแสดงที่นี่ พร้อมชนิดข้อมูลแบบ Python'))); return; }
    const tb = h('tbody');
    const preview = h('div', { class: 'var-preview' });
    for (const [name, v] of vars) {
      const t = PB.typeName(v), isModel = v instanceof PB.Estimator;
      const tr = h('tr', { class: v instanceof PB.DataFrame || v instanceof PB.Series ? 'clickable' : '' }, h('td', { class: 'name' }, name), h('td', { class: 'type' }, h('span', { class: 't-' + (isModel ? 'model' : t) }, t)), h('td', { class: 'val' }, describeVal(v)));
      if (v instanceof PB.DataFrame || v instanceof PB.Series) tr.addEventListener('click', () => { preview.textContent = ''; preview.appendChild(h('div', { class: 'chart-title', style: { marginBottom: '6px' } }, name + (v instanceof PB.DataFrame ? '.head(20)' : ''))); preview.appendChild(A.renderTable(v instanceof PB.DataFrame ? v.head(20) : v)); });
      tb.appendChild(tr);
    }
    box.appendChild(h('table', { class: 'vars' }, h('thead', {}, h('tr', {}, h('th', {}, TR('ชื่อตัวแปร')), h('th', {}, TR('ชนิด (Python)')), h('th', {}, TR('ค่า')))), tb));
    box.appendChild(preview);
  };

  /* ======================= data upload ======================= */
  let xlsxLoading = null;
  const loadXLSX = () => {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxLoading) xlsxLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => { xlsxLoading = null; rej(new Error(TR('โหลดตัวอ่าน Excel ไม่สำเร็จ'))); }; document.head.appendChild(s); });
    return xlsxLoading;
  };
  A.readFile = async (file) => {
    const name = file.name.replace(/[\\/:*?"<>|]/g, '_');
    const ext = (name.split('.').pop() || '').toLowerCase();
    const bytes = await file.arrayBuffer();
    let df, sep = ',', encoding = 'utf-8', sheet = null;
    if (['xlsx', 'xls', 'xlsm'].includes(ext)) {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true });
      sheet = wb.SheetNames[0];
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
      df = PB.fromAOA(aoa);
      if (wb.SheetNames.length > 1) U.toast(TR`ใช้ชีตแรก "${sheet}" จากทั้งหมด ${wb.SheetNames.length} ชีต`);
      sheet = wb.SheetNames.length > 1 ? sheet : null;
    } else {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch (e) { text = new TextDecoder('windows-874').decode(bytes); encoding = 'windows-874'; }
      if (ext === 'json') df = PB.readJSON(text);
      else {
        const first = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 2000);
        sep = ext === 'tsv' ? '\t' : [',', ';', '\t', '|'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
        if (first.split(sep).length < 2) sep = ',';
        df = PB.readCSV(text, { sep });
      }
    }
    PB.files.set(name, { df, sep, encoding, sheet, bytes, kind: ext });
    if (PB.schema) PB.schema.rememberFile(name, df);
    return name;
  };
  A.pickFile = (cb) => {
    const inp = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.json,.xlsx,.xls,.xlsm', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      try { const name = await A.readFile(f); U.toast(TR`อ่าน ${name} แล้ว (${PB.files.get(name).df.nrows.toLocaleString()} แถว)`); if (cb) cb(name); if (A.dataDialogRefresh) A.dataDialogRefresh(); }
      catch (e) { U.alert(TR('อ่านไฟล์ไม่สำเร็จ: ') + (e.thai || e.message)); }
    });
    document.body.appendChild(inp); inp.click();
  };
  /* blocks that load data: on an empty workspace they become the program and run, otherwise they go below it */
  A.addData = (prog, note) => {
    if (!A.ws.getTopBlocks(false).length && !(A.ex && A.ex.active)) A.loadProgram(prog, { run: true });
    else { A.appendProgram(prog); U.toast(note); }
  };
  const headOf = (v) => PB.R.print(PB.R.b('pb_df_view', { DF: { name: v }, FN: 'head', N: 5 }));
  const DTYPE_TH = { table: TR('ตาราง'), text: TR('ข้อความ'), timeseries: TR('อนุกรมเวลา'), image: TR('รูปภาพ') };
  A.openData = () => {
    const list = h('div', { class: 'file-list' });
    const drop = h('div', { class: 'file-drop' }, h('b', {}, TR('ลากไฟล์มาวางที่นี่ หรือเลือกไฟล์')), h('span', { class: 'muted' }, TR('รองรับ CSV, TSV, Excel (.xlsx), JSON · ภาษาไทย UTF-8 และ TIS-620 · ไฟล์อยู่ในเครื่องคุณเท่านั้น ไม่ถูกอัปโหลดไปไหน')), h('button', { class: 'btn btn-accent', onclick: () => A.pickFile() }, U.icon('upload'), TR('เลือกไฟล์')));
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', async (e) => { e.preventDefault(); for (const f of e.dataTransfer.files) { try { await A.readFile(f); } catch (err) { U.alert(TR('อ่าน ') + f.name + TR(' ไม่สำเร็จ: ') + (err.thai || err.message)); } } render(); });
    const render = () => {
      list.textContent = '';
      if (!PB.files.size) { list.appendChild(h('div', { class: 'muted' }, TR('ยังไม่มีไฟล์ของคุณ อัปโหลดไฟล์ด้านบน หรือเลือกชุดข้อมูลตัวอย่างด้านล่าง'))); return; }
      for (const [name, f] of PB.files) {
        const df = f.df;
        const types = df.columns.slice(0, 8).map((c) => h('span', { class: 'chip' }, c, h('small', {}, PB.dtypeLabel(df.dtypeOf(c)))));
        const item = h('div', { class: 'file-item' },
          h('div', { class: 'fi-head' }, h('b', {}, name), h('span', { class: 'muted' }, TR`${df.nrows.toLocaleString()} แถว × ${df.ncols} คอลัมน์${f.encoding !== 'utf-8' ? ' · ' + f.encoding : ''}`)),
          h('div', { class: 'chips' }, types, df.ncols > 8 ? h('span', { class: 'muted' }, `+${df.ncols - 8}`) : null),
          A.renderTable(df.head(5)),
          h('div', { class: 'field-row' },
            h('button', { class: 'btn btn-sm', onclick: () => { m.close(); A.addData(PB.R.program([PB.R.set('df', PB.R.b('pb_read_file', { FN: 'pd.read_csv', FILE: name })), headOf('df')]), TR('เพิ่มบล็อกอ่านไฟล์ไว้ท้ายพื้นที่ทำงานแล้ว')); } }, TR('เพิ่มบล็อกอ่านไฟล์')),
            h('button', { class: 'btn btn-sm btn-accent', onclick: () => { m.close(); A.openWizard({ file: name }); } }, U.icon('wand'), TR('วิเคราะห์ด้วยตัวช่วยเลือกโมเดล')),
            h('button', { class: 'btn btn-sm', onclick: () => { m.close(); A.openWizard({ file: name, task: 'clean' }); } }, U.icon('broom'), TR('ทำความสะอาดไฟล์นี้')),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { PB.files.delete(name); render(); } }, TR('นำออก'))));
        list.appendChild(item);
      }
    };
    A.dataDialogRefresh = render;
    render();
    /* the datasets built into the app, for starting without a file of your own */
    const samples = h('section', { class: 'data-samples' },
      h('h3', {}, TR('ชุดข้อมูลตัวอย่างในแอป')),
      h('p', { class: 'muted' }, TR('ไม่ต้องอัปโหลด เลือกแล้วแอปจะเพิ่มบล็อกโหลดข้อมูลและแสดง 5 แถวแรกให้')),
      h('div', { class: 'opt-grid' }, Object.entries(PB.DATASETS).map(([key, d]) => h('button', { type: 'button', class: 'opt', 'data-dataset': key, title: d.desc,
        onclick: () => { m.close(); A.addData(PB.R.program([PB.R.set('df', PB.R.b('pb_dataset', { NAME: key })), headOf('df')]), TR('เพิ่มบล็อกโหลดข้อมูลไว้ท้ายพื้นที่ทำงานแล้ว')); } },
        h('b', {}, d.title), h('small', {}, TR`${key} · ${d.rows.toLocaleString()} แถว · ${DTYPE_TH[d.type] || d.type}`)))));
    const m = U.modal({ title: TR('ข้อมูลของฉัน'), body: h('div', {}, drop, list, samples), onClose: () => { A.dataDialogRefresh = null; } });
  };

  /* ======================= model wizard ======================= */
  const GLYPH = {
    table: '<rect x="2" y="3" width="24" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2 8h24M2 13h24M10 3v16M18 3v16" stroke="currentColor" stroke-width="1.3"/>',
    text: '<path d="M3 5h22M3 10h18M3 15h22M3 20h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    timeseries: '<path d="M2 18l6-6 5 4 6-9 7 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><path d="M2 21h24" stroke="currentColor" stroke-width="1.2"/>',
    image: '<rect x="3" y="2" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 6h4v4H7zM15 6h2v8h-2zM7 14h8v2H7z" fill="currentColor"/>',
  };
  const DTYPES = [['table', TR('ตาราง'), TR('ตัวเลขและหมวดหมู่ เช่น ยอดขาย ข้อมูลลูกค้า')], ['text', TR('ข้อความ'), TR('รีวิว ความคิดเห็น ข่าว')], ['timeseries', TR('อนุกรมเวลา'), TR('ค่ารายวัน รายเดือน ตามลำดับเวลา')], ['image', TR('รูปภาพ'), TR('ภาพขนาดเล็กเป็นค่าพิกเซล')]];
  const inferRoles = PB.R.inferRoles;
  /* Build the recipe config for an uploaded file. `over` holds the user's choices from the wizard
     (target / text / value columns and the feature list); everything else is inferred. */
  function fileConfig(name, dtype, task, over = {}) {
    const df = PB.files.get(name).df, roles = inferRoles(df), cols = df.columns;
    const has = (c) => c !== undefined && c !== null && cols.includes(c);
    const nums = cols.filter((c) => roles[c] === 'num' || roles[c] === 'num-cat'), cats = cols.filter((c) => roles[c] === 'cat' || roles[c] === 'num-cat');
    const hasNA = (list) => list.some((c) => df._data.get(c).some(PB.isMissing));
    const cfg = { file: name, roles };
    if (dtype === 'text') {
      const tc = has(over.text) ? over.text : cols.find((c) => roles[c] === 'text') || cols.find((c) => df.dtypeOf(c) === 'object');
      cfg.text = tc;
      cfg.target = has(over.target) ? over.target : cols.find((c) => c !== tc && (roles[c] === 'cat' || roles[c] === 'num-cat')) || cols.find((c) => c !== tc);
      cfg.hue = cfg.target; cfg.dropna = true;
      return cfg;
    }
    if (dtype === 'timeseries') {
      cfg.value = has(over.value) ? over.value : nums.find((c) => roles[c] === 'num') || nums[0];
      cfg.dateCol = cols.find((c) => roles[c] === 'date') || null;
      cfg.lags = Math.max(2, Math.min(12, Math.floor(df.nrows / 4))); cfg.start = '2020-01-01'; cfg.freq = 'MS';
      return cfg;
    }
    if (dtype === 'image') { cfg.target = has(over.target) ? over.target : cols.find((c) => /label|target|class|^y$/i.test(c)) || cols[cols.length - 1]; return cfg; }
    if (task === 'classification' || task === 'regression') {
      const tgt = has(over.target) ? over.target : task === 'regression' ? (nums.filter((c) => roles[c] === 'num').slice(-1)[0] || nums[nums.length - 1]) : (cats.slice(-1)[0] || cols[cols.length - 1]);
      cfg.target = tgt;
      const auto = cols.filter((c) => c !== tgt && (roles[c] === 'num' || roles[c] === 'num-cat' || roles[c] === 'cat'));
      cfg.features = Array.isArray(over.features) ? over.features.filter((c) => c !== tgt && has(c)) : auto;
      cfg.dummies = cfg.features.filter((c) => df.dtypeOf(c) === 'object');
      cfg.dropna = hasNA([tgt, ...cfg.features]);
      if (task === 'classification' && has(tgt)) {
        const counts = new Map();
        for (const v of df._data.get(tgt)) if (!PB.isMissing(v)) counts.set(PB.keyOf(v), (counts.get(PB.keyOf(v)) || 0) + 1);
        cfg.nClasses = counts.size;
        if (counts.size && Math.min(...counts.values()) < 2) cfg.noStratify = true;
      }
      return cfg;
    }
    const autoF = nums.filter((c) => roles[c] === 'num').slice(0, 8);
    cfg.features = Array.isArray(over.features) ? over.features.filter(has) : autoF.length ? autoF : nums.slice(0, 8);
    cfg.dropna = hasNA(cfg.features);
    cfg.hue = cats.find((c) => df.dtypeOf(c) === 'object') || null;
    cfg.x = cfg.features[0]; cfg.y = cfg.features[1] || cfg.features[0];
    cfg.num = nums[0]; cfg.cat = cats.find((c) => df.dtypeOf(c) === 'object') || cats[0];
    return cfg;
  }
  /* Problems that would make the generated program fail, explained before any block is built. */
  function checkConfig(cfg) {
    const df = cfg.file && PB.files.get(cfg.file) ? PB.files.get(cfg.file).df : null;
    if (!df) return null;
    const t = cfg.task;
    if ((t === 'classification' || t === 'regression') && (!cfg.features || !cfg.features.length)) return TR('เลือกคอลัมน์ฟีเจอร์อย่างน้อย 1 คอลัมน์');
    if (t === 'regression' && !PB.isNumericDtype(df.dtypeOf(cfg.target))) return TR`คอลัมน์เป้าหมาย ${cfg.target} ไม่ใช่ตัวเลข งานพยากรณ์ค่าต้องใช้คอลัมน์ตัวเลข (หรือเลือกงานจำแนกประเภทแทน)`;
    if (t === 'classification' && cfg.nClasses > 50) return TR`คอลัมน์เป้าหมาย ${cfg.target} มี ${cfg.nClasses} ค่าที่ไม่ซ้ำกัน ดูเหมือนเป็นตัวเลขต่อเนื่อง ลองเลือกงาน "พยากรณ์ค่าตัวเลข" หรือเลือกคอลัมน์เป้าหมายอื่น`;
    if ((t === 'clustering' || t === 'pca') && (!cfg.features || cfg.features.length < 2)) return TR('งานนี้ต้องใช้คอลัมน์ตัวเลขอย่างน้อย 2 คอลัมน์');
    if (t === 'anomaly' && (!cfg.features || !cfg.features.length)) return TR('ไม่พบคอลัมน์ตัวเลขในไฟล์นี้');
    if ((t === 'text_classification' || t === 'text_clustering') && !cfg.text) return TR('ไม่พบคอลัมน์ข้อความในไฟล์นี้');
    if (t === 'text_classification' && cfg.text === cfg.target) return TR('คอลัมน์ข้อความและคอลัมน์คำตอบต้องเป็นคนละคอลัมน์');
    if ((t === 'forecast' || t === 'trend') && !cfg.value) return TR('ไม่พบคอลัมน์ตัวเลขสำหรับดูแนวโน้มหรือพยากรณ์');
    if (t === 'forecast' && df.nrows < 12) return TR`ข้อมูลมีเพียง ${df.nrows} แถว การพยากรณ์ต้องมีอย่างน้อย 12 ช่วงเวลา`;
    if ((t === 'image_classification' || t === 'image_pca') && df.columns.filter((c) => c !== cfg.target).some((c) => !PB.isNumericDtype(df.dtypeOf(c)))) return TR('ข้อมูลภาพต้องมีแต่คอลัมน์ตัวเลข (ค่าพิกเซล) ยกเว้นคอลัมน์ป้ายกำกับ');
    return null;
  }
  A._fileConfig = (name, dtype, task, over) => fileConfig(name, dtype, task, over);
  A._checkConfig = checkConfig;
  A.openWizard = (pre = {}) => {
    const st = { dtype: 'table', task: 'classification', source: pre.file ? 'file:' + pre.file : 'iris', models: ['RandomForestClassifier'], modelsFor: 'classification', cfg: null, evalMode: 'holdout', tokenizer: 'char',
      prep: { missing: 'auto', dedupe: 'keep', outliers: 'none', scaler: 'standard' } };
    const PREP_TASKS = ['classification', 'regression', 'clustering', 'pca', 'anomaly'];
    const cleaning = pre.task === 'clean';
    if (cleaning) { st.task = 'clean'; if (!pre.file) st.source = PB.files.size ? 'file:' + Array.from(PB.files.keys()).pop() : 'coffee'; }
    const EVAL_TASKS = ['classification', 'regression', 'text_classification', 'image_classification'];
    const EVALS = [['holdout', TR('แบ่งฝึก / ทดสอบ'), TR('train_test_split แล้ววัดผลกับชุดทดสอบ เร็วที่สุด')], ['cv', TR('Cross-validation 5 รอบ'), TR('สลับชุดทดสอบ 5 รอบ ได้คะแนนเฉลี่ยที่เชื่อถือได้กว่า')], ['grid', 'GridSearchCV', TR('ลองค่าพารามิเตอร์หลายชุดแล้วเลือกชุดที่ดีที่สุดให้ (1 โมเดล)')]];
    const TOKS = [['char', TR('ชิ้นตัวอักษร (char_wb)'), TR('ไม่ต้องตัดคำ ทนต่อคำสะกดผิด')], ['thai', TR('ตัดคำไทย (PyThaiNLP)'), TR('แบ่งเป็นคำด้วยพจนานุกรม อ่านผลเข้าใจง่าย')]];
    if (pre.file && !cleaning) { const r = inferRoles(PB.files.get(pre.file).df); if (Object.values(r).includes('text')) { st.dtype = 'text'; st.task = 'text_classification'; } else if (Object.values(r).includes('date')) { st.dtype = 'timeseries'; st.task = 'forecast'; } }
    const body = h('div');
    const summary = h('div', { class: 'wz-summary' });
    const sec = (n, title, content) => h('section', { class: 'wz-sec' }, h('h3', {}, h('span', { class: 'n' }, String(n)), title), content);
    const datasetsFor = (dtype, task) => Object.entries(PB.DATASETS).filter(([, d]) => d.type === dtype && (d.tasks[task] || (task === 'clean' && dtype === 'table')));
    function fixState() {
      const tasks = PB.TASKS[st.dtype];
      if (!tasks.some((t) => t[0] === st.task)) st.task = tasks[0][0];
      const ds = datasetsFor(st.dtype, st.task);
      if (!st.source.startsWith('file:') && !ds.some(([k]) => k === st.source)) st.source = ds.length ? ds[0][0] : PB.files.size ? 'file:' + PB.files.keys().next().value : '';
      const allowed = PB.TASK_MODELS[st.task];
      if (st.modelsFor !== st.task) { st.models = allowed.length ? [allowed[0]] : []; st.modelsFor = st.task; }
      st.models = st.models.filter((m) => allowed.includes(m));
      if (!st.models.length && allowed.length) st.models = [allowed[0]];
      const key = `${st.source}|${st.dtype}|${st.task}`;
      if (st.overKey !== key) { st.over = {}; st.overKey = key; }
      if (st.task === 'clean') {
        /* scan once per data source; the user's ticks live in st.clean until the source changes */
        const file = st.source.startsWith('file:') ? st.source.slice(5) : null;
        if (st.cleanKey !== st.source) {
          const raw = file ? PB.files.get(file).df : PB.loadSample(st.source), roles = inferRoles(raw);
          st.cleanRaw = raw; st.cleanRoles = roles; st.scan = PB.R.cleanScan(raw, roles); st.cleanKey = st.source;
          st.clean = PB.R.cleanDefaults(st.scan, (!file && PB.DATASETS[st.source].tasks.clean) || {});
        }
        st.cfg = Object.assign(file ? { file } : { dataset: st.source }, st.clean);
      } else if (st.source.startsWith('file:')) st.cfg = fileConfig(st.source.slice(5), st.dtype, st.task, st.over);
      else st.cfg = Object.assign({ dataset: st.source }, PB.DATASETS[st.source].tasks[st.task]);
    }
    function render() {
      fixState();
      body.textContent = '';
      body.appendChild(sec(1, TR('ข้อมูลของคุณเป็นแบบไหน'), h('div', { class: 'opt-grid' }, DTYPES.map(([k, t, d]) => { const b = h('button', { type: 'button', class: 'opt', 'aria-pressed': String(st.dtype === k), onclick: () => { st.dtype = k; render(); } }); const g = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); g.setAttribute('viewBox', '0 0 28 22'); g.setAttribute('class', 'glyph'); g.innerHTML = GLYPH[k]; b.append(g, h('b', {}, t), h('small', {}, d)); return b; }))));
      body.appendChild(sec(2, TR('อยากให้คอมพิวเตอร์ทำอะไร'), h('div', { class: 'opt-grid' }, PB.TASKS[st.dtype].map(([k, t, d]) => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(st.task === k), onclick: () => { if (k === 'clean' && st.task !== 'clean' && !st.source.startsWith('file:')) st.source = 'coffee'; st.task = k; render(); } }, h('b', {}, U.cap(t)), h('small', {}, d))))));
      const srcSel = h('select', { class: 'select', id: 'wz-src', onchange: () => { st.source = srcSel.value; render(); } });
      for (const [k, d] of datasetsFor(st.dtype, st.task)) srcSel.appendChild(h('option', { value: k }, TR`${d.title} (${k}) · ${d.rows.toLocaleString()} แถว`));
      for (const [name, f] of PB.files) srcSel.appendChild(h('option', { value: 'file:' + name }, TR`ไฟล์ของฉัน: ${name} · ${f.df.nrows.toLocaleString()} แถว`));
      srcSel.value = st.source;
      const dataBox = h('div', { class: 'field-row' }, h('div', { class: 'field' }, h('label', { for: 'wz-src' }, TR('ชุดข้อมูล')), srcSel), h('button', { class: 'btn btn-sm', onclick: () => A.pickFile((name) => { st.source = 'file:' + name; render(); }) }, U.icon('upload'), TR('อัปโหลดไฟล์')));
      const dsDesc = st.source && !st.source.startsWith('file:') ? h('div', { class: 'muted', style: { marginTop: '6px' } }, PB.DATASETS[st.source].desc) : null;
      const roleBox = st.source.startsWith('file:') && st.task !== 'clean' ? roleEditor() : null;
      const tokBox = st.dtype === 'text' ? h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, TR('วิธีแบ่งข้อความเป็นชิ้น')), h('div', { class: 'opt-grid two' }, TOKS.map(([k, t, d]) => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(st.tokenizer === k), onclick: () => { st.tokenizer = k; render(); } }, h('b', {}, t), h('small', {}, d))))) : null;
      body.appendChild(sec(3, TR('เลือกข้อมูล'), h('div', {}, dataBox, dsDesc, roleBox, tokBox)));
      const allowed = PB.TASK_MODELS[st.task];
      let n = 4;
      if (st.task === 'clean') { body.appendChild(sec(n++, TR('สิ่งที่พบในข้อมูลและวิธีแก้'), cleanIssues())); body.appendChild(sec(n++, TR('ปรับสเกล (Normalize)'), cleanScale())); }
      else if (st.dtype === 'table' && PREP_TASKS.includes(st.task)) body.appendChild(sec(n++, TR('ทำความสะอาด & ปรับสเกล'), prepBox()));
      const evalOn = EVAL_TASKS.includes(st.task);
      if (evalOn) {
        let gridNote = null;
        if (st.evalMode === 'grid' && st.models.length) {
          const g = PB.R.GRIDS[st.models[0]];
          gridNote = h('div', { class: 'muted', style: { marginTop: '8px' } }, g ? TR`ค่าที่จะลองกับ ${st.models[0]}: ` + Object.entries(g).map(([k, v]) => `${k} = ${v.replace(/^\[|\]$/g, '').replace(/"/g, '')}`).join(' · ') + TR(' (แก้ได้ในบล็อก GridSearchCV)') : '');
        }
        body.appendChild(sec(n++, TR('วิธีวัดผล'), h('div', {}, h('div', { class: 'opt-grid' }, EVALS.map(([k, t, d]) => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(st.evalMode === k), onclick: () => { st.evalMode = k; if (k === 'grid') st.models = st.models.slice(0, 1); render(); } }, h('b', {}, t), h('small', {}, d)))), gridNote)));
      }
      if (allowed.length) {
        const multi = !['pca', 'anomaly', 'clustering', 'forecast', 'text_clustering', 'image_pca'].includes(st.task) && !(evalOn && st.evalMode === 'grid');
        body.appendChild(sec(n++, multi ? TR('เลือกโมเดล (เลือกหลายตัว = เปรียบเทียบผล)') : TR('เลือกโมเดล'), h('div', { class: 'opt-grid' }, allowed.map((cls, i) => {
          const M = BK.modelInfo(cls), on = st.models.includes(cls);
          const tags = [];
          if (i === 0) tags.push(h('span', { class: 'tag good' }, TR('แนะนำ')));
          if (M.flags.scale) tags.push(h('span', { class: 'tag' }, TR('ปรับสเกลให้อัตโนมัติ')));
          if (M.flags.slow) tags.push(h('span', { class: 'tag note' }, TR('ฝึกนานกว่า')));
          return h('button', { type: 'button', class: 'opt', role: 'checkbox', 'aria-checked': String(on), onclick: () => { if (multi) { st.models = on ? st.models.filter((m) => m !== cls) : st.models.concat(cls); if (!st.models.length) st.models = [cls]; } else st.models = [cls]; render(); } },
            h('span', { class: 'check' }), h('b', {}, M.th), h('code', {}, cls), h('small', {}, M.desc), h('div', { class: 'tags' }, tags));
        }))));
      }
      summary.textContent = '';
      summary.appendChild(h('b', {}, TR('บล็อกที่จะสร้าง')));
      summary.appendChild(h('div', {}, planText()));
      body.appendChild(summary);
    }
    /* ---------- cleansing task: what the scan found; every fix can be switched off ---------- */
    const OUT_OPTS = [['none', TR('ไม่ทำ')], ['nan', TR('ทำเป็นค่าว่างแล้วเติม')], ['clip', TR('ตัดขอบ (clip)')], ['remove', TR('ลบแถว')]];
    const NUM_FILL = [['median', TR('มัธยฐาน')], ['mean', TR('ค่าเฉลี่ย')], ['drop', TR('ลบแถว')], ['none', TR('ไม่เติม')]];
    const CAT_FILL = [['mode', TR('ค่าที่พบบ่อยที่สุด')], ['unknown', TR('"ไม่ทราบ"')], ['drop', TR('ลบแถว')], ['none', TR('ไม่เติม')]];
    const SCALE_OPTS = [['none', TR('ไม่ปรับ')], ['minmax', 'Min-Max (0–1)'], ['standard', 'Standard (z-score)'], ['robust', TR('Robust (มัธยฐาน/IQR)')], ['maxabs', 'MaxAbs (−1–1)']];
    const SCALE_NOTE = { minmax: TR('MinMaxScaler: ค่าต่ำสุดเป็น 0 ค่าสูงสุดเป็น 1 รูปร่างการกระจายเหมือนเดิม แต่ไวต่อค่าผิดปกติ'), standard: TR('StandardScaler: ค่าเฉลี่ยเป็น 0 ส่วนเบี่ยงเบนมาตรฐานเป็น 1 เหมาะกับโมเดลส่วนใหญ่'), robust: TR('RobustScaler: ใช้มัธยฐานและ IQR จึงทนค่าผิดปกติ'), maxabs: TR('MaxAbsScaler: หารด้วยค่าสัมบูรณ์มากสุด เก็บศูนย์และเครื่องหมายไว้') };
    const pyCol = (c) => `df[${PB.py.str(c)}]`;
    const pill = (label, on, onclick, hint, asIs) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(!!on), onclick }, asIs ? label : U.cap(label), hint ? h('small', {}, hint) : null);
    const pills = (opts, cur, set, label) => h('div', { class: 'pills', role: 'group', 'aria-label': label || null }, opts.map(([k, t]) => pill(t, cur === k, () => { set(k); render(); })));
    let uid = 0;
    function cleanItem(key, title, desc, code, extra) {
      const on = st.clean.on, id = 'cl-' + (key || 'x') + '-' + (++uid);
      const box = h('div', { class: 'cl-item' + (key && !on[key] ? ' off' : '') });
      if (key) { const cb = h('input', { type: 'checkbox', id, onchange: () => { on[key] = cb.checked; render(); } }); cb.checked = !!on[key]; box.appendChild(cb); box.appendChild(h('label', { class: 'cl-title', for: id }, title)); }
      else { box.appendChild(h('span', { class: 'cl-dot', 'aria-hidden': 'true' })); box.appendChild(h('div', { class: 'cl-title' }, title)); }
      if (desc) box.appendChild(h('div', { class: 'cl-desc' }, desc));
      if (code) box.appendChild(h('code', { class: 'cl-code' }, code));
      if (extra && extra.length) box.appendChild(h('div', { class: 'cl-extra' }, extra));
      return box;
    }
    const fmtNum = (v) => (typeof v === 'number' ? PB.numStr(v) : String(v));
    function cleanIssues() {
      const sc = st.scan, c = st.clean, list = h('div', { class: 'cl-list' });
      if (sc.placeholders.length) list.appendChild(cleanItem('placeholders', TR('แทนข้อความที่หมายถึงค่าว่างด้วย NaN'), sc.placeholders.map((p) => TR`"${p.token}" ${p.n} ค่า (${p.cols.join(', ')})`).join(' · '), `df = df.replace([${sc.placeholders.map((p) => PB.py.str(p.token)).join(', ')}], np.nan)`));
      if (sc.strip.length) list.appendChild(cleanItem('strip', TR('ตัดช่องว่างเกินที่หัว-ท้ายข้อความ'), sc.strip.map((e) => TR`${e.col} ${e.n} ค่า`).join(' · '), sc.strip.map((e) => `${pyCol(e.col)}.str.strip()`).join('  ')));
      if (sc.case.length) list.appendChild(cleanItem('case', TR('ทำตัวพิมพ์ใหญ่-เล็กให้ตรงกัน'), sc.case.map((e) => `${e.col}: ${e.examples.join(' / ')} → ${e.fn}()`).join(' · '), sc.case.map((e) => `${pyCol(e.col)}.str.${e.fn}()`).join('  ')));
      if (c.replace.length) list.appendChild(cleanItem('replace', TR('รวมชื่อที่เขียนต่างกันให้เป็นชื่อเดียว'), c.replace.map((r) => `${r.col}: "${r.old}" → "${r.new}"`).join(' · ') + TR(' (กำหนดไว้กับชุดข้อมูลนี้ · ข้อมูลอื่นเพิ่มเองได้ด้วยบล็อก "แทนค่า")'), c.replace.map((r) => `${pyCol(r.col)}.replace(${PB.py.str(r.old)}, ${PB.py.str(r.new)})`).join('  ')));
      if (c.similar && c.similar.length) {
        /* every suggested pair can be switched off on its own: similar spellings are not always the same name */
        const extra = [h('div', { class: 'pills', role: 'group', 'aria-label': TR('คู่ที่จะรวม') }, c.similar.map((r) => {
          const e = (sc.similar || []).find((x) => x.col === r.col && x.old === r.old) || {};
          return pill(`${r.col}: ${r.old} → ${r.new}`, r.on !== false, () => { r.on = r.on === false; render(); }, e.ratio !== undefined ? TR`คล้าย ${PB.pyRoundN(e.ratio, 2)} · ${e.n} แถว` : '', true);
        }))];
        const cols = Array.from(new Set(c.similar.filter((r) => r.on !== false).map((r) => r.col)));
        list.appendChild(cleanItem('similar', TR('รวมชื่อที่สะกดคล้ายกัน (fuzzy matching)'), TR('ค่าที่พบน้อยและสะกดคล้ายค่าที่พบบ่อยกว่า (difflib หลังปรับรูปแบบตัวอักษรไทย) น่าจะเป็นชื่อเดียวกันที่พิมพ์ผิด · แตะคู่ที่ไม่ใช่ชื่อเดียวกันเพื่อไม่รวม'), cols.map((x) => `similar_values(${pyCol(x)})`).join('  '), extra));
      }
      if (sc.numeric.length) list.appendChild(cleanItem('numeric', TR('แปลงตัวเลขที่เก็บเป็นข้อความให้เป็นตัวเลข'), sc.numeric.map((e) => `${e.col}${e.examples.length ? TR(' เช่น ') + e.examples.map((x) => `"${x}"`).join(', ') : ''}${e.mode === 'strip' ? TR(' (ตัด , ฿ บาท % ออกก่อน)') : ''}${e.lost ? TR` · แปลงไม่ได้ ${e.lost} ค่า จะกลายเป็น NaN` : ''}`).join(' · '), sc.numeric.map((e) => `pd.to_numeric(${pyCol(e.col)}${e.mode === 'strip' ? '…' : ''}, errors="coerce")`).join('  ')));
      if (sc.dates && sc.dates.length) list.appendChild(cleanItem('dates', TR('แปลงวันที่ที่พิมพ์หลายรูปแบบเป็นชนิดวันที่'), sc.dates.map((e) => TR`${e.col}: อ่านได้ ${e.ok} จาก ${e.n} ค่า เช่น ${e.examples.map((x) => `"${x}"`).join(', ')}` + (e.bad.length ? TR` · อ่านไม่ได้ ${e.n - e.ok} ค่า เช่น ${e.bad.map((x) => `"${x}"`).join(', ')} จะกลายเป็น NaT` : '')).join(' · ') + TR(' (ปี พ.ศ. แปลงเป็น ค.ศ. ให้)'), sc.dates.map((e) => `${pyCol(e.col)} = parse_dates(${pyCol(e.col)})`).join('  ')));
      if (sc.dups) list.appendChild(cleanItem('dedupe', TR`ลบแถวซ้ำ (${sc.dups} แถว)`, sc.idCols.length ? TR`แถวที่ทุกช่องเหมือนกันทั้งแถว รวมถึงรหัส ${sc.idCols[0]} มักเกิดจากการบันทึกซ้ำ` : TR('ข้อมูลนี้ไม่มีคอลัมน์รหัส แถวที่เหมือนกันอาจเป็นคนละรายการจริง จึงยังไม่ลบให้ ติ๊กเองถ้ามั่นใจว่าเป็นข้อมูลซ้ำ'), 'df = df.drop_duplicates(keep="first")'));
      if (sc.sparse.length) list.appendChild(cleanItem('sparse', TR('ลบคอลัมน์ที่ว่างเกินครึ่ง'), sc.sparse.map((e) => TR`${e.col} ว่าง ${Math.round(e.frac * 100)}%`).join(' · ') + TR(' — เติมค่าไปก็ไม่ได้ข้อมูลจริง'), 'df = df.loc[:, df.isnull().mean() <= 0.5]'));
      if (sc.outliers.length) {
        const o = c.outliers, extra = [pills(OUT_OPTS, o.action, (k) => { o.action = k; }, TR('วิธีจัดการค่าผิดปกติ'))];
        if (o.action !== 'none') extra.push(h('div', { class: 'pills', role: 'group', 'aria-label': TR('คอลัมน์') }, sc.outliers.map((e) => pill(e.col, o.cols.includes(e.col), () => { o.cols = o.cols.includes(e.col) ? o.cols.filter((x) => x !== e.col) : o.cols.concat(e.col); render(); }, TR`${e.n} ค่า`))));
        list.appendChild(cleanItem(null, TR('ค่าผิดปกติ (นอกช่วง Q1 − 1.5×IQR ถึง Q3 + 1.5×IQR)'), sc.outliers.map((e) => TR`${e.col} ${e.n} ค่า เช่น ${e.examples.map(fmtNum).join(', ')}`).join(' · ') + TR(' — ดูก่อนว่าเป็นค่าที่พิมพ์ผิด (ทำเป็นค่าว่างแล้วเติม) หรือค่าจริงที่สุดโต่ง (ตัดขอบหรือเก็บไว้)'), null, extra));
      }
      /* the columns that still have gaps after the steps above (outliers turned into NaN included) */
      const probe = PB.R.cleanPlan(st.cleanRaw, Object.assign({}, c, { missing: { num: 'median', cat: 'mode' }, scale: { method: 'none' } }), st.cleanRoles).steps.filter((x) => x.kind === 'fill');
      const numF = probe.filter((x) => x.how === 'median'), catF = probe.filter((x) => x.how === 'mode');
      if (probe.length) {
        const m = c.missing, extra = [];
        if (numF.length) extra.push(h('div', { class: 'cl-row' }, h('span', { class: 'cl-lbl' }, TR('ตัวเลข · ') + numF.map((x) => `${x.col} ${x.n}`).join(', ')), pills(NUM_FILL, m.num, (k) => { m.num = k; }, TR('คอลัมน์ตัวเลข'))));
        if (catF.length) extra.push(h('div', { class: 'cl-row' }, h('span', { class: 'cl-lbl' }, TR('หมวดหมู่ · ') + catF.map((x) => `${x.col} ${x.n}`).join(', ')), pills(CAT_FILL, m.cat, (k) => { m.cat = k; }, TR('คอลัมน์หมวดหมู่'))));
        list.appendChild(cleanItem(null, TR('ค่าว่างที่เหลือ'), TR('จำนวนค่าว่างหลังขั้นตอนข้างบน เลือกวิธีเติมของแต่ละชนิดคอลัมน์ (มัธยฐานไม่ถูกดึงด้วยค่าสุดโต่งเหมือนค่าเฉลี่ย)'), null, extra));
      }
      if (!list.childNodes.length) list.appendChild(h('div', { class: 'cl-none' }, TR('ไม่พบปัญหาที่ต้องแก้: ไม่มีค่าว่าง ข้อความแทนค่าว่าง แถวซ้ำ หรือตัวเลขที่เก็บเป็นข้อความ ข้ามไปปรับสเกลได้เลย')));
      return list;
    }
    function cleanScale() {
      const c = st.clean, sc = c.scale;
      const after = PB.R.cleanPlan(st.cleanRaw, Object.assign({}, c, { scale: { method: 'none' } }), st.cleanRoles).df;
      const nums = after.columns.filter((x) => after.dtypeOf(x) === 'int64' || after.dtypeOf(x) === 'float64');
      const box = h('div', { class: 'cl-list' }, pills(SCALE_OPTS, sc.method, (k) => { sc.method = k; }, TR('วิธีปรับสเกล')));
      if (sc.method !== 'none') {
        box.appendChild(h('div', { class: 'cl-row' }, h('span', { class: 'cl-lbl' }, TR('คอลัมน์ที่ปรับ')), h('div', { class: 'pills', role: 'group', 'aria-label': TR('คอลัมน์ที่ปรับสเกล') }, nums.map((x) => pill(x, sc.cols.includes(x), () => { sc.cols = sc.cols.includes(x) ? sc.cols.filter((y) => y !== x) : nums.filter((y) => y === x || sc.cols.includes(y)); render(); })))));
        const pl = h('input', { type: 'checkbox', id: 'cl-plots', onchange: () => { sc.plots = pl.checked; render(); } }); pl.checked = sc.plots !== false;
        box.appendChild(h('div', { class: 'cl-check' }, pl, h('label', { for: 'cl-plots' }, TR('วาดกราฟกล่องก่อนและหลังปรับสเกล'))));
        box.appendChild(h('div', { class: 'muted' }, TR`${SCALE_NOTE[sc.method]} · ถ้าจะนำไปสร้างโมเดล ควรเรียนสเกลจากชุดฝึกเท่านั้น (ตัวช่วยเลือกโมเดลใส่ตัวปรับสเกลไว้ในไปป์ไลน์ให้)`));
      }
      const sv = h('input', { type: 'checkbox', id: 'cl-save', onchange: () => { c.save = sv.checked; render(); } }); sv.checked = !!c.save;
      box.appendChild(h('div', { class: 'cl-check' }, sv, h('label', { for: 'cl-save' }, TR('บันทึกข้อมูลที่สะอาดแล้วเป็นไฟล์ clean_data.csv'))));
      return box;
    }
    function cleanPlanText() {
      const plan = PB.R.cleanPlan(st.cleanRaw, st.clean, st.cleanRoles).steps, of = (k) => plan.filter((x) => x.kind === k);
      const out = [TR('โหลดข้อมูล'), TR('ตรวจคุณภาพ')];
      if (of('na').length) out.push(TR('ข้อความแทนค่าว่าง → NaN'));
      const t = of('text').length + of('replace').length; if (t) out.push(TR`แก้ข้อความ ${t} จุด`);
      const sm = of('similar').reduce((n, x) => n + x.pairs.length, 0); if (sm) out.push(TR`รวมชื่อที่สะกดคล้ายกัน ${sm} คู่`);
      if (of('numeric').length) out.push(TR`แปลงเป็นตัวเลข ${of('numeric').length} คอลัมน์`);
      if (of('dates').length) out.push(TR`แปลงวันที่ ${of('dates').length} คอลัมน์`);
      if (of('dedupe').length) out.push(TR`ลบแถวซ้ำ ${of('dedupe')[0].n} แถว`);
      if (of('sparse').length) out.push(TR`ลบคอลัมน์ ${of('sparse')[0].cols.join(', ')}`);
      if (of('outlier').length) out.push(TR('ค่าผิดปกติใน ') + of('outlier').map((x) => x.col).join(', '));
      if (of('fill').length) out.push(TR`เติมค่าว่าง ${of('fill').length} คอลัมน์`);
      if (of('dropna').length) out.push(TR`ลบแถวที่ว่าง ${of('dropna')[0].n} แถว`);
      if (plan.some((x) => x.kind !== 'scale')) out.push(TR('ตรวจคุณภาพอีกครั้ง'));
      const sc = of('scale')[0]; if (sc) out.push(TR`${sc.cls} ${sc.cols.length} คอลัมน์`);
      if (st.clean.save) out.push(TR('บันทึก clean_data.csv'));
      return out.join(' → ');
    }
    /* ---------- table tasks: cleaning and scaling before the model ---------- */
    function prepBox() {
      const p = st.prep, anomaly = st.task === 'anomaly', grid = h('div', { class: 'prep-grid' });
      const row = (label, key, opts) => { grid.appendChild(h('span', { class: 'lbl' }, label)); grid.appendChild(pills(opts, p[key], (k) => { p[key] = k; }, label)); };
      row(TR('ค่าว่าง'), 'missing', [['auto', TR('อัตโนมัติ')], ['fill', TR('เติมค่า')], ['drop', TR('ลบแถวที่ว่าง')]]);
      row(TR('แถวซ้ำ'), 'dedupe', [['keep', TR('เก็บไว้')], ['drop', TR('ลบแถวซ้ำ')]]);
      if (!anomaly) row(TR('ค่าผิดปกติ'), 'outliers', [['none', TR('ไม่ทำ')], ['clip', TR('ตัดขอบ (IQR)')], ['remove', TR('ลบแถว (IQR)')]]);
      if (!anomaly) row(TR('ปรับสเกล'), 'scaler', [['standard', 'StandardScaler'], ['minmax', 'MinMaxScaler'], ['robust', 'RobustScaler'], ['none', TR('ไม่ปรับ')]]);
      grid.appendChild(h('div', { class: 'prep-info' }, prepInfo()));
      return grid;
    }
    function prepInfo() {
      const cfg = st.cfg || {}, data = PB.R.prepData(cfg);
      if (!data) return '';
      const used = [cfg.target].concat(cfg.features || []).filter((c) => c && data.has(c)), roles = inferRoles(data);
      const miss = used.map((c) => [c, data._data.get(c).filter(PB.isMissing).length]).filter((x) => x[1]);
      const outl = used.filter((c) => c !== cfg.target && roles[c] === 'num').map((c) => [c, PB.outliers(data.col(c), 'iqr', 1.5).mask.filter(Boolean).length]).filter((x) => x[1]);
      const dups = data.duplicatedCount();
      const parts = [miss.length ? TR('ค่าว่าง ') + miss.map(([c, k]) => `${c} ${k}`).join(', ') : TR('คอลัมน์ที่ใช้ไม่มีค่าว่าง'), dups ? TR`แถวซ้ำ ${dups} แถว` : TR('ไม่มีแถวซ้ำ')];
      if (st.task !== 'anomaly') parts.push(outl.length ? TR('ค่าผิดปกติ ') + outl.map(([c, k]) => `${c} ${k}`).join(', ') : TR('ไม่พบค่าผิดปกติตามกฎ IQR'));
      const auto = Object.keys(cfg.fill || {}).length ? TR`เติม ${Object.entries(cfg.fill).map(([k, v]) => TR`${k} ด้วย ${v}`).join(', ')}${cfg.dropna ? TR(' แล้วลบแถวที่ยังว่าง') : ''}` : cfg.dropna ? TR('ลบแถวที่ว่าง') : TR('ไม่ต้องจัดการ');
      let txt = TR('ข้อมูลนี้: ') + parts.join(' · ') + TR` · ค่าว่างแบบอัตโนมัติ = ${auto}`;
      if (st.task !== 'anomaly') txt += st.task === 'clustering' || st.task === 'pca' ? TR(' · ตัวปรับสเกลใช้กับ X ก่อนจัดกลุ่ม/ลดมิติ') : TR(' · ตัวปรับสเกลใช้เฉพาะโมเดลที่ต้องปรับสเกล (KNN, SVM, MLP, LogisticRegression …) ผ่านไปป์ไลน์ จึงเรียนสเกลจากชุดฝึกเท่านั้น');
      return txt;
    }
    function roleEditor() {
      const cfg = st.cfg, df = PB.files.get(cfg.file).df, cols = df.columns;
      const box = h('div', { style: { marginTop: '10px', display: 'grid', gap: '10px' } });
      const pick = (label, key, opts) => { const s = h('select', { class: 'select', id: 'wz-' + key, onchange: () => { st.over[key] = s.value; render(); } }, opts.map((c) => h('option', { value: c }, c))); s.value = cfg[key] ?? ''; return h('div', { class: 'field' }, h('label', { for: 'wz-' + key }, label), s); };
      const toggle = (c) => { const f = (st.over.features || cfg.features).slice(); const i = f.indexOf(c); if (i >= 0) f.splice(i, 1); else f.push(c); st.over.features = cols.filter((x) => f.includes(x)); render(); };
      const chip = (c, hint) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(cfg.features.includes(c)), onclick: () => toggle(c) }, c, hint ? h('small', {}, hint) : null);
      const ROLE_TH = { num: TR('ตัวเลข'), 'num-cat': TR('ตัวเลขกลุ่ม'), cat: TR('หมวดหมู่'), text: TR('ข้อความ'), date: TR('วันที่'), id: TR('รหัส') };
      if (st.task === 'classification' || st.task === 'regression') {
        box.appendChild(pick(TR('คอลัมน์คำตอบ (เป้าหมาย y)'), 'target', st.task === 'regression' ? cols.filter((c) => PB.isNumericDtype(df.dtypeOf(c))) : cols));
        box.appendChild(h('div', { class: 'field' }, h('label', {}, TR('คอลัมน์ฟีเจอร์ (X) · แตะเพื่อเลือก/ไม่เลือก')), h('div', { class: 'chips' }, cols.filter((c) => c !== cfg.target).map((c) => chip(c, ROLE_TH[cfg.roles[c]])))));
      } else if (st.dtype === 'text') { box.appendChild(h('div', { class: 'field-row' }, pick(TR('คอลัมน์ข้อความ'), 'text', cols), st.task === 'text_classification' ? pick(TR('คอลัมน์คำตอบ'), 'target', cols) : null)); }
      else if (st.dtype === 'timeseries') { box.appendChild(h('div', { class: 'field-row' }, pick(TR('คอลัมน์ค่าที่จะพยากรณ์'), 'value', cols.filter((c) => PB.isNumericDtype(df.dtypeOf(c)))))); }
      else if (st.dtype === 'image') box.appendChild(pick(TR('คอลัมน์ป้ายกำกับ'), 'target', cols));
      else if (st.task !== 'eda') box.appendChild(h('div', { class: 'field' }, h('label', {}, TR('คอลัมน์ตัวเลขที่ใช้ · แตะเพื่อเลือก/ไม่เลือก')), h('div', { class: 'chips' }, cols.filter((c) => PB.isNumericDtype(df.dtypeOf(c))).map((c) => chip(c)))));
      const dropped = cols.filter((c) => cfg.roles[c] === 'id' || cfg.roles[c] === 'text');
      if (dropped.length && (st.task === 'classification' || st.task === 'regression')) box.appendChild(h('div', { class: 'muted' }, TR`ไม่ใช้คอลัมน์ ${dropped.join(', ')} เป็นฟีเจอร์ เพราะเป็นข้อความยาวหรือรหัสที่ไม่ซ้ำกัน (แตะเพื่อเพิ่มเองได้)`));
      const problem = checkConfig(Object.assign({ task: st.task }, cfg));
      if (problem) box.appendChild(h('div', { class: 'wz-problem', role: 'status' }, problem));
      return box;
    }
    function planText() {
      if (st.task === 'clean') return cleanPlanText();
      const c = st.cfg || {}; const steps = [TR('โหลดข้อมูล')];
      const prepOn = st.dtype === 'table' && PREP_TASKS.includes(st.task), p = st.prep;
      if (prepOn && p.dedupe === 'drop') steps.push(TR('ลบแถวซ้ำ'));
      if (prepOn && p.missing === 'fill') steps.push(TR('เติมค่าว่าง (มัธยฐาน / ค่าที่พบบ่อย)'));
      else if (prepOn && p.missing === 'drop') steps.push(TR('ลบแถวที่ว่าง'));
      else {
        if (c.fill && Object.keys(c.fill).length) steps.push(TR('เติมค่าว่าง'));
        if (c.dropna) steps.push(TR('ลบแถวที่ว่าง'));
      }
      if (prepOn && st.task !== 'anomaly' && p.outliers !== 'none') steps.push(p.outliers === 'clip' ? TR('ตัดขอบค่าผิดปกติ') : TR('ลบแถวที่มีค่าผิดปกติ'));
      if (c.dummies && c.dummies.length) steps.push(TR('แปลงหมวดหมู่เป็น 0/1'));
      if (st.dtype === 'text' && st.tokenizer === 'thai') steps.push(TR('ตัดคำไทย'));
      if (prepOn && st.task !== 'anomaly') { const scaled = st.task === 'clustering' || st.task === 'pca' || st.models.some((m) => BK.modelInfo(m).flags.scale); if (scaled) steps.push(p.scaler === 'none' ? TR('ไม่ปรับสเกล') : TR('ปรับสเกลด้วย ') + PB.R.SCALER_CLS[p.scaler]); }
      const ev = EVAL_TASKS.includes(st.task) ? st.evalMode : 'holdout';
      if (ev !== 'cv' && ['classification', 'regression', 'text_classification', 'image_classification', 'forecast'].includes(st.task)) steps.push(TR('แบ่งข้อมูลฝึก/ทดสอบ'));
      if (ev === 'grid' && st.models.length) steps.push(TR`GridSearchCV หาค่าพารามิเตอร์ของ ${st.models[0]}`);
      else if (st.models.length > 1 && !['clustering', 'pca', 'anomaly'].includes(st.task)) steps.push(TR`เปรียบเทียบ ${st.models.length} โมเดล${ev === 'cv' ? TR('ด้วย cross-validation') : ''}`);
      else if (st.models.length) steps.push(st.models[0] + (ev === 'cv' ? TR(' + cross-validation 5 รอบ') : ''));
      steps.push(st.task === 'eda' || st.task === 'trend' ? TR('สถิติและกราฟ') : TR('วัดผลและกราฟ'));
      return steps.join(' → ');
    }
    const replace = h('button', { class: 'btn btn-accent', onclick: () => build(false) }, U.icon('wand'), TR('สร้างบล็อกและรัน'));
    const append = h('button', { class: 'btn', onclick: () => build(true) }, TR('เพิ่มต่อท้ายของเดิม'));
    function build(appendMode) {
      fixState();
      const ev = EVAL_TASKS.includes(st.task) ? st.evalMode : 'holdout';
      const prep = st.dtype === 'table' && PREP_TASKS.includes(st.task) ? { prep: { missing: st.prep.missing, dedupe: st.prep.dedupe === 'drop', outliers: st.prep.outliers, scaler: st.prep.scaler } } : {};
      const cfg = Object.assign({ task: st.task, models: ev === 'grid' ? st.models.slice(0, 1) : st.models, evalMode: ev, tokenizer: st.dtype === 'text' ? st.tokenizer : undefined }, st.cfg, prep);
      const problem = checkConfig(cfg);
      if (problem) { U.alert(problem); return; }
      let prog;
      try { prog = PB.R.build(cfg); } catch (e) { U.alert(TR('สร้างบล็อกไม่ได้: ') + e.message); return; }
      m.close();
      if (appendMode) { A.appendProgram(prog); U.toast(TR('เพิ่มบล็อกต่อท้ายแล้ว กด ▶ รัน ได้เลย')); }
      else A.loadProgram(prog, { run: true });
    }
    render();
    const m = U.modal({ title: cleaning ? TR('ตัวช่วยทำความสะอาดข้อมูล') : TR('ตัวช่วยเลือกโมเดล'), body, foot: [h('div', { class: 'grow' }, TR('ทุกบล็อกที่สร้างคือคำสั่ง pandas / scikit-learn จริง')), append, replace] });
  };

  /* ======================= menus & project files ======================= */
  A.openSamples = (anchor) => U.menu(anchor, [
    { title: TR('แบบฝึกหัด: ต่อบล็อกตามโจทย์'), sub: TR`${PB.EXERCISES.length} ข้อ ตรวจคำตอบอัตโนมัติ`, run: () => A.openExercises() },
    { title: TR('ตัวช่วยทำความสะอาดข้อมูล'), sub: TR('หาค่าว่าง แถวซ้ำ ค่าผิดปกติ แล้วปรับสเกลให้'), run: () => A.openWizard({ task: 'clean' }) }, '-',
    { label: TR('โครงงานตัวอย่าง') }, ...PB.SAMPLES.map((s) => ({ title: s.title, sub: s.sub, run: () => A.loadProgram(s.build(), { run: true }) }))]);
  A.openMore = (anchor) => U.menu(anchor, [
    { title: TR('English · เปลี่ยนเป็นภาษาอังกฤษ'), sub: TR('ทั้งแอปเป็นภาษาอังกฤษ บล็อกและไฟล์ที่อัปโหลดยังอยู่ครบ'), run: () => PB.i18n.switchTo(PB.i18n.other()) },
    { title: TR('แบบฝึกหัด'), sub: TR`ต่อบล็อกตามโจทย์ ${PB.EXERCISES.length} ข้อ`, run: () => A.openExercises() },
    { title: TR('ทำความสะอาดข้อมูล'), sub: TR('ค่าว่าง แถวซ้ำ ค่าผิดปกติ และปรับสเกล (Normalize)'), run: () => A.openWizard({ task: 'clean' }) },
    { title: TR('ส่งออกผลลัพธ์เป็น PDF'), sub: TR('หน้าผลลัพธ์ทั้งหมด (ตาราง กราฟ ข้อความ) เป็นไฟล์ PDF ขนาด A4'), run: () => A.exportPdf(), hidden: !A.caps.downloads },
    { title: TR('ส่งออกรายงาน HTML'), sub: TR('ผลลัพธ์ กราฟ คำอธิบายภาษาไทย และโค้ด ในไฟล์เดียว'), run: () => A.exportReport(), hidden: !A.caps.downloads },
    { title: TR('ดาวน์โหลดชุดโค้ด (.zip)'), sub: TR('.py + .ipynb (Colab) + รายงาน + บล็อก + คำอธิบาย'), run: () => A.exportZip(), hidden: !A.caps.downloads },
    { title: TR('คัดลอกโค้ด Python'), sub: TR('วางใน Colab / Jupyter / VS Code ได้ทันที'), run: () => A.copyText(A.fullScript(A.codeOpts.comments), TR('คัดลอกโค้ด Python แล้ว')) },
    { title: TR('บันทึกโครงงาน (.json)'), sub: TR('เก็บบล็อกไว้เปิดภายหลัง'), run: () => A.saveFile(PB.APP.slug + '_project.json', JSON.stringify({ app: PB.APP.name, version: 1, workspace: Blockly.serialization.workspaces.save(A.ws) }, null, 1)), hidden: !A.caps.downloads },
    { title: TR('เปิดโครงงาน'), sub: TR('ไฟล์ .json หรือ .blocks.json'), run: () => openProject() },
    '-',
    { title: TR('รันทีละขั้นช้า ๆ'), sub: TR`ตอนนี้ ${A.stepDelay} มิลลิวินาที/ขั้น`, run: () => { A.stepDelay = A.stepDelay >= 900 ? 250 : A.stepDelay + 300; U.toast(TR`ความเร็วทีละขั้น: ${A.stepDelay} มิลลิวินาที`); } },
    { title: TR('จัดเรียงบล็อก'), run: () => A.ws.cleanUp() },
    { title: TR('ล้างพื้นที่ทำงาน'), sub: TR('ลบบล็อกทั้งหมด แล้วกลับไปหน้าเริ่มต้น'), run: () => U.confirm(TR('ลบบล็อกทั้งหมดในพื้นที่ทำงาน?'), (ok) => {
      if (!ok) return;
      A.ws.clear(); A.out.clear(); A.vars = null; A.lastError = null; A.setErrorBadge(false); A.setStatus('', TR('พร้อมรัน'));
      if (A.refreshVars) A.refreshVars();
      if (A.start) A.start.reset();
    }, TR('ลบทั้งหมด')) },
  ], { alignRight: true });
  A.openProject = () => openProject();
  function openProject() {
    const inp = h('input', { type: 'file', accept: '.json', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files[0]; inp.remove(); if (!f) return;
      try { const j = JSON.parse(await f.text()); const st = j.workspace || j; if (!st.blocks) throw new Error(TR('ไม่พบบล็อกในไฟล์')); A.loadProgram(st); U.toast(TR('เปิดโครงงานแล้ว')); }
      catch (e) { U.alert(TR('เปิดไฟล์โครงงานไม่ได้: ') + e.message); }
    });
    document.body.appendChild(inp); inp.click();
  }

  /* ======================= boot ======================= */
  async function boot() {
    const fontWait = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, U.sleep(1800)]) : Promise.resolve();
    await fontWait;
    PB.i18n.translateDom(document.body);
    A.initWorkspace();
    A.initLayout();
    U.$$('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
      const act = b.dataset.act;
      if (act === 'run') A.run(); else if (act === 'step') A.run({ step: true }); else if (act === 'stop') A.stop();
      else if (act === 'wizard') A.openWizard(); else if (act === 'clean') A.openWizard({ task: 'clean' }); else if (act === 'samples') A.openSamples(b); else if (act === 'data') A.openData(); else if (act === 'more') A.openMore(b);
      else if (act === 'exercises') A.openExercises(); else if (act === 'report') A.exportReport(); else if (act === 'pdf') A.exportPdf();
      else if (act === 'zoom-in') A.ws.zoomCenter(1); else if (act === 'zoom-out') A.ws.zoomCenter(-1); else if (act === 'center') A.ws.zoomToFit(); else if (act === 'tidy') A.ws.cleanUp();
      else if (act === 'lang') PB.i18n.switchTo(PB.i18n.other());
      else if (act === 'clear-out') { A.out.clear(); } else if (act === 'copy-code') A.copyText(A.fullScript(A.codeOpts.comments), TR('คัดลอกโค้ด Python แล้ว')); else if (act === 'zip') A.exportZip();
      void e;
    }));
    const cm = $('#code-comments'); cm.value = A.codeOpts.comments; cm.addEventListener('change', () => { A.codeOpts.comments = cm.value; U.store.set('pyblocks.codeOpts', A.codeOpts); A.refreshCode(true); });
    U.$$('[data-tr-mode]').forEach((b) => b.addEventListener('click', () => { A.trMode = b.dataset.trMode; U.$$('[data-tr-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); A.refreshTranslate(true); }));
    U.$$('[data-tr-lang]').forEach((b) => b.addEventListener('click', () => { A.trLang = b.dataset.trLang; U.$$('[data-tr-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); A.refreshTranslate(true); }));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); A.run(); }
      if (e.key === 'Escape' && A.running) A.stop();
    });
    document.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
    document.addEventListener('drop', async (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length || e.target.closest('.file-drop')) return; e.preventDefault(); for (const f of e.dataTransfer.files) { try { await A.readFile(f); } catch (err) { U.alert(TR('อ่าน ') + f.name + TR(' ไม่สำเร็จ: ') + (err.thai || err.message)); return; } } A.openData(); });
    U.$$('[data-tr-lang]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.trLang === A.trLang)));
    /* files uploaded before switching language come back with the page */
    const kept = await PB.i18n.restoreFiles();
    if (kept) U.toast(TR`ไฟล์ที่อัปโหลดไว้ ${kept} ไฟล์ยังอยู่ครบ`);
    /* a new tab or visit opens on the start screen with a blank workspace (the saved work is offered there);
       a reload or a language switch in this tab brings back the program or exercise that was open */
    A.blankStart = true;
    A.start.init();
    const reopen = A.start.reopening();
    if (reopen) A.restoreWork();
    A.onSelect(null);
    document.body.classList.add('ready');
    A.start.boot({ fresh: !reopen });
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then((d) => { A.caps.downloads = d; U.$$('[data-needs="downloads"]').forEach((e) => { e.hidden = !d; }); }).catch(() => {});
      window.claude.use('sample').then((s) => { A.caps.sample = s; if (A.panel === 'translate') A.refreshTranslate(true); }).catch(() => {});
    } else if (window.top === window.self) {
      /* a plain web page (GitHub Pages, or the file opened in a browser): the browser saves files itself */
      A.caps.downloads = A.browserDownloads;
      U.$$('[data-needs="downloads"]').forEach((e) => { e.hidden = false; });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

