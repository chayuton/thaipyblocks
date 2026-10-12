"""Build the two printable worksheets (A4 PDF, Thai) from the solution projects in this folder:
  worksheet1_kmeans.pdf          ใบงานที่ 1 จัดกลุ่มลูกค้าด้วย K-Means
  worksheet2_neural_network.pdf  ใบงานที่ 2 ทำนายการงอกของเมล็ดด้วย Neural Network
The block picture of each part is shot from the app itself (the solution split at its comment blocks), the pages are
HTML printed by Chromium with the app's own fonts (vendor/node_modules/@fontsource), and the page footer is stamped
afterwards so it uses the same fonts. Text and tables are in ws1(), ws2() and key() below. Also writes answer_key.pdf (for the teacher) and worksheets_all.pdf (all three in one file).
Needs: python3 build.py · cd vendor && npm ci · pip install playwright pypdf pillow
  python3 worksheets/make_worksheet_pdf.py"""
import base64, html, json, os, re, sys, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'test'))
from ui_smoke import route, PAGE
FONTS = os.path.join(ROOT, 'vendor', 'node_modules', '@fontsource')
FAMILIES = {'IBM Plex Sans Thai': 'ibm-plex-sans-thai', 'IBM Plex Mono': 'ibm-plex-mono', 'Chakra Petch': 'chakra-petch'}
TMP = tempfile.mkdtemp(prefix='worksheet_pdf_')
PARTS = {}
CHARTS = {}
MM_PER_PX = 0.165         # printed size of one CSS pixel of the block pictures (Blockly scale 1)
CONTENT_MM = 178          # A4 width minus 16 mm margins

# ---------- block pictures, part by part ----------
SHOT_CSS = """.pane-side,.splitter{display:none!important}.studio{grid-template-columns:minmax(0,1fr)!important}
.canvas-tools,.inspector,.run-badge,.ex-bar{display:none!important}
.blocklyScrollbarHandle,.blocklyScrollbarBackground,.blocklyToolboxDiv,.blocklyToolbox,.blocklyFlyout{display:none!important}
.blocklyMainBackground{fill:#ffffff!important;stroke:none!important}"""

def route_fonts(page):
    """the app's Google Fonts stylesheet and font files, served from the @fontsource copies"""
    route(page)
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

def shoot_parts(page, name):
    """split the solution at its comment blocks into separate stacks, lay them out in a column, shoot each stack alone"""
    sol = json.load(open(os.path.join(HERE, f'solution_{name}.json'), encoding='utf-8'))
    page.set_viewport_size({'width': 1440, 'height': 900})
    page.evaluate('(st) => PB.ui.loadProgram(st)', sol['workspace'])
    page.wait_for_timeout(300)
    page.evaluate("""(css) => { let s = document.getElementById('shot-css'); if (!s) { s = document.createElement('style'); s.id = 'shot-css'; document.head.appendChild(s); }
        s.textContent = css; const ws = PB.ui.ws; if (Blockly.getSelected()) Blockly.getSelected().unselect(); ws.setScale(1);
        const heads = []; for (let b = ws.getTopBlocks(true)[0]; b; b = b.getNextBlock()) if (b.type === 'pb_comment') heads.push(b);
        for (let i = heads.length - 1; i >= 1; i--) heads[i].unplug(false);
        let y = 0; heads.forEach((h) => { const xy = h.getRelativeToSurfaceXY(); h.moveBy(-xy.x, y - xy.y); y += h.getHeightWidth().height + 120; });
        window.__heads = heads.map((h) => h.id); Blockly.svgResize(ws); }""", SHOT_CSS)
    w, h = page.evaluate('() => { const ws = PB.ui.ws, bb = ws.getBlocksBoundingBox(); return [Math.ceil((bb.right - bb.left) * ws.scale), Math.ceil((bb.bottom - bb.top) * ws.scale)]; }')
    page.set_viewport_size({'width': max(1200, w + 240), 'height': h + 300})
    page.wait_for_timeout(300)
    page.evaluate('() => { Blockly.svgResize(PB.ui.ws); PB.ui.ws.scrollCenter(); }')
    page.wait_for_timeout(500)
    rects = page.evaluate("""() => window.__heads.map((id) => { const r = PB.ui.ws.getBlockById(id).getSvgRoot().getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })""")
    parts = []
    for i, r in enumerate(rects):
        path = os.path.join(TMP, f'{name}_part{i + 1}.png'); pad = 6
        page.screenshot(path=path, clip={'x': r['x'] - pad, 'y': r['y'] - pad, 'width': r['w'] + 2 * pad, 'height': r['h'] + 2 * pad})
        im = Image.open(path).convert('RGB'); im.save(path, optimize=True)
        parts.append({'path': path, 'css_w': round(r['w'] + 2 * pad)})
    return parts

def shoot_all():
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=2.5).new_page(); route_fonts(page)
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_function('!PB.ui.running', timeout=60000)
        for fname in ('mall_customers.csv', 'seed_germination.csv'):   # uploaded, so the read-file blocks show no missing-file mark
            data = base64.b64encode(open(os.path.join(HERE, fname), 'rb').read()).decode()
            page.evaluate("""async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); await PB.ui.readFile(new File([bin], name)); }""", [fname, data])
        for name in ('kmeans', 'neural_network'): PARTS[name] = shoot_parts(page, name)
        page.evaluate("() => { const s = document.getElementById('shot-css'); if (s) s.remove(); }")
        page.set_viewport_size({'width': 1440, 'height': 900})
        for name in ('kmeans', 'neural_network'):   # charts for the answer key: run each solution and shoot its chart cells
            sol = json.load(open(os.path.join(HERE, f'solution_{name}.json'), encoding='utf-8'))
            page.evaluate('(st) => PB.ui.loadProgram(st, { run: true })', sol['workspace'])
            page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=300000)
            page.evaluate("() => { document.querySelector('.studio').style.setProperty('--side-w', '780px'); Blockly.svgResize(PB.ui.ws); }")
            page.wait_for_timeout(400)
            cells = page.locator('#out-body .cell.chart'); CHARTS[name] = []
            for i in range(cells.count()):
                path = os.path.join(TMP, f'{name}_chart{i}.png'); cells.nth(i).scroll_into_view_if_needed(); page.wait_for_timeout(200)
                cells.nth(i).screenshot(path=path); CHARTS[name].append(path)
        b.close()

# ---------- pages ----------
CAT = {'data': '#0E7C86', 'clean': '#4D7C0F', 'prep': '#A5561A', 'model': '#5A4CC0', 'cls': '#6D4BC3', 'clu': '#1B7D52',
       'train': '#4E5BC2', 'metric': '#B04A2F', 'viz': '#7A5C1F', 'py': '#546273', 'var': '#B0466F', 'list': '#7D4CB3', 'loop': '#3B7F45'}
e = html.escape
def path(cat, text): return f'<span class="path" style="--c:{CAT[cat]}">{e(text)}</span>'
def blk(cat, text): return f'<span class="blk{" wrap" if len(text) > 36 else ""}" style="--c:{CAT[cat]}">{e(text)}</span>'
def code(text): return f'<code>{e(text)}</code>'

def font_css():
    out = []
    for pkg, weights in (('ibm-plex-sans-thai', (400, 500, 600, 700)), ('chakra-petch', (500, 600, 700)), ('ibm-plex-mono', (400, 500))):
        for w in weights:
            css = open(os.path.join(FONTS, pkg, f'{w}.css'), encoding='utf-8').read()
            out.append(css.replace('url(./files/', f'url(file://{FONTS}/{pkg}/files/'))
    return '\n'.join(out)

CSS = r'''
@page { size: A4; margin: 13mm 16mm 16mm 16mm; }
:root { --ink: #132132; --ink-2: #3c4b5c; --ink-3: #6f7d8e; --line: #c9d2dd; --soft: #f2f5f9; --accent: #2c69b0; --accent-soft: #e6eff9; --warn: #9a5b00; --warn-soft: #fff6e5; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: var(--ink); font: 400 10.3pt/1.56 'IBM Plex Sans Thai', 'Loma', sans-serif; }
h1, h2, h3 { font-family: 'Chakra Petch', 'IBM Plex Sans Thai', sans-serif; line-height: 1.3; margin: 0; }
/* room inside the heading box for Thai marks stacked above the first line: a heading that starts a page must not paint them at the foot of the previous one */
h2, h3 { padding-top: 0.28em; }
p { margin: 0 0 2.2mm; }
code { font: 500 9.2pt/1.4 'IBM Plex Mono', 'IBM Plex Sans Thai', monospace; background: var(--soft); border: 0.6px solid #dde3ea; border-radius: 1.2mm; padding: 0 1mm; white-space: nowrap; }
.mono { font-family: 'IBM Plex Mono', 'IBM Plex Sans Thai', monospace; font-size: 9.2pt; }

/* ---------- title block ---------- */
.top { display: flex; align-items: center; justify-content: space-between; border-bottom: 2.2px solid var(--ink); padding-bottom: 2.4mm; }
.brand { font: 700 12.5pt 'Chakra Petch', sans-serif; letter-spacing: 0.2px; display: flex; align-items: center; gap: 2mm; }
.brand .mark { width: 5.2mm; height: 5.2mm; position: relative; }
.brand .mark i { position: absolute; width: 3.6mm; height: 3.6mm; border-radius: 1mm; }
.brand .mark i:first-child { left: 0; top: 0; background: #2c69b0; }
.brand .mark i:last-child { right: 0; bottom: 0; background: #f2c53d; }
.brand b { color: var(--accent); font-weight: 700; }
.ws-no { font: 700 11pt 'Chakra Petch', sans-serif; color: #fff; background: var(--ink); padding: 1.2mm 3.6mm 1mm; border-radius: 1.4mm; letter-spacing: 0.3px; }
.title { margin: 4.2mm 0 1mm; }
.title h1 { font-size: 21pt; font-weight: 700; }
.title .sub { color: var(--ink-2); font-size: 11pt; margin-top: 1mm; }
.idgrid { display: grid; grid-template-columns: 2.3fr 1.3fr; gap: 2.2mm 7mm; margin: 4mm 0 0; font-size: 10pt; }
.idgrid div { display: flex; align-items: flex-end; gap: 2mm; white-space: nowrap; }
.idgrid span.fill { flex: 1; border-bottom: 0.8px solid var(--ink-3); height: 6mm; }

/* ---------- sections ---------- */
h2 { font-size: 13.5pt; font-weight: 700; margin: 5.2mm 0 2.2mm; display: flex; align-items: center; gap: 2.4mm; break-after: avoid; }
h2 .n { display: inline-grid; place-items: center; min-width: 6.4mm; height: 6.4mm; padding: 0 1.4mm; border-radius: 1.4mm; background: var(--accent); color: #fff; font-size: 10.5pt; }
h3 { font-size: 11.6pt; font-weight: 700; margin: 0 0 1.8mm; break-after: avoid; }
h3 .tag { font: 600 9pt 'IBM Plex Sans Thai', sans-serif; color: var(--accent); margin-right: 1.6mm; }
ul, ol { margin: 0 0 2mm; padding-left: 6.2mm; }
li { margin: 0 0 1.3mm; }
li::marker { font-weight: 600; color: var(--ink-2); }
ul.sub { margin-top: 1.2mm; padding-left: 5mm; list-style: disc; }
.lead { color: var(--ink-2); }

/* ---------- chips: menu path in the app and block name ---------- */
.path { font-weight: 600; white-space: nowrap; }
.path::before { content: ''; display: inline-block; width: 2.3mm; height: 2.3mm; border-radius: 0.6mm; background: var(--c); margin: 0 1.2mm 0.25mm 0; vertical-align: middle; }
.blk { display: inline; font-weight: 500; font-size: 9.6pt; color: #111; background: color-mix(in srgb, var(--c) 13%, white); border: 0.8px solid color-mix(in srgb, var(--c) 55%, white);
  border-left: 1.6mm solid var(--c); border-radius: 1.2mm; padding: 0.15mm 1.3mm 0.15mm 1.2mm; white-space: nowrap; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.blk.wrap { white-space: normal; }
.legend { display: flex; gap: 4mm; flex-wrap: wrap; font-size: 9.2pt; color: var(--ink-2); border: 0.8px dashed var(--line); border-radius: 1.6mm; padding: 1.6mm 3mm; margin: 0 0 4mm; }
.nw { white-space: nowrap; }

/* ---------- step parts with their block picture ---------- */
.part { margin: 0 0 5mm; }
.part > h3 { display: flex; align-items: baseline; padding: 1.3mm 3mm 1.2mm; border-left: 1.3mm solid var(--accent); background: var(--soft); border-radius: 0 1.2mm 1.2mm 0; margin-bottom: 2.2mm; }
.part ol { margin-bottom: 2.2mm; break-inside: avoid; }
.part figure { margin: 1.6mm 0 0 6.2mm; break-inside: avoid; }
.part figure img { display: block; }
.part figcaption { font-size: 8.4pt; color: var(--ink-3); margin-top: 1mm; }
.note { background: var(--accent-soft); border-left: 1.2mm solid var(--accent); border-radius: 1.2mm; padding: 2mm 3mm; font-size: 9.6pt; margin: 2mm 0; break-inside: avoid; }
.note.warn { background: var(--warn-soft); border-left-color: #d08a0b; }
.codeline { break-inside: avoid; font: 500 9pt/1.5 'IBM Plex Mono', 'IBM Plex Sans Thai', monospace; background: var(--soft); border-radius: 1.2mm; padding: 1.6mm 2.6mm; margin: 1.2mm 0 1.6mm; white-space: pre-wrap; }

/* ---------- tables ---------- */
table { border-collapse: collapse; width: 100%; font-size: 9.8pt; }
th, td { border: 0.8px solid #9aa7b6; padding: 1.2mm 2mm; text-align: left; vertical-align: middle; }
th { background: #e9eef4; font-weight: 600; line-height: 1.35; }
td.c, th.c { text-align: center; }
.datatable { break-inside: avoid; } .datatable td:first-child { white-space: nowrap; }
.rec { break-inside: avoid; margin: 0 0 5.5mm; }
.rec .how { font-size: 9.6pt; color: var(--ink-2); margin: 0 0 1.8mm; }
.rec td { height: 8mm; }
.rec td.k { font-weight: 600; text-align: center; background: #f6f8fb; }
.rec td.dash { color: var(--ink-3); text-align: center; }
.small { font-size: 9pt; color: var(--ink-3); }

/* ---------- questions with writing lines ---------- */
.q { break-inside: avoid; margin: 0 0 4.2mm; padding-top: 0.45em; display: grid; grid-template-columns: 7mm 1fr; }  /* room for stacked Thai marks when a question starts a page */
.q .qn { font: 700 11pt 'Chakra Petch', sans-serif; color: var(--accent); }
.q .lines { margin-top: 1mm; }
.q .lines i { display: block; height: 7mm; border-bottom: 0.7px solid #aab5c2; }
.q .opt { font-size: 8.8pt; font-weight: 600; color: var(--warn); margin-left: 1mm; }
.submit { break-inside: avoid; border: 1px dashed var(--ink-3); border-radius: 2mm; padding: 3mm 4mm; margin-top: 3mm; }
.submit h3 { margin-bottom: 1.2mm; }
.submit ul { list-style: none; padding-left: 0; margin: 0; }
.submit li::before { content: ''; display: inline-block; width: 3.2mm; height: 3.2mm; border: 0.9px solid var(--ink-2); border-radius: 0.6mm; margin-right: 2mm; vertical-align: -0.3mm; }
.pb { break-before: page; }
.keep { break-inside: avoid; }
'''

def img(name, i, alt):
    p = PARTS[name][i - 1]
    w = min(CONTENT_MM - 10, p['css_w'] * MM_PER_PX)
    return f'<figure><img src="file://{p["path"]}" style="width:{w:.1f}mm" alt="{e(alt)}"><figcaption>บล็อกของตอนนี้เมื่อต่อเสร็จ ใช้ตรวจลำดับของตนเอง</figcaption></figure>'

def lines(n): return '<div class="lines">' + '<i></i>' * n + '</div>'

def question(no, text, n=4, optional=False):
    return f'<div class="q"><div class="qn">{no}</div><div>{text}{"<span class=opt>ข้อท้าทาย</span>" if optional else ""}{lines(n)}</div></div>'

def head(no, title, sub):
    return f'''<div class="top"><div class="brand"><span class="mark"><i></i><i></i></span><span>Thai<b>Py</b>Blocks</span></div><div class="ws-no">ใบงานที่ {no}</div></div>
<div class="title"><h1>{e(title)}</h1><div class="sub">{e(sub)}</div></div>
<div class="idgrid"><div>ชื่อ-สกุล <span class="fill"></span></div><div>รหัสนักศึกษา <span class="fill"></span></div>
<div>รายวิชา <span class="fill"></span></div><div>กลุ่มเรียน <span class="fill"></span> วันที่ <span class="fill"></span></div></div>'''

def prepare(csv, submit_note):
    return f'''<h2><span class="n">2</span>สิ่งที่ต้องเตรียม</h2>
<ol>
<li>เปิดแอป ThaiPyBlocks จากลิงก์ที่ผู้สอนให้ บนคอมพิวเตอร์หรือแท็บเล็ต (จอกว้างต่อบล็อกได้สะดวกกว่า) ลิงก์ <span style="display:inline-block;width:56mm;border-bottom:0.8px solid #6f7d8e"></span></li>
<li>ดาวน์โหลดไฟล์ {code(csv)} จากผู้สอน</li>
<li>ในแอปกด <b>ข้อมูลของฉัน</b> → <b>เลือกไฟล์</b> (หรือลากไฟล์มาวาง) แอปแสดงจำนวนแถว คอลัมน์ และ 5 แถวแรกให้ตรวจว่าอ่านไฟล์ถูก</li>
<li>กดเมนู ⋯ → <b>ล้างพื้นที่ทำงาน</b> แล้วเริ่มต่อบล็อกใหม่ แตะบล็อกเพื่อดูคำสั่ง Python และความหมายภาษาไทยด้านล่าง</li>
<li><b>ส่งงาน</b>: ใบงานนี้ที่กรอกตารางและตอบคำถามครบ พร้อมไฟล์ PDF จากปุ่ม <b>PDF</b> ในแท็บผลลัพธ์ของแอป {submit_note}</li>
</ol>
<p class="small">ไฟล์ที่อัปโหลดอยู่ในเครื่องของนักศึกษาเท่านั้น ถ้ารีโหลดหน้าต้องอัปโหลดใหม่ (บล็อกที่ต่อไว้ไม่หาย)</p>'''

LEGEND = f'''<div class="legend"><span>{path("data", "ข้อมูล › โหลด & สำรวจ")} = หมวดบล็อกในแถบซ้าย (สีเดียวกับในแอป)</span><span>{blk("data", "ตั้ง df = อ่านไฟล์ของฉัน")} = บล็อกที่ลากมาต่อ</span></div>'''

# ======================= ใบงานที่ 1: K-Means =======================
def ws1():
    K = 'kmeans'
    h = [head(1, 'จัดกลุ่มลูกค้าด้วย K-Means', 'ฝึกโมเดลด้วยข้อมูลชุดฝึก แล้วจัดกลุ่มลูกค้าใหม่ในข้อมูลชุดทดสอบ')]
    h.append(f'''<h2><span class="n">1</span>จุดประสงค์</h2>
<p class="lead">นักศึกษาต่อบล็อกใน ThaiPyBlocks เพื่อแบ่งลูกค้าเป็น <b>ชุดฝึก (train)</b> กับ <b>ชุดทดสอบ (test)</b> ให้ K-Means หากลุ่มจากชุดฝึก แล้วตรวจว่ากลุ่มที่ได้ใช้กับลูกค้าที่โมเดลไม่เคยเห็นได้ ทุกบล็อกคือคำสั่ง Python (pandas · scikit-learn) จริง ดูได้ในแท็บ "โค้ด Python"</p>
<p><b>เมื่อทำใบงานเสร็จ นักศึกษาจะ</b></p>
<ul>
<li>อธิบายได้ว่าทำไมต้องแยกชุดทดสอบไว้ก่อนฝึกโมเดล และใช้บล็อก {code("train_test_split")} ได้</li>
<li>ฝึก K-Means กับชุดฝึก แล้วจัดลูกค้าในชุดทดสอบเข้ากลุ่มที่เรียนได้</li>
<li>เลือกจำนวนกลุ่ม k ด้วยวิธี elbow และวัดคุณภาพกลุ่มด้วยค่า silhouette (−1 ถึง 1 ยิ่งใกล้ 1 กลุ่มยิ่งแยกกันชัด)</li>
</ul>''')
    h.append(prepare('mall_customers.csv', '(รันด้วยค่าตามใบงาน k = 5 ก่อนกด PDF)'))
    h.append(f'''<h2><span class="n">3</span>ข้อมูล: ลูกค้าห้างสรรพสินค้า 200 คน</h2>
<p>ไฟล์ {code("mall_customers.csv")} เป็นข้อมูลจำลองเพื่อการสอน ลูกค้าแบ่งเป็น 5 กลุ่มตามรายได้และการใช้จ่าย แต่ไฟล์ไม่มีคอลัมน์บอกกลุ่ม โมเดลต้องหาเอง กิจกรรมใช้เฉพาะ income กับ spending ซึ่งมีช่วงค่าใกล้กัน จึงไม่ต้องปรับสเกลก่อนใช้ K-Means</p>
<table class="datatable"><tr><th>คอลัมน์</th><th>ความหมาย</th><th>ค่าในไฟล์</th></tr>
<tr><td class="mono">customer_id</td><td>รหัสลูกค้า</td><td>C001–C200</td></tr>
<tr><td class="mono">gender</td><td>เพศ</td><td>หญิง 103 คน, ชาย 97 คน</td></tr>
<tr><td class="mono">age</td><td>อายุ (ปี)</td><td>18–70</td></tr>
<tr><td class="mono">income</td><td>รายได้ต่อเดือน (พันบาท)</td><td>16–108</td></tr>
<tr><td class="mono">spending</td><td>คะแนนการใช้จ่ายที่ห้างให้ ยิ่งมากยิ่งซื้อบ่อยและซื้อมาก</td><td>1–99</td></tr></table>
''')
    h.append(f'''<h2><span class="n">4</span>ขั้นตอนการต่อบล็อก</h2>
<p class="lead">กด ▶ รัน ได้ทุกเมื่อ แอปรันใหม่ตั้งแต่บล็อกแรก หลังรันครั้งแรก ช่องชื่อคอลัมน์จะมีรายการให้เลือก เปลี่ยนชื่อตัวแปรได้ที่<span class="nw">ลูกศร ▾</span> ของตัวแปร → เปลี่ยนชื่อตัวแปร…</p>{LEGEND}
<div class="part"><h3><span class="tag">ตอนที่ 1</span>โหลดและดูข้อมูล</h3><ol>
<li>{path("data", "ข้อมูล › โหลด & สำรวจ")} ลาก {blk("data", "ตั้ง df = อ่านไฟล์ของฉัน")} มาวาง กดช่อง "เลือกไฟล์…" แล้วเลือก {code("mall_customers.csv")}</li>
<li>ต่อ {blk("data", "print( ดูแถว df.head(5) )")} จากหมวดเดียวกัน</li>
<li>{path("viz", "กราฟ")} ต่อ {blk("viz", "กราฟ x–y")} เลือก scatterplot, data = df, x = income, y = spending, hue เว้นว่าง</li>
<li>กด ▶ รัน ต้องเห็นตาราง 5 แถวและกราฟจุด 200 จุด</li></ol>{img(K, 1, "บล็อกตอนที่ 1")}</div>
<div class="part"><h3><span class="tag">ตอนที่ 2</span>แบ่งชุดฝึก / ชุดทดสอบ</h3><ol>
<li>{path("prep", "เตรียมข้อมูล")} ลาก {blk("prep", "ตั้ง X = …")} มาวาง เปลี่ยนค่าทางขวาเป็น {blk("data", "df[[ ]]")} จาก {path("data", "ข้อมูล › เลือก & กรอง")} แล้วเลือก income, spending</li>
<li>{path("prep", "เตรียมข้อมูล")} ลาก {blk("prep", "ตั้ง y = df[ ]")} เลือก customer_id แล้วเปลี่ยนชื่อตัวแปร y เป็น {code("ids")}</li>
<li>{path("prep", "เตรียมข้อมูล")} ต่อ {blk("prep", "แบ่งข้อมูลฝึก / ทดสอบ")} ตั้งค่า X, ids, test_size = 0.2, random_state = 42 เลือก shuffle=True (ไม่ใช้ stratify เพราะไม่มีคลาส) และเปลี่ยนชื่อ y_train, y_test เป็น id_train, id_test</li>
<li>กด ▶ รัน ต้องเห็นข้อความ "train 160 แถว · test 40 แถว"</li></ol>{img(K, 2, "บล็อกตอนที่ 2")}
<div style="break-inside:avoid;padding-top:2.4mm"><p class="small" style="margin:0">โค้ด Python ที่ได้ (รหัสลูกค้าไม่ได้ใช้ฝึก แต่บอกว่าลูกค้าคนไหนอยู่ชุดใด)</p>
<div class="codeline">X_train, X_test, id_train, id_test = train_test_split(X, ids, test_size=0.2, random_state=42)</div></div></div>
<div class="part"><h3><span class="tag">ตอนที่ 3</span>หาจำนวนกลุ่ม k ด้วยวิธี elbow (ใช้ชุดฝึกเท่านั้น)</h3><ol>
<li>{path("py", "Python › ตัวแปร")} กด สร้างตัวแปร… ชื่อ {code("inertias")} ลาก {blk("var", "ตั้ง inertias =")} มาต่อ แล้วใส่ {blk("list", "ลิสต์ว่าง [ ]")} จาก {path("py", "Python › ลิสต์")}</li>
<li>{path("py", "Python › ลูป")} ต่อ {blk("loop", "นับ i จาก 1 ถึง 10 ทีละ 1")} แล้วเปลี่ยนชื่อ i เป็น {code("k")}</li>
<li>ในช่อง "ทำ" ของลูป ใส่ 3 บล็อกตามลำดับ
<ul class="sub"><li>{path("model", "โมเดล › จัดกลุ่ม & ลดมิติ")} {blk("clu", "ตั้ง model = KMeans(…)")} แล้วลากตัวแปร k มาวางทับเลข n_clusters</li>
<li>{path("train", "ฝึก & ทำนาย")} {blk("train", "ฝึก (ไม่มีคำตอบ) model.fit( )")} เลือก X_train</li>
<li>{path("py", "Python › แสดงผล")} {blk("py", ".append( )")} เลือก inertias ใส่ {blk("py", "round( , 1)")} แล้วใส่ {blk("train", "ค่าในโมเดล model . inertia_")} ไว้ใน round</li></ul></li>
<li>ใต้ลูป ต่อ {blk("py", "print( ผลลัพธ์: , … )")} แก้ข้อความเป็น {code("inertia ของ k = 1 ถึง 10:")} แล้วใส่ตัวแปร inertias</li>
<li>{path("viz", "กราฟ")} ต่อ {blk("viz", "กราฟจากลิสต์")} แบบ plot ใส่ inertias</li>
<li>กด ▶ รัน บันทึกค่าลงตารางที่ 1 จุดซ้ายสุดของกราฟคือ k = 1 แล้วหา "ข้อศอก" ที่เส้นเริ่มแบนราบ</li></ol>{img(K, 3, "บล็อกตอนที่ 3")}</div>
<div class="part"><h3><span class="tag">ตอนที่ 4</span>ฝึกด้วยชุดฝึก แล้วจัดกลุ่มลูกค้าใหม่ในชุดทดสอบ</h3><ol>
<li>ต่อ {blk("clu", "ตั้ง model = KMeans(…)")} อีกครั้งใต้กราฟ (นอกลูป) ใส่ n_clusters = k ที่เลือกจากข้อศอก แล้วต่อ {blk("train", "ฝึก (ไม่มีคำตอบ) model.fit(X_train)")}</li>
<li>สร้างตัวแปร {code("train_labels")} แล้วต่อ {blk("var", "ตั้ง train_labels = ค่าในโมเดล model . labels_")}</li>
<li>{path("train", "ฝึก & ทำนาย")} ต่อ {blk("train", "ตั้ง y_pred = ทำนาย model.predict(X_test)")} แล้วเปลี่ยนชื่อ y_pred เป็น {code("test_labels")}</li>
<li>{path("metric", "วัดผล")} ใส่ {blk("metric", "คุณภาพการจัดกลุ่ม silhouette_score( , )")} ลงใน {blk("py", "print( , )")} 2 บล็อก: ข้อความ {code("Silhouette ชุดฝึก:")} กับ X_train, train_labels และ {code("Silhouette ชุดทดสอบ:")} กับ X_test, test_labels</li>
<li>{path("data", "ข้อมูล › คำนวณคอลัมน์")} {blk("data", "สร้าง/แทนคอลัมน์")} เลือก X_train ชื่อคอลัมน์ cluster ใส่ train_labels แล้วต่อ {blk("data", "print( จัดกลุ่มสรุป X_train.groupby(cluster) … mean() )")} จาก {path("data", "ข้อมูล › เลือก & กรอง")} โดยเว้นช่องคอลัมน์ว่าง (= ทุกคอลัมน์ตัวเลข)</li>
<li>ต่อ {blk("data", "สร้าง/แทนคอลัมน์")} อีกบล็อก เลือก X_test ชื่อ cluster ใส่ test_labels แล้วต่อ {blk("viz", "กราฟ x–y")} data = X_test, x = income, y = spending, hue = cluster</li>
<li>{path("train", "ฝึก & ทำนาย › ใช้งานโมเดล")} ใส่ {blk("train", "ทำนายข้อมูลใหม่")} ลงใน print แก้ค่าเป็น {code('{"income": 30, "spending": 85}')}</li>
<li>กด ▶ รัน แล้วกดปุ่ม PDF เก็บผล</li></ol>
<div class="note warn"><b>ลำดับในตอนที่ 4 สำคัญ</b> ต้องทำนายและวัด silhouette ก่อนเพิ่มคอลัมน์ cluster ถ้าเพิ่มก่อน บล็อกทำนายจะแจ้งข้อผิดพลาด (ข้อมูลมี 3 คอลัมน์ แต่โมเดลฝึกมา 2 คอลัมน์) และ silhouette จะนับ cluster เป็นฟีเจอร์ด้วยจนค่าผิด</div>
{img(K, 4, "บล็อกตอนที่ 4")}</div>''')
    rows1 = ''.join(f'<tr><td class="k">{k}</td><td></td><td{" class=dash" if k == 1 else ""}>{"–" if k == 1 else ""}</td></tr>' for k in range(1, 11))
    rows2 = ''.join(f'<tr><td class="k">{k}</td><td></td><td></td></tr>' for k in (3, 4, 5, 6))
    rows3 = ''.join(f'<tr><td class="k">{c}</td><td></td><td></td><td></td></tr>' for c in range(5))
    rows4 = ''.join(f'<tr><td class="k">{ts}</td><td class="k">{rs}</td><td></td><td></td><td></td><td></td></tr>' for ts, rs in ((0.2, 42), (0.2, 7), (0.5, 42)))
    h.append(f'''<div class="keep"><h2><span class="n">5</span>ตารางบันทึกผล</h2>
<p class="lead">บันทึกทศนิยม 3 ตำแหน่ง (เช่น 0.704) ทุกครั้งที่แก้ค่าในบล็อก ต้องกด ▶ รัน ใหม่ก่อนอ่านผล ทดลองเสร็จแล้วคืนค่าเดิมก่อนทำตารางถัดไป</p>
<div class="rec"><h3>ตารางที่ 1 &nbsp;inertia ของ k = 1–10</h3><p class="how">ตอนที่ 3: คัดจากบรรทัด "inertia ของ k = 1 ถึง 10" ตามลำดับ แล้วหาว่าแต่ละ k ลดลงจากค่าก่อนหน้าเท่าไร</p>
<table><tr><th class="c" style="width:16%">k</th><th>inertia</th><th>ลดลงจาก k ก่อนหน้า</th></tr>{rows1}</table>
<p style="margin-top:2mm">ข้อศอกของกราฟอยู่ที่ k = <span style="display:inline-block;width:18mm;border-bottom:0.8px solid #6f7d8e"></span></p></div></div>
<div class="rec"><h3>ตารางที่ 2 &nbsp;จำนวนกลุ่มกับคุณภาพการจัดกลุ่ม</h3><p class="how">แก้ n_clusters ในบล็อก KMeans ที่อยู่นอกลูปเป็น 3, 4, 5, 6 ทีละค่า แล้วรัน</p>
<table><tr><th class="c" style="width:16%">k</th><th>Silhouette ชุดฝึก</th><th>Silhouette ชุดทดสอบ</th></tr>{rows2}</table></div>
<div class="rec"><h3>ตารางที่ 3 &nbsp;ตั้งชื่อกลุ่มลูกค้า (k = 5)</h3><p class="how">คัดค่าเฉลี่ยจากตาราง groupby แล้วตั้งชื่อกลุ่ม เช่น "รายได้สูง ใช้จ่ายน้อย"</p>
<table><tr><th class="c" style="width:16%">cluster</th><th style="width:20%">income เฉลี่ย <span class="nw">(พันบาท)</span></th><th style="width:20%">spending เฉลี่ย</th><th>ชื่อกลุ่ม</th></tr>{rows3}</table></div>
<div class="rec"><h3>ตารางที่ 4 &nbsp;เปลี่ยนวิธีแบ่งข้อมูล (k = 5)</h3><p class="how">แก้ test_size หรือ random_state ในบล็อกแบ่งข้อมูลตามแถว แล้วรัน</p>
<table><tr><th class="c">test_size</th><th class="c">random_state</th><th>แถว ฝึก / ทดสอบ</th><th>Silhouette ชุดฝึก</th><th>Silhouette ชุดทดสอบ</th><th>ลูกค้าใหม่ (30, 85) อยู่กลุ่ม</th></tr>{rows4}</table></div>''')
    h.append('<div class="keep"><h2><span class="n">6</span>คำถามท้ายใบงาน</h2><p class="lead">ตอบสั้น ๆ พร้อมอ้างตัวเลขจากตาราง</p>')
    h.append(question(1, 'กราฟจุดในตอนที่ 1 เห็นลูกค้ากี่กลุ่ม ตรงกับ k ที่ข้อศอกของตารางที่ 1 หรือไม่', 3) + '</div>')
    h.append(question(2, 'ทำไมต้องหา k และฝึก KMeans ด้วยชุดฝึกเท่านั้น ถ้าใช้ลูกค้าทั้ง 200 คนฝึก จะรู้ได้อย่างไรว่ากลุ่มที่ได้ใช้กับลูกค้าใหม่ได้', 4))
    h.append(question(3, 'ตารางที่ 2: ถ้าเลือก k จาก Silhouette ชุดทดสอบ จะได้ k เท่าไร ต่างจากชุดฝึกหรือไม่ ควรใช้ชุดไหนเลือก k เพราะอะไร', 4))
    h.append(question(4, 'ตารางที่ 4: เลขกลุ่มของลูกค้าใหม่เปลี่ยนไปตามการแบ่งข้อมูล แปลว่าเขาย้ายกลุ่มจริงหรือไม่ เขาเป็นลูกค้ากลุ่มไหนในตารางที่ 3 และห้างควรเสนออะไรให้เขา', 4))
    return 'ใบงานที่ 1 จัดกลุ่มลูกค้าด้วย K-Means', ''.join(h)

# ======================= ใบงานที่ 2: Neural Network =======================
def ws2():
    N = 'neural_network'
    h = [head(2, 'ทำนายการงอกของเมล็ดด้วย Neural Network', 'ฝึกโมเดลด้วยข้อมูลชุดฝึก แล้ววัดความแม่นยำกับข้อมูลชุดทดสอบ')]
    h.append(f'''<h2><span class="n">1</span>จุดประสงค์</h2>
<p class="lead">นักศึกษาต่อบล็อกใน ThaiPyBlocks เพื่อแบ่งข้อมูลเป็น <b>ชุดฝึก (train)</b> กับ <b>ชุดทดสอบ (test)</b> ฝึก Neural Network ({code("MLPClassifier")}) ด้วยชุดฝึก แล้ววัด accuracy กับชุดทดสอบที่โมเดลไม่เคยเห็น เทียบกับ {code("LogisticRegression")} ซึ่งแบ่งข้อมูลได้ด้วยเส้นตรงเท่านั้น</p>
<p><b>เมื่อทำใบงานเสร็จ นักศึกษาจะ</b></p>
<ul>
<li>แยกฟีเจอร์ X กับคำตอบ y แล้วแบ่งชุดฝึก / ชุดทดสอบโดยรักษาสัดส่วนคลาส (stratify)</li>
<li>ปรับสเกลด้วยค่าที่เรียนจากชุดฝึกเท่านั้น และบอกได้ว่าทำไม</li>
<li>อ่าน accuracy ของชุดฝึกเทียบกับชุดทดสอบ เพื่อดูว่าโมเดลเรียนน้อยไป (underfitting) หรือจำข้อมูลฝึก (overfitting)</li>
<li>บอกได้ว่าทำไม Neural Network แยกข้อมูลที่เส้นแบ่งเป็นเส้นโค้งได้ แต่โมเดลเส้นตรงทำไม่ได้</li>
</ul>''')
    h.append(prepare('seed_germination.csv', '(รันด้วยค่าตามใบงาน MLP (16,) ก่อนกด PDF)'))
    h.append(f'''<h2><span class="n">3</span>ข้อมูล: ผลการเพาะเมล็ด 400 ถาด</h2>
<p>ไฟล์ {code("seed_germination.csv")} เป็นข้อมูลจำลองเพื่อการสอน เมล็ดงอกดีเมื่ออุณหภูมิและความชื้น "พอดี" ทั้งคู่ ส่วนใหญ่อยู่ที่ราว 22–33 °C และความชื้น 44–77% จุด "งอก" จึงรวมกันเป็นวงรีกลางกราฟ เส้นตรงเส้นเดียวแบ่งไม่ได้</p>
<table class="datatable"><tr><th>คอลัมน์</th><th>ความหมาย</th><th>ค่าในไฟล์</th></tr>
<tr><td class="mono">temperature</td><td>อุณหภูมิเฉลี่ยระหว่างเพาะ (°C)</td><td>10.2–40.0</td></tr>
<tr><td class="mono">humidity</td><td>ความชื้นในดิน (%)</td><td>10–95</td></tr>
<tr><td class="mono">germinated</td><td>ผลการเพาะ = คำตอบ y</td><td>งอก, ไม่งอก</td></tr></table>''')
    h.append(f'''<h2><span class="n">4</span>ขั้นตอนการต่อบล็อก</h2>
<p class="lead">กด ▶ รัน ได้ทุกเมื่อ แอปรันใหม่ตั้งแต่บล็อกแรก หลังรันครั้งแรก ช่องชื่อคอลัมน์จะมีรายการให้เลือก</p>{LEGEND}
<div class="part"><h3><span class="tag">ตอนที่ 1</span>โหลดและดูข้อมูล</h3><ol>
<li>{path("data", "ข้อมูล › โหลด & สำรวจ")} ลาก {blk("data", "ตั้ง df = อ่านไฟล์ของฉัน")} มาวาง เลือก {code("seed_germination.csv")} แล้วต่อ {blk("data", "print( ดูแถว df.head(5) )")}</li>
<li>{path("clean", "ทำความสะอาด & ปรับสเกล › ตรวจคุณภาพข้อมูล")} ต่อ {blk("clean", "print( df[ ].value_counts() )")} เลือก germinated เพื่อนับถาดงอก / ไม่งอก</li>
<li>{path("viz", "กราฟ")} ต่อ {blk("viz", "กราฟ x–y")} scatterplot, data = df, x = temperature, y = humidity, hue = germinated</li>
<li>กด ▶ รัน แล้วดูว่าจุด "งอก" อยู่ตรงไหนของกราฟ</li></ol>{img(N, 1, "บล็อกตอนที่ 1")}</div>
<div class="part"><h3><span class="tag">ตอนที่ 2</span>แยก X, y และแบ่งชุดฝึก / ชุดทดสอบ</h3><ol>
<li>{path("prep", "เตรียมข้อมูล")} ลาก {blk("prep", "ตั้ง X = ลบคอลัมน์ df.drop(columns=[ ])")} เลือก germinated (เหลือ temperature, humidity)</li>
<li>{path("prep", "เตรียมข้อมูล")} ลาก {blk("prep", "ตั้ง y = df[ ]")} เลือก germinated</li>
<li>{path("prep", "เตรียมข้อมูล")} ต่อ {blk("prep", "แบ่งข้อมูลฝึก / ทดสอบ")} test_size = 0.25, random_state = 42 เลือก stratify=y เพื่อให้สัดส่วนงอก / ไม่งอกเท่ากันทั้งสองชุด</li>
<li>กด ▶ รัน ต้องเห็นข้อความ "train 300 แถว · test 100 แถว"</li></ol>{img(N, 2, "บล็อกตอนที่ 2")}</div>
<div class="part"><h3><span class="tag">ตอนที่ 3</span>ปรับสเกลด้วยค่าจากชุดฝึกเท่านั้น</h3><ol>
<li>{path("prep", "เตรียมข้อมูล")} ต่อ 3 บล็อกเรียงกัน: {blk("prep", "ตั้ง scaler = StandardScaler()")} → {blk("prep", "ตั้ง X_train = scaler.fit_transform(X_train)")} → {blk("prep", "ตั้ง X_test = scaler.transform(X_test)")}</li></ol>
<div class="note">fit_transform เรียนค่าเฉลี่ยและส่วนเบี่ยงเบนมาตรฐานจากชุดฝึกแล้วแปลง ส่วน transform ใช้ค่าเดิมนั้นแปลงชุดทดสอบ ห้าม fit กับชุดทดสอบ เพราะเท่ากับให้โมเดลแอบดูข้อสอบ</div>{img(N, 3, "บล็อกตอนที่ 3")}</div>
<div class="part"><h3><span class="tag">ตอนที่ 4</span>โมเดลเส้นตรงไว้เปรียบเทียบ</h3><ol>
<li>{path("model", "โมเดล › จำแนกประเภท")} ต่อ {blk("cls", "ตั้ง model = LogisticRegression(C=1, max_iter=1000)")}</li>
<li>{path("train", "ฝึก & ทำนาย")} ต่อ {blk("train", "ฝึกโมเดล model.fit(X_train, y_train)")}</li>
<li>ใส่ {blk("train", "คะแนน model.score( , )")} ลงใน {blk("py", "print( , )")} 2 บล็อก: {code("LogisticRegression ชุดฝึก:")} กับ X_train, y_train และ {code("LogisticRegression ชุดทดสอบ:")} กับ X_test, y_test</li></ol>{img(N, 4, "บล็อกตอนที่ 4")}</div>
<div class="part"><h3><span class="tag">ตอนที่ 5</span>Neural Network</h3><ol>
<li>{path("model", "โมเดล › จำแนกประเภท")} ต่อ {blk("cls", "ตั้ง model = MLPClassifier(…)")} แก้ hidden_layer_sizes เป็น {code("(16,)")} (ชั้นซ่อน 1 ชั้น 16 นิวรอน) และ max_iter เป็น 1000</li>
<li>ต่อ {blk("train", "ฝึกโมเดล model.fit(X_train, y_train)")} และ print คะแนน 2 บล็อกแบบตอนที่ 4 ใช้ข้อความ {code("MLP ชุดฝึก:")} กับ {code("MLP ชุดทดสอบ:")} (คลิกขวาที่บล็อก → ทำซ้ำบล็อก แล้วแก้ข้อความได้)</li>
<li>{path("train", "ฝึก & ทำนาย")} ต่อ {blk("train", "ตั้ง y_pred = ทำนาย model.predict(X_test)")}</li>
<li>{path("viz", "กราฟ")} ต่อ {blk("viz", "ตารางความสับสน")} (y_test, y_pred) และ {path("metric", "วัดผล")} ต่อ {blk("metric", "print( รายงานผลจำแนก classification_report(y_test, y_pred) )")}</li>
<li>กด ▶ รัน (MLP ใช้เวลาฝึกไม่กี่วินาที) แล้วกดปุ่ม PDF เก็บผล</li></ol>
<div class="note">ตารางความสับสน: แถว = คำตอบจริง คอลัมน์ = สิ่งที่โมเดลทาย ช่องแนวทแยงคือทายถูก</div>{img(N, 5, "บล็อกตอนที่ 5")}</div>''')
    models = [('LogisticRegression', '–', '1000'), ('MLP', '(2,)', '1000'), ('MLP', '(8,)', '1000'), ('MLP', '(16,)', '1000'), ('MLP', '(100,)', '1000'),
              ('MLP', '(16, 16)', '1000'), ('MLP', '(16,)', '300'), ('MLP ไม่ปรับสเกล', '(16,)', '1000')]
    rows = ''.join(f'<tr><td style="white-space:nowrap">{m}</td><td class="c mono">{hl}</td><td class="c">{it}</td><td></td><td></td><td></td><td></td></tr>' for m, hl, it in models)
    h.append(f'''<div class="keep"><h2><span class="n">5</span>ตารางบันทึกผล</h2>
<p class="lead">บันทึกทศนิยม 3 ตำแหน่ง ทุกครั้งที่แก้ค่าในบล็อก ต้องกด ▶ รัน ใหม่ก่อนอ่านผล ทดลองเสร็จแล้วคืนค่าเดิม</p>
<div class="rec"><h3>ตารางที่ 1 &nbsp;จำนวนถาดงอก / ไม่งอก</h3><p class="how">แถวแรกจาก value_counts · แถวที่สองจากคอลัมน์ support ของ classification_report</p>
<table><tr><th style="width:34%"></th><th class="c">งอก</th><th class="c">ไม่งอก</th><th class="c">รวม</th><th class="c">สัดส่วนงอก</th></tr>
<tr><td>ทั้งไฟล์</td><td></td><td></td><td class="c">400</td><td></td></tr>
<tr><td>ชุดทดสอบ</td><td></td><td></td><td class="c">100</td><td></td></tr></table></div></div>
<div class="rec"><h3>ตารางที่ 2 &nbsp;เปรียบเทียบโมเดลทำนายการงอก</h3><p class="how">แก้ค่าในบล็อก MLPClassifier ทีละแถว แล้วรัน (แถว LogisticRegression ได้จากทุกการรัน) แถวสุดท้าย: คลิกขวาที่ 3 บล็อกปรับสเกล → ปิดการทำงานบล็อก</p>
<table><tr><th>โมเดล</th><th class="c">hidden_layer_sizes</th><th class="c">max_iter</th><th>Accuracy ชุดฝึก</th><th>Accuracy ชุดทดสอบ</th><th>ฝึก − ทดสอบ</th><th>มีคำเตือนไหม</th></tr>{rows}</table></div>''')
    h.append('<div class="keep"><h2><span class="n">6</span>คำถามท้ายใบงาน</h2><p class="lead">ตอบสั้น ๆ พร้อมอ้างตัวเลขจากตาราง</p>')
    h.append(question(1, 'ถ้าทายว่า "ไม่งอก" ทุกถาด จะได้ accuracy บนชุดทดสอบเท่าไร (ใช้ตารางที่ 1) LogisticRegression ทำได้ดีกว่านี้หรือไม่ เพราะอะไร (ดูรูปร่างของจุดในกราฟ)', 4) + '</div>')
    h.append(question(2, 'MLP (2,) ได้ accuracy เท่ากับคำตอบข้อ 1 พอดี ดูแถว งอก ใน classification_report แล้วอธิบายว่าโมเดลทำอะไรอยู่'))
    h.append(question(3, 'ตารางที่ 2: แบบไหนได้ accuracy ชุดทดสอบสูงสุด เป็นแบบเดียวกับที่ชุดฝึกสูงสุดหรือไม่ ค่า ฝึก − ทดสอบ ที่กว้างขึ้นบอกอะไร', 4))
    h.append(question(4, 'คำเตือนที่ max_iter = 300 หมายความว่าอะไร แก้อย่างไร', 3))
    h.append(question(5, 'ทำไมต้อง fit ตัวปรับสเกลกับชุดฝึก แล้วแค่ transform ชุดทดสอบ แถว "ไม่ปรับสเกล" บอกอะไรเกี่ยวกับ Neural Network', 4))
    h.append(question(6, 'ถ้าจะทำนายถาดใหม่ 27 °C ความชื้น 60% ด้วยโมเดลนี้ ต้องทำอะไรกับค่าก่อนส่งให้โมเดล', 3, optional=True))
    return 'ใบงานที่ 2 ทำนายการงอกของเมล็ดด้วย Neural Network', ''.join(h)


# ======================= เฉลยสำหรับผู้สอน =======================
def chart(name, i, w, cap):
    return f'<figure style="margin:2mm 0 4mm;break-inside:avoid"><img src="file://{CHARTS[name][i]}" style="width:{w}mm"><figcaption>{e(cap)}</figcaption></figure>'

def table(head, rows):
    th = ''.join(f'<th>{x}</th>' for x in head)
    return '<table style="margin-bottom:3mm;break-inside:avoid"><tr>' + th + '</tr>' + ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows) + '</table>'

def key():
    h = ["""<div class="top"><div class="brand"><span class="mark"><i></i><i></i></span><span>Thai<b>Py</b>Blocks</span></div><div class="ws-no">เฉลย</div></div>
<div class="title"><h1>เฉลยใบงานที่ 1 และ 2 สำหรับผู้สอน</h1><div class="sub">ผลที่ควรได้ ตารางบันทึกผล และแนวคำตอบ (ไม่แจกนักศึกษา)</div></div>
<p class="lead" style="margin-top:3mm">ตัวเลขทุกค่าได้จากการรันเฉลยใน ThaiPyBlocks และตรงกับโค้ด Python ที่แอปสร้างเมื่อรันด้วย pandas 3.0 และ scikit-learn 1.8 (รุ่นอื่นอาจต่างที่ทศนิยมตำแหน่งท้าย ๆ แต่ข้อสรุปเหมือนเดิม) เปิดเฉลยบล็อกได้ที่เมนู ⋯ → เปิดโครงงาน → <code>solution_kmeans.json</code> / <code>solution_neural_network.json</code> แล้วอัปโหลด CSV และกด ▶ รัน</p>"""]
    inertia = [226726.5, 145867.4, 127108.7, 49493.0, 17688.4, 15921.9, 15089.3, 12249.1, 11332.2, 9802.4]
    rows1 = [[f'<b>{k}</b>', f'{v:,.1f}', '–' if k == 1 else f'{inertia[k - 2] - v:,.1f}'] for k, v in enumerate(inertia, 1)]
    h.append('<h2><span class="n">1</span>ใบงานที่ 1 K-Means (test_size 0.2, random_state 42)</h2>')
    h.append('<div class="keep"><h3>ตารางที่ 1 inertia ของ k = 1–10</h3>' + table(['k', 'inertia', 'ลดลงจาก k ก่อนหน้า'], rows1) +
             '<p>ข้อศอกอยู่ที่ <b>k = 5</b>: จาก k = 4 ลดลง 31,804.6 แต่ถัดไปลดลงแค่ 1,766.5</p></div>')
    h.append(chart('kmeans', 1, 140, 'กราฟ elbow ที่ควรได้ (จุดที่ 4 นับจาก 0 คือ k = 5)'))
    h.append('<div class="keep"><h3>ตารางที่ 2 จำนวนกลุ่มกับคุณภาพการจัดกลุ่ม</h3>' + table(['k', 'Silhouette ชุดฝึก', 'Silhouette ชุดทดสอบ'],
             [['<b>3</b>', '0.399', '0.509'], ['<b>4</b>', '0.593', '0.677'], ['<b>5</b>', '<b>0.704</b>', '0.651'], ['<b>6</b>', '0.626', '0.557']]) +
             '<p>k = 5 ดีที่สุดบนชุดฝึก แต่ชุดทดสอบให้ k = 4 สูงกว่า เพราะชุดทดสอบมีลูกค้ากลุ่มรายได้น้อย ใช้จ่ายสูงเพียง 2 คน (k = 4 รวมกลุ่มนี้เข้ากับกลุ่มกลาง) ค่าจากลูกค้า 40 คนจึงแกว่งง่าย ใช้ประกอบคำถามข้อ 3</p></div>')
    h.append('<div class="keep"><h3>ตารางที่ 3 ตั้งชื่อกลุ่มลูกค้า (k = 5)</h3>' + table(['cluster', 'income เฉลี่ย (พันบาท)', 'spending เฉลี่ย', 'ชื่อกลุ่ม (ตัวอย่าง)'],
             [['<b>0</b>', '55.2', '50.2', 'รายได้กลาง ใช้จ่ายกลาง'], ['<b>1</b>', '87.9', '82.9', 'รายได้สูง ใช้จ่ายสูง'], ['<b>2</b>', '23.1', '19.3', 'รายได้น้อย ใช้จ่ายน้อย'],
              ['<b>3</b>', '88.3', '16.2', 'รายได้สูง ใช้จ่ายน้อย'], ['<b>4</b>', '24.2', '84.2', 'รายได้น้อย ใช้จ่ายสูง']]) + '</div>')
    h.append('<div class="keep"><h3>ตารางที่ 4 เปลี่ยนวิธีแบ่งข้อมูล (k = 5)</h3>' + table(['test_size', 'random_state', 'แถว ฝึก / ทดสอบ', 'Silhouette ชุดฝึก', 'Silhouette ชุดทดสอบ', 'ลูกค้าใหม่ (30, 85)'],
             [['0.2', '42', '160 / 40', '0.704', '0.651', 'กลุ่ม 4'], ['0.2', '7', '160 / 40', '0.706', '0.658', 'กลุ่ม 2'], ['0.5', '42', '100 / 100', '0.712', '0.682', 'กลุ่ม 4']]) +
             '<p>ทั้งสามแถวคือกลุ่ม "รายได้น้อย ใช้จ่ายสูง" เลขกลุ่มเป็นแค่ป้ายที่ K-Means ตั้งใหม่ทุกครั้งที่ฝึก</p></div>')
    h.append(chart('kmeans', 2, 140, 'ลูกค้าในชุดทดสอบ 40 คน แยกสีตามกลุ่มที่โมเดล k = 5 จัดให้'))
    h.append('<div class="keep"><h3>แนวคำตอบใบงานที่ 1</h3><ol>'
             '<li>เห็น 5 กลุ่ม (สี่มุมกับตรงกลาง) ตรงกับข้อศอก k = 5</li>'
             '<li>ชุดทดสอบคือลูกค้าที่โมเดลไม่เคยเห็น Silhouette ชุดทดสอบ 0.651 ใกล้ชุดฝึก 0.704 จึงบอกได้ว่ากลุ่มใช้กับลูกค้าใหม่ได้ ถ้าใช้ทั้ง 200 คนฝึกจะไม่มีข้อมูลเหลือไว้ตรวจ</li>'
             '<li>ชุดทดสอบให้ k = 4 แต่ต้องเลือก k จากชุดฝึก (k = 5) การเลือกด้วยชุดทดสอบคือเอาข้อสอบมาใช้ตอนฝึก คะแนนทดสอบจะดีเกินจริง และลูกค้า 40 คนน้อยเกินกว่าจะใช้ตัดสินเอง</li>'
             '<li>ไม่ได้ย้าย เลขกลุ่มเปลี่ยนเพราะฝึกใหม่ด้วยชุดฝึกคนละชุด ค่าเฉลี่ยของกลุ่มบอกว่าเขาอยู่กลุ่ม "รายได้น้อย ใช้จ่ายสูง" ทุกครั้ง เหมาะกับโปรโมชันผ่อน 0% หรือคูปองส่วนลด</li></ol></div>')
    models = [('LogisticRegression', '–', '1000', '0.450', '0.460', '−0.010', 'ไม่มี'), ('MLP', '(2,)', '1000', '0.590', '0.590', '0.000', 'ไม่มี*'),
              ('MLP', '(8,)', '1000', '0.947', '0.910', '0.037', 'ConvergenceWarning'), ('MLP', '<b>(16,)</b>', '1000', '0.963', '<b>0.940</b>', '0.023', 'ไม่มี'),
              ('MLP', '(100,)', '1000', '0.970', '0.920', '0.050', 'ไม่มี'), ('MLP', '(16, 16)', '1000', '0.977', '0.920', '0.057', 'ไม่มี'),
              ('MLP', '(16,)', '300', '0.913', '0.880', '0.033', 'ConvergenceWarning'), ('MLP ไม่ปรับสเกล', '(16,)', '1000', '0.747', '0.780', '−0.033', 'ไม่มี')]
    h.append('<h2 class="pb"><span class="n">2</span>ใบงานที่ 2 Neural Network (test_size 0.25 แบบ stratify, random_state 42)</h2>')
    h.append('<div class="keep"><h3>ตารางที่ 1 จำนวนถาดงอก / ไม่งอก</h3>' + table(['', 'งอก', 'ไม่งอก', 'รวม', 'สัดส่วนงอก'],
             [['ทั้งไฟล์', '164', '236', '400', '0.41'], ['ชุดทดสอบ', '41', '59', '100', '0.41']]) +
             '<p>stratify ทำให้สัดส่วนงอกเท่ากันทั้งสองชุด การทาย "ไม่งอก" ทุกถาดได้ accuracy 0.59 บนชุดทดสอบ</p></div>')
    h.append('<div class="keep"><h3>ตารางที่ 2 เปรียบเทียบโมเดล</h3>' + table(['โมเดล', 'hidden_layer_sizes', 'max_iter', 'ชุดฝึก', 'ชุดทดสอบ', 'ฝึก − ทดสอบ', 'คำเตือน'], [list(m) for m in models]) +
             '<p class="small">* ใน Colab จะมี UndefinedMetricWarning จาก classification_report เพราะไม่มีถาดใดถูกทายว่างอก</p></div>')
    h.append('<p>ตารางความสับสนของ MLP (16,): งอก→งอก 37, งอก→ไม่งอก 4, ไม่งอก→งอก 2, ไม่งอก→ไม่งอก 57 · แถว งอก ใน classification_report: precision 0.95 recall 0.90 f1 0.93</p>')
    h.append(chart('neural_network', 1, 140, 'ตารางความสับสนที่ควรได้ (MLP 16 นิวรอน)'))
    h.append('<div class="keep"><h3>แนวคำตอบใบงานที่ 2</h3><ol>'
             '<li>ได้ 0.59 LogisticRegression ได้ 0.46 แย่กว่าการทายแบบนั้น เพราะถาดงอกรวมเป็นวงรีกลางกราฟและถูกล้อมด้วยถาดไม่งอก เส้นตรงเส้นเดียวแบ่งไม่ได้</li>'
             '<li>โมเดลทาย "ไม่งอก" ทุกถาด แถว งอก มี precision และ recall เป็น 0.00 นิวรอน 2 ตัวน้อยเกินจะสร้างเส้นแบ่งโค้ง (underfitting)</li>'
             '<li>(16,) ได้ชุดทดสอบสูงสุด 0.94 ส่วน (16, 16) ได้ชุดฝึกสูงสุด 0.977 แต่ชุดทดสอบเหลือ 0.92 ส่วนต่างที่กว้างขึ้น (0.023 → 0.057) คือสัญญาณว่าโมเดลเริ่มจำข้อมูลฝึก (overfitting)</li>'
             '<li>ฝึกครบ 300 รอบแล้วค่า loss ยังลดไม่สุด (ยังไม่ลู่เข้า) accuracy จึงต่ำกว่า (0.913 / 0.880) แก้โดยเพิ่ม max_iter เป็น 1000</li>'
             '<li>ค่าเฉลี่ยและส่วนเบี่ยงเบนมาตรฐานต้องมาจากชุดฝึกเท่านั้น ไม่เช่นนั้นข้อมูลทดสอบรั่วเข้าการฝึก เมื่อไม่ปรับสเกล accuracy ตกเหลือ 0.747 / 0.780 เพราะ Neural Network ไวต่อขนาดตัวเลขของแต่ละคอลัมน์</li>'
             '<li>แปลงค่าใหม่ด้วย scaler.transform ตัวเดิมก่อนทำนาย หรือใช้บล็อก "ไปป์ไลน์" รวม StandardScaler กับ MLPClassifier ให้ปรับสเกลอัตโนมัติ</li></ol></div>')
    return 'เฉลยใบงานที่ 1 และ 2 สำหรับผู้สอน', ''.join(h)

def page(title, body):
    return f'<!doctype html><html lang="th"><head><meta charset="utf-8"><title>{e(title)}</title><style>{font_css()}{CSS}</style></head><body>{body}</body></html>'

def stamp(pg, body_pdf, out_pdf, title):
    from pypdf import PdfReader, PdfWriter
    body = PdfReader(body_pdf); n = len(body.pages)
    pages = ''.join(f'<div class="pg"{" style=\'break-after:page\'" if i < n else ""}><div class="ft"><span>ThaiPyBlocks · {e(title)}</span><span>หน้า {i} / {n}</span></div></div>' for i in range(1, n + 1))
    doc = (f'<!doctype html><html lang="th"><head><meta charset="utf-8"><style>{font_css()}@page{{size:A4;margin:0}}body{{margin:0}}'
           '.pg{position:relative;height:296.5mm;overflow:hidden}.ft{position:absolute;left:16mm;right:16mm;bottom:7.6mm;display:flex;justify-content:space-between;'
           "font:400 7.6pt 'IBM Plex Sans Thai',sans-serif;color:#6f7d8e;border-top:0.6px solid #c9d2dd;padding-top:1.4mm}</style></head><body>" + pages + '</body></html>')
    src = os.path.join(TMP, 'footer.html'); open(src, 'w', encoding='utf-8').write(doc)
    pg.goto('file://' + src); pg.evaluate('document.fonts.ready.then(() => true)')
    foot_pdf = os.path.join(TMP, 'footer.pdf'); pg.pdf(path=foot_pdf, format='A4', print_background=True, prefer_css_page_size=True)
    feet = PdfReader(foot_pdf)
    assert len(feet.pages) == n, (len(feet.pages), n)
    w = PdfWriter()
    for page, foot in zip(body.pages, feet.pages):
        page.merge_page(foot); w.add_page(page)
    w.add_metadata({'/Title': title, '/Author': 'ThaiPyBlocks', '/Subject': 'ใบงาน ThaiPyBlocks: ข้อมูลฝึกและข้อมูลทดสอบ'})
    with open(out_pdf, 'wb') as f: w.write(f)


def main():
    shoot_all()
    jobs = [('worksheet1_kmeans.pdf', *ws1()), ('worksheet2_neural_network.pdf', *ws2()), ('answer_key.pdf', *key())]
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        for fname, title, body_html in jobs:
            src = os.path.join(TMP, fname.replace('.pdf', '.html'))
            open(src, 'w', encoding='utf-8').write(page(title, body_html))
            pg.goto('file://' + src); pg.wait_for_load_state('load'); pg.evaluate('document.fonts.ready.then(() => true)')
            missing = pg.evaluate("() => Array.from(document.images).filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src)")
            if missing: raise SystemExit(f'missing pictures: {missing}')
            body_pdf = os.path.join(TMP, 'body.pdf')
            pg.pdf(path=body_pdf, format='A4', print_background=True, prefer_css_page_size=True)
            stamp(pg, body_pdf, os.path.join(HERE, fname), title)
            print('wrote', os.path.join('worksheets', fname))
        b.close()
    from pypdf import PdfWriter   # all three in one file, each keeps its own page numbers
    w = PdfWriter()
    for fname, title, _ in jobs: w.append(os.path.join(HERE, fname), outline_item=title)
    w.add_metadata({'/Title': 'ใบงาน ThaiPyBlocks: K-Means และ Neural Network พร้อมเฉลย', '/Author': 'ThaiPyBlocks'})
    with open(os.path.join(HERE, 'worksheets_all.pdf'), 'wb') as f: w.write(f)
    print('wrote', os.path.join('worksheets', 'worksheets_all.pdf'))

if __name__ == '__main__':
    main()
