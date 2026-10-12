"""Find Thai text in the JavaScript sources (src/**/*.js) — the strings people see must go through TR() so the
English interface can translate them (src/i18n.js + src/i18n_en.js).

  python3 test/i18n_tool.py check     # every Thai string is wrapped in TR(...) / TR`...`, or marked as data
                                      # (a line containing  /* th-data */  keeps its Thai strings as they are),
                                      # and every TR key has an English entry in src/i18n_en.js
  python3 test/i18n_tool.py keys      # list the TR keys (JSON) — the keys of src/i18n_en.js
  python3 test/i18n_tool.py wrap FILE # wrap the unwrapped Thai strings of FILE in TR (lines marked th-data are skipped)

A key is the string as JavaScript sees it; in a template TR`a ${x} b` the key is "a {0} b".
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')
SKIP = {'thai_dict.js', 'data.js', 'i18n_en.js', 'i18n.js'}
TH = re.compile(r'[฀-๿]')
REGEX_PREV = set('(,=:[!&|?{};+-*%<>~^')
ESC = {'n': '\n', 't': '\t', 'r': '\r', '0': '\0', 'b': '\b', 'f': '\f', 'v': '\v'}


def cook(raw):
    out, i = [], 0
    while i < len(raw):
        c = raw[i]
        if c == '\\' and i + 1 < len(raw):
            n = raw[i + 1]
            if n == 'u' and raw[i + 2:i + 3] == '{':
                j = raw.index('}', i); out.append(chr(int(raw[i + 3:j], 16))); i = j + 1; continue
            if n == 'u': out.append(chr(int(raw[i + 2:i + 6], 16))); i += 6; continue
            if n == 'x': out.append(chr(int(raw[i + 2:i + 4], 16))); i += 4; continue
            if n == '\n': i += 2; continue
            out.append(ESC.get(n, n)); i += 2; continue
        out.append(c); i += 1
    return ''.join(out)


class Lit:
    def __init__(self, kind, start, end, parts, line, calls=()):
        self.kind, self.start, self.end, self.parts, self.line = kind, start, end, parts, line   # parts: static raw pieces
        self.calls = tuple(calls)    # the functions whose arguments contain this literal (innermost last)

    @property
    def key(self):
        if self.kind == 'tpl':
            return ''.join(cook(p) + (f'{{{i}}}' if i < len(self.parts) - 1 else '') for i, p in enumerate(self.parts))
        return cook(self.parts[0])

    @property
    def thai(self):
        return any(TH.search(p) for p in self.parts)


def scan(src):
    """all string / template literals (templates: also the literals inside ${...}), comments and regexes skipped"""
    lits, i, n, prev = [], 0, len(src), ''

    def line_of(pos): return src.count('\n', 0, pos) + 1

    def read_template(i, stack):     # src[i] == '`'
        start, parts, buf_start, j = i, [], i + 1, i + 1
        while j < n:
            c = src[j]
            if c == '\\': j += 2; continue
            if c == '`': parts.append(src[buf_start:j]); return j + 1, Lit('tpl', start, j + 1, parts, line_of(start), stack)
            if c == '$' and src[j + 1:j + 2] == '{':
                parts.append(src[buf_start:j]); j = read_code(j + 2, '}', stack); buf_start = j; continue
            j += 1
        raise SyntaxError('unterminated template at line %d' % line_of(start))

    def read_code(i, close, outer=()):   # code until the matching close brace; returns index after it
        depth, j, last, stack = 0, i, '(', list(outer)
        while j < n:
            c = src[j]
            if c in ' \t\r\n': j += 1; continue
            if src.startswith('//', j): j = src.find('\n', j); j = n if j < 0 else j; continue
            if src.startswith('/*', j): j = src.index('*/', j) + 2; continue
            if c in '\'"':
                k = j + 1
                while src[k] != c:
                    k += 2 if src[k] == '\\' else 1
                lits.append(Lit('str', j, k + 1, [src[j + 1:k]], line_of(j), stack)); j = k + 1; last = 'x'; continue
            if c == '`':
                j, lit = read_template(j, stack); lits.append(lit); last = 'x'; continue
            if c == '/' and (last in REGEX_PREV or re.search(r'\b(return|typeof|case|in|of)\s*$', src[max(0, j - 12):j])):
                k, cls = j + 1, False
                while k < n:
                    ch = src[k]
                    if ch == '\\': k += 2; continue
                    if ch == '[': cls = True
                    elif ch == ']': cls = False
                    elif ch == '/' and not cls: break
                    elif ch == '\n': break
                    k += 1
                j = k + 1
                while j < n and src[j].isalpha(): j += 1
                last = 'x'; continue
            if c == '(':
                m = re.search(r'([\w$.]+)\s*$', src[max(0, j - 40):j]); stack.append(m.group(1) if m else '')
            if c == ')' and len(stack) > len(outer): stack.pop()
            if c == '{': depth += 1
            if c == '}':
                if depth == 0 and close == '}': return j + 1
                depth -= 1
            last = c if not (c.isalnum() or c in '_$') else 'x'
            j += 1
        return j

    read_code(0, None)
    return sorted(lits, key=lambda l: l.start)


def js_files():
    for d, _, fs in os.walk(SRC):
        for f in sorted(fs):
            if f.endswith('.js') and f not in SKIP: yield os.path.join(d, f)


def wrapped(src, lit):
    if lit.kind == 'tpl': return src[max(0, lit.start - 2):lit.start] == 'TR'
    return re.search(r'TR\(\s*$', src[max(0, lit.start - 8):lit.start]) is not None


def bilingual(lit):
    """the Thai side of T(X, 'ไทย', 'English') in block explanations: chosen by the explanation language"""
    return any(c in ('T', 'X.t') or c.endswith('.T') for c in lit.calls)


def data_line(src, lit):
    if bilingual(lit): return True
    a = src.rfind('\n', 0, lit.start) + 1; b = src.find('\n', lit.start)
    line = src[a:b if b >= 0 else len(src)]
    return '/* th-data */' in line or '/* th-en */' in line


def survey():
    out = []
    for f in js_files():
        src = open(f, encoding='utf-8').read()
        for lit in scan(src):
            if lit.thai: out.append((os.path.relpath(f, ROOT), lit, wrapped(src, lit), data_line(src, lit)))
    return out


def html_keys():
    """visible text and labelled attributes of src/index.html (translated in the page by PB.i18n.translateDom)"""
    s = open(os.path.join(SRC, 'index.html'), encoding='utf-8').read()
    s = re.sub(r'<script>[\s\S]*?</script>|<style>[\s\S]*?</style>|<!--[\s\S]*?-->', '', s)
    keys = set()
    for m in re.finditer(r'>([^<>]+)<', s):
        t = ' '.join(m.group(1).split())
        if TH.search(t): keys.add(t)
    for m in re.finditer(r'\b(?:title|aria-label|placeholder|content)="([^"]*)"', s):
        if TH.search(m.group(1)): keys.add(m.group(1))
    return keys


def load_en():
    s = open(os.path.join(SRC, 'i18n_en.js'), encoding='utf-8').read()
    s = s[s.index('PB.I18N_EN = ') + 13:]
    return json.loads(s[:s.rindex('}') + 1])


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'
    if cmd == 'wrap':
        f = sys.argv[2]; src = open(f, encoding='utf-8').read()
        for lit in reversed(scan(src)):
            if not lit.thai or wrapped(src, lit) or data_line(src, lit): continue
            src = src[:lit.start] + ('TR' + src[lit.start:lit.end] if lit.kind == 'tpl' else 'TR(' + src[lit.start:lit.end] + ')') + src[lit.end:]
        open(f, 'w', encoding='utf-8').write(src)
    elif cmd == 'keys':
        ks = sorted({l.key for _, l, w, d in survey() if w} | html_keys())
        print(json.dumps(ks, ensure_ascii=False, indent=0))
    elif cmd == 'list':          # unwrapped Thai strings with their place, for review
        for f, l, w, d in survey():
            if not w and not d: print(f'{f}:{l.line}: {l.key!r}')
    else:
        bad = [(f, l) for f, l, w, d in survey() if not w and not d]
        en = load_en() if os.path.exists(os.path.join(SRC, 'i18n_en.js')) else {}
        keys = {l.key for _, l, w, d in survey() if w} | html_keys()
        missing = sorted(k for k in keys if k not in en)
        badph = sorted(k for k in keys if k in en and sorted(re.findall(r'\{\d+\}', k)) != sorted(re.findall(r'\{\d+\}', en[k])))
        unused = sorted(k for k in en if k not in keys)
        for f, l in bad: print(f'not wrapped  {f}:{l.line}: {l.key!r}')
        for k in missing: print(f'no English   {k!r}')
        for k in badph: print(f'placeholders {k!r} -> {en[k]!r}')
        print(f'{len(keys)} keys · {len(bad)} unwrapped · {len(missing)} without English · {len(badph)} placeholder mismatches · {len(unused)} unused English entries')
        sys.exit(1 if bad or missing or badph else 0)
