"""Screenshots of key views for a visual review.
The README picture: python3 test/shots.py docs readme  ->  docs/screenshot.png
The start screen (light / dark / phone / English): python3 test/shots.py <folder> start"""
import base64, os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/shots'
WHICH = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)
FILES = os.path.join(ROOT, 'test', 'files')

def boot(p, w, h, dark=False, hash=''):
    """the app as it opens: the start screen on a blank workspace"""
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme='dark' if dark else 'light', device_scale_factor=1 if w > 600 else 2)
    page = ctx.new_page(); route(page)
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.goto(PAGE + hash); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_function('!PB.ui.running', timeout=60000)
    page.wait_for_timeout(400)
    return b, page

def load(page, sid):
    page.evaluate(f'PB.ui.loadProgram(PB.SAMPLES.find(s => s.id === {json.dumps(sid)}).build(), {{run: true}})')
    page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=120000); page.wait_for_timeout(300)

def upload(page, fname):
    data = base64.b64encode(open(os.path.join(FILES, fname), 'rb').read()).decode()
    page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); await PB.ui.readFile(new File([bin], name)); }''', [fname, data])

def want(k): return WHICH is None or k in WHICH

with sync_playwright() as p:
    if want('start'):
        for name, w, h, dark, hash in [('s1_start', 1360, 860, False, ''), ('s2_start_dark', 1360, 860, True, ''), ('s3_start_laptop', 1024, 700, False, ''),
                                       ('s4_start_en', 1360, 860, False, '#lang=en'), ('s5_start_phone', 390, 844, False, '')]:
            b, page = boot(p, w, h, dark, hash)
            page.screenshot(path=f'{OUT}/{name}.png')
            b.close()
    if want('desk'):
        b, page = boot(p, 1360, 860)
        load(page, 'iris')
        page.screenshot(path=f'{OUT}/d1_iris_out.png')
        page.evaluate('PB.ui.setPanel("code")'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d2_code.png')
        page.evaluate('PB.ui.setPanel("translate")'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d3_translate.png')
        page.click('[data-tr-mode="flow"]'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d3b_flow.png')
        page.evaluate('PB.ui.setPanel("out")')
        # step mode highlight
        page.click('[data-act="step"]'); page.wait_for_timeout(1600)
        page.screenshot(path=f'{OUT}/d7_step.png')
        page.click('[data-act="stop"]'); page.wait_for_timeout(400)
        # error display
        page.evaluate('''() => { const R = PB.R; PB.ui.loadProgram(R.program([R.set('df', R.b('pb_dataset', { NAME: 'iris' })), R.print(R.b('pb_series_stat', { DF: { name: 'df' }, COL: 'sepal_lenght', FN: 'mean' }))]), { run: true }); }''')
        page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d8_error.png')
        # uploaded file: data dialog + wizard role editor
        upload(page, 'customers.csv')
        page.evaluate('PB.ui.openData()'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d9_data.png')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        page.evaluate('PB.ui.openWizard({ file: "customers.csv" })'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d10_wizard_file.png')
        page.evaluate("document.querySelector('.modal .modal-body, .modal [class*=body]') && (document.querySelector('.modal .modal-body, .modal [class*=body]').scrollTop = 99999)"); page.wait_for_timeout(200)
        page.screenshot(path=f'{OUT}/d11_wizard_file2.png')
        page.click('.modal button:has-text("สร้างบล็อกและรัน")'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/d12_customers.png')
        b.close()
    if want('phone'):
        b, page = boot(p, 390, 844)
        load(page, 'iris')
        page.evaluate('PB.ui.setView("blocks")'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/m1_blocks.png')
        page.evaluate('PB.ui.setView("out")'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/m2_out.png')
        page.evaluate('PB.ui.openWizard()'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/m3_wizard.png')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        page.evaluate('PB.ui.setView("translate")'); page.wait_for_timeout(300)
        page.screenshot(path=f'{OUT}/m4_translate.png')
        b.close()
    if want('dark'):
        b, page = boot(p, 1360, 860, dark=True)
        load(page, 'titanic')
        page.evaluate("document.querySelector('#out-body').closest('.panel').scrollTop = 99999"); page.wait_for_timeout(200)
        page.screenshot(path=f'{OUT}/d6_dark_titanic.png')
        page.click('[data-act="step"]'); page.wait_for_timeout(1600)
        page.screenshot(path=f'{OUT}/d13_dark_step.png')
        page.click('[data-act="stop"]'); page.wait_for_timeout(300)
        b.close()
    if want('readme'):
        # docs/screenshot.png for the GitHub README: the data-cleansing sample, blocks on the left and results on the right
        b, page = boot(p, 1360, 860)
        load(page, 'clean')
        page.screenshot(path=f'{OUT}/screenshot.png')
        b.close()
print('ok')
