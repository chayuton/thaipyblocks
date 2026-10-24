/* ThaiPyBlocks: a standalone HTML report of the last run — key numbers, every output cell
   (tables, charts, text), the program explained step by step in Thai, and the full Python code. */
(function () {
  const U = PB.u, $ = U.$, A = PB.ui, esc = U.esc;

  /* the app's own styles for tokens, output cells, tables and charts (top-level rules, light theme only) */
  function appCss() {
    const t = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).find((x) => x.includes('.cell-gutter')) || '';
    const KEEP = /(^|[\s,>])(:root|\.cell|\.out-text|\.err-|\.tbl-|table\.df|\.chart|\.legend|\.tip|\.img-grid|\.dl-card|\.tk-|\.tag|\.muted)/;
    const out = [];
    let i = 0;
    while (i < t.length) {
      const open = t.indexOf('{', i);
      if (open < 0) break;
      const sel = t.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (sel.startsWith('@')) {
        let depth = 0, j = open;
        for (; j < t.length; j++) { if (t[j] === '{') depth++; else if (t[j] === '}' && --depth === 0) break; }
        i = j + 1; continue;
      }
      const close = t.indexOf('}', open);
      if (close < 0) break;
      if (KEEP.test(sel) && !sel.includes('data-theme')) out.push(`${sel} {${t.slice(open + 1, close)}}`);
      i = close + 1;
    }
    return out.join('\n');
  }
  const REPORT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; background: #eef1f5; color: var(--ink); font: 15px/1.6 var(--font-body); -webkit-font-smoothing: antialiased; }
.page { max-width: 1000px; margin: 0 auto; padding: 32px 22px 64px; }
.rp-head { display: grid; gap: 6px; margin-bottom: 18px; }
.rp-brand { display: flex; align-items: center; gap: 8px; font: 600 13px var(--font-display); color: var(--accent); letter-spacing: .02em; }
.rp-brand i { width: 14px; height: 10px; border-radius: 3px; background: var(--accent); display: inline-block; }
.rp-brand i + i { background: var(--signal); margin-left: -4px; }
h1 { font: 700 30px/1.25 var(--font-display); margin: 0; text-wrap: balance; }
.rp-meta { color: var(--ink-3); font-size: 13px; }
.rp-err { background: var(--err-soft); border-left: 3px solid var(--err); border-radius: 8px; padding: 10px 14px; margin: 0 0 16px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; margin-bottom: 4px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; display: grid; gap: 2px; }
.tile .k { font-size: 12.5px; color: var(--ink-2); }
.tile .v { font: 600 25px/1.2 var(--font-display); font-variant-numeric: tabular-nums; color: var(--ink); word-break: break-all; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; margin-top: 18px; overflow: hidden; }
.card > h2 { font: 600 17px var(--font-display); margin: 0; padding: 14px 18px; border-bottom: 1px solid var(--line-soft); }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; padding: 14px 18px; margin: 0; }
.facts dt { color: var(--ink-3); font-size: 13.5px; }
.facts dd { margin: 0; }
.facts code, .steps-th code { font: 500 12.5px var(--font-mono); background: var(--surface-3); padding: 0 5px; border-radius: 4px; }
.outs .cell:last-child { border-bottom: 0; }
.outs .chart { max-width: 680px; }
.img-grid img { width: 56px; height: 56px; image-rendering: pixelated; border-radius: 4px; border: 1px solid var(--line-soft); background: #fff; }
.steps-th { margin: 0; padding: 14px 18px 16px 42px; display: grid; gap: 8px; }
.steps-th ol { margin: 6px 0 0; padding-left: 20px; display: grid; gap: 4px; }
.steps-th .py { display: block; font: 12px/1.45 var(--font-mono); color: var(--ink-3); margin-top: 1px; white-space: pre-wrap; word-break: break-word; }
.steps-th .br { font-size: 12.5px; font-weight: 600; color: var(--ink-2); list-style: none; margin-left: -18px; }
details.code { padding: 0; }
details.code > summary { cursor: pointer; padding: 12px 18px; font-weight: 600; color: var(--accent); }
pre.py { margin: 0; padding: 12px 18px 16px; background: var(--code-bg); font: 12.5px/1.6 var(--font-mono); white-space: pre-wrap; word-break: break-word; border-top: 1px solid var(--line-soft); }
.rp-foot { margin-top: 22px; color: var(--ink-3); font-size: 12.5px; display: grid; gap: 4px; }
.rp-foot code { font-family: var(--font-mono); }
@media (max-width: 640px) { .page { padding: 18px 12px 40px; } h1 { font-size: 24px; } .facts { grid-template-columns: 1fr; gap: 2px; } .facts dd { margin-bottom: 8px; } .cell { grid-template-columns: 1fr; } .cell-gutter { text-align: left; } }
@media print {
  body { background: #fff; font-size: 12.5px; }
  .page { max-width: none; padding: 0; }
  .card { border-color: #ccd3dc; break-inside: auto; }
  .cell, .tile, .chart { break-inside: avoid; }
  .tbl-wrap { max-height: none !important; overflow: visible !important; }
}`;

  /* ---------- pieces of the report ---------- */
  function metrics() {
    const out = [];
    for (const e of A.out.log) {
      if (e.kind !== 'print' || e.values.length !== 2 || typeof e.values[0] !== 'string') continue;
      const v = PB.unbox(e.values[1]);
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const label = e.values[0].replace(/[:：]\s*$/, '').trim() || TR('ค่า');
      if (out.some((m) => m.label === label)) continue;
      out.push({ label, value: v, full: PB.str(e.values[1]) });
    }
    return out.slice(0, 12);
  }
  const fmt = (v) => (Number.isInteger(v) ? v.toLocaleString('en-US') : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Number(v.toPrecision(4))));
  function facts() {
    const blocks = A.ws.getAllBlocks(false).filter((b) => b.isEnabled());
    const uniq = (a) => [...new Set(a)];
    const data = uniq(blocks.filter((b) => b.type === 'pb_dataset').map((b) => { const k = b.getFieldValue('NAME'), d = PB.DATASETS[k]; return d ? `${d.title} (${k})` : k; })
      .concat(blocks.filter((b) => b.type === 'pb_read_file').map((b) => TR`ไฟล์ ${b.getFieldValue('FILE')}`)));
    const models = uniq(blocks.filter((b) => /^pb_m_/.test(b.type)).map((b) => b.type.slice(5)));
    const evals = [];
    if (blocks.some((b) => b.type === 'pb_split')) evals.push(TR('แบ่งข้อมูลฝึก/ทดสอบ'));
    if (blocks.some((b) => b.type === 'pb_cv' || b.type === 'pb_compare_cv')) evals.push('cross-validation');
    if (blocks.some((b) => b.type === 'pb_grid')) evals.push('GridSearchCV');
    if (blocks.some((b) => b.type === 'pb_cv_ts')) evals.push('TimeSeriesSplit');
    if (blocks.some((b) => b.type === 'pb_naive')) evals.push(TR('เทียบกับค่าพยากรณ์แบบง่าย'));
    const thai = blocks.some((b) => /^pb_th_|pb_word_count/.test(b.type) || (b.type === 'pb_vectorizer' && /^thai/.test(b.getFieldValue('AN'))));
    const rows = [];
    if (data.length) rows.push([TR('ข้อมูล'), data.join(', ')]);
    const df = A.vars && PB.unbox(A.vars.get('df'));
    if (df instanceof PB.DataFrame) rows.push([TR('ตาราง df ตอนจบ'), TR`${df.nrows.toLocaleString()} แถว × ${df.ncols} คอลัมน์`]);
    if (models.length) rows.push([TR('โมเดล'), models.map((m) => `<code>${esc(m)}</code>`).join(' ')]);
    if (evals.length) rows.push([TR('วิธีวัดผล'), evals.join(' · ')]);
    if (thai) rows.push([TR('ข้อความภาษาไทย'), TR('ตัดคำด้วย PyThaiNLP (engine newmm)')]);
    rows.push([TR('ผลการรัน'), A.lastError ? TR`<span style="color:var(--err)">หยุดเพราะข้อผิดพลาด</span>` : TR`สำเร็จ${A.lastRunSecs ? TR` ใน ${esc(A.lastRunSecs)} วินาที` : ''}`]);
    return { rows, data, models };
  }
  function outputsHtml() {
    return Array.from(document.querySelectorAll('#out-body .cell')).map((c) => {
      const k = c.cloneNode(true);
      const g = k.querySelector('.cell-gutter'); if (g) g.textContent = g.textContent.trim();
      const src = c.querySelectorAll('canvas'), dst = k.querySelectorAll('canvas');
      dst.forEach((cv, i) => {
        try { const img = document.createElement('img'); img.src = src[i].toDataURL('image/png'); img.alt = TR('ภาพพิกเซล'); cv.replaceWith(img); } catch (e) { cv.remove(); }
      });
      k.querySelectorAll('button, .tip').forEach((b) => b.remove());
      k.querySelectorAll('[aria-describedby], [tabindex]').forEach((el) => { el.removeAttribute('tabindex'); });
      return k.outerHTML;
    }).join('\n');
  }
  function stepsHtml() {
    const steps = PB.explain.steps(A.ws, PB.i18n.lang);
    const list = (items) => items.map((s) => {
      let li = `<li>${esc(s.text)}${s.code ? `<span class="py">${esc(s.code)}</span>` : ''}`;
      if (s.children.length) li += `<ol>${list(s.children)}</ol>`;
      if (s.branches) s.branches.forEach((br) => { if (br.label || br.steps.length) li += `<ol>${br.label ? `<li class="br">${esc(br.label)}</li>` : ''}${list(br.steps)}</ol>`; });
      return li + '</li>';
    }).join('');
    return steps.length ? `<ol class="steps-th">${list(steps)}</ol>` : TR('<p class="muted" style="padding:14px 18px;margin:0">ยังไม่มีบล็อก</p>');
  }

  /* title and overview of the last run, shared by the HTML report and the PDF export (src/ui/pdf.js) */
  A.runInfo = () => {
    const f = facts();
    const ex = A.ex && A.ex.active ? PB.EXERCISES.find((e) => e.id === A.ex.active) : null;
    const title = ex ? TR`แบบฝึกหัดข้อ ${ex.n}: ${ex.title}` : TR('รายงานผลการวิเคราะห์') + (f.models.length ? `: ${f.models.slice(0, 3).join(', ')}${f.models.length > 3 ? ' …' : ''}` : '') + (f.data.length ? TR` กับข้อมูล${f.data[0].replace(/ \(.*\)$/, '')}` : '');
    const when = new Date().toLocaleString(PB.i18n.lang === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'long', timeStyle: 'short' });
    return { title, when, rows: f.rows, data: f.data, models: f.models };
  };
  A.buildReport = () => {
    const { title, when, rows } = A.runInfo(), f = { rows }, m = metrics();
    const code = A.fullScript(A.codeOpts.comments);
    const codeLines = code.replace(/\n$/, '').split('\n');
    const err = A.lastError;
    const parts = [];
    parts.push(TR`<header class="rp-head"><div class="rp-brand"><i></i><i></i> ${esc(PB.APP.name)}</div><h1>${esc(title)}</h1><div class="rp-meta">สร้างเมื่อ ${esc(when)} · ทุกขั้นตอนคือคำสั่ง Python จริง (pandas · scikit-learn) ดูโค้ดทั้งหมดได้ท้ายรายงาน</div></header>`);
    if (err) parts.push(TR`<div class="rp-err"><b>โปรแกรมหยุดก่อนจบ:</b> ${esc(err.thai || err.message || String(err))}${err.pyType ? ` <code>${esc(err.pyType)}</code>` : ''}</div>`);
    if (m.length) parts.push(`<div class="tiles">${m.map((x) => `<div class="tile" title="${esc(x.full)}"><span class="k">${esc(x.label)}</span><span class="v">${esc(fmt(x.value))}</span></div>`).join('')}</div>`);
    parts.push(TR`<section class="card"><h2>ภาพรวม</h2><dl class="facts">${f.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></section>`);
    parts.push(TR`<section class="card"><h2>ผลลัพธ์ทีละขั้น</h2><div class="outs">${outputsHtml()}</div></section>`);
    parts.push(TR`<section class="card"><h2>คำอธิบายโปรแกรมเป็นภาษาไทย</h2>${stepsHtml()}</section>`);
    parts.push(TR`<section class="card"><details class="code"><summary>โค้ด Python ทั้งหมด (${codeLines.length} บรรทัด) — คลิกเพื่อดู</summary><pre class="py">${codeLines.map((l) => U.highlightPy(l)).join('\n')}</pre></details></section>`);
    parts.push(TR`<footer class="rp-foot"><span>รันโค้ดเดียวกันใน Python ได้ด้วย <code>pip install ${esc(A.pipPackages(code))}</code> (ใช้ Google Colab หรือ Jupyter ก็ได้)</span><span>รายงานนี้สร้างจาก ${esc(PB.APP.name)} ในเบราว์เซอร์ ตัวเลขอาจต่างจาก Python ในเครื่องอื่นเล็กน้อยในหลักทศนิยมท้าย ๆ</span></footer>`);
    return `<!doctype html>
<html lang="${PB.i18n.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap">
<style>
${appCss()}
${REPORT_CSS}
</style></head>
<body><main class="page">
${parts.join('\n')}
</main>
<script>window.addEventListener('beforeprint', function () { document.querySelectorAll('details').forEach(function (d) { d.open = true; }); });</script>
</body></html>`;
  };
  /* outputs are current when nothing changed in the workspace since the last run */
  A.outputsCurrent = () => A.out.log.length > 0 && A.lastRunVersion === A.wsVersion && !!document.querySelector('#out-body .cell');
  A.exportReport = async () => {
    if (A.running) { U.toast(TR('รอให้โปรแกรมรันเสร็จก่อน')); return; }
    if (!A.outputsCurrent()) { U.toast(TR('กำลังรันโปรแกรมเพื่อทำรายงานจากบล็อกล่าสุด…')); await A.run(); }
    if (!A.out.log.length) { U.toast(TR('ยังไม่มีผลลัพธ์ให้ทำรายงาน เพิ่มบล็อก print หรือกราฟแล้วกด ▶ รัน'), 3600); return; }
    const d = new Date(), slug = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    await A.saveFile(`${PB.APP.slug}_report_${slug}.html`, A.buildReport());
  };
})();
