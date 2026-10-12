"""Messy online-shop orders for the cleansing demo of version 3.8 (synthetic orders, not real).

Shows the two problems the cleaning assistant learned in 3.8, next to a few familiar ones:
- the same name written in several ways: typing mistakes ("เชียงไหม่", "Electornics"), a doubled
  vowel or "เ" + "เ" typed instead of "แ" ("ขอนเเก่น", "นครราชสีมาา"), an extra "ฯ" ("กรุงเทพฯ"), and
  abbreviations that no spelling rule can catch ("กทม", "กรุงเทพมหานคร")
- order dates typed in many formats: 2026-01-15, 15/01/2026, 15/1/2569 (Buddhist year),
  15 ม.ค. 2569, 15 มกราคม 2569, Jan 15, 2026, 15 Jan 2026, 2026/01/15, plus an impossible 31/02/2026
- blanks and "-", amounts with commas and "บาท", and three orders entered twice
The output is the same on every run."""
import csv, datetime, io, random

COLUMNS = ["order_id", "order_date", "province", "category", "payment", "qty", "amount"]
PROVINCES = [("กรุงเทพ", 30), ("เชียงใหม่", 14), ("ขอนแก่น", 10), ("นครราชสีมา", 9), ("ชลบุรี", 9), ("ภูเก็ต", 8), ("สงขลา", 7)]
CATEGORIES = [("Electronics", 26), ("Fashion", 22), ("Home", 18), ("Beauty", 14), ("Books", 10)]
PAYMENTS = [("โอนเงิน", 40), ("บัตรเครดิต", 30), ("เก็บเงินปลายทาง", 25)]
PRICE = {"Electronics": (590, 4900), "Fashion": (190, 1590), "Home": (150, 2400), "Beauty": (120, 990), "Books": (95, 650)}
TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
TH_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _pick(rnd, pairs):
    total = sum(w for _, w in pairs)
    x = rnd.uniform(0, total)
    for v, w in pairs:
        x -= w
        if x <= 0:
            return v
    return pairs[-1][0]


def _date_text(rnd, d):
    """one order date in one of the formats people type"""
    style = _pick(rnd, [("iso", 30), ("dmy", 20), ("dmy_be", 10), ("th_short", 12), ("th_full", 6), ("en_mdy", 8), ("en_dmy", 6), ("ymd_slash", 8)])
    be = d.year + 543
    if style == "iso":
        return d.isoformat()
    if style == "dmy":
        return f"{d.day:02d}/{d.month:02d}/{d.year}"
    if style == "dmy_be":
        return f"{d.day}/{d.month}/{be}"
    if style == "th_short":
        return f"{d.day} {TH_MONTHS[d.month - 1]} {be}"
    if style == "th_full":
        return f"{d.day} {TH_MONTHS_FULL[d.month - 1]} {be}"
    if style == "en_mdy":
        return f"{EN_MONTHS[d.month - 1]} {d.day}, {d.year}"
    if style == "en_dmy":
        return f"{d.day} {EN_MONTHS[d.month - 1]} {d.year}"
    return f"{d.year}/{d.month:02d}/{d.day:02d}"


def build_rows():
    rnd = random.Random(38)
    start = datetime.date(2026, 1, 3)
    rows = []
    for i in range(72):
        d = start + datetime.timedelta(days=i * 2 + rnd.randint(0, 1))
        cat = _pick(rnd, CATEGORIES)
        lo, hi = PRICE[cat]
        qty = rnd.choice([1, 1, 1, 2, 2, 3])
        amount = qty * (rnd.randint(lo // 10, hi // 10) * 10 - 1 if rnd.random() < 0.5 else rnd.randint(lo // 10, hi // 10) * 10)
        rows.append({
            "order_id": f"A{i + 1:03d}", "order_date": _date_text(rnd, d), "province": _pick(rnd, PROVINCES),
            "category": cat, "payment": _pick(rnd, PAYMENTS), "qty": str(qty), "amount": str(amount),
        })

    def put(col, idx, values):
        for k, v in zip(idx, values):
            rows[k][col] = v

    # the same province written differently: spelling mistakes the assistant can match by similarity …
    put("province", [3, 27], ["กรุงเทพฯ", "กรุงเทพฯ"])
    put("province", [8, 40], ["เชียงไหม่", "เชียงใหม่ "])
    put("province", [12, 55], ["ขอนเเก่น", "ขอนเเก่น"])
    put("province", [19], ["นครราชสีมาา"])
    put("province", [33], ["สงขา"])
    put("province", [46], ["ภูเก็ด"])
    # … and abbreviations that need a rule (the dataset preset)
    put("province", [5, 22, 61], ["กทม", "กทม", "กทม"])
    put("province", [15, 50], ["กรุงเทพมหานคร", "กรุงเทพมหานคร"])
    # category and payment typos
    put("category", [6, 36], ["Electornics", "Electronic"])
    put("category", [18, 58], ["fashion", "Fashoin"])
    put("category", [29], ["Beuaty"])
    put("payment", [10, 44], ["บัตรเครดิด", "เก็บเงินปลายทา"])
    # dates: an impossible day and blanks
    put("order_date", [24], ["31/02/2026"])
    put("order_date", [38, 66], ["", "-"])
    # missing and text amounts
    put("amount", [9, 48], ["", "-"])
    put("amount", [1, 31, 63], ["1,290", "2,450 บาท", "฿890"])
    put("qty", [52], [""])

    # three orders were entered twice
    out = list(rows)
    for src, after in [(4, 11), (30, 35), (57, 64)]:
        pos = out.index(rows[after]) + 1
        out.insert(pos, dict(rows[src]))
    return out


def csv_text():
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    w.writeheader()
    for r in build_rows():
        w.writerow(r)
    text = buf.getvalue()
    assert '"""' not in text and "\\" not in text
    return text


if __name__ == "__main__":
    print(csv_text())
