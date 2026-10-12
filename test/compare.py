# Compare engine output (JS) with scikit-learn reference output.
import json, sys, math
js = json.load(open(sys.argv[1])); py = json.load(open(sys.argv[2]))
def same(a, b, tol):
    if isinstance(a, dict) or isinstance(b, dict):
        if not (isinstance(a, dict) and isinstance(b, dict)): return False
        return all(same(a.get(k), b.get(k), tol) for k in set(a) | set(b) if not k.endswith("_ms"))
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y, tol) for x, y in zip(a, b))
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return math.isclose(a, b, rel_tol=tol, abs_tol=tol)
    return a == b
bad = 0
for k in py:
    a, b = js.get(k), py[k]
    if isinstance(b, dict):
        for kk in b:
            ok = same(a.get(kk) if isinstance(a, dict) else None, b[kk], 1e-6)
            if not ok:
                bad += 1
                av = a.get(kk) if isinstance(a, dict) else a
                print(f"DIFF {k}.{kk}\n   js={json.dumps(av, ensure_ascii=False)[:400]}\n   py={json.dumps(b[kk], ensure_ascii=False)[:400]}")
        if isinstance(a, dict) and "error" in a: print("ERROR", k, a["error"], a.get("stack", ""))
    else:
        if not same(a, b, 1e-6):
            bad += 1; print(f"DIFF {k}\n   js={json.dumps(a, ensure_ascii=False)[:300]}\n   py={json.dumps(b, ensure_ascii=False)[:300]}")
print("timings:", js.get("_time"), "total", js.get("_total_ms"))
print("differences:", bad)
