"""Compare the in-browser Thai tokenizers (src/engine/thai.js) with PyThaiNLP on several thousand texts: the
sample reviews, random dictionary-word sentences, random Thai syllable soup, and mixed text with numbers,
English, emoji, tabs and newlines. Every engine the blocks offer is checked, with and without whitespace:
word_tokenize newmm / longest / mm, syllable_tokenize(engine="dict") and subword_tokenize(engine="tcc").
Run: python3 test/thai_check.py [engine …]"""
import json, os, random, subprocess, sys
from pythainlp.tokenize import word_tokenize, syllable_tokenize, subword_tokenize
from pythainlp.corpus.common import thai_words, thai_stopwords

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'data'))
from thai_reviews_src import rows as review_rows  # noqa: E402

random.seed(7)
W = sorted(thai_words())
texts = [r[0] for r in review_rows()]
for _ in range(1500):
    k = random.randint(1, 9)
    sep = random.choice(['', '', '', ' '])
    texts.append(sep.join(random.choice(W) for _ in range(k)))
CONS = 'กขคฆงจฉชซญฎฏฐฑฒณดตถทธนบปผพฟภมยรลวศษสหฬอฮ'
VOW = ['ะ', 'า', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', 'ั', 'ำ', '็', '่', '้', '๊', '๋', '์', 'เ', 'แ', 'โ', 'ใ', 'ไ', 'ๆ', 'ฯ']
for _ in range(800):
    texts.append(''.join(random.choice(CONS + ''.join(VOW)) for _ in range(random.randint(1, 30))))
EXTRA = ['12:30น.', '1,250', '3.14', '127.0.0.1', 'iPhone', 'COVID-19', '😋', '👍🏽', '\n', '\t', '  ', '๑๒๓', 'ราคา', 'บาท', 'ดีมาก!!', '(ทดสอบ)', 'e-mail', '50%', '"ok"']
for _ in range(800):
    parts = [random.choice(W) if random.random() < 0.6 else random.choice(EXTRA) for _ in range(random.randint(1, 10))]
    texts.append(''.join(p if random.random() < 0.7 else p + ' ' for p in parts))
texts += ['', ' ', 'ก', 'กข', 'ฯลฯ', 'ๆๆๆ', 'สวัสดีครับ', 'โอเคบ่พวกเรารักภาษาบ้านเกิด', 'วรรณกรรม ภาพวาด และการแสดงงิ้ว ',
          'เงิน1,234บาท19:32น 127.0.0.1', 'ชินโซ อาเบะ เกิด 21 กันยายน', 'ขณะนี้เวลา 12:00น อัตราแลกเปลี่ยน 1,234.5 baht/zeny']

ENGINES = {
    'newmm': (lambda t, kw: word_tokenize(t, engine='newmm', keep_whitespace=kw), 'E.thai.wordTokenize(t, { keepWhitespace: kw })'),
    'longest': (lambda t, kw: word_tokenize(t, engine='longest', keep_whitespace=kw), "E.thai.wordTokenize(t, { engine: 'longest', keepWhitespace: kw })"),
    'mm': (lambda t, kw: word_tokenize(t, engine='mm', keep_whitespace=kw), "E.thai.wordTokenize(t, { engine: 'mm', keepWhitespace: kw })"),
    'syllable': (lambda t, kw: syllable_tokenize(t, engine='dict', keep_whitespace=kw), 'E.thai.syllables(t, { keepWhitespace: kw })'),
    'tcc': (lambda t, kw: subword_tokenize(t, engine='tcc', keep_whitespace=kw), 'E.thai.tccTokenize(t, { keepWhitespace: kw })'),
}
stop = sorted(thai_stopwords())
failed = False
for name in (sys.argv[1:] or ENGINES):
    py, call = ENGINES[name]
    expect = [[py(t, True), py(t, False)] for t in texts]
    js = r"""
const E = require(process.argv[1]);
const texts = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const t0 = Date.now();
const out = texts.map((t) => [true, false].map((kw) => %s));
process.stdout.write(JSON.stringify({ out, ms: Date.now() - t0, nstop: E.thai.stopwords().size }));
""" % call
    res = subprocess.run(['node', '-e', js, os.path.join(ROOT, 'test', 'load_engine.js')], input=json.dumps(texts), capture_output=True, text=True)
    if res.returncode:
        print(res.stderr[-2000:]); sys.exit(1)
    got = json.loads(res.stdout)
    bad = [(t, e, g) for t, e, g in zip(texts, expect, got['out']) if e != g]
    print(f'{name}: {len(texts)} texts · {len(bad)} mismatches · js {got["ms"]} ms' + (f' · stopwords {got["nstop"]} (python {len(stop)})' if name == 'newmm' else ''))
    for t, e, g in bad[:6]:
        print('TEXT', repr(t)); print('  py', e); print('  js', g)
    failed = failed or bool(bad)
sys.exit(1 if failed else 0)
