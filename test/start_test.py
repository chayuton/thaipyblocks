"""The start screen (src/ui/start.js): opening the app shows a blank workspace with the ways to begin — a new
program, data, sample projects, exercises — and "continue" for the work saved in this browser. Checks every
choice through real clicks, that a reload or a language switch brings back the open work while a new tab starts
blank again, that opening the app never overwrites the saved work, the phone layout, the English screen and the
contrast of the block-shaped buttons in both themes.

  python3 build.py && python3 test/start_test.py        prints one line per check, then "N/M passed" """
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE
from playwright.sync_api import sync_playwright

THAI = re.compile(r'[฀-๿]')
ok_all = []
def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''), flush=True)
    ok_all.append(bool(cond)); return cond

errs = []
def open_tab(ctx, url=PAGE):
    """a new tab of the same browser profile: localStorage is shared, sessionStorage starts empty"""
    page = ctx.new_page(); route(page)
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(url); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000)
    page.wait_for_timeout(400); page.wait_for_function('!PB.ui.running', timeout=60000)
    return page

def settle(page, ms=300):
    page.wait_for_timeout(ms); page.wait_for_function('!PB.ui.running', timeout=120000); page.wait_for_timeout(150)

STATE = '''() => { const s = document.querySelector('#start'), r = s && !s.hidden ? s.getBoundingClientRect() : null;
  return { shown: !!s && !s.hidden, away: !!s && s.classList.contains('is-away'), blocks: PB.ui.ws.getTopBlocks(false).length, all: PB.ui.ws.getAllBlocks(false).filter((b) => !b.isShadow()).length,
    cells: document.querySelectorAll('#out-body .cell').length, err: PB.ui.lastError ? PB.ui.lastError.message : null,
    choices: Array.from(document.querySelectorAll('#start [data-start]')).map((b) => b.dataset.start),
    resume: Array.from(document.querySelectorAll('#start .sb-resume')).map((b) => b.innerText.replace(/\\s+/g, ' ').trim()),
    left: r ? Math.round(r.left) : null, ex: PB.ui.ex.active, status: document.querySelector('#run-status').innerText.trim(),
    tools: getComputedStyle(document.querySelector('.canvas-tools')).display }; }'''
# the number of blocks in the saved work (localStorage), shadows left out like getAllBlocks(false).filter(!isShadow)
DRAFT = '''() => { const d = JSON.parse(localStorage.getItem("pyblocks.draft.v2") || "null"); let n = 0;
  const walk = (b) => { if (!b) return; n++; Object.values(b.inputs || {}).forEach((i) => walk(i.block)); if (b.next) walk(b.next.block); };
  ((d && d.state && d.state.blocks && d.state.blocks.blocks) || []).forEach(walk); return n; }'''
# contrast of every start block's text against its fill (WCAG relative luminance)
CONTRAST = '''() => { const lum = (c) => { const m = c.match(/[\\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
  return Array.from(document.querySelectorAll('#start .sb')).map((b) => { const bg = getComputedStyle(b).backgroundColor, fg = getComputedStyle(b.querySelector('.sb-desc') || b).color;
    const [a, c] = [lum(bg), lum(fg)].sort((x, y) => y - x); return [b.dataset.start, Math.round((a + 0.05) / (c + 0.05) * 100) / 100]; }); }'''

with sync_playwright() as p:
    browser = p.chromium.launch()
    # ---------- 1. a fresh browser: blank workspace, the four ways in ----------
    ctx = browser.new_context(viewport={'width': 1360, 'height': 860})
    page = open_tab(ctx)
    s = page.evaluate(STATE)
    check('opens on the start screen with a blank workspace and nothing run', s['shown'] and s['blocks'] == 0 and s['cells'] == 0 and s['status'] == 'พร้อมรัน', str(s))
    check('four ways in: new program, data, sample projects, exercises (no "continue" without saved work)', s['choices'] == ['new', 'data', 'samples', 'exercises'] and not s['resume'], str(s['choices']))
    tb = page.evaluate('PB.ui.ws.getToolbox().getWidth()')
    check('computer: the screen sits right of the palette, canvas buttons hidden', s['left'] is not None and s['left'] >= tb and s['tools'] == 'none', f"left {s['left']} · palette {tb} · tools {s['tools']}")
    tools = page.evaluate('Array.from(document.querySelectorAll("#start .start-tools button")).map((b) => b.innerText.trim())')
    check('helpers on the start screen: model wizard, cleaning assistant, open project', tools == ['ตัวช่วยเลือกโมเดล', 'ทำความสะอาดข้อมูล', 'เปิดโครงงาน'], str(tools))
    low = [x for x in page.evaluate(CONTRAST) if x[1] < 4.5]
    check('block text contrast at least 4.5:1 (light theme)', not low, str(page.evaluate(CONTRAST)))
    # a palette category opened from the start screen: the screen steps aside, and comes back when it closes
    page.click('.blocklyToolboxCategory:has-text("ข้อมูล") >> nth=0'); page.wait_for_timeout(250)
    page.click('.blocklyToolboxCategory:has-text("โหลด & สำรวจ") >> nth=0'); page.wait_for_timeout(350)
    away = page.evaluate(STATE)['away']
    page.evaluate('PB.ui.ws.getToolbox().clearSelection()'); page.wait_for_timeout(350)
    check('an open palette category moves the start screen aside, closing it brings it back', away and not page.evaluate(STATE)['away'])

    # ---------- 2. data: a built-in dataset becomes the program ----------
    page.click('#start [data-start="data"]'); page.wait_for_selector('.modal .data-samples')
    sets = page.evaluate('Array.from(document.querySelectorAll(".modal [data-dataset]")).map((b) => b.dataset.dataset)')
    check('"ข้อมูล" opens My data with every built-in dataset', sets == page.evaluate('Object.keys(PB.DATASETS)') and len(sets) >= 10, str(sets))
    page.click('.modal [data-dataset="iris"]'); settle(page)
    s = page.evaluate(STATE)
    out = page.inner_text('#out-body')
    code = page.evaluate('PB.ui.fullScript("none")')
    check('picking a dataset loads it, prints the first rows and leaves the start screen', not s['shown'] and s['blocks'] == 1 and s['all'] == 4 and not s['err'] and 'sepal_length' in out and 'df.head(5)' in code, f"{s} {code[-80:]!r}")
    check('canvas buttons back once there are blocks', s['tools'] != 'none')
    # with blocks already there, a dataset goes below them
    page.click('.topbar [data-act="data"] >> visible=true'); page.wait_for_selector('.modal [data-dataset="tips"]')
    page.click('.modal [data-dataset="tips"]'); page.wait_for_timeout(400)
    check('with a program open, a dataset is added below it', page.evaluate(STATE)['blocks'] == 2 and 'ท้ายพื้นที่ทำงาน' in page.evaluate("(document.querySelector('.toast') || {}).textContent || ''"))

    # ---------- 3. clearing the workspace returns to the start screen ----------
    page.click('.topbar [data-act="more"]'); page.click('.menu button:has-text("ล้างพื้นที่ทำงาน")'); page.click('.modal .btn-accent'); page.wait_for_timeout(400)
    s = page.evaluate(STATE)
    check('"ล้างพื้นที่ทำงาน" clears blocks and results and shows the start screen again', s['shown'] and s['blocks'] == 0 and s['cells'] == 0 and s['status'] == 'พร้อมรัน' and not s['resume'], str(s))

    # ---------- 4. sample projects through the gallery ----------
    page.click('#start [data-start="samples"]'); page.wait_for_selector('.modal .sample-grid')
    ids = page.evaluate('Array.from(document.querySelectorAll(".modal [data-sample]")).map((b) => b.dataset.sample)')
    check('"โครงงานตัวอย่าง" lists every sample project', ids == page.evaluate('PB.SAMPLES.map((s) => s.id)') and len(ids) == 11, str(ids))
    page.click('.modal [data-sample="titanic"]'); settle(page, 500)
    s = page.evaluate(STATE)
    check('a sample from the gallery is built and run', not s['shown'] and s['all'] > 20 and s['cells'] > 3 and not s['err'], str(s))
    page.wait_for_timeout(900)
    n_titanic = page.evaluate(DRAFT)

    # ---------- 5. a reload brings the open work back ----------
    page.reload(); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); settle(page, 500)
    s = page.evaluate(STATE)
    check('reloading the page brings back the open program and runs it', not s['shown'] and s['all'] == n_titanic and s['cells'] > 3 and not s['err'], str(s))
    page.close()

    # ---------- 6. a new tab starts blank again and offers to continue ----------
    page = open_tab(ctx)
    s = page.evaluate(STATE)
    check('a new tab opens on the start screen even with saved work', s['shown'] and s['blocks'] == 0 and s['cells'] == 0, str(s))
    check('"ทำต่อจากครั้งก่อน" shows the saved program: blocks, data, when', len(s['resume']) == 1 and 'ทำต่อจากครั้งก่อน' in s['resume'][0] and 'บล็อก' in s['resume'][0] and 'ไททานิก' in s['resume'][0], str(s['resume']))
    page.wait_for_timeout(1000)
    check('opening the app leaves the saved work as it was', n_titanic > 20 and page.evaluate(DRAFT) == n_titanic, f'{page.evaluate(DRAFT)} of {n_titanic} blocks')
    page.click('#start [data-start="resume"]'); settle(page, 500)
    s = page.evaluate(STATE)
    check('"ทำต่อจากครั้งก่อน" restores the program and runs it', not s['shown'] and s['all'] == n_titanic and s['cells'] > 3 and not s['err'], str(s))
    page.close()

    # ---------- 7. new program: the palette opens at the blocks that load data ----------
    page = open_tab(ctx)
    page.click('#start [data-start="new"]'); page.wait_for_timeout(500)
    s = page.evaluate(STATE)
    sel = page.evaluate('(() => { const t = PB.ui.ws.getToolbox(), i = t.getSelectedItem(); return [i ? i.getName() : null, t.getFlyout().isVisible()]; })()')
    check('"เริ่มงานใหม่": start screen put away, palette open at "โหลด & สำรวจ", workspace still blank', not s['shown'] and s['blocks'] == 0 and sel == ['โหลด & สำรวจ', True], f'{s} {sel}')
    page.evaluate('PB.ui.ws.getToolbox().clearSelection()'); page.wait_for_timeout(300)
    check('closing the palette keeps the blank workspace (no start screen until it is cleared)', not page.evaluate(STATE)['shown'])
    fb = page.evaluate('''() => { const t = PB.ui.ws.getToolbox(); t.setSelectedItem(t.getToolboxItems().find((i) => i.getName && i.getName() === 'โหลด & สำรวจ'));
        return new Promise((res) => setTimeout(() => { const g = document.querySelector('.blocklyFlyout:not([style*="display: none"]) .blocklyBlockCanvas > .blocklyDraggable'); if (!g) return res(null); const r = g.getBoundingClientRect(); res([r.x + 12, r.y + 10]); }, 350)); }''')
    if fb:
        page.mouse.move(fb[0], fb[1]); page.mouse.down(); page.mouse.move(fb[0] + 80, fb[1] + 40, steps=4); page.mouse.move(820, 420, steps=8); page.mouse.up(); page.wait_for_timeout(1200)
    check('dragging the first block in starts this visit\'s own program (it replaces the saved work)', fb is not None and page.evaluate(STATE)['blocks'] == 1 and page.evaluate(DRAFT) == page.evaluate(STATE)['all'], f'{fb} {page.evaluate(STATE)["blocks"]} blocks, draft {page.evaluate(DRAFT)}')
    page.close()

    # ---------- 8. exercises: continue in a new tab, leave back to the start screen ----------
    page = open_tab(ctx)
    page.evaluate('PB.ui.loadProgram(PB.SAMPLES.find((s) => s.id === "mpg").build())'); page.wait_for_timeout(1000)
    n_mpg = page.evaluate(DRAFT)
    page.close()
    page = open_tab(ctx)
    page.click('#start [data-start="exercises"]'); page.wait_for_selector('.modal .ex-item')
    page.click('.modal .ex-item >> nth=0'); page.wait_for_timeout(600)
    first = page.evaluate('PB.EXERCISES[0]')
    check('an exercise opened from the start screen', page.evaluate(STATE)['ex'] == first['id'] and not page.evaluate(STATE)['shown'])
    page.close()
    page = open_tab(ctx)
    s = page.evaluate(STATE)
    check('a new tab offers both the saved program and the exercise left open', len(s['resume']) == 2 and f"ข้อ {first['n']}" in s['resume'][1] and first['title'] in s['resume'][1], str(s['resume']))
    page.locator('#start .sb-resume').nth(1).click(); page.wait_for_timeout(600)
    s = page.evaluate(STATE)
    check('"ทำแบบฝึกหัดต่อ" reopens that exercise', s['ex'] == first['id'] and page.evaluate("document.body.classList.contains('ex-mode')"), str(s))
    page.evaluate('PB.ui.exLeave()'); page.wait_for_timeout(500)
    s = page.evaluate(STATE)
    check('leaving it (opened from the start screen) returns to the start screen, saved program still offered', s['shown'] and s['blocks'] == 0 and not s['ex'] and len(s['resume']) == 1 and page.evaluate(DRAFT) == n_mpg, str(s))
    # a different choice drops the exercise offer
    page.close()
    page = open_tab(ctx)
    check('after leaving, the exercise is no longer offered', len(page.evaluate(STATE)['resume']) == 1)

    # ---------- 9. switching language on the start screen ----------
    with page.expect_navigation():
        page.click('.topbar [data-act="lang"]')
    page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); settle(page, 400)
    s = page.evaluate(STATE)
    text = page.evaluate('document.querySelector("#start").innerText')
    check('switching language on the start screen stays there, in English', s['shown'] and s['blocks'] == 0 and page.evaluate('PB.i18n.lang') == 'en' and 'Where would you like to start?' in text, str(s))
    check('start screen in English: no Thai left', not THAI.findall(text) and 'Continue where you left off' in text, str(sorted(set(THAI.findall(text)))[:8]))
    check('the saved work survives the language switch', page.evaluate(DRAFT) == n_mpg)
    page.click('#start [data-start="samples"]'); page.wait_for_selector('.modal .sample-grid')
    th = THAI.findall(page.evaluate('document.querySelector(".modal").innerText'))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    page.click('#start [data-start="data"]'); page.wait_for_selector('.modal .data-samples')
    th += THAI.findall(page.evaluate('document.querySelector(".modal").innerText'))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    check('gallery and data dialog in English', not th, str(sorted(set(th))[:8]))
    with page.expect_navigation():
        page.click('.topbar [data-act="lang"]')
    page.wait_for_function('document.body.classList.contains("ready")', timeout=30000)
    ctx.close()

    # ---------- 10. dark theme ----------
    ctx = browser.new_context(viewport={'width': 1360, 'height': 860}, color_scheme='dark')
    page = open_tab(ctx)
    low = [x for x in page.evaluate(CONTRAST) if x[1] < 4.5]
    notch = page.evaluate('getComputedStyle(document.querySelector("#start .sb"), "::before").backgroundColor === getComputedStyle(document.querySelector(".pane-blocks")).backgroundColor')
    check('dark theme: block text contrast at least 4.5:1, notches match the canvas', not low and notch, str(page.evaluate(CONTRAST)))
    ctx.close()

    # ---------- 11. phone ----------
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    page = open_tab(ctx)
    r = page.evaluate('''() => { const s = document.querySelector('#start').getBoundingClientRect(), p = document.querySelector('.pane-blocks').getBoundingClientRect(), x = s.left + 40, y = s.top + 200;
        return { left: s.left, width: s.width, pane: p.width, top: document.elementFromPoint(x, y).closest('#start') !== null, scroll: document.documentElement.scrollWidth <= innerWidth,
                 cols: getComputedStyle(document.querySelector('#start .sb-grid')).gridTemplateColumns.split(' ').length }; }''')
    check('phone: the start screen covers the whole blocks view (palette too), two columns, no sideways scroll', r['left'] == 0 and abs(r['width'] - r['pane']) < 1 and r['top'] and r['scroll'] and r['cols'] == 2, str(r))
    page.tap('#start [data-start="samples"]'); page.wait_for_selector('.modal .sample-grid')
    page.tap('.modal [data-sample="iris"]'); settle(page, 500)
    s = page.evaluate(STATE)
    check('phone: a sample from the gallery runs and the results view opens', not s['shown'] and s['cells'] > 3 and not s['err'] and page.evaluate('document.querySelector(".studio").dataset.view') == 'out', str(s))
    page.close()
    page = open_tab(ctx)
    page.tap('#start [data-start="new"]'); page.wait_for_timeout(400)
    vis = page.evaluate('(() => { const t = document.querySelector(".blocklyToolbox").getBoundingClientRect(); return document.elementFromPoint(t.left + 20, t.top + 20).closest(".blocklyToolbox") !== null; })()')
    check('phone: "เริ่มงานใหม่" uncovers the palette', vis and not page.evaluate(STATE)['shown'])
    ctx.close()

    check('no page errors', not errs, str(errs[:3]))
    browser.close()
print(f'{sum(ok_all)}/{len(ok_all)} passed')
sys.exit(0 if all(ok_all) else 1)
