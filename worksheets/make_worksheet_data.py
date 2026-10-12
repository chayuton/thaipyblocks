"""Build the two practice datasets for the K-Means / Neural Network worksheet (fixed seeds, so the files are the
same every time). Both are made-up data written for teaching; no real people or measurements.

  mall_customers.csv    200 customers of a department store: income and spending score form 5 customer groups
  seed_germination.csv  400 seed trays: seeds sprout only in a middle band of temperature AND soil moisture,
                        an oval region a straight line cannot separate (a neural network can)

  python3 worksheets/make_worksheet_data.py"""
import csv, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))

def mall():
    rng = np.random.RandomState(2026)
    #        n   income (พันบาท/เดือน)  spending score   age        share of women
    groups = [(22, 22, 5, 20, 7, 46, 12, 0.50),   # รายได้น้อย ใช้จ่ายน้อย
              (22, 24, 5, 80, 8, 25, 5, 0.60),    # รายได้น้อย ใช้จ่ายมาก (วัยรุ่น-วัยทำงานตอนต้น)
              (80, 55, 6, 50, 6, 41, 13, 0.55),   # รายได้กลาง ใช้จ่ายกลาง
              (38, 88, 9, 17, 8, 42, 10, 0.45),   # รายได้มาก ใช้จ่ายน้อย
              (38, 87, 9, 82, 7, 32, 4, 0.55)]    # รายได้มาก ใช้จ่ายมาก
    rows = []
    for n, im, isd, sm, ssd, am, asd, fem in groups:
        for _ in range(n):
            income = int(round(min(130, max(12, rng.normal(im, isd)))))
            spend = int(round(min(99, max(1, rng.normal(sm, ssd)))))
            age = int(round(min(70, max(18, rng.normal(am, asd)))))
            gender = 'หญิง' if rng.rand() < fem else 'ชาย'
            rows.append([gender, age, income, spend])
    order = rng.permutation(len(rows))
    out = [[f'C{i + 1:03d}'] + rows[j] for i, j in enumerate(order)]
    with open(os.path.join(HERE, 'mall_customers.csv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['customer_id', 'gender', 'age', 'income', 'spending'])
        w.writerows(out)
    return out

def seeds():
    rng = np.random.RandomState(23)
    rows = []
    for i in range(400):
        if rng.rand() < 0.5:                                    # half spread over all conditions, half near the good zone
            t, h = rng.uniform(10, 40), rng.uniform(10, 95)
        else:
            t, h = rng.normal(27, 5), rng.normal(60, 14)
        t = min(40, max(10, t)); h = min(95, max(10, h))
        t, h = round(t, 1), int(round(h))
        d = ((t - 27) / 7) ** 2 + ((h - 60) / 20) ** 2          # 1 on the edge of the good zone
        p = 1 / (1 + math.exp(6 * (d - 1)))
        rows.append([t, h, 'งอก' if rng.rand() < p else 'ไม่งอก'])
    with open(os.path.join(HERE, 'seed_germination.csv'), 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['temperature', 'humidity', 'germinated'])
        w.writerows(rows)
    return rows

if __name__ == '__main__':
    m, s = mall(), seeds()
    print('mall_customers.csv', len(m), 'rows · seed_germination.csv', len(s), 'rows,', sum(r[2] == 'งอก' for r in s), 'germinated')
