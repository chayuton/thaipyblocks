/* ThaiPyBlocks: SVG chart renderer for the output panel (scatter, line, bar, histogram, box, heatmap, images).
   Colours come from CSS tokens so charts follow the light/dark theme. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}, kids = []) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
    for (const k of kids) if (k) e.appendChild(k);
    return e;
  };
  const H = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
  const SEQ_L = ['#e9f1fc', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#2a78d6', '#1c5cab', '#104281', '#0d366b'];
  const RED = ['#fbe3e2', '#f6c2bf', '#ef9893', '#e7716b', '#e34948', '#c23332', '#9b2524', '#741a1a'];
  const BLUE = ['#e2edfb', '#bcd6f7', '#8ab7ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281', '#0d366b'];
  const fmt = (v, d) => {
    if (v === null || v === undefined || Number.isNaN(v)) return '–';
    if (typeof v !== 'number') return String(v);
    if (d === undefined) { const a = Math.abs(v); d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a === 0 ? 0 : 4; if (Number.isInteger(v)) d = 0; }
    return v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
  };
  function niceScale(lo, hi, n = 5, zero = false) {
    if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
    if (lo === hi) { const d = Math.abs(lo) || 1; lo -= d / 2; hi += d / 2; }
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), err = raw / mag;
    const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
    const ticks = []; for (let v = a; v <= b + step * 1e-6; v += step) ticks.push(+v.toPrecision(12));
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return { lo: a, hi: b, ticks, dec };
  }
  const lin = (d0, d1, r0, r1) => (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
  const MONTHS = [TR('ม.ค.'), TR('ก.พ.'), TR('มี.ค.'), TR('เม.ย.'), TR('พ.ค.'), TR('มิ.ย.'), TR('ก.ค.'), TR('ส.ค.'), TR('ก.ย.'), TR('ต.ค.'), TR('พ.ย.'), TR('ธ.ค.')];
  function dateTicks(lo, hi) {
    const yrs = (hi - lo) / (365.25 * 864e5);
    const out = [];
    if (yrs >= 2) {
      const y0 = new Date(lo).getUTCFullYear(), y1 = new Date(hi).getUTCFullYear(); const step = Math.max(1, Math.ceil((y1 - y0) / 7));
      for (let y = y0; y <= y1 + 1; y += step) { const t = Date.UTC(y, 0, 1); if (t >= lo && t <= hi) out.push([t, String(y)]); }
    } else {
      const d = new Date(lo); let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
      const months = Math.max(1, Math.round(yrs * 12)), step = Math.max(1, Math.ceil(months / 6));
      for (let i = 0; i < 40; i++) { const t = Date.UTC(y, m - 1, 1); if (t > hi) break; if (t >= lo) out.push([t, MONTHS[m - 1] + ' ' + String(y).slice(2)]); m += step; while (m > 12) { m -= 12; y++; } }
    }
    return out;
  }
  const fmtDate = (t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
  function textWidth(s, size = 11) { let w = 0; for (const ch of String(s)) w += /[ัิ-ฺ็-๎]/.test(ch) ? 0 : /[A-Z0-9]/.test(ch) ? size * 0.62 : size * 0.56; return w; }
  const trunc = (s, px, size = 11) => { s = String(s); if (textWidth(s, size) <= px) return s; while (s.length > 1 && textWidth(s + '…', size) > px) s = s.slice(0, -1); return s + '…'; };
  function symbol(kind, x, y, r) {
    switch (kind % 6) {
      case 1: return S('rect', { x: x - r * 0.88, y: y - r * 0.88, width: r * 1.76, height: r * 1.76, rx: 1 });
      case 2: return S('path', { d: `M${x},${y - r * 1.15}L${x + r * 1.05},${y + r * 0.8}L${x - r * 1.05},${y + r * 0.8}Z` });
      case 3: return S('path', { d: `M${x},${y - r * 1.2}L${x + r * 1.2},${y}L${x},${y + r * 1.2}L${x - r * 1.2},${y}Z` });
      case 4: return S('path', { d: `M${x - r * 1.1},${y - r * 0.35}h${r * 0.75}v${-r * 0.75}h${r * 0.7}v${r * 0.75}h${r * 0.75}v${r * 0.7}h${-r * 0.75}v${r * 0.75}h${-r * 0.7}v${-r * 0.75}h${-r * 0.75}Z` });
      case 5: return S('path', { d: `M${x - r},${y - r * 0.6}L${x},${y + r}L${x + r},${y - r * 0.6}Z` });
      default: return S('circle', { cx: x, cy: y, r });
    }
  }
  function legendSymbol(kind, color) { const s = S('svg', { width: 12, height: 12, viewBox: '0 0 12 12' }); const m = symbol(kind, 6, 6, 4.2); m.setAttribute('style', `fill:${color}`); s.appendChild(m); return s; }
  function rampColor(ramp, t) { t = Math.min(1, Math.max(0, t)); const i = t * (ramp.length - 1), a = Math.floor(i), b = Math.min(ramp.length - 1, a + 1), f = i - a; const ca = hex(ramp[a]), cb = hex(ramp[b]); return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * f)},${Math.round(ca[1] + (cb[1] - ca[1]) * f)},${Math.round(ca[2] + (cb[2] - ca[2]) * f)})`; }
  function hex(h) { if (h.startsWith('rgb')) return h.match(/\d+/g).map(Number); return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  const lum = (c) => { const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  /* PB.charts.printing: charts drawn for the PDF use the light palette whatever the app's theme */
  const isDark = () => !PB.charts.printing && (getComputedStyle(document.documentElement).colorScheme === 'dark' || document.documentElement.dataset.theme === 'dark');

  /* ---------- frame: title, legend, plot, table toggle, tooltip ---------- */
  function frame(spec, root) {
    const wrap = H('div', 'chart');
    const head = H('div', 'chart-head');
    const tbox = H('div');
    if (spec.title) tbox.appendChild(H('div', 'chart-title', spec.title));
    const sub = subtitle(spec); if (sub) tbox.appendChild(H('div', 'chart-sub', sub));
    head.appendChild(tbox);
    const tbtn = H('button', 'btn btn-sm btn-ghost', TR('ตาราง')); tbtn.type = 'button'; tbtn.setAttribute('aria-pressed', 'false');
    head.appendChild(tbtn);
    wrap.appendChild(head);
    const legend = H('div', 'legend'); wrap.appendChild(legend);
    const plot = H('div'); plot.style.position = 'relative'; wrap.appendChild(plot);
    const table = H('div'); table.hidden = true; wrap.appendChild(table);
    const tip = H('div', 'tip'); tip.hidden = true; plot.appendChild(tip);
    tbtn.addEventListener('click', () => {
      const on = tbtn.getAttribute('aria-pressed') !== 'true';
      tbtn.setAttribute('aria-pressed', String(on)); tbtn.textContent = on ? TR('กราฟ') : TR('ตาราง');
      if (on && !table.firstChild) table.appendChild(tableView(spec));
      table.hidden = !on; plot.hidden = on; legend.hidden = on;
    });
    root.appendChild(wrap);
    return { wrap, legend, plot, tip };
  }
  function subtitle(spec) {
    if (spec.kind === 'scatter') return TR`${spec.y.label} เทียบกับ ${spec.x.label}` + (spec.x.values ? TR` · ${spec.x.values.length.toLocaleString()} จุด` : '');
    if (spec.kind === 'hist') return TR`ฮิสโตแกรมของ ${spec.xlabel}`;
    if (spec.kind === 'bar' && spec.ylabel) return spec.horizontal ? spec.xlabel : TR`${spec.ylabel} แยกตาม ${spec.xlabel}`;
    if (spec.kind === 'line' && spec.y && spec.y.label) return `${spec.y.label}${spec.x.label ? TR(' ตาม ') + spec.x.label : ''}`;
    if (spec.kind === 'box') return spec.wide ? TR`การกระจายของค่าในแต่ละคอลัมน์ · จุด = ค่าผิดปกติ (นอก 1.5×IQR)` : TR`การกระจายของ ${spec.ylabel} แยกตาม ${spec.xlabel}`;
    return '';
  }
  function showTip(f, x, y, rows) {
    const tip = f.tip; tip.textContent = '';
    for (const r of rows) {
      const row = H('div', 'row');
      if (r.color) { const k = H('i', 'key'); k.style.background = r.color; row.appendChild(k); }
      row.appendChild(H('span', 'tv', r.value)); if (r.label) row.appendChild(H('span', 'tl', r.label));
      tip.appendChild(row);
    }
    tip.hidden = false;
    const pw = f.plot.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(0, Math.min(pw - tw, x + 12)) + 'px';
    tip.style.top = Math.max(0, y - th - 10) + 'px';
  }
  const hideTip = (f) => { f.tip.hidden = true; };
  function axisY(g, sc, y, x0, x1, fmtFn) {
    for (const t of sc.ticks) {
      const yy = y(t);
      g.appendChild(S('line', { x1: x0, x2: x1, y1: yy, y2: yy, style: 'stroke:var(--grid)', 'stroke-width': 1 }));
      g.appendChild(S('text', { x: x0 - 6, y: yy + 3.5, 'text-anchor': 'end' }, [document.createTextNode(fmtFn ? fmtFn(t) : fmt(t, sc.dec))]));
    }
  }
  function sizeOf(f, ratio = 0.56, minH = 220, maxH = 380) { const w = Math.max(280, f.plot.clientWidth || f.wrap.clientWidth || 560); return { w, h: Math.round(Math.min(maxH, Math.max(minH, w * ratio))) }; }

  /* ---------- scatter ---------- */
  function scatter(spec, f) {
    const { w, h } = sizeOf(f);
    const m = { l: 52, r: 14, t: 10, b: 40 };
    const xs = spec.x.values, ys = spec.y.values;
    const idx = xs.map((_, i) => i).filter((i) => Number.isFinite(+xs[i]) && Number.isFinite(+ys[i]));
    const sx = niceScale(Math.min(...idx.map((i) => xs[i])), Math.max(...idx.map((i) => xs[i]))), sy = niceScale(Math.min(...idx.map((i) => ys[i])), Math.max(...idx.map((i) => ys[i])));
    const X = lin(sx.lo, sx.hi, m.l, w - m.r), Y = lin(sy.lo, sy.hi, h - m.b, m.t);
    const svg = S('svg', { class: 'plot', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': spec.title || 'scatter plot' });
    const g = S('g'); svg.appendChild(g);
    axisY(g, sy, Y, m.l, w - m.r);
    for (const t of sx.ticks) g.appendChild(S('text', { x: X(t), y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(spec.x.date ? fmtDate(t).slice(0, 7) : fmt(t, sx.dec))]));
    g.appendChild(S('line', { x1: m.l, x2: w - m.r, y1: h - m.b, y2: h - m.b, style: 'stroke:var(--axis)' }));
    g.appendChild(S('text', { class: 'lab', x: (m.l + w - m.r) / 2, y: h - 6, 'text-anchor': 'middle' }, [document.createTextNode(spec.x.label)]));
    const yl = S('text', { class: 'lab', x: 12, y: (m.t + h - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})` }, [document.createTextNode(spec.y.label)]); g.appendChild(yl);
    if (spec.identity) { const a = Math.max(sx.lo, sy.lo), b = Math.min(sx.hi, sy.hi); g.appendChild(S('line', { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), style: 'stroke:var(--ink-3)', 'stroke-dasharray': '5 4', 'stroke-width': 1.5 })); }
    let colorOf = () => SERIES[0], symOf = () => 0, cats = null, cont = null;
    if (spec.hue) {
      const hv = spec.hue.values;
      const uniq = Array.from(new Set(hv.filter((v) => !PB.isMissing(v)).map((v) => PB.keyOf(v))));
      const numeric = hv.every((v) => PB.isMissing(v) || typeof v === 'number');
      if (numeric && uniq.length > 10) {
        const vals = hv.filter((v) => typeof v === 'number' && !Number.isNaN(v)); const lo = Math.min(...vals), hi = Math.max(...vals);
        cont = { lo, hi }; const ramp = isDark() ? SEQ_L.slice(3) : SEQ_L.slice(2);
        colorOf = (i) => (typeof hv[i] === 'number' && !Number.isNaN(hv[i]) ? rampColor(ramp, (hv[i] - lo) / (hi - lo || 1)) : 'var(--ink-3)');
        const lg = f.legend; lg.appendChild(H('span', null, spec.hue.label + ':'));
        const bar = H('i', 'ramp'); bar.style.background = `linear-gradient(90deg, ${ramp[0]}, ${ramp[ramp.length - 1]})`; const sp = H('span'); sp.appendChild(document.createTextNode(fmt(lo) + ' ')); sp.appendChild(bar); sp.appendChild(document.createTextNode(' ' + fmt(hi))); lg.appendChild(sp);
      } else {
        const seen = []; const map = new Map();
        hv.forEach((v) => { const k = PB.isMissing(v) ? 'NaN' : PB.keyOf(v); if (!map.has(k)) { map.set(k, seen.length); seen.push(PB.isMissing(v) ? 'NaN' : v); } });
        const order = seen.every((v) => typeof v === 'number') ? seen.slice().sort((a, b) => a - b) : seen;
        order.forEach((v, i) => map.set(typeof v === 'string' && v === 'NaN' ? 'NaN' : PB.keyOf(v), i));
        cats = order;
        const useShapes = order.length > 3;
        colorOf = (i) => { const k = map.get(PB.isMissing(hv[i]) ? 'NaN' : PB.keyOf(hv[i])); return k < 8 ? SERIES[k] : 'var(--ink-3)'; };
        symOf = (i) => (useShapes ? map.get(PB.isMissing(hv[i]) ? 'NaN' : PB.keyOf(hv[i])) : 0);
        f.legend.appendChild(H('span', null, spec.hue.label + ':'));
        order.slice(0, 12).forEach((v, k) => { const s = H('span'); s.appendChild(legendSymbol(useShapes ? k : 0, k < 8 ? SERIES[k] : 'var(--ink-3)')); s.appendChild(document.createTextNode(PB.str(v))); f.legend.appendChild(s); });
        if (order.length > 12) f.legend.appendChild(H('span', null, TR`+${order.length - 12} อื่น ๆ`));
      }
    }
    const r = idx.length > 1500 ? 3 : 4, ring = idx.length > 1500 ? 1 : 1.5;
    const pts = S('g');
    const P = idx.map((i) => [X(xs[i]), Y(ys[i]), i]);
    for (const [px, py, i] of P) { const mk = symbol(symOf(i), px, py, r); mk.setAttribute('style', `fill:${colorOf(i)};stroke:var(--surface);stroke-width:${ring}`); pts.appendChild(mk); }
    g.appendChild(pts);
    const hit = S('rect', { x: m.l, y: m.t, width: w - m.l - m.r, height: h - m.t - m.b, fill: 'transparent' });
    const ring2 = S('circle', { r: r + 3, style: 'fill:none;stroke:var(--ink);stroke-width:1.5', visibility: 'hidden' });
    g.appendChild(ring2); g.appendChild(hit);
    hit.addEventListener('pointermove', (ev) => {
      const bb = svg.getBoundingClientRect(), k = w / bb.width; const mx = (ev.clientX - bb.left) * k, my = (ev.clientY - bb.top) * k;
      let best = null, bd = 24 * 24 * k * k;
      for (const p of P) { const d = (p[0] - mx) ** 2 + (p[1] - my) ** 2; if (d < bd) { bd = d; best = p; } }
      if (!best) { hideTip(f); ring2.setAttribute('visibility', 'hidden'); return; }
      ring2.setAttribute('cx', best[0]); ring2.setAttribute('cy', best[1]); ring2.setAttribute('visibility', 'visible');
      const i = best[2], rows = [{ value: spec.x.date ? fmtDate(xs[i]) : fmt(xs[i]), label: spec.x.label }, { value: fmt(ys[i]), label: spec.y.label }];
      if (spec.hue) rows.push({ value: PB.str(spec.hue.values[i]), label: spec.hue.label, color: colorOf(i) });
      showTip(f, best[0] / k, best[1] / k, rows);
    });
    hit.addEventListener('pointerleave', () => { hideTip(f); ring2.setAttribute('visibility', 'hidden'); });
    return svg;
  }

  /* ---------- line ---------- */
  function line(spec, f) {
    const { w, h } = sizeOf(f, 0.5);
    const m = { l: 56, r: 18, t: 12, b: 40 };
    const series = spec.series.filter((s) => s.points.length);
    const catX = spec.x.categorical;
    let xVals = [];
    if (catX) { const seen = new Map(); series.forEach((s) => s.points.forEach(([x]) => { if (!seen.has(PB.keyOf(x))) seen.set(PB.keyOf(x), x); })); xVals = Array.from(seen.values()); }
    const allX = series.flatMap((s) => s.points.map((p) => p[0])), allY = series.flatMap((s) => s.points.map((p) => p[1])).filter(Number.isFinite);
    const sy = niceScale(Math.min(...allY), Math.max(...allY));
    const xlo = catX ? 0 : Math.min(...allX), xhi = catX ? Math.max(1, xVals.length - 1) : Math.max(...allX);
    const X = catX ? (v) => lin(0, Math.max(1, xVals.length - 1), m.l + 10, w - m.r - 10)(xVals.findIndex((q) => PB.keyOf(q) === PB.keyOf(v))) : lin(xlo, xhi === xlo ? xlo + 1 : xhi, m.l, w - m.r);
    const Y = lin(sy.lo, sy.hi, h - m.b, m.t);
    const svg = S('svg', { class: 'plot', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': spec.title || 'line chart' });
    const g = S('g'); svg.appendChild(g);
    axisY(g, sy, Y, m.l, w - m.r);
    g.appendChild(S('line', { x1: m.l, x2: w - m.r, y1: h - m.b, y2: h - m.b, style: 'stroke:var(--axis)' }));
    if (spec.x.date) for (const [t, lab] of dateTicks(xlo, xhi)) g.appendChild(S('text', { x: X(t), y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(lab)]));
    else if (catX) { const step = Math.ceil(xVals.length / Math.max(2, Math.floor((w - m.l) / 70))); xVals.forEach((v, i) => { if (i % step === 0) g.appendChild(S('text', { x: X(v), y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(trunc(PB.str(v), 64))])); }); }
    else { const sx = niceScale(xlo, xhi, 6); for (const t of sx.ticks) if (t >= xlo - 1e-9 && t <= xhi + 1e-9) g.appendChild(S('text', { x: X(t), y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(fmt(t, sx.dec))])); }
    if (spec.x.label) g.appendChild(S('text', { class: 'lab', x: (m.l + w - m.r) / 2, y: h - 6, 'text-anchor': 'middle' }, [document.createTextNode(spec.x.label)]));
    if (spec.y.label) g.appendChild(S('text', { class: 'lab', x: 12, y: (m.t + h - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})` }, [document.createTextNode(spec.y.label)]));
    series.forEach((s, k) => {
      const col = SERIES[k % 8];
      const d = s.points.filter((p) => Number.isFinite(p[1])).map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      g.appendChild(S('path', { d, style: `fill:none;stroke:${col};stroke-width:2;stroke-linejoin:round;stroke-linecap:round`, 'stroke-dasharray': s.dashed ? '6 4' : null }));
      const showPts = spec.markers || s.points.length <= 24;
      if (showPts) s.points.forEach((p) => { if (Number.isFinite(p[1])) g.appendChild(S('circle', { cx: X(p[0]), cy: Y(p[1]), r: 3.5, style: `fill:${col};stroke:var(--surface);stroke-width:1.5` })); });
      const last = s.points.filter((p) => Number.isFinite(p[1])).slice(-1)[0];
      if (last) g.appendChild(S('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4, style: `fill:${col};stroke:var(--surface);stroke-width:2` }));
    });
    if (series.length > 1) series.forEach((s, k) => { const sp = H('span'); const i = H('i', s.dashed ? 'dash' : 'line'); i.style.background = SERIES[k % 8]; i.style.color = SERIES[k % 8]; sp.appendChild(i); sp.appendChild(document.createTextNode(s.name)); f.legend.appendChild(sp); });
    const cross = S('line', { y1: m.t, y2: h - m.b, style: 'stroke:var(--ink-3)', 'stroke-width': 1, visibility: 'hidden' }); g.appendChild(cross);
    const hit = S('rect', { x: m.l, y: m.t, width: w - m.l - m.r, height: h - m.t - m.b, fill: 'transparent' }); g.appendChild(hit);
    hit.addEventListener('pointermove', (ev) => {
      const bb = svg.getBoundingClientRect(), k = w / bb.width, mx = (ev.clientX - bb.left) * k;
      let best = null, bd = Infinity;
      for (const s of series) for (const p of s.points) { const d = Math.abs(X(p[0]) - mx); if (d < bd) { bd = d; best = p[0]; } }
      if (best === null) return;
      const bx = X(best); cross.setAttribute('x1', bx); cross.setAttribute('x2', bx); cross.setAttribute('visibility', 'visible');
      const rows = [{ value: spec.x.date ? fmtDate(best) : PB.str(best), label: spec.x.label || 'x' }];
      series.forEach((s, j) => { const p = s.points.find((q) => PB.keyOf(q[0]) === PB.keyOf(best)); if (p) rows.push({ value: fmt(p[1]), label: s.name, color: SERIES[j % 8] }); });
      showTip(f, bx / k, (ev.clientY - bb.top), rows);
    });
    hit.addEventListener('pointerleave', () => { hideTip(f); cross.setAttribute('visibility', 'hidden'); });
    return svg;
  }

  /* ---------- bars (vertical / horizontal, grouped) ---------- */
  function roundedBar(x, y, w, h, r, dir) {
    r = Math.min(r, Math.abs(dir === 'up' || dir === 'down' ? w : h) / 2, Math.abs(dir === 'up' || dir === 'down' ? h : w));
    if (dir === 'up') return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    if (dir === 'down') return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    if (dir === 'right') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }
  function bars(spec, f) {
    const cats = spec.categories, ser = spec.series, ns = ser.length;
    const all = ser.flatMap((s) => s.values).filter(Number.isFinite);
    const sv = niceScale(Math.min(0, ...all), Math.max(0, ...all), 5, true);
    const svg = S('svg', { class: 'plot', role: 'img', 'aria-label': spec.title || 'bar chart' });
    const g = S('g'); svg.appendChild(g);
    if (ns > 1) ser.forEach((s, k) => { const sp = H('span'); const i = H('i'); i.style.background = SERIES[k % 8]; sp.appendChild(i); sp.appendChild(document.createTextNode(s.name)); f.legend.appendChild(sp); });
    const labelFew = cats.length * ns <= 14;
    const hits = [];
    if (spec.horizontal) {
      const W = Math.max(280, f.plot.clientWidth || 560);
      const labW = Math.min(170, Math.max(50, ...cats.map((c) => textWidth(c, 11) + 10)));
      const band = Math.max(22, Math.min(34, 260 / Math.max(1, cats.length) + 8)), Hh = cats.length * band * Math.max(1, ns * 0.75) + 36;
      const m = { l: labW + 8, r: 46, t: 6, b: 28 };
      const X = lin(sv.lo, sv.hi, m.l, W - m.r);
      svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
      for (const t of sv.ticks) { g.appendChild(S('line', { x1: X(t), x2: X(t), y1: m.t, y2: Hh - m.b, style: 'stroke:var(--grid)' })); g.appendChild(S('text', { x: X(t), y: Hh - m.b + 15, 'text-anchor': 'middle' }, [document.createTextNode(fmt(t, sv.dec))])); }
      const bandH = (Hh - m.t - m.b) / cats.length;
      cats.forEach((c, i) => {
        const y0 = m.t + i * bandH;
        g.appendChild(S('text', { x: m.l - 8, y: y0 + bandH / 2 + 4, 'text-anchor': 'end', class: 'lab' }, [document.createTextNode(trunc(c, labW - 10))]));
        const th = Math.min(20, (bandH * 0.72 - (ns - 1) * 2) / ns);
        ser.forEach((s, k) => {
          const v = s.values[i]; if (!Number.isFinite(v)) return;
          const yy = y0 + (bandH - (th * ns + (ns - 1) * 2)) / 2 + k * (th + 2);
          const xa = X(Math.min(0, v)), xb = X(Math.max(0, v));
          g.appendChild(S('path', { d: roundedBar(xa, yy, Math.max(1, xb - xa), th, 4, v >= 0 ? 'right' : 'left'), style: `fill:${SERIES[k % 8]}` }));
          if (labelFew) g.appendChild(S('text', { class: 'val', x: v >= 0 ? xb + 5 : xa - 5, y: yy + th / 2 + 4, 'text-anchor': v >= 0 ? 'start' : 'end' }, [document.createTextNode(fmt(v))]));
          hits.push({ x: m.l, y: y0, w: W - m.l - m.r, h: bandH, i });
        });
      });
      g.appendChild(S('line', { x1: X(0), x2: X(0), y1: m.t, y2: Hh - m.b, style: 'stroke:var(--axis)' }));
      addBarHits(g, svg, hits, f, spec, W);
      return svg;
    }
    const { w, h } = sizeOf(f, 0.5);
    const longest = Math.max(...cats.map((c) => textWidth(c, 11)));
    const m = { l: 56, r: 12, t: 16, b: 38 };
    const bandW = (w - m.l - m.r) / Math.max(1, cats.length);
    const rotate = longest + 8 > bandW;
    if (rotate) m.b = Math.min(110, 24 + Math.min(longest, 120) * 0.72);
    const Y = lin(sv.lo, sv.hi, h - m.b, m.t);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    axisY(g, sv, Y, m.l, w - m.r);
    cats.forEach((c, i) => {
      const x0 = m.l + i * bandW;
      const bw = Math.min(24, (bandW * 0.72 - (ns - 1) * 2) / ns);
      const gx = x0 + (bandW - (bw * ns + (ns - 1) * 2)) / 2;
      ser.forEach((s, k) => {
        const v = s.values[i]; if (!Number.isFinite(v)) return;
        const xx = gx + k * (bw + 2), ya = Y(Math.max(0, v)), yb = Y(Math.min(0, v));
        g.appendChild(S('path', { d: roundedBar(xx, ya, bw, Math.max(1, yb - ya), 4, v >= 0 ? 'up' : 'down'), style: `fill:${SERIES[k % 8]}` }));
        if (labelFew && bw >= 14) g.appendChild(S('text', { class: 'val', x: xx + bw / 2, y: v >= 0 ? ya - 4 : yb + 12, 'text-anchor': 'middle' }, [document.createTextNode(fmt(v))]));
      });
      const lx = x0 + bandW / 2;
      if (rotate) g.appendChild(S('text', { x: lx, y: h - m.b + 12, 'text-anchor': 'end', transform: `rotate(-40 ${lx} ${h - m.b + 12})` }, [document.createTextNode(trunc(c, 120))]));
      else g.appendChild(S('text', { x: lx, y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(c)]));
      hits.push({ x: x0, y: m.t, w: bandW, h: h - m.t - m.b, i });
    });
    g.appendChild(S('line', { x1: m.l, x2: w - m.r, y1: Y(0), y2: Y(0), style: 'stroke:var(--axis)' }));
    if (spec.ylabel) g.appendChild(S('text', { class: 'lab', x: 12, y: (m.t + h - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})` }, [document.createTextNode(spec.ylabel)]));
    addBarHits(g, svg, hits, f, spec, w);
    return svg;
  }
  function addBarHits(g, svg, hits, f, spec, W) {
    const seen = new Set();
    for (const hb of hits) {
      if (seen.has(hb.i)) continue; seen.add(hb.i);
      const r = S('rect', { x: hb.x, y: hb.y, width: hb.w, height: hb.h, fill: 'transparent' });
      r.addEventListener('pointerenter', () => r.setAttribute('style', 'fill:var(--ink);fill-opacity:.05'));
      r.addEventListener('pointermove', (ev) => {
        const bb = svg.getBoundingClientRect();
        const rows = [{ value: spec.categories[hb.i], label: spec.horizontal ? '' : spec.xlabel }];
        spec.series.forEach((s, k) => rows.push({ value: fmt(s.values[hb.i]), label: s.name, color: SERIES[k % 8] }));
        showTip(f, ev.clientX - bb.left, ev.clientY - bb.top, rows);
      });
      r.addEventListener('pointerleave', () => { r.removeAttribute('style'); hideTip(f); });
      g.appendChild(r);
    }
  }

  /* ---------- histogram ---------- */
  function hist(spec, f) {
    const { w, h } = sizeOf(f, 0.48);
    const m = { l: 52, r: 12, t: 12, b: 40 };
    const e = spec.edges, ser = spec.series, nb = e.length - 1;
    const tot = PB.range(nb).map((j) => ser.reduce((s, x) => s + x.values[j], 0));
    const sy = niceScale(0, Math.max(...tot), 5, true);
    const sx = niceScale(e[0], e[nb], 6);
    const X = lin(e[0], e[nb], m.l, w - m.r), Y = lin(sy.lo, sy.hi, h - m.b, m.t);
    const svg = S('svg', { class: 'plot', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': spec.title || 'histogram' });
    const g = S('g'); svg.appendChild(g);
    axisY(g, sy, Y, m.l, w - m.r);
    for (const t of sx.ticks) if (t >= e[0] - 1e-9 && t <= e[nb] + 1e-9) g.appendChild(S('text', { x: X(t), y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(fmt(t, sx.dec))]));
    if (ser.length > 1) ser.forEach((s, k) => { const sp = H('span'); const i = H('i'); i.style.background = SERIES[k % 8]; sp.appendChild(i); sp.appendChild(document.createTextNode(s.name)); f.legend.appendChild(sp); });
    for (let j = 0; j < nb; j++) {
      const x0 = X(e[j]) + 1, x1 = X(e[j + 1]) - 1;
      let acc = 0;
      ser.forEach((s, k) => {
        const v = s.values[j]; if (!v) return;
        const ya = Y(acc + v), yb = Y(acc); const top = k === ser.length - 1 || ser.slice(k + 1).every((q) => !q.values[j]);
        g.appendChild(S('path', { d: top ? roundedBar(x0, ya, Math.max(1, x1 - x0), yb - ya - (acc ? 2 : 0), 3, 'up') : `M${x0},${ya}H${x1}V${yb - (acc ? 2 : 0)}H${x0}Z`, style: `fill:${SERIES[k % 8]}` }));
        acc += v;
      });
      const r = S('rect', { x: X(e[j]), y: m.t, width: Math.max(1, X(e[j + 1]) - X(e[j])), height: h - m.t - m.b, fill: 'transparent' });
      r.addEventListener('pointermove', (ev) => { const bb = svg.getBoundingClientRect(); const rows = [{ value: `${fmt(e[j])} – ${fmt(e[j + 1])}`, label: spec.xlabel }]; ser.forEach((s, k) => rows.push({ value: String(s.values[j]), label: s.name, color: SERIES[k % 8] })); showTip(f, ev.clientX - bb.left, ev.clientY - bb.top, rows); r.setAttribute('style', 'fill:var(--ink);fill-opacity:.05'); });
      r.addEventListener('pointerleave', () => { hideTip(f); r.removeAttribute('style'); });
      g.appendChild(r);
    }
    g.appendChild(S('line', { x1: m.l, x2: w - m.r, y1: Y(0), y2: Y(0), style: 'stroke:var(--axis)' }));
    g.appendChild(S('text', { class: 'lab', x: (m.l + w - m.r) / 2, y: h - 6, 'text-anchor': 'middle' }, [document.createTextNode(spec.xlabel)]));
    g.appendChild(S('text', { class: 'lab', x: 12, y: (m.t + h - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})` }, [document.createTextNode(TR('จำนวน'))]));
    return svg;
  }

  /* ---------- box plot ---------- */
  function box(spec, f) {
    const { w, h } = sizeOf(f, 0.5);
    const m = { l: 56, r: 12, t: 12, b: 40 };
    const G = spec.groups.filter((g0) => g0.n);
    const all = G.flatMap((g0) => [g0.lo, g0.hi, ...g0.out]);
    const sy = niceScale(Math.min(...all), Math.max(...all));
    const Y = lin(sy.lo, sy.hi, h - m.b, m.t), band = (w - m.l - m.r) / Math.max(1, G.length);
    const svg = S('svg', { class: 'plot', viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': spec.title || 'box plot' });
    const g = S('g'); svg.appendChild(g);
    axisY(g, sy, Y, m.l, w - m.r);
    G.forEach((gr, i) => {
      const cx = m.l + band * (i + 0.5), bw = Math.min(46, band * 0.5), col = SERIES[i % 8];
      g.appendChild(S('line', { x1: cx, x2: cx, y1: Y(gr.lo), y2: Y(gr.q1), style: 'stroke:var(--ink-2)', 'stroke-width': 1.2 }));
      g.appendChild(S('line', { x1: cx, x2: cx, y1: Y(gr.q3), y2: Y(gr.hi), style: 'stroke:var(--ink-2)', 'stroke-width': 1.2 }));
      g.appendChild(S('line', { x1: cx - bw / 4, x2: cx + bw / 4, y1: Y(gr.lo), y2: Y(gr.lo), style: 'stroke:var(--ink-2)', 'stroke-width': 1.2 }));
      g.appendChild(S('line', { x1: cx - bw / 4, x2: cx + bw / 4, y1: Y(gr.hi), y2: Y(gr.hi), style: 'stroke:var(--ink-2)', 'stroke-width': 1.2 }));
      g.appendChild(S('rect', { x: cx - bw / 2, y: Y(gr.q3), width: bw, height: Math.max(1, Y(gr.q1) - Y(gr.q3)), rx: 4, style: `fill:${col};fill-opacity:.22;stroke:${col};stroke-width:1.5` }));
      g.appendChild(S('line', { x1: cx - bw / 2, x2: cx + bw / 2, y1: Y(gr.med), y2: Y(gr.med), style: `stroke:${col}`, 'stroke-width': 2.5 }));
      gr.out.forEach((v) => g.appendChild(S('circle', { cx, cy: Y(v), r: 2.6, style: `fill:none;stroke:${col};stroke-width:1.2` })));
      g.appendChild(S('text', { x: cx, y: h - m.b + 16, 'text-anchor': 'middle' }, [document.createTextNode(trunc(gr.name, band - 6))]));
      const r = S('rect', { x: cx - band / 2, y: m.t, width: band, height: h - m.t - m.b, fill: 'transparent' });
      r.addEventListener('pointermove', (ev) => { const bb = svg.getBoundingClientRect(); showTip(f, ev.clientX - bb.left, ev.clientY - bb.top, [{ value: gr.name, label: spec.xlabel, color: col }, { value: fmt(gr.med), label: TR('มัธยฐาน') }, { value: `${fmt(gr.q1)} – ${fmt(gr.q3)}`, label: 'Q1–Q3' }, { value: String(gr.n), label: TR('จำนวน') }]); });
      r.addEventListener('pointerleave', () => hideTip(f));
      g.appendChild(r);
    });
    g.appendChild(S('text', { class: 'lab', x: 12, y: (m.t + h - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${(m.t + h - m.b) / 2})` }, [document.createTextNode(spec.ylabel)]));
    return svg;
  }

  /* ---------- heatmap ---------- */
  function heatmap(spec, f) {
    const R = spec.rows, C = spec.cols, V = spec.values;
    const W = Math.max(280, f.plot.clientWidth || 560);
    const labW = Math.min(140, Math.max(30, ...R.map((r) => textWidth(r, 11) + 10)));
    const topH = Math.min(110, Math.max(24, ...C.map((c) => textWidth(c, 11) * 0.72 + 14)));
    const cell = Math.max(18, Math.min(64, (W - labW - 16) / C.length));
    const Hh = topH + cell * R.length + 8 + (spec.xlabel ? 18 : 0);
    const svg = S('svg', { class: 'plot', viewBox: `0 0 ${W} ${Hh}`, role: 'img', 'aria-label': spec.title || 'heatmap' });
    const g = S('g'); svg.appendChild(g);
    const flat = V.flat().filter(Number.isFinite);
    const lo = Math.min(...flat), hi = Math.max(...flat);
    const dark = isDark();
    const color = (v) => {
      if (!Number.isFinite(v)) return 'var(--surface-3)';
      if (spec.diverging) { const t = Math.max(-1, Math.min(1, v)); if (Math.abs(t) < 0.04) return dark ? '#383835' : '#f0efec'; return t > 0 ? rampColor(RED, t) : rampColor(BLUE, -t); }
      return rampColor(dark ? SEQ_L.slice(2) : SEQ_L, (v - lo) / (hi - lo || 1));
    };
    const allInt = flat.every(Number.isInteger);
    C.forEach((c, j) => { const x = labW + j * cell + cell / 2; g.appendChild(S('text', { x, y: topH - 6, 'text-anchor': 'start', transform: `rotate(-40 ${x} ${topH - 6})` }, [document.createTextNode(trunc(c, 110))])); });
    R.forEach((r, i) => {
      const y = topH + i * cell;
      g.appendChild(S('text', { x: labW - 6, y: y + cell / 2 + 4, 'text-anchor': 'end' }, [document.createTextNode(trunc(r, labW - 8))]));
      C.forEach((c, j) => {
        const v = V[i][j], x = labW + j * cell, fill = color(v);
        const rect = S('rect', { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, rx: 3, style: `fill:${fill}` });
        g.appendChild(rect);
        if (cell >= 26) {
          const txt = allInt ? String(v) : fmt(v, 2);
          const ink = fill.startsWith('var') ? 'var(--ink)' : lum(fill) < 0.36 ? '#ffffff' : '#132132';
          g.appendChild(S('text', { x: x + cell / 2, y: y + cell / 2 + 4, 'text-anchor': 'middle', style: `fill:${ink};font-size:${Math.min(12, cell / 3.2)}px;font-weight:500` }, [document.createTextNode(txt)]));
        }
        rect.addEventListener('pointermove', (ev) => { const bb = svg.getBoundingClientRect(); showTip(f, ev.clientX - bb.left, ev.clientY - bb.top, [{ value: allInt ? String(v) : fmt(v, 3), label: '' }, { value: r, label: spec.ylabel || TR('แถว') }, { value: c, label: spec.xlabel || TR('คอลัมน์') }]); rect.setAttribute('stroke', 'var(--ink)'); });
        rect.addEventListener('pointerleave', () => { hideTip(f); rect.removeAttribute('stroke'); });
      });
    });
    if (spec.xlabel) g.appendChild(S('text', { class: 'lab', x: labW + (C.length * cell) / 2, y: Hh - 4, 'text-anchor': 'middle' }, [document.createTextNode(spec.xlabel + TR(' (คอลัมน์) · ') + (spec.ylabel || '') + TR(' (แถว)'))]));
    const lg = f.legend;
    if (spec.diverging) { const b = H('i', 'ramp'); b.style.background = `linear-gradient(90deg, ${BLUE[6]}, ${BLUE[2]}, ${dark ? '#383835' : '#f0efec'}, ${RED[2]}, ${RED[6]})`; const sp = H('span'); sp.appendChild(document.createTextNode('-1 ')); sp.appendChild(b); sp.appendChild(document.createTextNode(' +1')); lg.appendChild(sp); }
    else { const ramp = dark ? SEQ_L.slice(2) : SEQ_L; const b = H('i', 'ramp'); b.style.background = `linear-gradient(90deg, ${ramp[0]}, ${ramp[ramp.length - 1]})`; const sp = H('span'); sp.appendChild(document.createTextNode(fmt(lo) + ' ')); sp.appendChild(b); sp.appendChild(document.createTextNode(' ' + fmt(hi))); lg.appendChild(sp); }
    return svg;
  }

  /* ---------- images ---------- */
  function images(spec, f) {
    const grid = H('div', 'img-grid');
    const side = spec.side;
    for (const im of spec.images) {
      const fig = H('figure');
      const cv = document.createElement('canvas'); cv.width = side; cv.height = side;
      const ctx = cv.getContext('2d'); const img = ctx.createImageData(side, side);
      const mx = Math.max(...im.pixels, 1);
      im.pixels.forEach((v, i) => { const c = 255 - Math.round((v / mx) * 255); img.data[i * 4] = c; img.data[i * 4 + 1] = c; img.data[i * 4 + 2] = c; img.data[i * 4 + 3] = 255; });
      ctx.putImageData(img, 0, 0);
      fig.appendChild(cv); fig.appendChild(H('figcaption', null, im.label));
      grid.appendChild(fig);
    }
    f.legend.hidden = true;
    return grid;
  }

  /* ---------- table view twin ---------- */
  function tableView(spec) {
    let cols = [], rows = [];
    if (spec.kind === 'scatter') { cols = [spec.x.label, spec.y.label].concat(spec.hue ? [spec.hue.label] : []); rows = spec.x.values.map((x, i) => [spec.x.date ? fmtDate(x) : x, spec.y.values[i]].concat(spec.hue ? [spec.hue.values[i]] : [])); }
    else if (spec.kind === 'line') { const xs = []; const seen = new Set(); spec.series.forEach((s) => s.points.forEach(([x]) => { const k = PB.keyOf(x); if (!seen.has(k)) { seen.add(k); xs.push(x); } })); cols = [spec.x.label || 'x'].concat(spec.series.map((s) => s.name)); rows = xs.map((x) => [spec.x.date ? fmtDate(x) : x].concat(spec.series.map((s) => { const p = s.points.find((q) => PB.keyOf(q[0]) === PB.keyOf(x)); return p ? p[1] : ''; }))); }
    else if (spec.kind === 'bar') { cols = [spec.xlabel || TR('หมวด')].concat(spec.series.map((s) => s.name)); rows = spec.categories.map((c, i) => [c].concat(spec.series.map((s) => s.values[i]))); }
    else if (spec.kind === 'hist') { cols = [TR('ช่วง ') + spec.xlabel].concat(spec.series.map((s) => s.name)); rows = PB.range(spec.edges.length - 1).map((j) => [`${fmt(spec.edges[j])} – ${fmt(spec.edges[j + 1])}`].concat(spec.series.map((s) => s.values[j]))); }
    else if (spec.kind === 'box') { cols = [spec.xlabel, 'n', TR('ต่ำสุด*'), 'Q1', TR('มัธยฐาน'), 'Q3', TR('สูงสุด*'), TR('ค่าผิดปกติ')]; rows = spec.groups.map((g0) => [g0.name, g0.n, g0.lo, g0.q1, g0.med, g0.q3, g0.hi, g0.out.length]); }
    else if (spec.kind === 'heatmap') { cols = [''].concat(spec.cols); rows = spec.rows.map((r, i) => [r].concat(spec.values[i])); }
    else if (spec.kind === 'images') { cols = [TR('ภาพที่'), TR('ป้าย')]; rows = spec.images.map((im, i) => [i, im.label]); }
    const wrap = H('div', 'tbl-wrap'); const t = H('table', 'df');
    const thead = H('thead'); const trh = H('tr'); cols.forEach((c) => trh.appendChild(H('th', null, c))); thead.appendChild(trh); t.appendChild(thead);
    const tb = H('tbody');
    rows.slice(0, 500).forEach((r) => { const tr = H('tr'); r.forEach((v, j) => { const td = H(j === 0 ? 'th' : 'td', typeof v === 'string' && j ? 'str' : null, typeof v === 'number' ? fmt(v, 4) : PB.str(v ?? '')); tr.appendChild(td); }); tb.appendChild(tr); });
    t.appendChild(tb); wrap.appendChild(t);
    if (rows.length > 500) { const p = H('div', 'tbl-meta', TR`แสดง 500 จาก ${rows.length.toLocaleString()} แถว`); const box2 = H('div'); box2.appendChild(wrap); box2.appendChild(p); return box2; }
    return wrap;
  }

  const DRAW = { scatter, line, bar: bars, hist, box, heatmap, images };
  PB.charts = {
    render(spec, root) {
      const f = frame(spec, root);
      const draw = () => {
        f.legend.textContent = '';
        const old = f.plot.querySelector('svg.plot, .img-grid'); if (old) old.remove();
        let el;
        try { el = DRAW[spec.kind](spec, f); } catch (e) { el = H('div', 'muted', TR('วาดกราฟไม่ได้: ') + e.message); }
        f.plot.insertBefore(el, f.tip);
      };
      draw();
      let lastW = f.plot.clientWidth;
      if (window.ResizeObserver && spec.kind !== 'images') {
        let tmo = null;
        new ResizeObserver(() => { const nw = f.plot.clientWidth; if (!nw || Math.abs(nw - lastW) < 24) return; lastW = nw; clearTimeout(tmo); tmo = setTimeout(draw, 120); }).observe(f.plot);
      }
      return f.wrap;
    },
    fmt,
  };
})();
