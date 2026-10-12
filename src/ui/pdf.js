/* ThaiPyBlocks: the results panel as an A4 PDF file, made in the browser without any library.
   1. The results are copied onto an offscreen sheet one A4 page wide, always in the light theme. Charts are
      drawn again at that width from their spec; tables too wide for the page are split into column groups.
   2. The sheet becomes a display list in sheet coordinates: boxes, text runs, SVG shapes and images.
   3. Pages break only between text lines, table rows and whole charts. A table that continues on the
      next page repeats its header row there.
   4. Each page is painted onto a canvas with the page's own web fonts, so Thai is shaped by the browser
      exactly as on screen, and goes into the PDF as one image. An invisible text layer (a Type 3 font with
      a ToUnicode map) on top keeps the text searchable and copyable. */
(function () {
  const U = PB.u, h = U.h, A = PB.ui;
  const PAGE_W = 794, PAGE_H = 1123;                 // A4 (210 × 297 mm) in CSS px
  const MX = 40, MT = 40, MB = 56;                   // page margins; the footer sits in the bottom margin
  const CW = PAGE_W - 2 * MX, CH = PAGE_H - MT - MB;
  const SCALE = 2;                                   // canvas pixels per CSS px (about 192 dpi)
  const PDF_W = 595.28, PDF_H = 841.89, K = PDF_H / PAGE_H;   // A4 in points; points per CSS px

  /* ======================= 1. the sheet ======================= */
  /* the light theme's tokens, read from the app's own stylesheet so the PDF follows any palette change */
  function lightTokens() {
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent).find((t) => t.includes('.cell-gutter')) || '';
    const m = /:root\s*\{([^}]*)\}/.exec(css);
    const out = new Map();
    if (m) for (const d of m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
      const i = d.indexOf(':'), k = d.slice(0, i).trim();
      if (i > 0 && k.startsWith('--')) out.set(k, d.slice(i + 1).trim());
    }
    return out;
  }
  const MARK = '<svg viewBox="0 0 26 26" width="18" height="18" aria-hidden="true"><rect y="2" width="16" height="11" rx="3" style="fill:var(--accent)"/>'
    + '<rect x="4" y="12" width="6" height="4" rx="1.5" style="fill:var(--accent)"/><rect x="10" y="13" width="16" height="11" rx="3" style="fill:var(--signal)"/></svg>';
  function headerEl(info) {
    const brand = h('div', { class: 'pdf-brand' });
    brand.innerHTML = MARK;
    brand.appendChild(h('span', {}, PB.APP.name));
    const facts = h('dl', { class: 'pdf-facts' });
    for (const [k, v] of info.rows) { const dd = h('dd'); dd.innerHTML = v; facts.append(h('dt', {}, k), dd); }
    return h('header', { class: 'pdf-head' }, brand, h('h1', { class: 'pdf-title' }, info.title),
      h('div', { class: 'pdf-meta' }, TR`สร้างเมื่อ ${info.when} · ผลลัพธ์จากการรันโปรแกรมบล็อกล่าสุด`), facts);
  }
  /* one results cell ready for paper: a plain Out[n] label, no buttons or tooltips, canvas pixels copied */
  function cellCopy(cell) {
    const k = cell.cloneNode(true);
    const g = k.querySelector('.cell-gutter'); if (g) g.textContent = g.textContent.trim();
    const src = cell.querySelectorAll('canvas'), dst = k.querySelectorAll('canvas');
    dst.forEach((cv, i) => { try { cv.getContext('2d').drawImage(src[i], 0, 0); } catch (e) { /* leave it blank */ } });
    return k;
  }
  function buildSheet(info, tokens) {
    const sheet = h('div', { class: 'pdf-sheet', 'aria-hidden': 'true' });
    for (const [k, v] of tokens) sheet.style.setProperty(k, v);
    sheet.style.width = CW + 'px';
    sheet.appendChild(headerEl(info));
    document.body.appendChild(sheet);
    for (const cell of document.querySelectorAll('#out-body .cell')) {
      const k = cellCopy(cell);
      sheet.appendChild(k);
      const old = k.querySelector('.chart');
      if (cell._pbChart && old) {
        /* the copied chart was laid out for the panel's width: draw it again for the page */
        const box = old.parentNode; box.textContent = '';
        PB.charts.render(cell._pbChart, box);
        const live = cell.querySelector('.chart-head button');
        if (live && live.getAttribute('aria-pressed') === 'true') { const b = box.querySelector('.chart-head button'); if (b) b.click(); }
      }
      k.querySelectorAll('button, .tip, [hidden]').forEach((b) => b.remove());
    }
    return sheet;
  }
  /* like pandas' display.max_columns: a table with more than 20 columns keeps the first and last 10 around a "…" column */
  const MAX_COLS = 20;
  function trimColumns(tbl) {
    const n = tbl.rows[0].cells.length - 1, keep = MAX_COLS / 2;
    if (n <= MAX_COLS) return false;
    for (const row of tbl.rows) {
      const cells = Array.from(row.cells);
      if (cells.length !== n + 1) continue;
      const gap = document.createElement(row.parentNode.tagName === 'THEAD' ? 'th' : 'td');
      gap.className = 'pdf-gap'; gap.textContent = '…';
      cells.slice(keep + 1, n - keep + 1).forEach((c) => c.remove());
      row.insertBefore(gap, cells[n - keep + 1]);
    }
    return true;
  }
  /* tables wider than the page: split into groups of columns, each repeating the index column */
  function splitWideTables(sheet) {
    for (const wrap of Array.from(sheet.querySelectorAll('.tbl-wrap'))) {
      const tbl = wrap.querySelector('table');
      if (!tbl || !tbl.rows.length) continue;
      const avail = wrap.getBoundingClientRect().width;
      if (tbl.rows[0].cells.length < 3 || tbl.getBoundingClientRect().width <= avail + 0.5) continue;
      const total = tbl.rows[0].cells.length - 1, trimmed = trimColumns(tbl);
      if (trimmed) wrap.before(h('div', { class: 'pdf-cols' }, TR`แสดง ${MAX_COLS} จาก ${total} คอลัมน์: ${MAX_COLS / 2} คอลัมน์แรกและ ${MAX_COLS / 2} คอลัมน์สุดท้าย แบบเดียวกับที่ pandas พิมพ์ตารางกว้าง`));
      const head = tbl.rows[0], n = head.cells.length;
      const wid = Array.from(head.cells, (c) => c.getBoundingClientRect().width);
      const groups = []; let cur = [], w = wid[0];
      for (let j = 1; j < n; j++) {
        if (cur.length && w + wid[j] > avail) { groups.push(cur); cur = []; w = wid[0]; }
        cur.push(j); w += wid[j];
      }
      if (cur.length) groups.push(cur);
      if (groups.length < 2) continue;
      const parts = [];
      for (const g of groups) {
        const t = tbl.cloneNode(false);
        for (const sec of [tbl.tHead, ...tbl.tBodies]) {
          if (!sec) continue;
          const s2 = sec.cloneNode(false);
          for (const row of sec.rows) {
            const r2 = row.cloneNode(false);
            r2.appendChild(row.cells[0].cloneNode(true));
            for (const j of g) if (row.cells[j]) r2.appendChild(row.cells[j].cloneNode(true));
            s2.appendChild(r2);
          }
          t.appendChild(s2);
        }
        const w2 = wrap.cloneNode(false); w2.appendChild(t);
        const names = g.map((j) => head.cells[j]).filter((c) => !c.classList.contains('pdf-gap')).map((c) => c.textContent);
        const span = names.length ? names[0] + (names.length > 1 ? ' … ' + names[names.length - 1] : '') : '';
        parts.push(h('div', { class: 'pdf-cols' }, trimmed ? TR`คอลัมน์ ${span}` : TR`คอลัมน์ที่ ${g[0]}–${g[g.length - 1]} จาก ${total}${span ? ` (${span})` : ''}`), w2);
      }
      wrap.replaceWith(...parts);
    }
    /* a single column can still be wider than the page: let that table wrap its text */
    for (const wrap of sheet.querySelectorAll('.tbl-wrap')) {
      const tbl = wrap.querySelector('table');
      if (tbl && tbl.getBoundingClientRect().width > wrap.getBoundingClientRect().width + 0.5) tbl.classList.add('pdf-wrap');
    }
  }

  /* ======================= fonts ======================= */
  const fontOf = (cs) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  /* every font on the sheet with the characters it draws (HTML text only for the baseline probes) */
  function sheetFonts(sheet) {
    const all = new Map(), html = new Set();
    const tw = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!/\S/.test(n.data) || !n.parentElement) continue;
      const f = fontOf(getComputedStyle(n.parentElement));
      let set = all.get(f); if (!set) all.set(f, (set = new Set()));
      if (set.size < 600) for (const ch of n.data) set.add(ch);
      if (!(n.parentElement instanceof SVGElement)) html.add(f);
    }
    return { all, html };
  }
  /* load each face before painting: a canvas never waits for a web font, it silently uses a fallback */
  async function loadFonts(fonts) {
    if (!document.fonts || !document.fonts.load) return;
    const jobs = [...fonts.all].map(([f, set]) => document.fonts.load(f, [...set].join('')).catch(() => null));
    await Promise.race([Promise.all(jobs), U.sleep(5000)]);
    await Promise.race([document.fonts.ready, U.sleep(2000)]);
  }
  /* where the baseline sits below the top of a text box, measured from real layout for each font */
  function baselines(fonts) {
    const box = h('div', { class: 'pdf-probe', 'aria-hidden': 'true' }), probes = [];
    for (const f of fonts) {
      const p = h('span', { style: { font: f, lineHeight: 'normal' } }, 'Hg');
      const m = h('span', { style: { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' } });
      p.appendChild(m); box.appendChild(p); probes.push([f, p, m]);
    }
    document.body.appendChild(box);
    const out = new Map(), range = document.createRange();
    for (const [f, p, m] of probes) {
      range.selectNodeContents(p.firstChild);
      out.set(f, m.getBoundingClientRect().top - range.getBoundingClientRect().top);
    }
    box.remove();
    return out;
  }

  /* ======================= 2. display list ======================= */
  const clear = (c) => !c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c);
  const num = (v) => parseFloat(v) || 0;
  let graphemes = null;
  try { graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' }); } catch (e) { graphemes = null; }
  /* [start, end) of each user-perceived character: Thai vowels and tone marks stay with their consonant */
  function clusters(s) {
    if (graphemes) return Array.from(graphemes.segment(s), (g) => [g.index, g.index + g.segment.length]);
    const out = [], re = /(?:[\ud800-\udbff][\udc00-\udfff]|[\s\S])[\u0300-\u036f\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u200d\ufe0f]*/g;
    for (let m = re.exec(s); m; m = re.exec(s)) out.push([m.index, m.index + m[0].length]);
    return out;
  }
  function radii(cs, b) {
    const one = (v) => { const p = String(v).split(' ')[0]; return p.endsWith('%') ? (num(p) / 100) * Math.min(b.w, b.h) : num(p); };
    const r = [one(cs.borderTopLeftRadius), one(cs.borderTopRightRadius), one(cs.borderBottomRightRadius), one(cs.borderBottomLeftRadius)];
    return r.some((x) => x > 0) ? r.map((x) => Math.min(x, b.w / 2, b.h / 2)) : null;
  }
  function gradient(v) {
    const m = /^linear-gradient\((.*)\)$/.exec(String(v).trim());
    if (!m) return null;
    const parts = m[1].split(/,(?![^(]*\))/).map((s) => s.trim());
    let ang = 180;
    if (/deg$/.test(parts[0])) ang = num(parts.shift());
    else if (/^to /.test(parts[0])) ang = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[parts.shift()] ?? 180;
    const stops = parts.map((p) => (/^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)/i.exec(p) || [])[1]).filter(Boolean);
    return stops.length >= 2 ? { ang, stops } : null;
  }
  function displayList(sheet, base) {
    const o = sheet.getBoundingClientRect(), ox = o.left, oy = o.top;
    const ops = [], range = document.createRange();
    let head = null;                                   // the <thead> being visited: its ops are repeated on later pages
    const rel = (r) => ({ x: r.left - ox, y: r.top - oy, w: r.width, h: r.height });

    function boxOps(cs, b) {
      if (b.w < 0.5 || b.h < 0.5) return;
      const rad = radii(cs, b);
      if (!clear(cs.backgroundColor)) ops.push({ t: 'rect', ...b, rad, fill: cs.backgroundColor, head });
      if (cs.backgroundImage && cs.backgroundImage !== 'none') { const g = gradient(cs.backgroundImage); if (g) ops.push({ t: 'grad', ...b, rad, g, head }); }
      const bw = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(num);
      const bs = [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle];
      const bc = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
      const on = bw.map((w, i) => w > 0 && bs[i] !== 'none' && bs[i] !== 'hidden' && !clear(bc[i]));
      if (!on.some(Boolean)) return;
      if (on.every(Boolean) && bw.every((w) => w === bw[0]) && bc.every((c) => c === bc[0]) && bs.every((s) => s === 'solid')) ops.push({ t: 'ring', ...b, rad, bw: bw[0], color: bc[0], head });
      else on.forEach((v, i) => { if (v) ops.push({ t: 'side', side: i, ...b, rad, bw: bw[i], color: bc[i], dash: bs[i] === 'dashed' || bs[i] === 'dotted' ? bs[i] : null, head }); });
    }
    /* runs of one text node that sit on one line each: [start, end) and their box */
    function lineRuns(node, a, b, out) {
      const s = node.data.slice(a, b);
      let cur = null;
      for (const [i, j] of clusters(s)) {
        if (s[i] === '\t') { if (cur) out.push(cur); cur = null; continue; }   // text after a tab starts where the browser put it
        range.setStart(node, a + i); range.setEnd(node, a + j);
        const rs = range.getClientRects(), r = rs.length ? rs[rs.length - 1] : null;
        if (!r || (r.width === 0 && /\s/.test(s[i]))) continue;          // collapsed white space
        if (cur && Math.abs(r.top - cur.top) < 1 && Math.abs(r.left - cur.right) < 1.5) { cur.b = a + j; cur.right = r.right; cur.bottom = Math.max(cur.bottom, r.bottom); }
        else { if (cur) out.push(cur); cur = { a: a + i, b: a + j, left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }
      }
      if (cur) out.push(cur);
    }
    function textOps(node, cs) {
      const s = node.data;
      if (!/\S/.test(s)) return;
      const pre = /^(pre|pre-wrap|break-spaces)$/.test(cs.whiteSpace);
      const font = fontOf(cs), up = base.has(font) ? base.get(font) : num(cs.fontSize) * 0.8, size = num(cs.fontSize), color = cs.color;
      const pieces = [];
      if (pre) { let i = 0; for (const line of s.split('\n')) { if (/\S/.test(line)) pieces.push([i, i + line.length]); i += line.length + 1; } }
      else pieces.push([0, s.length]);
      const runs = [];
      for (const [a, b] of pieces) {
        range.setStart(node, a); range.setEnd(node, b);
        const rs = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        if (rs.length === 1 && !s.slice(a, b).includes('\t')) runs.push({ a, b, left: rs[0].left, top: rs[0].top, right: rs[0].right, bottom: rs[0].bottom });
        else if (rs.length) lineRuns(node, a, b, runs);
      }
      for (const run of runs) {
        let t = s.slice(run.a, run.b), x = run.left;
        if (!pre) {
          const lead = t.length - t.replace(/^\s+/, '').length;
          if (lead) { range.setStart(node, run.a + lead); range.setEnd(node, run.a + lead + 1); const r = range.getClientRects()[0]; if (r) x = r.left; }
          t = t.trim().replace(/\s+/g, ' ');
        }
        if (!t) continue;
        ops.push({ t: 'text', s: t, x: x - ox, y: run.top - oy + up, top: run.top - oy, bottom: run.bottom - oy, w: run.right - x, font, size, color, head });
      }
    }
    function svgOps(svg) {
      for (const el of svg.querySelectorAll('line, path, rect, circle, ellipse, polyline, polygon, text')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility !== 'visible') continue;
        const ctm = el.getScreenCTM();
        if (!ctm) continue;
        const bb = el.getBoundingClientRect(), tag = el.tagName.toLowerCase(), at = (n) => num(el.getAttribute(n));
        const m = [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - ox, ctm.f - oy], top = bb.top - oy, bottom = bb.bottom - oy;
        if (tag === 'text') {
          const s = el.textContent.replace(/\s+/g, ' ').trim();
          if (s && cs.fill !== 'none') ops.push({ t: 'svgtext', s, x: at('x'), y: at('y'), m, top, bottom, font: fontOf(cs), size: num(cs.fontSize), fill: cs.fill, anchor: cs.textAnchor, baseline: cs.dominantBaseline, head });
          continue;
        }
        const op = {
          t: 'shape', kind: tag, m, top, bottom, head,
          fill: cs.fill === 'none' || tag === 'line' ? null : cs.fill, stroke: cs.stroke === 'none' ? null : cs.stroke, sw: num(cs.strokeWidth),
          fo: num(cs.fillOpacity), so: num(cs.strokeOpacity), op: cs.opacity === '' ? 1 : num(cs.opacity), rule: cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
          cap: cs.strokeLinecap, join: cs.strokeLinejoin, dash: !cs.strokeDasharray || cs.strokeDasharray === 'none' ? null : cs.strokeDasharray.split(/[\s,]+/).map(num),
        };
        if (tag === 'line') Object.assign(op, { x1: at('x1'), y1: at('y1'), x2: at('x2'), y2: at('y2') });
        else if (tag === 'rect') { Object.assign(op, { x: at('x'), y: at('y'), w: at('width'), h: at('height'), rx: el.hasAttribute('rx') ? at('rx') : at('ry') }); if (!(op.w > 0 && op.h > 0)) continue; }
        else if (tag === 'circle') Object.assign(op, { cx: at('cx'), cy: at('cy'), r: at('r') });
        else if (tag === 'ellipse') Object.assign(op, { cx: at('cx'), cy: at('cy'), rx: at('rx'), ry: at('ry') });
        else if (tag === 'path') { op.d = el.getAttribute('d') || ''; if (!op.d) continue; }
        else { const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); op.pts = []; for (let i = 0; i + 1 < v.length; i += 2) op.pts.push([v[i], v[i + 1]]); op.kind = 'poly'; op.closed = tag === 'polygon'; }
        if (op.fill || op.stroke) ops.push(op);
      }
    }
    function visit(el) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') return;
      const shown = cs.visibility === 'visible';
      const b = rel(el.getBoundingClientRect());
      const outer = head;
      if (el.tagName === 'THEAD') head = el;
      if (shown) boxOps(cs, b);
      if (el instanceof SVGSVGElement) { if (shown) svgOps(el); head = outer; return; }
      if (el.tagName === 'CANVAS' || el.tagName === 'IMG') {
        if (shown && b.w > 0 && b.h > 0) ops.push({ t: 'img', el, ...b, smooth: cs.imageRendering !== 'pixelated', head });
        head = outer; return;
      }
      /* overflow clips at the padding box, inside the border */
      const clip = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
      if (clip) {
        const bt = num(cs.borderTopWidth), br = num(cs.borderRightWidth), bb = num(cs.borderBottomWidth), bl = num(cs.borderLeftWidth);
        const r = radii(cs, b), inner = { x: b.x + bl, y: b.y + bt, w: b.w - bl - br, h: b.h - bt - bb };
        ops.push({ t: 'clip', ...inner, rad: r && r.map((v, i) => Math.max(0, v - [Math.max(bt, bl), Math.max(bt, br), Math.max(bb, br), Math.max(bb, bl)][i])) });
      }
      for (const ch of el.childNodes) {
        if (ch.nodeType === 3) { if (shown) textOps(ch, cs); }
        else if (ch.nodeType === 1) visit(ch);
      }
      if (clip) ops.push({ t: 'unclip' });
      head = outer;
    }
    visit(sheet);
    return ops;
  }

  /* ======================= 3. page breaks ======================= */
  function merge(list) {
    const s = list.filter(([a, b]) => b - a > 0.01).sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [a, b] of s) { const last = out[out.length - 1]; if (last && a < last[1] - 0.01) last[1] = Math.max(last[1], b); else out.push([a, b]); }
    return out;
  }
  /* stretches of the sheet a page break must not cut: text lines, table rows, whole charts, plus
     keep-together rules (a cell's label with its first lines, a table's header with its first row,
     the last two lines of a cell) */
  function blocksOf(sheet, ops) {
    const o = sheet.getBoundingClientRect();
    const rel = (el) => { const r = el.getBoundingClientRect(); return [r.top - o.top, r.bottom - o.top]; };
    const iv = [];
    for (const op of ops) {
      if (op.t === 'text' || op.t === 'svgtext') iv.push([op.top, op.bottom]);
      else if (op.t === 'img') iv.push([op.y, op.y + op.h]);
    }
    for (const el of sheet.querySelectorAll('tr, figure, .dl-card, .pdf-head, .legend, .chart-head')) iv.push(rel(el));
    for (const ch of sheet.querySelectorAll('.chart')) if (!ch.querySelector('table')) iv.push(rel(ch));
    const tables = [];
    const firstRow = (el) => { const t = el && (el.tagName === 'TABLE' ? el : el.querySelector('table')); return t && t.tBodies[0] && t.tBodies[0].rows[0]; };
    for (const t of sheet.querySelectorAll('table')) {
      const th = t.tHead, body = t.tBodies[0];
      if (!th || !body || !body.rows.length) continue;
      const [ht, hb] = rel(th), [, fb] = rel(body.rows[0]), [, tb] = rel(t);
      iv.push([ht, fb]);
      tables.push({ el: th, top: ht, h: hb - ht, start: fb, end: tb });
      /* "5 แถว × 3 คอลัมน์" under a table stays with its last row */
      const meta = t.closest('.tbl-wrap') && t.closest('.tbl-wrap').nextElementSibling;
      if (meta && meta.classList.contains('tbl-meta')) iv.push([rel(body.rows[body.rows.length - 1])[0], rel(meta)[1]]);
    }
    /* a column-group label, or a short printed label, stays with the header and first row of the table below it */
    for (const lab of sheet.querySelectorAll('.pdf-cols, .cell-body pre.out-text')) {
      if (lab.tagName === 'PRE' && lab.getBoundingClientRect().height > 60) continue;
      let nx = lab.nextElementSibling;
      while (nx && nx.classList.contains('pdf-cols')) nx = nx.nextElementSibling;
      const row = firstRow(nx);
      if (row) iv.push([rel(lab)[0], rel(row)[1]]);
    }
    let blocks = merge(iv);
    const cuts = [], keep = [];
    for (const cell of sheet.children) {
      if (!cell.classList.contains('cell')) continue;
      const [ct, cb] = rel(cell);
      cuts.push(ct);
      const inside = blocks.filter(([a, b]) => a >= ct - 0.5 && b <= cb + 0.5);
      if (inside.length) keep.push([ct, inside[Math.min(1, inside.length - 1)][1]]);
      if (inside.length >= 2) keep.push([inside[inside.length - 2][0], inside[inside.length - 1][1]]);
    }
    blocks = merge(blocks.concat(keep));
    return { blocks, cuts, tables, total: o.height };
  }
  function paginate({ blocks, cuts, tables, total }) {
    const pages = [];
    let y0 = 0, repeat = null;
    for (let guard = 0; y0 < total - 0.5 && guard < 1000; guard++) {
      const y1 = y0 + CH - (repeat ? repeat.h : 0);
      if (y1 >= total) { pages.push({ y0, y1: total, repeat }); break; }
      const hit = blocks.find(([a, b]) => a < y1 - 0.01 && b > y1 + 0.01);
      let cut;
      if (hit) cut = hit[0] > y0 + 1 && hit[1] - hit[0] <= CH ? hit[0] : y1;   // a block taller than a page is cut where the page ends
      else {
        cut = y1;
        let end = y0; for (const [, b] of blocks) if (b <= y1 && b > end) end = b;
        for (const c of cuts) if (c >= end - 0.5 && c <= y1 && c > y0 + 1) cut = c;   // prefer the top of the next cell
      }
      pages.push({ y0, y1: cut, repeat });
      const t = tables.find((tb) => tb.start - 0.5 <= cut && cut < tb.end - 0.5);
      repeat = t ? { el: t.el, top: t.top, h: t.h } : null;
      y0 = cut;
    }
    return pages;
  }

  /* ======================= 4. painting ======================= */
  function rrPath(ctx, x, y, w, hh, r) {
    ctx.beginPath();
    if (!r) { ctx.rect(x, y, w, hh); return; }
    addRR(ctx, x, y, w, hh, r);
  }
  function addRR(ctx, x, y, w, hh, r) {
    const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(v, w / 2, hh / 2)));
    ctx.moveTo(x + tl, y);
    ctx.arcTo(x + w, y, x + w, y + hh, tr);
    ctx.arcTo(x + w, y + hh, x, y + hh, br);
    ctx.arcTo(x, y + hh, x, y, bl);
    ctx.arcTo(x, y, x + w, y, tl);
    ctx.closePath();
  }
  function paintShape(ctx, op) {
    ctx.save();
    ctx.transform(...op.m);
    let path = null;
    ctx.beginPath();
    if (op.kind === 'line') { ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); }
    else if (op.kind === 'rect') addRR(ctx, op.x, op.y, op.w, op.h, [op.rx, op.rx, op.rx, op.rx]);
    else if (op.kind === 'circle') ctx.arc(op.cx, op.cy, Math.max(0, op.r), 0, Math.PI * 2);
    else if (op.kind === 'ellipse') ctx.ellipse(op.cx, op.cy, Math.max(0, op.rx), Math.max(0, op.ry), 0, 0, Math.PI * 2);
    else if (op.kind === 'poly') { op.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (op.closed) ctx.closePath(); }
    else { try { path = new Path2D(op.d); } catch (e) { ctx.restore(); return; } }
    if (op.fill) { ctx.globalAlpha = op.op * op.fo; ctx.fillStyle = op.fill; if (path) ctx.fill(path, op.rule); else ctx.fill(op.rule); }
    if (op.stroke && op.sw > 0) {
      ctx.globalAlpha = op.op * op.so; ctx.strokeStyle = op.stroke; ctx.lineWidth = op.sw; ctx.lineCap = op.cap; ctx.lineJoin = op.join;
      ctx.setLineDash(op.dash && op.dash.some((v) => v > 0) ? op.dash : []);
      if (path) ctx.stroke(path); else ctx.stroke();
    }
    ctx.restore();
  }
  const ALIGN = { start: 'left', middle: 'center', end: 'right' };
  const BASELINE = { middle: 'middle', central: 'middle', hanging: 'hanging', 'text-before-edge': 'top', 'text-top': 'top', 'text-after-edge': 'bottom', 'text-bottom': 'bottom' };
  /* paint the ops that touch [from, to] of the sheet; text that lies inside also goes to `items` for the
     PDF text layer, in page coordinates (dx, dy = where sheet (0, 0) lands on the page) */
  function paintOps(ctx, ops, from, to, pick, items, dx, dy) {
    let font = null;
    for (const op of ops) {
      if (op.t === 'clip') { ctx.save(); rrPath(ctx, op.x, op.y, op.w, op.h, op.rad); ctx.clip(); continue; }
      if (op.t === 'unclip') { ctx.restore(); font = null; continue; }
      if (pick && !pick(op)) continue;
      const top = op.top !== undefined ? op.top : op.y, bottom = op.bottom !== undefined ? op.bottom : op.y + op.h;
      if (bottom <= from || top >= to) continue;
      const inside = top >= from - 0.5 && bottom <= to + 0.5;
      switch (op.t) {
        case 'rect': ctx.fillStyle = op.fill; rrPath(ctx, op.x, op.y, op.w, op.h, op.rad); ctx.fill(); break;
        case 'grad': {
          const a = (op.g.ang * Math.PI) / 180, len = Math.abs(op.w * Math.sin(a)) + Math.abs(op.h * Math.cos(a));
          const cx = op.x + op.w / 2, cy = op.y + op.h / 2, ux = (Math.sin(a) * len) / 2, uy = (-Math.cos(a) * len) / 2;
          const gr = ctx.createLinearGradient(cx - ux, cy - uy, cx + ux, cy + uy);
          op.g.stops.forEach((c, i) => { try { gr.addColorStop(i / (op.g.stops.length - 1), c); } catch (e) { /* unknown colour */ } });
          ctx.fillStyle = gr; rrPath(ctx, op.x, op.y, op.w, op.h, op.rad); ctx.fill();
          break;
        }
        case 'ring': {
          ctx.fillStyle = op.color; ctx.beginPath();
          const r = op.rad || [0, 0, 0, 0];
          addRR(ctx, op.x, op.y, op.w, op.h, r);
          addRR(ctx, op.x + op.bw, op.y + op.bw, op.w - 2 * op.bw, op.h - 2 * op.bw, r.map((v) => Math.max(0, v - op.bw)));
          ctx.fill('evenodd');
          break;
        }
        case 'side': {
          ctx.save();
          if (op.rad) { rrPath(ctx, op.x, op.y, op.w, op.h, op.rad); ctx.clip(); }
          const s = op.side, w = op.bw;
          const band = [[op.x, op.y, op.w, w], [op.x + op.w - w, op.y, w, op.h], [op.x, op.y + op.h - w, op.w, w], [op.x, op.y, w, op.h]][s];
          if (op.dash) {
            ctx.strokeStyle = op.color; ctx.lineWidth = w; ctx.setLineDash(op.dash === 'dotted' ? [w, w] : [3 * w, 2 * w]);
            ctx.beginPath();
            if (s % 2 === 0) { ctx.moveTo(band[0], band[1] + w / 2); ctx.lineTo(band[0] + band[2], band[1] + w / 2); }
            else { ctx.moveTo(band[0] + w / 2, band[1]); ctx.lineTo(band[0] + w / 2, band[1] + band[3]); }
            ctx.stroke();
          } else { ctx.fillStyle = op.color; ctx.fillRect(...band); }
          ctx.restore();
          break;
        }
        case 'img':
          ctx.imageSmoothingEnabled = op.smooth;
          try { ctx.drawImage(op.el, op.x, op.y, op.w, op.h); } catch (e) { /* image not ready */ }
          ctx.imageSmoothingEnabled = true;
          break;
        case 'text':
          if (font !== op.font) { ctx.font = op.font; font = op.font; }
          ctx.fillStyle = op.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(op.s, op.x, op.y);
          if (items && inside) items.push({ s: op.s, size: op.size, w: op.w, m: [1, 0, 0, 1, op.x + dx, op.y + dy] });
          break;
        case 'shape': paintShape(ctx, op); break;
        case 'svgtext': {
          ctx.save(); ctx.transform(...op.m);
          ctx.font = op.font; font = null;
          ctx.fillStyle = op.fill; ctx.textAlign = ALIGN[op.anchor] || 'left'; ctx.textBaseline = BASELINE[op.baseline] || 'alphabetic';
          ctx.fillText(op.s, op.x, op.y);
          const w = ctx.measureText(op.s).width;
          ctx.restore();
          if (items && inside) {
            const sx = op.x + (op.anchor === 'middle' ? -w / 2 : op.anchor === 'end' ? -w : 0);
            const b = BASELINE[op.baseline], sy = op.y + (b === 'middle' ? 0.35 * op.size : b === 'hanging' || b === 'top' ? 0.8 * op.size : 0);
            const [a, bb, c, d, e, f] = op.m;
            items.push({ s: op.s, size: op.size, w, m: [a, bb, c, d, a * sx + c * sy + e + dx, bb * sx + d * sy + f + dy] });
          }
          break;
        }
        default: break;
      }
    }
  }
  function paintPage(ctx, ops, page, n, total, info, tokens, family) {
    const items = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    let top = MT;
    if (page.repeat) {
      /* the header row of a table that continues from the previous page */
      const r = page.repeat, dy = MT - r.top;
      ctx.save(); ctx.setTransform(SCALE, 0, 0, SCALE, SCALE * MX, SCALE * dy);
      ctx.beginPath(); ctx.rect(-MX, r.top, PAGE_W, r.h); ctx.clip();
      paintOps(ctx, ops, r.top, r.top + r.h, (op) => op.head === r.el, items, MX, dy);
      ctx.restore();
      top += r.h;
    }
    const dy = top - page.y0;
    ctx.save(); ctx.setTransform(SCALE, 0, 0, SCALE, SCALE * MX, SCALE * dy);
    ctx.beginPath(); ctx.rect(-MX, page.y0, PAGE_W, page.y1 - page.y0); ctx.clip();
    paintOps(ctx, ops, page.y0, page.y1, null, items, MX, dy);
    ctx.restore();
    /* footer: app and title on the left, page number on the right */
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const fy = PAGE_H - MB + 32, ink = tokens.get('--ink-3') || '#6f7d8e';
    ctx.fillStyle = tokens.get('--line') || '#d4dbe4'; ctx.fillRect(MX, PAGE_H - MB + 14, CW, 1);
    ctx.font = `400 10px ${family}`; ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
    const right = TR`หน้า ${n} / ${total}`, rw = ctx.measureText(right).width;
    ctx.textAlign = 'right'; ctx.fillText(right, PAGE_W - MX, fy);
    let left = `${PB.APP.name} · ${info.title}`;
    const room = CW - rw - 28;
    if (ctx.measureText(left).width > room) { while (left.length > 1 && ctx.measureText(left + '…').width > room) left = left.slice(0, -1); left += '…'; }
    ctx.textAlign = 'left'; ctx.fillText(left, MX, fy);
    items.push({ s: left, size: 10, w: ctx.measureText(left).width, m: [1, 0, 0, 1, MX, fy] }, { s: right, size: 10, w: rw, m: [1, 0, 0, 1, PAGE_W - MX - rw, fy] });
    return items;
  }

  /* ======================= 5. the PDF file ======================= */
  async function deflate(bytes) {
    const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  /* the page as an RGB image: lossless Flate with the PNG "Up" predictor, or JPEG where the browser has no CompressionStream */
  async function pageImage(canvas) {
    const w = canvas.width, hh = canvas.height;
    if (typeof CompressionStream === 'function') {
      try {
        const px = canvas.getContext('2d').getImageData(0, 0, w, hh).data, row = w * 4;
        const raw = new Uint8Array((w * 3 + 1) * hh);
        for (let y = 0, o = 0, p = 0; y < hh; y++) {
          raw[o++] = 2;
          if (y === 0) for (let x = 0; x < w; x++, p += 4) { raw[o++] = px[p]; raw[o++] = px[p + 1]; raw[o++] = px[p + 2]; }
          else for (let x = 0; x < w; x++, p += 4) { raw[o++] = px[p] - px[p - row]; raw[o++] = px[p + 1] - px[p + 1 - row]; raw[o++] = px[p + 2] - px[p + 2 - row]; }
        }
        return { data: await deflate(raw), filter: `/FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${w} >>`, w, h: hh };
      } catch (e) { /* fall back to JPEG */ }
    }
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    return { data: new Uint8Array(await blob.arrayBuffer()), filter: '/DCTDecode', w, h: hh };
  }
  const hex16 = (s) => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i).toString(16).padStart(4, '0')).join('').toUpperCase();
  const isMark = (ch) => /\p{M}/u.test(ch);
  function toUnicode(chars) {
    const out = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap', '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def', '1 begincodespacerange', '<00> <FF>', 'endcodespacerange'];
    for (let i = 0; i < chars.length; i += 100) {
      const part = chars.slice(i, i + 100);
      out.push(`${part.length} beginbfchar`);
      part.forEach((ch, j) => out.push(`<${(i + j + 1).toString(16).padStart(2, '0').toUpperCase()}> <${hex16(ch)}>`));
      out.push('endbfchar');
    }
    out.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
    return out.join('\n');
  }
  function pdfDate(d) {
    const p = (v) => String(v).padStart(2, '0'), off = -d.getTimezoneOffset();
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
      + `${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}'${p(Math.abs(off) % 60)}'`;
  }
  async function writePdf(pages, title) {
    const enc = new TextEncoder(), chunks = [];
    let size = 0;
    const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); size += b.length; };
    const f3 = (v) => (Math.abs(v) < 5e-4 ? '0' : String(+v.toFixed(3)));
    const zip = typeof CompressionStream === 'function';
    /* the text layer's characters: up to 255 per Type 3 font, codes 1–255 */
    const codes = new Map(), fontChars = [];
    for (const pg of pages) for (const it of pg.text) for (const ch of it.s) {
      if (codes.has(ch)) continue;
      const k = codes.size, f = Math.floor(k / 255);
      (fontChars[f] = fontChars[f] || []).push(ch);
      codes.set(ch, [f, (k % 255) + 1]);
    }
    let next = 1;
    const id = () => next++;
    const CATALOG = id(), PAGES = id(), INFO = id(), WIDE = id(), ZERO = id();
    const fonts = fontChars.map(() => ({ obj: id(), cmap: id() }));
    const ids = pages.map(() => ({ page: id(), content: id(), image: id() }));
    const offs = [];
    const obj = (n, body) => { offs[n] = size; put(`${n} 0 obj\n${body}\nendobj\n`); };
    const stream = (n, dict, data) => {
      offs[n] = size;
      const b = typeof data === 'string' ? enc.encode(data) : data;
      put(`${n} 0 obj\n<< ${dict} /Length ${b.length} >>\nstream\n`); put(b); put('\nendstream\nendobj\n');
    };
    put('%PDF-1.4\n'); put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    obj(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R /Lang (${PB.i18n.lang === 'en' ? 'en-GB' : 'th-TH'}) /ViewerPreferences << /DisplayDocTitle true >> >>`);
    obj(PAGES, `<< /Type /Pages /Kids [${ids.map((p) => `${p.page} 0 R`).join(' ')}] /Count ${pages.length} >>`);
    obj(INFO, `<< /Title <FEFF${hex16(title)}> /Creator <FEFF${hex16(PB.APP.name)}> /Producer <FEFF${hex16(PB.APP.name)}> /CreationDate (${pdfDate(new Date())}) >>`);
    stream(WIDE, '', '500 0 d0'); stream(ZERO, '', '0 0 d0');
    fontChars.forEach((chars, f) => {
      const widths = chars.map((ch) => (isMark(ch) ? 0 : 500));
      obj(fonts[f].obj, `<< /Type /Font /Subtype /Type3 /FontBBox [0 0 0 0] /FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << ${chars.map((_, i) => `/g${i + 1} ${widths[i] ? WIDE : ZERO} 0 R`).join(' ')} >>`
        + ` /Encoding << /Type /Encoding /Differences [1 ${chars.map((_, i) => `/g${i + 1}`).join(' ')}] >> /FirstChar 1 /LastChar ${chars.length} /Widths [${widths.join(' ')}]`
        + ` /ToUnicode ${fonts[f].cmap} 0 R /Resources << >> >>`);
      stream(fonts[f].cmap, '', toUnicode(chars));
    });
    const fontRes = fonts.length ? `/Font << ${fonts.map((ft, f) => `/F${f} ${ft.obj} 0 R`).join(' ')} >> ` : '';
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i], im = pg.img;
      let cs = `q ${PDF_W} 0 0 ${PDF_H} 0 0 cm /Im0 Do Q\n`;
      const lines = [];
      for (const it of pg.text) {
        const segs = []; let wsum = 0;
        for (const ch of it.s) {
          const [f, c] = codes.get(ch); wsum += isMark(ch) ? 0 : 500;
          const hx = c.toString(16).padStart(2, '0'), last = segs[segs.length - 1];
          if (last && last.f === f) last.hex += hx; else segs.push({ f, hex: hx });
        }
        if (!wsum || !(it.w > 0) || !(it.size > 0)) continue;
        const [a, b, c, d, e, f] = it.m;
        lines.push(`${f3(K * a)} ${f3(-K * b)} ${f3(-K * c)} ${f3(K * d)} ${f3(K * e)} ${f3(PDF_H - K * f)} Tm ${f3((100 * it.w) / ((wsum / 1000) * it.size))} Tz`
          + segs.map((s) => ` /F${s.f} ${f3(it.size)} Tf <${s.hex}> Tj`).join(''));
      }
      if (lines.length) cs += `BT 3 Tr\n${lines.join('\n')}\nET\n`;
      obj(ids[i].page, `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${PDF_W} ${PDF_H}] /Resources << /XObject << /Im0 ${ids[i].image} 0 R >> ${fontRes}/ProcSet [/PDF /Text /ImageC] >> /Contents ${ids[i].content} 0 R >>`);
      if (zip) stream(ids[i].content, '/Filter /FlateDecode', await deflate(enc.encode(cs)));
      else stream(ids[i].content, '', cs);
      stream(ids[i].image, `/Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${im.filter}`, im.data);
    }
    const xref = size;
    put(`xref\n0 ${next}\n0000000000 65535 f \n`);
    for (let i = 1; i < next; i++) put(`${String(offs[i]).padStart(10, '0')} 00000 n \n`);
    const fid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    put(`trailer\n<< /Size ${next} /Root ${CATALOG} 0 R /Info ${INFO} 0 R /ID [<${fid}> <${fid}>] >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* ======================= export ======================= */
  /* the current results as a PDF Blob; `progress(i, n)` is told about each page */
  A.buildPdf = async (progress) => {
    const info = A.runInfo(), tokens = lightTokens();
    let sheet = null;
    PB.charts.printing = true;                         // charts drawn for the sheet use the light palette
    try {
      sheet = buildSheet(info, tokens);
      await loadFonts(sheetFonts(sheet));
      splitWideTables(sheet);
      const fonts = sheetFonts(sheet);
      await loadFonts(fonts);
      const ops = displayList(sheet, baselines(fonts.html));
      const pages = paginate(blocksOf(sheet, ops));
      const family = getComputedStyle(sheet).fontFamily;
      const canvas = document.createElement('canvas');
      canvas.width = PAGE_W * SCALE; canvas.height = PAGE_H * SCALE;
      const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
      const out = [];
      for (let i = 0; i < pages.length; i++) {
        if (progress) progress(i + 1, pages.length);
        const text = paintPage(ctx, ops, pages[i], i + 1, pages.length, info, tokens, family);
        out.push({ img: await pageImage(canvas), text });
      }
      return { blob: await writePdf(out, info.title), pages: pages.length };
    } finally {
      PB.charts.printing = false;
      if (sheet) sheet.remove();
    }
  };
  let busy = false;
  A.exportPdf = async () => {
    if (busy) return;
    if (A.running) { U.toast(TR('รอให้โปรแกรมรันเสร็จก่อน')); return; }
    const hasOut = () => !!document.querySelector('#out-body .cell:not(.note)');
    if (A.lastRunVersion !== A.wsVersion) { U.toast(TR('กำลังรันโปรแกรมเพื่อทำ PDF จากบล็อกล่าสุด…')); await A.run(); }
    if (!hasOut()) { U.toast(TR('ยังไม่มีผลลัพธ์ให้ทำ PDF เพิ่มบล็อก print หรือกราฟแล้วกด ▶ รัน'), 3600); return; }
    busy = true;
    const btns = U.$$('[data-act="pdf"]');
    btns.forEach((b) => { b.disabled = true; });
    U.toast(TR('กำลังสร้าง PDF…'), 60000);
    try {
      const { blob } = await A.buildPdf((i, n) => { if (n > 1) U.toast(TR`กำลังสร้าง PDF… หน้า ${i} จาก ${n}`, 60000); });
      U.$$('.toast').forEach((t) => t.remove());
      const d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      await A.saveFile(`${PB.APP.slug}_results_${stamp}.pdf`, blob);
    } catch (e) {
      U.$$('.toast').forEach((t) => t.remove());
      console.error(e);
      U.alert(TR('สร้าง PDF ไม่สำเร็จ: ') + ((e && e.message) || e));
    } finally {
      busy = false;
      btns.forEach((b) => { b.disabled = false; });
    }
  };
})();
