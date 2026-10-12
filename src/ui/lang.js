/* ThaiPyBlocks: interface language (ไทย / English).
   The texts themselves are translated by TR() (src/engine/core.js) with the dictionary in src/i18n_en.js; this file
   translates the page's own HTML (src/index.html), and switches language: the blocks are saved, uploaded files are
   kept for the reload in IndexedDB, and the page reloads so that every block, menu and message is built in the
   new language. */
(function () {
  const U = PB.u, A = (PB.ui = PB.ui || {}), L = PB.i18n;
  const KEY = 'pyblocks.lang', KEEP = 'pyblocks.keptFiles';
  const THAI = /[฀-๿]/;

  /* ---------------- the page's HTML ---------------- */
  const tr = (s) => {
    const k = s.trim().replace(/\s+/g, ' ');
    if (!THAI.test(k)) return null;
    const v = PB.I18N_EN && PB.I18N_EN[k];
    if (v === undefined) { L.missing.add(k); return null; }
    return v;
  };
  L.translateDom = (root = document.body) => {
    if (L.lang !== 'en' || !root) return;
    document.documentElement.lang = 'en';
    const t = tr(document.title || ''); if (t) document.title = t;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) { const d = tr(meta.getAttribute('content') || ''); if (d) meta.setAttribute('content', d); }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentNode && /^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const v = tr(n.nodeValue); if (v === null) continue;
      const lead = n.nodeValue.match(/^\s*/)[0], tail = n.nodeValue.match(/\s*$/)[0];
      n.nodeValue = lead + v + tail;
    }
    /* set last: a data-en text is already the final English (the language button says ไทย on purpose) */
    root.querySelectorAll('[data-en]').forEach((el) => { el.textContent = el.dataset.en; });
    root.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); const x = v && tr(v); if (x) el.setAttribute(a, x); }
    });
  };

  /* ---------------- switching ---------------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('pyblocks-reload', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function keepFiles() {
    if (!PB.files || !PB.files.size) return;
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction('files', 'readwrite'), st = tx.objectStore('files');
        st.clear();
        for (const [name, f] of PB.files) if (f.bytes) st.put({ name, bytes: f.bytes }, name);
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
      db.close();
      U.store.set(KEEP, Date.now());
    } catch (e) { /* storage blocked: the files have to be uploaded again, as after any reload */ }
  }
  /* called by boot before the draft is restored, so the program can run straight away */
  L.restoreFiles = async () => {
    const at = U.store.get(KEEP);
    if (!at) return 0;
    U.store.del(KEEP);
    if (Date.now() - at > 5 * 60 * 1000) return 0;
    let n = 0;
    try {
      const db = await idb();
      const items = await new Promise((res, rej) => {
        const tx = db.transaction('files', 'readwrite'), st = tx.objectStore('files'), out = [];
        st.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue(); } };
        tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error);
      });
      await new Promise((res) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').clear(); tx.oncomplete = res; tx.onerror = res; });
      db.close();
      for (const it of items) { try { await A.readFile(new File([it.bytes], it.name)); n++; } catch (e) { /* skip a file that no longer reads */ } }
    } catch (e) { /* nothing kept */ }
    return n;
  };
  L.switchTo = async (lang) => {
    if (lang === L.lang) return;
    if (A.saveDraftNow) A.saveDraftNow();
    /* Python comments follow the interface language unless the person chose otherwise */
    const opts = U.store.get('pyblocks.codeOpts');
    if (opts && opts.comments === L.lang) { opts.comments = lang; U.store.set('pyblocks.codeOpts', opts); }
    U.store.set(KEY, lang);
    await keepFiles();
    if (U.store.get(KEY) !== lang || /lang=/.test(location.hash)) location.hash = 'lang=' + lang;   /* storage blocked: keep it in the address */
    location.reload();
  };
  L.other = () => (L.lang === 'en' ? 'th' : 'en');
})();
