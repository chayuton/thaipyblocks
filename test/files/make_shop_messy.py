"""Writes shop_messy.csv: a small messy shop-orders file for the cleansing tests (deterministic)."""
import csv, os, random

def rows():
    r = random.Random(7)
    out = []
    for i in range(60):
        gender = r.choice(['หญิง', 'ชาย', 'หญิง', 'ชาย', ' หญิง', 'ชาย ', '-'])
        region = r.choice(['เหนือ', 'ใต้', 'กลาง', 'อีสาน', 'กลาง ', ' ใต้'])
        channel = r.choice(['Online', 'Online', 'online', 'ONLINE', 'Store', 'store', 'Store'])
        base = r.randint(180, 2600)
        fmt = r.choice(['{:,}', '฿{:,}', '{:,} บาท', '{}', '{}'])
        amount = fmt.format(base) if r.random() > 0.06 else r.choice(['?', ''])
        qty = r.randint(1, 6) if r.random() > 0.05 else r.choice([99, 120])
        rating = '' if r.random() < 0.1 else ('N/A' if r.random() < 0.05 else f'{r.randint(5, 50) / 10:.1f}')
        coupon = r.choice(['NEW10', 'VIP']) if r.random() < 0.12 else ''
        out.append([f'S{i + 1:03d}', gender, region, channel, amount, qty, rating, coupon])
    for j in (4, 17, 33):
        out.append(list(out[j]))
    return out

if __name__ == '__main__':
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shop_messy.csv')
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['order_id', 'gender', 'region', 'channel', 'amount', 'qty', 'rating', 'coupon'])
        w.writerows(rows())
    print('wrote', path)
