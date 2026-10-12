"""Messy coffee-shop membership data for the cleansing / normalization demo (synthetic people, not real).

Built to show the usual problems of real files in one small table: duplicated rows, blanks and
placeholder text ("-", "?", "ไม่ระบุ"), stray spaces, inconsistent letter case, an abbreviation
("กทม"), numbers stored as text ("1,250", "฿980", "2,300 บาท"), impossible ages (typos) and a
column that is mostly empty. The output is the same on every run."""
import csv, io, random

COLUMNS = ["member_id", "gender", "age", "province", "member_type", "visits", "monthly_spend", "satisfaction", "line_id", "renew"]
PROVINCES = [("กรุงเทพ", 34), ("เชียงใหม่", 14), ("ขอนแก่น", 11), ("ภูเก็ต", 10), ("ชลบุรี", 11)]
TYPES = [("Regular", 40), ("Silver", 25), ("Gold", 15)]
HANDLES = ["mint", "beam", "ploy", "nut", "fern", "bank", "earth", "praew", "tong", "joy", "kao", "pim"]


def _pick(rnd, pairs):
    total = sum(w for _, w in pairs)
    x = rnd.uniform(0, total)
    for v, w in pairs:
        x -= w
        if x <= 0:
            return v
    return pairs[-1][0]


def _baht(rnd, amount):
    text = f"{amount:,}"
    style = rnd.random()
    return "฿" + text if style < 0.2 else text + " บาท" if style < 0.38 else text


def build_rows():
    rnd = random.Random(2026)
    rows = []
    for i in range(80):
        member_type = _pick(rnd, TYPES)
        visits = {"Regular": rnd.randint(1, 8), "Silver": rnd.randint(5, 14), "Gold": rnd.randint(11, 20)}[member_type]
        ticket = rnd.choice([65, 75, 85, 95, 110, 120, 135])
        spend = visits * ticket + rnd.choice([0, 0, 5, 10, 15, 20, 30, 40, 55])
        satisfaction = max(1, min(5, round(rnd.gauss(3.5 + (0.5 if member_type == "Gold" else 0.0), 0.85))))
        renew = "ใช่" if visits * 0.12 + satisfaction * 0.55 + rnd.gauss(0, 0.6) > 3.2 else "ไม่"
        rows.append({
            "member_id": f"M{i + 1:03d}", "gender": rnd.choice(["ชาย", "หญิง"]), "age": str(rnd.randint(18, 60)),
            "province": _pick(rnd, PROVINCES), "member_type": member_type, "visits": str(visits),
            "monthly_spend": _baht(rnd, spend), "satisfaction": str(satisfaction),
            "line_id": "@" + rnd.choice(HANDLES) + str(rnd.randint(10, 99)) if rnd.random() < 0.15 else "", "renew": renew,
        })

    def put(col, idx, values):
        for k, v in zip(idx, values):
            rows[k][col] = v

    # stray spaces, case variants and an abbreviation in the category columns
    put("province", [0, 9, 23, 37, 52, 66], [" กรุงเทพ", "กรุงเทพ ", "เชียงใหม่ ", " ขอนแก่น", "กรุงเทพ ", "ภูเก็ต "])
    put("province", [5, 28, 44, 71], ["กทม"] * 4)
    put("member_type", [1, 14, 33, 48, 59, 75], ["gold", "GOLD", "regular", "REGULAR ", "silver", " Silver"])
    put("member_type", [0, 21], ["gold", "regular"])
    put("gender", [2, 17, 40, 61], [" ชาย", "หญิง ", "ชาย ", " หญิง"])
    # missing values: blanks and placeholder text
    put("gender", [6, 30, 55, 69, 78], [""] * 5)
    put("gender", [12, 47], ["ไม่ระบุ"] * 2)
    put("age", [3, 26, 50, 73], [""] * 4)
    put("visits", [11, 39, 64], [""] * 3)
    put("monthly_spend", [8, 35, 58], [""] * 3)
    put("monthly_spend", [4, 19, 46], ["-"] * 3)
    put("satisfaction", [0, 24, 57], ["-"] * 3)
    put("satisfaction", [15, 68], ["?"] * 2)
    # impossible ages (typing mistakes) that an outlier rule should catch
    put("age", [7, 42, 63], ["250", "199", "999"])
    # the first rows show the mess at a glance in df.head()
    put("monthly_spend", [1, 2], ["฿1,450", "2,380 บาท"])

    # five members were entered twice
    out = list(rows)
    for src, after in [(3, 10), (16, 30), (27, 45), (41, 60), (66, 76)]:
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
