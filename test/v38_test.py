"""Version 3.8: automatic feature selection (SelectKBest), the cleaning assistant's similar spellings (fuzzy
matching) and dates typed in many formats, the other PyThaiNLP tokenizers, and the value pickers.

1. Programs with every new block, and the cleaning assistant on the new "orders" dataset, run in the app and in
   CPython (pandas / scikit-learn / PyThaiNLP); every printed output must be the same text (the machinery of
   test/clean_test.py).
2. parse_date and similar_values: the engine and the Python helpers on hundreds of tricky inputs.
3. The interface: value pickers (values at that point of the program, picking swaps text/number, one undo),
   the assistant dialog on "orders" (pairs can be switched off one by one), the new blocks in the toolbox,
   and the same in English.
Run: python3 test/v38_test.py"""
import json, os, random, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import clean_test
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright

ok_all = []
def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''))
    ok_all.append(bool(cond)); return cond

# ---------------------------------------------------------------- 1. app vs CPython
PROGRAMS = {
    'v38_selectk_iris': r'''
      S.set('df', B('pb_dataset', { NAME: 'iris' })),
      S.set('X', B('pb_drop_cols', { DF: V('df'), COLS: 'species' })),
      S.set('y', B('pb_col', { DF: V('df'), COL: 'species' })),
      B('pb_split', { XTR: V('X_train'), XTE: V('X_test'), YTR: V('y_train'), YTE: V('y_test'), X: V('X'), Y: V('y'), TS: 0.2, RS: 42, MODE: 'stratify' }),
      S.set('selector', B('pb_selectk', { FN: 'f_classif', K: 2 })),
      S.set('X_train', B('pb_selectk_fit', { M: V('selector'), X: V('X_train'), Y: V('y_train') })),
      S.set('X_test', B('pb_transform', { M: V('selector'), FN: 'transform', X: V('X_test') })),
      S.print(B('pb_selectk_scores', { M: V('selector') })),
      S.print(B('pb_df_view', { DF: V('X_train'), FN: 'head', N: 5 })),
      S.print(B('pb_df_view', { DF: V('X_test'), FN: 'head', N: 3 })),
      S.print2('features:', B('pb_attr', { M: V('selector'), ATTR: 'feature_names_in_' })),
      S.set('model', R.model('LogisticRegression')),
      B('pb_fit', { M: V('model'), X: V('X_train'), Y: V('y_train') }),
      S.set('y_pred', B('pb_predict', { M: V('model'), FN: 'predict', X: V('X_test') })),
      S.print2('Accuracy:', B('pb_metric', { FN: 'accuracy_score', YT: V('y_test'), YP: V('y_pred') })),
      B('pb_plot_importance', { M: V('selector'), ATTR: 'scores_', X: V('X') }),
      S.set('chi', B('pb_selectk', { FN: 'chi2', K: 3 })),
      S.set('Xc', B('pb_selectk_fit', { M: V('chi'), X: V('X'), Y: V('y') })),
      S.print(B('pb_selectk_scores', { M: V('chi') })),
      S.print(B('pb_df_info', { DF: V('Xc'), FN: 'shape' })),
    ''',
    'v38_selectk_mpg_pipeline': r'''
      S.set('df', B('pb_dataset', { NAME: 'mpg' })),
      S.set('df', B('pb_df_clean', { DF: V('df'), FN: 'dropna' })),
      S.set('X', B('pb_cols', { DF: V('df'), COLS: 'cylinders, displacement, horsepower, weight, acceleration, model_year' })),
      S.set('y', B('pb_col', { DF: V('df'), COL: 'mpg' })),
      B('pb_split', { XTR: V('X_train'), XTE: V('X_test'), YTR: V('y_train'), YTE: V('y_test'), X: V('X'), Y: V('y'), TS: 0.2, RS: 42, MODE: 'shuffle' }),
      S.set('selector', B('pb_selectk', { FN: 'f_regression', K: 3 })),
      S.set('model', B('pb_pipeline', {}, { A: R.get('selector'), B: R.model('LinearRegression') })),
      B('pb_fit', { M: V('model'), X: V('X_train'), Y: V('y_train') }),
      S.print2('R²:', B('pb_score', { M: V('model'), X: V('X_test'), Y: V('y_test') })),
      S.print(B('pb_selectk_scores', { M: V('selector') })),
      S.set('grid', B('pb_grid', { GRID: '{"selectkbest__k": [1, 2, 3, 4, 5, 6]}', CV: 5, SC: 'None' }, { M: R.get('model') })),
      B('pb_fit', { M: V('grid'), X: V('X_train'), Y: V('y_train') }),
      S.print2('best:', B('pb_grid_attr', { G: V('grid'), ATTR: 'best_params_' })),
      S.print2('best score:', B('pb_grid_attr', { G: V('grid'), ATTR: 'best_score_' })),
    ''',
    'v38_orders_blocks': r'''
      S.set('df', B('pb_dataset', { NAME: 'orders' })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 8 })),
      S.print(B('pb_similar_values', { DF: V('df'), COL: 'province', CUT: 0.8 })),
      S.print(B('pb_similar_values', { DF: V('df'), COL: 'province', CUT: 0.95 })),
      S.print(B('pb_similar_values', { DF: V('df'), COL: 'category', CUT: 0.8 })),
      S.print(B('pb_similar_values', { DF: V('df'), COL: 'order_id', CUT: 0.9 })),
      B('pb_parse_dates', { DF: V('df'), COL: 'order_date' }),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'dtypes' })),
      S.print(B('pb_quality', { DF: V('df') })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 12 })),
      S.print(B('pb_filter', { DF: V('df'), COL: 'order_date', OP: 'isnull' })),
      B('pb_replace_val', { DF: V('df'), COL: 'province' }, { OLD: S.text('ขอนเเก่น'), NEW: S.text('ขอนแก่น') }),
      S.print(B('pb_series_stat', { DF: V('df'), COL: 'province', FN: 'value_counts' })),
    ''',
    'v38_thai_tokenizers': r'''
      S.set('df', B('pb_dataset', { NAME: 'thai_reviews' })),
      S.print(B('pb_th_tokenize', { ENG: 'newmm', KW: 'False' }, { TEXT: S.text('ไปกินข้าวกันนะ iPhone ราคา 1,234.50 บาท') })),
      S.print(B('pb_th_tokenize', { ENG: 'longest', KW: 'False' }, { TEXT: S.text('ไปกินข้าวกันนะ iPhone ราคา 1,234.50 บาท') })),
      S.print(B('pb_th_tokenize', { ENG: 'mm', KW: 'True' }, { TEXT: S.text('ไปกินข้าวกันนะ iPhone ราคา 1,234.50 บาท') })),
      S.print(B('pb_th_subword', { FN: 'syllable', KW: 'False' }, { TEXT: S.text('ประเทศไทยสวยงามมาก') })),
      S.print(B('pb_th_subword', { FN: 'tcc', KW: 'True' }, { TEXT: S.text('ประเทศไทย สวยงาม') })),
      B('pb_set_col', { DF: V('df'), NAME: 'w_longest' }, { VAL: B('pb_th_tokens', { DF: V('df'), COL: 'text', FN: 'thai_tokenize', ENG: 'longest' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'w_mm' }, { VAL: B('pb_th_tokens', { DF: V('df'), COL: 'text', FN: 'thai_tokenize_nostop', ENG: 'mm' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'syl' }, { VAL: B('pb_th_tokens', { DF: V('df'), COL: 'text', FN: 'thai_tokenize', ENG: 'syllable' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'tcc' }, { VAL: B('pb_th_tokens', { DF: V('df'), COL: 'text', FN: 'thai_tokenize', ENG: 'tcc' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'words' }, { VAL: B('pb_th_tokens', { DF: V('df'), COL: 'text', FN: 'thai_tokenize_nostop', ENG: 'newmm' }) }),
      S.print(B('pb_cell', { DF: V('df'), COL: 'w_longest', N: 0 })),
      S.print(B('pb_cell', { DF: V('df'), COL: 'w_mm', N: 3 })),
      S.print(B('pb_cell', { DF: V('df'), COL: 'syl', N: 5 })),
      S.print(B('pb_cell', { DF: V('df'), COL: 'tcc', N: 7 })),
      S.print(B('pb_cell', { DF: V('df'), COL: 'words', N: 9 })),
      S.print(B('pb_word_count', { DF: V('df'), COL: 'syl', N: 10 })),
      S.print(B('pb_word_count', { DF: V('df'), COL: 'w_longest', N: 10 })),
      S.print(B('pb_word_count', { DF: V('df'), COL: 'w_mm', N: 8 })),
    ''',
}
CLEAN_CASES = [
    ('v38_clean_orders', {'dataset': 'orders'}, {}, {}),
    ('v38_clean_orders_no_new_steps', {'dataset': 'orders'}, {}, {'similar': False, 'dates': False}),
    ('v38_clean_orders_scale_save', {'dataset': 'orders'}, {'scale': {'method': 'minmax', 'cols': ['qty', 'amount'], 'plots': True}, 'save': True, 'outliers': {'action': 'clip', 'cols': ['amount']}}, {'dedupe': True}),
    ('v38_clean_coffee_unchanged', {'dataset': 'coffee'}, None, None),
]
clean_test.PROGRAMS = PROGRAMS
clean_test.CLEAN_CASES = CLEAN_CASES
clean_test.PREP_CASES = []
fails = clean_test.main(set(sys.argv[1:]) or None)
check(f'{len(PROGRAMS) + len(CLEAN_CASES)} programs: app and CPython print the same', not fails, str(fails[:6]))

# ---------------------------------------------------------------- 2. parse_date / similar_values on many inputs
random.seed(38)
TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
THF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'January', 'Sept', 'jan', 'DEC', 'Mayo', 'Foo']
dates = []
for _ in range(600):
    y, m, d = random.choice([1999, 2000, 2024, 2025, 2026, 2567, 2568, 2569, 1500, 2401, 9999, 100]), random.randint(0, 13), random.randint(0, 32)
    f = random.choice(['{y}-{m:02d}-{d:02d}', '{y}/{m}/{d}', '{d}/{m}/{y}', '{d:02d}-{m:02d}-{y}', '{d}.{m}.{y}', '{d} {th} {y}', '{d}{th}{y}', '{d} {thf} {y}',
                       '{en} {d}, {y}', '{en}. {d} {y}', '{d} {en} {y}', '{d} {en}, {y}', ' {y}-{m}-{d} ', '{y}-{m}-{d} 10:30', '{d}/{m}/{yy}', '{th} {d} {y}'])
    mm = max(1, min(12, m))
    s = f.format(y=y, m=m, d=d, th=TH[mm - 1], thf=THF[mm - 1], en=random.choice(EN), yy=y % 100)
    if random.random() < 0.1: s = s.translate(str.maketrans('0123456789', '๐๑๒๓๔๕๖๗๘๙'))
    dates.append(s)
dates += ['', ' ', '-', 'NaN', '31/02/2026', '29/02/2024', '29/02/2025', '29 ก.พ. 2567', '0/0/0000', '2026-1-1', '1/1/1', 'Jan 1 2026', 'Feb 30, 2026']
WORDS = ['กรุงเทพ', 'กรุงเทพฯ', 'กทม', 'เชียงใหม่', 'เชียงไหม่', 'ขอนแก่น', 'ขอนเเก่น', 'นครราชสีมา', 'นครราชสีมาา', 'สงขลา', 'สงขา',
         'Electronics', 'Electornics', 'Electronic', 'Fashion', 'fashion', 'Fashoin', 'ใต้', 'ใต', 'เหนือ', 'กลาง', 'Gold', 'Bold', 'ก่ี', 'กี่']
series = [[random.choice(WORDS) for _ in range(random.randint(3, 40))] for _ in range(80)]
sys.path.insert(0, os.path.join(ROOT, 'data'))
helpers = {}
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(); route(page)
    page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000)
    code = page.evaluate('''() => { PB.py.reset(); PB.blocks.parseDatesPy('df', 'd'); PB.blocks.similarPy('df["c"]', 0.8);
        return PB.py.importLines().join('\\n') + '\\n\\n' + Array.from(PB.py.helpers.values()).join('\\n\\n\\n') + '\\n'; }''')
    js_dates = page.evaluate('(xs) => xs.map((x) => { const v = PB.parseDateValue(x); return Number.isNaN(v) ? null : PB.fmtDate(v); })', dates)
    js_sim = page.evaluate('''(ss) => ss.map((vals) => { const df = PB.similarValues(new PB.Series(vals, { dtype: 'object' }), 0.8); return df.__str__(); })''', series)
    b.close()
exec(code, helpers)
pd = helpers['pd']
py_dates = [None if pd.isna(helpers['parse_date'](x)) else str(helpers['parse_date'](x).date()) for x in dates]
bad = [(x, a, q) for x, a, q in zip(dates, js_dates, py_dates) if a != q]
check(f'parse_date: engine = Python on {len(dates)} date strings ({sum(1 for q in py_dates if q)} valid)', not bad, str(bad[:5]))
pd.options.future.infer_string = False
py_sim = [str(helpers['similar_values'](pd.Series(vals, dtype=object))) for vals in series]
bad = [(v, a, q) for v, a, q in zip(series, js_sim, py_sim) if a != q]
check(f'similar_values: engine = Python on {len(series)} random columns', not bad, (bad[0][1] + '\n---\n' + bad[0][2]) if bad else '')

# ---------------------------------------------------------------- 3. interface
def boot(p, url, w=1360, h=860):
    b = p.chromium.launch(); page = b.new_context(viewport={'width': w, 'height': h}).new_page(); route(page)
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(url); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_function('!PB.ui.running', timeout=60000)
    return b, page, errs

PICK_PROG = '''() => { const R = PB.R, V = (n) => ({ name: n }), df = V('df'), sh = (t, v) => ({ shadow: { type: t, fields: t === 'text' ? { TEXT: v } : { NUM: v } } });
  PB.ui.loadProgram(R.program([R.set('df', R.b('pb_dataset', { NAME: 'coffee' })), R.b('pb_clean_text', { DF: df, COL: 'province', FN: 'strip' }),
    R.b('pb_replace_val', { DF: df, COL: 'province' }, { OLD: sh('text', ''), NEW: sh('text', '') }),
    R.print(R.b('pb_filter', { DF: df, COL: 'member_type', OP: '==' }, { VAL: sh('math_number', 0) })),
    R.b('pb_fill_value', { DF: df, COL: 'gender' }, { VAL: sh('text', '') })]), { run: false }); }'''
def field_xy(page, btype, inp, fname):
    page.evaluate(f'''() => {{ const b = PB.ui.ws.getAllBlocks(false).find((x) => x.type === '{btype}'); PB.ui.ws.centerOnBlock(b.id); }}''')
    page.wait_for_timeout(250)
    return page.evaluate(f'''() => {{ const b = PB.ui.ws.getAllBlocks(false).find((x) => x.type === '{btype}'), t = b.getInputTargetBlock('{inp}');
        const r = t.getField('{fname}').getSvgRoot().getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }}''')
PICKER = '''() => ({ title: (document.querySelector('.blocklyDropDownDiv .pb-picker-title') || {}).textContent || '',
  items: Array.from(document.querySelectorAll('.blocklyDropDownDiv .pb-picker-item .pb-picker-name')).map((e) => e.textContent),
  own: (document.querySelector('.blocklyDropDownDiv .pb-picker-link') || {}).textContent || '' })'''
py_of = lambda page, t: page.evaluate(f'''() => PB.blockPython(PB.ui.ws.getAllBlocks(false).find((x) => x.type === '{t}')).trim()''')

with sync_playwright() as p:
    b, page, errs = boot(p, PAGE)
    page.evaluate(PICK_PROG); page.wait_for_timeout(400)
    page.mouse.click(*field_xy(page, 'pb_replace_val', 'OLD', 'TEXT')); page.wait_for_timeout(500)
    pk = page.evaluate(PICKER)
    check('replace · old value: the values at that point (after strip, so no " กรุงเทพ")', 'ณ จุดนี้' in pk['title'] and 'กทม' in pk['items'] and 'กรุงเทพ' in pk['items'] and not any(x != x.strip() or x.startswith('"') for x in pk['items']) and pk['own'] == 'พิมพ์ค่าเอง', json.dumps(pk, ensure_ascii=False)[:300])
    page.click('.blocklyDropDownDiv .pb-picker-item >> text=กทม'); page.wait_for_timeout(250)
    page.mouse.click(*field_xy(page, 'pb_replace_val', 'NEW', 'TEXT')); page.wait_for_timeout(500)
    page.click('.blocklyDropDownDiv .pb-picker-item >> text=กรุงเทพ'); page.wait_for_timeout(250)
    check('picking fills the Python code', py_of(page, 'pb_replace_val') == 'df["province"] = df["province"].replace("กทม", "กรุงเทพ")', py_of(page, 'pb_replace_val'))
    page.mouse.click(*field_xy(page, 'pb_filter', 'VAL', 'NUM')); page.wait_for_timeout(500)
    pk = page.evaluate(PICKER)
    check('filter on a text column: number slot lists the texts (before the case fix: gold / GOLD …)', 'Regular' in pk['items'] and 'gold' in pk['items'], str(pk['items'][:12]))
    page.click('.blocklyDropDownDiv .pb-picker-item >> text=Silver'); page.wait_for_timeout(250)
    check('a text picked into a number slot becomes a text block', py_of(page, 'pb_filter') == 'df[df["member_type"] == "Silver"]', py_of(page, 'pb_filter'))
    page.keyboard.press('Control+z'); page.wait_for_timeout(250)
    check('one undo brings the number back', py_of(page, 'pb_filter') == 'df[df["member_type"] == 0]', py_of(page, 'pb_filter'))
    page.mouse.click(*field_xy(page, 'pb_fill_value', 'VAL', 'TEXT')); page.wait_for_timeout(500)
    pk = page.evaluate(PICKER)
    check('fill value: gender values, typing still possible', 'ชาย' in pk['items'] and 'หญิง' in pk['items'], str(pk))
    page.click('.blocklyDropDownDiv .pb-picker-link'); page.wait_for_timeout(300)
    check('"พิมพ์ค่าเอง" opens the text editor', page.evaluate("!!document.querySelector('.blocklyWidgetDiv input, .blocklyHtmlInput')"))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    # isnull: no picker (the value slot is not used)
    nopick = page.evaluate('''() => { const b = PB.ui.ws.getAllBlocks(false).find((x) => x.type === 'pb_filter'); b.setFieldValue('isnull', 'OP');
        const t = b.getInputTargetBlock('VAL'); return !t || !PB.blocks.valueSlot(t.getField(t.type === 'text' ? 'TEXT' : 'NUM')); }''')
    check('no value list when the filter is isnull()', nopick)
    # an uploaded-file program after a reload falls back to the source data's values
    vals = page.evaluate('''() => { const R = PB.R, V = (n) => ({ name: n });
        PB.ui.loadProgram(R.program([R.set('df', R.b('pb_dataset', { NAME: 'orders' })), R.b('pb_replace_val', { DF: V('df'), COL: 'province' }, { OLD: { shadow: { type: 'text', fields: { TEXT: '' } } }, NEW: { shadow: { type: 'text', fields: { TEXT: '' } } } })]), { run: false });
        const b = PB.ui.ws.getAllBlocks(false).find((x) => x.type === 'pb_replace_val'); const v = PB.schema.valuesAt(b, 'df', 'province'); return [v.from, v.items.length, v.items.map((x) => x.label)]; }''')
    check('orders · province values at that point (16 spellings, rarest last)', vals[0] == 'here' and vals[1] == 16 and 'ขอนเเก่น' in vals[2] and '"เชียงใหม่ "' in vals[2], str(vals)[:300])
    # the cleaning assistant dialog on orders
    page.click('[data-act="clean"]'); page.wait_for_timeout(500)
    page.evaluate('''() => { const s = document.querySelector('#wz-src'); s.value = 'orders'; s.dispatchEvent(new Event('change', { bubbles: true })); }'''); page.wait_for_timeout(800)
    text = page.evaluate("document.querySelector('.modal').innerText")
    check('assistant: similar spellings row with every pair, dates row with examples', 'รวมชื่อที่สะกดคล้ายกัน' in text and 'เชียงไหม่ → เชียงใหม่' in text and 'Electornics → Electronics' in text and 'แปลงวันที่ที่พิมพ์หลายรูปแบบ' in text and '31/02/2026' in text, text[:200])
    n_on = page.evaluate('''() => Array.from(document.querySelectorAll('.modal .pill')).filter((x) => /→/.test(x.textContent) && x.getAttribute('aria-pressed') === 'true').length''')
    page.click('.modal .pill:has-text("category: Electronic → Electronics")'); page.wait_for_timeout(300)
    n_off = page.evaluate('''() => Array.from(document.querySelectorAll('.modal .pill')).filter((x) => /→/.test(x.textContent) && x.getAttribute('aria-pressed') === 'true').length''')
    check('a pair can be switched off', n_on == 12 and n_off == 11, f'{n_on} → {n_off}')
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); page.wait_for_timeout(600); page.wait_for_function('!PB.ui.running', timeout=60000)
    code = page.evaluate('PB.ui.fullScript("th")')
    check('the program merges the chosen pairs only and parses the dates', 'replace("Electornics", "Electronics")' in code and 'replace("Electronic", "Electronics")' not in code and 'df["order_date"] = parse_dates(df["order_date"])' in code and 'similar_values(df["province"])' in code and not page.evaluate('PB.ui.lastError ? PB.ui.lastError.message : null'), '')
    # toolbox
    names = page.evaluate('''() => { const tb = PB.ui.ws.getToolbox(); const out = []; for (const it of tb.getToolboxItems()) if (it.getContents) { const c = it.getContents(); (Array.isArray(c) ? c : []).forEach((x) => { const walk = (o) => { if (!o) return; if (o.type) out.push(o.type); if (o.inputs) Object.values(o.inputs).forEach((i) => walk(i.block || i.shadow)); }; walk(x); }); } return out; }''')
    check('toolbox has the new blocks', all(t in names for t in ['pb_selectk', 'pb_selectk_fit', 'pb_selectk_scores', 'pb_similar_values', 'pb_parse_dates', 'pb_th_subword']), str(sorted(set(t for t in names if t.startswith('pb_s') or t.startswith('pb_p') or t.startswith('pb_th')))))
    # schema: columns known without running
    cols = page.evaluate('''() => { const R = PB.R, V = (n) => ({ name: n });
        PB.ui.loadProgram(R.program([R.set('df', R.b('pb_dataset', { NAME: 'orders' })), R.b('pb_parse_dates', { DF: V('df'), COL: 'order_date' }), R.set('sim', R.b('pb_similar_values', { DF: V('df'), COL: 'province', CUT: 0.8 })), R.print(R.b('pb_df_view', { DF: V('sim'), FN: 'head', N: 5 }))]), { run: false });
        const last = PB.ui.ws.getAllBlocks(false).find((x) => x.type === 'pb_df_view'); return [PB.schema.columns(last, 'sim').cols.map((c) => c.name), PB.schema.columns(last, 'df').cols.find((c) => c.name === 'order_date').hint]; }''')
    check('schema knows the similar_values table and the date column', cols[0] == ['value', 'count', 'similar_to', 'count_similar', 'ratio'] and cols[1] == 'datetime64[us]', str(cols))
    check('no page errors', not errs, str(errs[:3]))
    b.close()
    # English
    b, page, errs = boot(p, PAGE + '#lang=en')
    page.evaluate(PICK_PROG); page.wait_for_timeout(400)
    page.mouse.click(*field_xy(page, 'pb_replace_val', 'OLD', 'TEXT')); page.wait_for_timeout(500)
    pk = page.evaluate(PICKER)
    check('English: picker title and buttons in English', pk['title'].startswith('Values of column province in df') and pk['own'] == 'Type a value', str(pk)[:200])
    page.keyboard.press('Escape')
    labels = page.evaluate('''() => { const ws = PB.ui.ws; const out = []; for (const t of ['pb_selectk', 'pb_selectk_scores', 'pb_similar_values', 'pb_parse_dates', 'pb_th_subword']) { const b = ws.newBlock(t); out.push(b.inputList.flatMap((i) => i.fieldRow.map((f) => f.getText())).join(' ') + ' | ' + b.tooltip); b.dispose(); } return out; }''')
    thai = [l for l in labels if re.search(r'[ก-๛]', l.split(' | ')[0])]
    check('English: new block labels and tooltips in English', not thai, str(thai[:2]))
    check('no page errors (English)', not errs, str(errs[:3]))
    b.close()

print(f'{sum(ok_all)}/{len(ok_all)} passed')
sys.exit(0 if all(ok_all) else 1)
