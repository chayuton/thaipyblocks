"""Bundle ThaiPyBlocks into one HTML page (Blockly stays on the CDN)."""
import re, os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
JS = ['engine/core.js', 'i18n_en.js', 'engine/frame.js', 'engine/ml_base.js', 'engine/clean.js', 'engine/linear.js', 'engine/tree.js', 'engine/others.js',
      'engine/cluster.js', 'engine/text.js', 'engine/metrics.js', 'engine/search.js', 'engine/select.js', 'engine/textclean.js', 'engine/thai.js', 'thai_dict.js', 'engine/datasets.js', 'data.js',
      'blocks/dsl.js', 'blocks/interp.js', 'blocks/b_data.js', 'blocks/b_ml.js', 'blocks/b_viz.js', 'blocks/b_more.js', 'blocks/b_clean.js', 'blocks/std.js',
      'ui/recipes.js', 'ui/util.js', 'ui/charts.js', 'ui/toolbox.js', 'ui/schema.js', 'ui/lang.js', 'ui/app_core.js', 'ui/exercises.js', 'ui/report.js', 'ui/pdf.js', 'ui/app_panels.js']
read = lambda p: open(os.path.join(SRC, p), encoding='utf-8').read()
html = read('index.html')
css = read('ui/styles.css')
js = '\n'.join(f'/* ---- {p} ---- */\n' + read(p) for p in JS)
js = js.replace('</script', '<\\/script')
util = read('ui/util.js')
icons = dict(re.findall(r"^\s+(\w+): '(<[^']*)',?$", util, re.M))
def icon(m):
    return f'<svg viewBox="0 0 20 20" aria-hidden="true">{icons[m.group(1)]}</svg>'
html = re.sub(r'<!--I:(\w+)-->', icon, html)
html = html.replace('/*__CSS__*/', css).replace('/*__JS__*/', js)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
out = os.path.join(ROOT, 'dist', 'thaipyblocks.html')
open(out, 'w', encoding='utf-8').write(html)
# local test page: same content inside a skeleton like the publisher adds
skel = ('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>' + html + '</body></html>')
open(os.path.join(ROOT, 'dist', 'test.html'), 'w', encoding='utf-8').write(skel)
# standalone page for GitHub Pages or opening the file in a browser: a full document, head tags in <head>
cut = html.index('<div class="app">')
icon_svg = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 26'%3E"
            "%3Crect y='2' width='16' height='11' rx='3' fill='%232c69b0'/%3E%3Crect x='4' y='12' width='6' height='4' rx='1.5' fill='%232c69b0'/%3E"
            "%3Crect x='10' y='13' width='16' height='11' rx='3' fill='%23f2c53d'/%3E%3C/svg%3E")
page = ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        f'<link rel="icon" href="{icon_svg}">\n'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>\n'
        + html[:cut] + '</head>\n<body>\n' + html[cut:] + '\n</body>\n</html>\n')
open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8').write(page)
# the same page next to build.py: the ready app that is committed to git, so the folder works on GitHub Pages
# (or opened straight from disk) with no build step, also when it sits inside another repository
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(page)
print('built', out, f'{os.path.getsize(out)/1024:.0f} KB', '+ dist/index.html (standalone page) + dist/test.html + index.html (the app, committed)')
