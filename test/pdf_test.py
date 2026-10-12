"""PDF export of the results panel (src/ui/pdf.js).
Every sample becomes a valid A4 PDF (qpdf --check, pypdf) with one page image per page and an invisible text
layer that holds every printed line, table header and chart title. Also checked: the dark theme still gives
white pages, a phone-width window gives the same pages, very wide tables are trimmed like pandas, long tables
repeat their header on the next page, errors and exercise titles appear, and the PDF button works with the
claude.ai downloads capability and on a plain web page (re-running stale blocks first).
Web fonts come from vendor/node_modules/@fontsource when installed (npm ci in vendor/), so pages are drawn
with the same fonts as the real app.   python3 test/pdf_test.py [--png DIR] keeps page images for a visual check."""
import base64, json, os, re, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright
import pypdf

FONTS = os.path.join(ROOT, 'vendor', 'node_modules', '@fontsource')
FAMILIES = {'IBM Plex Sans Thai': 'ibm-plex-sans-thai', 'IBM Plex Mono': 'ibm-plex-mono', 'Chakra Petch': 'chakra-petch'}
PNG = sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None
OUT = tempfile.mkdtemp(prefix='pdf_test_')
MOCK = r'''
window.__saves = [];
window.claude = { use: (name) => new Promise((res) => setTimeout(() => {
  if (name !== 'downloads') return res(null);
  res(Object.freeze({ save: async (req) => {
    const d = req.data, u8 = d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d.buffer || d);
    let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    window.__saves.push({ filename: req.filename, b64: btoa(s) }); return { status: 'saved' }; } }));
}, 30)) };
'''

def route_fonts(page):
    """the Google Fonts stylesheet and font files, served from the @fontsource copies (same faces, same unicode ranges)"""
    route(page)
    if not os.path.isdir(FONTS):
        return False
    def css(r):
        out = []
        for fam in re.findall(r'family=([^&]+)', r.request.url):
            name, _, weights = fam.replace('+', ' ').partition(':wght@')
            pkg = FAMILIES.get(name)
            for w in (weights.split(';') if pkg else []):
                p = os.path.join(FONTS, pkg, f'{w}.css')
                if os.path.exists(p):
                    out.append(open(p, encoding='utf-8').read().replace('url(./files/', f'url(https://fonts.gstatic.com/fs/{pkg}/'))
        r.fulfill(body='\n'.join(out), content_type='text/css')
    def files(r):
        pkg, name = re.search(r'/fs/([^/]+)/([^/?]+)', r.request.url).groups()
        r.fulfill(path=os.path.join(FONTS, pkg, 'files', name), content_type='font/woff2' if name.endswith('woff2') else 'font/woff')
    page.route('https://fonts.googleapis.com/**', css)
    page.route('https://fonts.gstatic.com/fs/**', files)
    return True

def boot(browser, w=1360, hgt=860, dark=False, mock=False, downloads=False, init=None):
    ctx = browser.new_context(viewport={'width': w, 'height': hgt}, color_scheme='dark' if dark else 'light', accept_downloads=downloads)
    page = ctx.new_page()
    fonts = route_fonts(page)
    if mock: page.add_init_script(MOCK)
    if init: page.add_init_script(init)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000)
    page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    return ctx, page, errs, fonts

def run(page, sid=None, program=None):
    page.evaluate(f'PB.ui.loadProgram(PB.SAMPLES.find(s => s.id === {json.dumps(sid)}).build(), {{ run: true }})' if sid else f'PB.ui.loadProgram({program}, {{ run: true }})')
    page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=120000); page.wait_for_timeout(200)

# what a reader must find in the PDF: each printed line, the first header cells of each table, chart titles, error titles
EXPECT_JS = r'''() => {
  const out = [], norm = (s) => s.replace(/\s+/g, ' ').trim();
  for (const cell of document.querySelectorAll('#out-body .cell')) {
    const g = cell.querySelector('.cell-gutter'); if (g && g.textContent.trim()) out.push(g.textContent.trim());
    cell.querySelectorAll('pre.out-text').forEach((p) => p.textContent.split('\n').map(norm).filter(Boolean).slice(0, 40).forEach((l) => out.push(l)));
    cell.querySelectorAll('table.df').forEach((t) => { const ths = Array.from(t.rows[0].cells).map((c) => norm(c.textContent)).filter(Boolean); out.push(...ths.slice(0, 2)); });
    cell.querySelectorAll('.chart-title, .err-title').forEach((e) => out.push(norm(e.textContent)));
  }
  return out;
}'''

def build(page):
    t0 = time.time()
    res = page.evaluate('''async () => { const r = await PB.ui.buildPdf(); const b = new Uint8Array(await r.blob.arrayBuffer());
      let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return { b64: btoa(s), pages: r.pages, type: r.blob.type }; }''')
    return base64.b64decode(res['b64']), res['pages'], res['type'], time.time() - t0

def inspect(data, name):
    """qpdf check, pages, page images and the text layer of one PDF"""
    fn = os.path.join(OUT, name + '.pdf'); open(fn, 'wb').write(data)
    q = subprocess.run(['qpdf', '--check', fn], capture_output=True, text=True)
    r = pypdf.PdfReader(fn)
    pages, imgs, texts = len(r.pages), [], []
    for pg in r.pages:
        box = [round(float(v), 2) for v in pg.mediabox]
        xo = pg['/Resources']['/XObject']
        imgs.append([(int(o.get_object()['/Width']), int(o.get_object()['/Height'])) for o in xo.values()] + [box])
        texts.append(pg.extract_text() or '')
    if PNG:
        os.makedirs(PNG, exist_ok=True)
        subprocess.run(['pdftoppm', '-r', '60', '-png', fn, os.path.join(PNG, name)], check=True)
    return dict(ok=q.returncode == 0, qpdf=(q.stdout + q.stderr).strip()[-200:], pages=pages, imgs=imgs, texts=texts, title=(r.metadata or {}).get('/Title', ''), file=fn)

squash = lambda s: re.sub(r'\s+', '', s)

def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''))
    return cond

results = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx, page, errs, fonts = boot(browser)
    print('web fonts:', 'served from vendor/node_modules/@fontsource' if fonts else 'not installed (system fonts)')
    samples = page.evaluate('PB.SAMPLES.map((s) => s.id)')
    counts = {}
    # ---------- 1. every sample ----------
    for sid in samples:
        run(page, sid)
        want = page.evaluate(EXPECT_JS)
        title = page.evaluate('PB.ui.runInfo().title')
        data, n, typ, secs = build(page)
        d = inspect(data, sid)
        counts[sid] = d['pages']
        alltext = squash(' '.join(d['texts']))
        missing = [w for w in want if squash(w) not in alltext]
        sizes_ok = all(im[:-1] == [(1588, 2246)] and im[-1] == [0, 0, 595.28, 841.89] for im in d['imgs'])
        footers = all(squash(f'หน้า {i + 1} / {n}') in squash(t) for i, t in enumerate(d['texts']))
        results.append(check(f'{sid}: valid A4 PDF, {n} page(s), {len(data) // 1024} KB, {secs:.1f} s',
                             d['ok'] and d['pages'] == n and n >= 1 and sizes_ok and typ == 'application/pdf' and data.startswith(b'%PDF-1.4') and secs < 20,
                             d['qpdf'] if not d['ok'] else ('' if sizes_ok else str(d['imgs'][:2]))))
        results.append(check(f'{sid}: text layer has all {len(want)} outputs, title and page numbers',
                             not missing and squash(title) in squash(d['texts'][0]) and 'ThaiPyBlocks' in d['texts'][0] and footers and d['title'] == title,
                             f'missing {missing[:4]}' if missing else ''))
    if fonts:
        results.append(check('web fonts used for the pages (title font loaded)', page.evaluate('document.fonts.check(\'700 22px "Chakra Petch"\', "ก")')))
    # ---------- 2. very wide table: pandas-style first/last 10 columns, in groups that fit the page ----------
    run(page, 'digits')
    d = inspect(build(page)[0], 'digits_wide')
    t = squash(' '.join(d['texts']))
    results.append(check('65-column table trimmed like pandas', squash('แสดง 20 จาก 65 คอลัมน์') in t and 'pixel_0_0' in t and 'target' in t and 'pixel_3_4' not in t))
    # ---------- 3. long table: the header row repeats on the next page ----------
    long_prog = "PB.R.program([PB.R.set('df', PB.R.b('pb_dataset', { NAME: 'iris' })), PB.R.print(PB.R.b('pb_df_view', { DF: { name: 'df' }, FN: 'head', N: 60 }))])"
    run(page, program=long_prog)
    d = inspect(build(page)[0], 'long_table')
    p2 = d['texts'][1] if d['pages'] > 1 else ''
    first2 = p2.strip().split('\n')[0] if p2 else ''
    results.append(check('60-row table continues with its header row', d['pages'] >= 2 and 'sepal_length' in first2 and 'species' in first2, first2[:80]))
    # ---------- 4. an error ----------
    err_prog = "PB.R.program([PB.R.set('df', PB.R.b('pb_dataset', { NAME: 'iris' })), PB.R.print(PB.R.b('pb_series_stat', { DF: { name: 'df' }, COL: 'sepal_lenght', FN: 'mean' }))])"
    run(page, program=err_prog)
    err_title = page.evaluate("document.querySelector('#out-body .err-title').textContent")
    d = inspect(build(page)[0], 'error')
    results.append(check('error message in the PDF (Thai + KeyError)', 'KeyError' in d['texts'][0] and squash(err_title) in squash(d['texts'][0]), err_title))
    # ---------- 5. more than 255 different characters: the text layer needs a second Type 3 font ----------
    many = ''.join(chr(c) for c in range(0x0E01, 0x0E3B)) + ''.join(chr(c) for c in range(0x0E3F, 0x0E5C)) + ''.join(chr(c) for c in range(0x21, 0x7F)) \
        + ''.join(chr(c) for c in range(0x0410, 0x0450)) + ''.join(chr(c) for c in range(0x0391, 0x03AA) if c != 0x03A2) + 'éèêëàâçñöüß€£¥©®°±×÷'
    run(page, program=f"PB.R.program([PB.R.print(PB.R.b('text', {{ TEXT: {json.dumps(many)} }}))])")
    d = inspect(build(page)[0], 'many_chars')
    fonts_used = len(pypdf.PdfReader(d['file']).pages[0]['/Resources']['/Font'])
    got = squash(' '.join(d['texts']))
    lost = [c for c in squash(many) if c not in got]
    results.append(check(f'{len(set(many))} different characters copy back from the text layer', fonts_used >= 2 and not lost, f'{fonts_used} fonts, missing {lost[:10]}'))
    # ---------- 6. exercise mode: the exercise is the title ----------
    page.evaluate('PB.ui.exStart(PB.EXERCISES[0].id, { fresh: true })'); page.wait_for_timeout(300)
    page.evaluate('PB.ui.run()'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    if page.evaluate("!!document.querySelector('#out-body .cell:not(.note)')"):
        d = inspect(build(page)[0], 'exercise')
        results.append(check('exercise title on the PDF', 'แบบฝึกหัดข้อ' in d['texts'][0], d['title']))
    page.evaluate('PB.ui.exLeave({ restore: false })')
    results.append(check('no page errors (light, desktop)', not errs, str(errs[:3])))
    ctx.close()

    # ---------- 7. an older browser: no CompressionStream (JPEG pages) and no Intl.Segmenter ----------
    ctx, page, errs, _ = boot(browser, init='delete window.CompressionStream; delete Intl.Segmenter;')
    run(page, 'reviews')
    want = page.evaluate(EXPECT_JS)
    d = inspect(build(page)[0], 'reviews_old_browser')
    filt = [str(o.get_object()['/Filter']) for pg in pypdf.PdfReader(d['file']).pages for o in pg['/Resources']['/XObject'].values()]
    t = squash(' '.join(d['texts']))
    results.append(check('older browser: JPEG pages, Thai text layer intact', d['ok'] and set(filt) == {'/DCTDecode'} and all(squash(w) in t for w in want), str(set(filt))))
    results.append(check('no page errors (older browser)', not errs, str(errs[:3])))
    ctx.close()

    # ---------- 8. dark theme and a phone-width window still give the same white A4 pages ----------
    for label, kw in [('dark theme', dict(dark=True)), ('phone width', dict(w=390, hgt=844))]:
        ctx, page, errs, _ = boot(browser, **kw)
        run(page, 'eda')
        d = inspect(build(page)[0], 'eda_' + label.split()[0])
        png = os.path.join(OUT, 'probe')
        subprocess.run(['pdftoppm', '-r', '20', '-png', '-f', '1', '-l', '1', d['file'], png], check=True)
        from PIL import Image
        hist = Image.open(png + '-1.png').convert('L').histogram()
        white = sum(hist[236:]) / sum(hist)
        results.append(check(f'{label}: white pages, same page count as desktop', white > 0.75 and d['pages'] == counts['eda'], f'{white:.0%} white, {d["pages"]} vs {counts["eda"]} pages'))
        results.append(check(f'no page errors ({label})', not errs, str(errs[:3])))
        ctx.close()

    # ---------- 9. the PDF button: claude.ai downloads capability ----------
    ctx, page, errs, _ = boot(browser, mock=True)
    page.wait_for_function('!document.querySelector(\'[data-act="pdf"]\').hidden', timeout=10000)
    page.click('[data-act="pdf"]')
    page.wait_for_function('window.__saves.length > 0', timeout=60000)
    s = page.evaluate('window.__saves[0]')
    pdf = base64.b64decode(s['b64'])
    results.append(check('PDF button saves through the downloads capability', re.fullmatch(r'thaipyblocks_results_\d{8}\.pdf', s['filename']) is not None and pdf.startswith(b'%PDF'), s['filename']))
    page.click('.topbar [data-act="more"]'); page.wait_for_timeout(200)
    menu = page.inner_text('.menu')
    page.keyboard.press('Escape')
    results.append(check('More menu offers the PDF export', 'ส่งออกผลลัพธ์เป็น PDF' in menu))
    # stale blocks are run again before the PDF is made
    page.evaluate("PB.ui.ws.getTopBlocks(false)[0].moveBy(10, 10)"); page.wait_for_timeout(100)
    stale = not page.evaluate('PB.ui.lastRunVersion === PB.ui.wsVersion')
    page.evaluate('PB.ui.exportPdf()'); page.wait_for_function('window.__saves.length > 1', timeout=60000)
    results.append(check('stale blocks run again before the PDF', stale and page.evaluate('PB.ui.lastRunVersion === PB.ui.wsVersion')))
    # nothing to export: a message, no file
    page.evaluate('PB.ui.ws.clear(); PB.ui.out.clear()'); page.wait_for_timeout(200)
    page.evaluate('PB.ui.exportPdf()'); page.wait_for_timeout(1500)
    toast = page.evaluate("(document.querySelector('.toast') || {}).textContent || ''")
    results.append(check('no outputs: explained, nothing saved', page.evaluate('window.__saves.length') == 2 and 'ยังไม่มีผลลัพธ์' in toast, toast))
    results.append(check('no page errors (claude.ai runtime)', not errs, str(errs[:3])))
    ctx.close()

    # ---------- 10. plain web page (GitHub Pages): the browser downloads the file ----------
    ctx, page, errs, _ = boot(browser, downloads=True)
    results.append(check('PDF button shown on a plain web page', not page.evaluate('document.querySelector(\'[data-act="pdf"]\').hidden')))
    with page.expect_download(timeout=60000) as dl:
        page.click('[data-act="pdf"]')
    f = dl.value
    body = open(f.path(), 'rb').read()
    results.append(check('browser download of the PDF', f.suggested_filename.endswith('.pdf') and body.startswith(b'%PDF') and len(body) > 20000, f'{f.suggested_filename} {len(body) // 1024} KB'))
    results.append(check('no page errors (plain page)', not errs, str(errs[:3])))
    ctx.close()
    browser.close()

print(f'{sum(results)}/{len(results)} passed · PDFs in {OUT}')
sys.exit(0 if all(results) else 1)
