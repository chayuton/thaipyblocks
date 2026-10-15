/* ThaiPyBlocks UI utilities: DOM helpers, Python syntax highlighter, ZIP writer, dialogs. */
(function () {
  const U = (PB.u = {});
  U.$ = (sel, root = document) => root.querySelector(sel);
  U.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  U.h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    return e;
  };
  /* a wizard title or option that shares its English with a lowercase block label ("find outliers") starts with a capital */
  U.cap = (s) => (typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.frame = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  U.store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  U.icon = (name) => {
    const P = {
      play: '<path d="M5 3.5v13l11-6.5z" fill="currentColor"/>',
      step: '<path d="M4 4v12l8-6zM14 4h2.5v12H14z" fill="currentColor"/>',
      stop: '<rect x="4.5" y="4.5" width="11" height="11" rx="1.5" fill="currentColor"/>',
      wand: '<path d="M3 17L13 7M12 3l.6 1.9L14.5 5.5l-1.9.6L12 8l-.6-1.9L9.5 5.5l1.9-.6zM16.5 9l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      book: '<path d="M3.5 4.5c2.5-1 4.5-1 6.5.5 2-1.5 4-1.5 6.5-.5v11c-2.5-1-4.5-1-6.5.5-2-1.5-4-1.5-6.5-.5zM10 5v11" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
      data: '<ellipse cx="10" cy="5" rx="6" ry="2.3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M4 5v10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3V5M4 10c0 1.3 2.7 2.3 6 2.3s6-1 6-2.3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
      more: '<circle cx="4.5" cy="10" r="1.6" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="currentColor"/><circle cx="15.5" cy="10" r="1.6" fill="currentColor"/>',
      plus: '<path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      minus: '<path d="M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      center: '<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="10" cy="10" r="2" fill="currentColor"/>',
      tidy: '<path d="M4 4h12M4 8h8M4 12h12M4 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      blocks: '<rect x="3" y="3.5" width="9" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="8" y="11" width="9" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>',
      out: '<path d="M3.5 5.5l4 4.5-4 4.5M10 15h6.5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      code: '<path d="M7 5l-4.5 5L7 15M13 5l4.5 5L13 15" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      translate: '<path d="M3 5h8M7 3v2M4.5 5c.8 3 2.8 5 5.5 6M9.5 5c-.8 3-2.8 5.5-6 7M11 17l3.5-8 3.5 8M12.2 14.5h4.6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      vars: '<path d="M4 6h3M4 10h3M4 14h3M9.5 6H16M9.5 10H16M9.5 14H16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      copy: '<rect x="6.5" y="6.5" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M13.5 6.5V5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 5v7A1.5 1.5 0 005 13.5h1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>',
      download: '<path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      close: '<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      upload: '<path d="M10 13V3.5M6 7.5l4-4 4 4M4 16.5h12" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      task: '<path d="M3.5 5.2l1.6 1.6 2.8-3M3.5 10.7l1.6 1.6 2.8-3M3.5 16.2l1.6 1.6 2.8-3M10.5 5.5h6.5M10.5 11h6.5M10.5 16.5h6.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      bulb: '<path d="M10 2.8a5.2 5.2 0 00-3 9.45V14h6v-1.75A5.2 5.2 0 0010 2.8zM7.5 16.3h5M8.5 18.3h3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      report: '<path d="M5 2.8h7l3.5 3.5v10.9H5zM12 2.8v3.5h3.5M7.5 14.5v-3M10 14.5V9.5M12.5 14.5v-2" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      broom: '<path d="M16.2 2.6l-5 6.6M8.4 8.2l5.2 3.4-2.1 5.6H4.2zM7.1 17.2l1.5-4.4M9.6 17.2l1.2-3.4M4.2 3.3v3M2.7 4.8h3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      pdf: '<path d="M5 2.8h7l3.5 3.5v10.9H5zM12 2.8v3.5h3.5M10.2 8.6v5.6M7.8 11.9l2.4 2.4 2.4-2.4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      history: '<path d="M3.7 10a6.3 6.3 0 1 0 1.85-4.45M3.4 3.4v3.4h3.4M10 6.4V10l2.6 1.7" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
      folder: '<path d="M2.8 5.6c0-.8.6-1.4 1.4-1.4h3.5l1.7 1.9h6.4c.8 0 1.4.6 1.4 1.4v7.2c0 .8-.6 1.4-1.4 1.4H4.2c-.8 0-1.4-.6-1.4-1.4z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
    };
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = P[name] || '';
    return s;
  };

  /* ---------- Python highlighter ---------- */
  const KW = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
  const BI = new Set(['print', 'len', 'range', 'list', 'dict', 'str', 'int', 'float', 'round', 'type', 'sum', 'min', 'max', 'abs', 'sorted', 'reversed', 'enumerate', 'zip', 'isinstance', 'hasattr']);
  U.highlightPy = (line) => {
    let out = '', i = 0;
    const re = /(#.*$)|([fF]?"(?:[^"\\]|\\.)*"|[fF]?'(?:[^'\\]|\\.)*')|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_฀-๿][\w฀-๿]*)/g;
    let m;
    while ((m = re.exec(line))) {
      out += U.esc(line.slice(i, m.index));
      const t = m[0];
      if (m[1]) out += `<span class="tk-com">${U.esc(t)}</span>`;
      else if (m[2]) out += `<span class="tk-str">${U.esc(t)}</span>`;
      else if (m[3]) out += `<span class="tk-num">${U.esc(t)}</span>`;
      else if (KW.has(t)) out += `<span class="tk-kw">${t}</span>`;
      else if (BI.has(t) && line[re.lastIndex] === '(') out += `<span class="tk-bi">${t}</span>`;
      else if (line[re.lastIndex] === '(') out += `<span class="tk-fn">${U.esc(t)}</span>`;
      else out += U.esc(t);
      i = re.lastIndex;
    }
    return out + U.esc(line.slice(i));
  };

  /* ---------- ZIP (store) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  U.zip = (files) => {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  };

  /* ---------- in-page dialogs (the viewer blocks alert/confirm/prompt) ---------- */
  U.modal = ({ title, body, foot, small, onClose, labelledby }) => {
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const head = U.h('div', { class: 'modal-head' }, U.h('h2', { id: labelledby || null }, title), U.h('button', { class: 'btn btn-ghost icon-btn', 'aria-label': TR('ปิด'), onclick: close }, U.icon('close')));
    const box = U.h('div', { class: 'modal' + (small ? ' small' : ''), role: 'dialog', 'aria-modal': 'true' }, head, U.h('div', { class: 'modal-body' }, body), foot ? U.h('div', { class: 'modal-foot' }, foot) : null);
    const scrim = U.h('div', { class: 'scrim', onmousedown: (e) => { if (e.target === scrim) close(); } }, box);
    document.body.appendChild(scrim);
    document.addEventListener('keydown', onKey);
    setTimeout(() => { const f = box.querySelector('input, select, textarea, .modal-foot .btn-accent'); if (f) f.focus(); }, 30);
    return { close, box };
  };
  U.prompt = (message, def, cb) => {
    const inp = U.h('input', { class: 'input', id: 'pb-prompt-input', value: def || '', style: { width: '100%' } });
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); cb(v); };
    const m = U.modal({ title: TR('ป้อนค่า'), small: true, body: U.h('div', { class: 'field' }, U.h('label', { for: 'pb-prompt-input' }, message), inp), foot: [U.h('button', { class: 'btn', onclick: () => finish(null) }, TR('ยกเลิก')), U.h('button', { class: 'btn btn-accent', onclick: () => finish(inp.value) }, TR('ตกลง'))], onClose: () => finish(null) });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(inp.value); });
    setTimeout(() => { inp.focus(); inp.select(); }, 40);
  };
  U.confirm = (message, cb, okText = TR('ตกลง')) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; m.close(); cb(v); };
    const m = U.modal({ title: TR('ยืนยัน'), small: true, body: U.h('p', { class: 'dlg-text' }, message), foot: [U.h('button', { class: 'btn', onclick: () => finish(false) }, TR('ยกเลิก')), U.h('button', { class: 'btn btn-accent', onclick: () => finish(true) }, okText)], onClose: () => finish(false) });
  };
  U.alert = (message, cb) => { const m = U.modal({ title: TR('แจ้งเตือน'), small: true, body: U.h('p', { class: 'dlg-text' }, message), foot: [U.h('button', { class: 'btn btn-accent', onclick: () => m.close() }, TR('ตกลง'))], onClose: () => cb && cb() }); };
  U.toast = (msg, ms = 2600) => { U.$$('.toast').forEach((x) => x.remove()); const t = U.h('div', { class: 'toast', role: 'status' }, msg); document.body.appendChild(t); setTimeout(() => t.remove(), ms); };
  U.menu = (anchor, items, opts = {}) => {
    const close = () => { m.remove(); document.removeEventListener('pointerdown', onDoc, true); document.removeEventListener('keydown', onKey); };
    const onDoc = (e) => { if (!m.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } };
    const m = U.h('div', { class: 'menu', role: 'menu' });
    for (const it of items) {
      if (it === '-') { m.appendChild(U.h('hr')); continue; }
      if (it.label) { m.appendChild(U.h('div', { class: 'menu-label' }, it.label)); continue; }
      if (it.hidden) continue;
      m.appendChild(U.h('button', { type: 'button', role: 'menuitem', onclick: () => { close(); it.run(); } }, U.h('b', {}, it.title), it.sub ? U.h('small', {}, it.sub) : null));
    }
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    let left = opts.alignRight ? r.right - mw : r.left; left = Math.max(8, Math.min(window.innerWidth - mw - 8, left));
    let top = r.bottom + 6; if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    setTimeout(() => { document.addEventListener('pointerdown', onDoc, true); document.addEventListener('keydown', onKey); const f = m.querySelector('button'); if (f) f.focus(); }, 0);
    return close;
  };
})();
