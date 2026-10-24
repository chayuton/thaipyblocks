#!/bin/sh
# ThaiPyBlocks: run every test suite and check each result line. The run stops at the first suite that fails.
#
# Needs (once):  pip install -r requirements.txt   then   python3 -m playwright install chromium
#                (cd vendor && npm ci)             Blockly, SheetJS and the web fonts for the test browser (Node.js 22+)
#                qpdf and pdftoppm for pdf_test    apt install qpdf poppler-utils  /  brew install qpdf poppler
# Run from anywhere:  sh test/run_all.sh        (PYTHON=/path/to/python3 sh test/run_all.sh to choose the interpreter)
# Logs: $TMPDIR/thaipyblocks-tests/<suite>.log
set -e
cd "$(dirname "$0")/.."
PY=${PYTHON:-python3}
LOG=${TMPDIR:-/tmp}/thaipyblocks-tests
mkdir -p "$LOG"
SKIPPED=""

fail() { echo "FAILED: $1"; echo "   ---- last lines of $LOG/$2.log"; tail -40 "$LOG/$2.log" | sed 's/^/   /'; exit 1; }
# run <suite> <command…>: log the output, stop when the command exits with an error, show the result line
run() {
  name=$1; shift
  printf '== %-15s ' "$name"
  "$@" > "$LOG/$name.log" 2>&1 || fail "exit code $?" "$name"
  tail -1 "$LOG/$name.log"
}
# json <suite> <output file> <command…>: the command writes its results as JSON, messages go to the log
json() {
  name=$1; out=$2; shift 2
  printf '== %-15s ' "$name"
  "$@" > "$out" 2> "$LOG/$name.log" || fail "exit code $?" "$name"
  echo "results written ($(wc -c < "$out" | tr -d ' ') bytes)"
}
# expect <suite> <line>: the log must contain exactly this line
expect() { grep -qxF -- "$2" "$LOG/$1.log" || fail "expected the line: $2" "$1"; }
# all_passed <suite>: the last "N/M passed" (or "N/M checks passed") line has N = M
all_passed() {
  line=$(grep -E '^[0-9]+/[0-9]+ (checks )?passed' "$LOG/$1.log" | tail -1)
  n=${line%%/*}; rest=${line#*/}; m=${rest%% *}
  { [ -n "$line" ] && [ "$n" = "$m" ]; } || fail "not every check passed: ${line:-no result line}" "$1"
}

[ -d vendor/node_modules/blockly ] || { echo "vendor/node_modules is missing: run  (cd vendor && npm ci)  first"; exit 1; }
"$PY" -c 'import sys; sys.exit(sys.version_info < (3, 12))' || { echo "Python 3.12 or newer is needed ($PY is $("$PY" -V 2>&1))"; exit 1; }

run build "$PY" build.py                                  # dist/test.html is the page the browser tests open
run i18n "$PY" test/i18n_tool.py check                    # every Thai text wrapped in TR() and translated

printf '== %-15s ' ui_smoke                               # every sample project in the browser
"$PY" test/ui_smoke.py > "$LOG/ui_smoke.log" 2>&1 || fail "exit code $?" ui_smoke
if grep -qE '^   ERROR:|PAGEERROR' "$LOG/ui_smoke.log"; then fail "a sample project shows an error" ui_smoke; fi
echo "$(grep -c '^== ' "$LOG/ui_smoke.log") sample projects ran without errors"

run py_check "$PY" test/py_check.py                       # the Python code of every sample gives the same results in CPython
expect py_check "python failures: 0"
for t in upload_test wizard_modes exercises_test clean_test report_test; do
  run "$t" "$PY" "test/$t.py"; expect "$t" "failures: []"
done
if [ -f test/worksheet_test.py ]; then                  # teacher-only: the worksheet answer keys (not in the public repository)
  run worksheet_test "$PY" test/worksheet_test.py
fi
if command -v qpdf > /dev/null && command -v pdftoppm > /dev/null; then
  run pdf_test "$PY" test/pdf_test.py; all_passed pdf_test
else
  printf '== %-15s SKIPPED: install qpdf and pdftoppm (poppler) to run it\n' pdf_test; SKIPPED="$SKIPPED pdf_test"
fi
for t in ux_test start_test columns_test lang_test v38_test trend_test; do
  run "$t" "$PY" "test/$t.py"; all_passed "$t"
done
run thai_check "$PY" test/thai_check.py                   # Thai word segmentation gives the same words as PyThaiNLP

json engine_js "$LOG/js.json" node test/engine_cases.js   # the in-browser models against scikit-learn
json engine_py "$LOG/py.json" sh -c 'cd test && exec "$0" sk_ref.py' "$PY"
run engine_compare "$PY" test/compare.py "$LOG/js.json" "$LOG/py.json"
d=$(sed -n 's/^differences: //p' "$LOG/engine_compare.log" | tail -1)
# known: LogisticRegression coef_ differs at the 3rd decimal, and GradientBoosting feature_importances_ on AVX-512 machines
{ [ -n "$d" ] && [ "$d" -le 2 ]; } || fail "more than the 2 known differences from scikit-learn" engine_compare
grep '^DIFF' "$LOG/engine_compare.log" | sed 's/^/   known difference: /' || true
json search_js "$LOG/s_js.json" node test/search_cases.js # GridSearchCV / cross-validation against scikit-learn
json search_py "$LOG/s_py.json" "$PY" test/search_ref.py
run search_compare "$PY" test/compare.py "$LOG/s_js.json" "$LOG/s_py.json"
expect search_compare "differences: 0"

run pages_test "$PY" test/pages_test.py                   # the site as GitHub Pages serves it, every function
all_passed pages_test

echo "all suites passed${SKIPPED:+ (skipped:$SKIPPED)}"
