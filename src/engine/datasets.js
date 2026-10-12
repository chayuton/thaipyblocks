/* ThaiPyBlocks engine: sample dataset loading + metadata used by blocks, wizard and code generator. */
(function () {
  const SEABORN = 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/';
  PB.DATASETS = {
    iris: {
      title: TR('ดอกไอริส'), en: 'Iris flowers', rows: 150, type: 'table', url: SEABORN + 'iris.csv',
      desc: TR('ขนาดกลีบดอกและกลีบเลี้ยงของดอกไอริส 3 สายพันธุ์ (150 ดอก)'),
      tasks: {
        classification: { target: 'species', features: ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'] },
        clustering: { features: ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'], hue: 'species' },
        pca: { features: ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'], hue: 'species' },
        regression: { target: 'petal_width', features: ['sepal_length', 'sepal_width', 'petal_length'] },
        eda: { num: 'petal_length', cat: 'species', x: 'petal_length', y: 'petal_width' },
        anomaly: { features: ['sepal_length', 'sepal_width', 'petal_length', 'petal_width'], x: 'petal_length', y: 'petal_width' },
      },
    },
    penguins: {
      title: TR('นกเพนกวิน'), en: 'Palmer penguins', rows: 344, type: 'table', url: SEABORN + 'penguins.csv',
      desc: TR('ขนาดจะงอยปาก ครีบ และน้ำหนักของเพนกวิน 3 สายพันธุ์ มีค่าว่างบางแถว'),
      tasks: {
        classification: { target: 'species', features: ['island', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g', 'sex'], dropna: true, dummies: ['island', 'sex'] },
        clustering: { features: ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g'], dropna: true, hue: 'species' },
        pca: { features: ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g'], dropna: true, hue: 'species' },
        regression: { target: 'body_mass_g', features: ['species', 'island', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'sex'], dropna: true, dummies: ['species', 'island', 'sex'] },
        eda: { num: 'body_mass_g', cat: 'species', x: 'flipper_length_mm', y: 'body_mass_g' },
        anomaly: { features: ['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g'], dropna: true, x: 'flipper_length_mm', y: 'body_mass_g' },
      },
    },
    titanic: {
      title: TR('ผู้โดยสารไททานิก'), en: 'Titanic passengers', rows: 891, type: 'table', url: SEABORN + 'titanic.csv',
      desc: TR('ข้อมูลผู้โดยสารเรือไททานิก 891 คน และการรอดชีวิต มีค่าว่างในอายุและท่าเรือ'),
      tasks: {
        classification: { target: 'survived', features: ['pclass', 'sex', 'age', 'sibsp', 'parch', 'fare', 'embarked'], fill: { age: 'median' }, dropna: true, dummies: ['sex', 'embarked'] },
        regression: { target: 'fare', features: ['pclass', 'sex', 'age', 'sibsp', 'parch', 'embarked'], fill: { age: 'median' }, dropna: true, dummies: ['sex', 'embarked'] },
        clustering: { features: ['age', 'fare', 'pclass'], dropna: true, hue: 'class' },
        pca: { features: ['age', 'fare', 'pclass', 'sibsp', 'parch'], dropna: true, hue: 'class' },
        eda: { num: 'age', cat: 'class', x: 'age', y: 'fare' },
        anomaly: { features: ['age', 'fare'], dropna: true, x: 'age', y: 'fare' },
      },
    },
    tips: {
      title: TR('ทิปร้านอาหาร'), en: 'Restaurant tips', rows: 244, type: 'table', url: SEABORN + 'tips.csv',
      desc: TR('ยอดบิล ทิป และข้อมูลลูกค้าจากร้านอาหาร 244 บิล'),
      tasks: {
        regression: { target: 'tip', features: ['total_bill', 'sex', 'smoker', 'day', 'time', 'size'], dummies: ['sex', 'smoker', 'day', 'time'] },
        classification: { target: 'time', features: ['total_bill', 'tip', 'size', 'day'], dummies: ['day'] },
        clustering: { features: ['total_bill', 'tip', 'size'], hue: 'time' },
        pca: { features: ['total_bill', 'tip', 'size'], hue: 'time' },
        anomaly: { features: ['total_bill', 'tip'], x: 'total_bill', y: 'tip' },
        eda: { num: 'total_bill', cat: 'day', x: 'total_bill', y: 'tip' },
      },
    },
    mpg: {
      title: TR('อัตราสิ้นเปลืองน้ำมัน'), en: 'Car fuel economy', rows: 398, type: 'table', url: SEABORN + 'mpg.csv',
      desc: TR('สเปกรถยนต์ 398 รุ่นกับระยะทางต่อแกลลอน (mpg) มีค่าว่างใน horsepower'),
      tasks: {
        regression: { target: 'mpg', features: ['cylinders', 'displacement', 'horsepower', 'weight', 'acceleration', 'model_year', 'origin'], dropna: true, dummies: ['origin'] },
        classification: { target: 'origin', features: ['mpg', 'cylinders', 'displacement', 'horsepower', 'weight', 'acceleration'], dropna: true },
        clustering: { features: ['mpg', 'horsepower', 'weight'], dropna: true, hue: 'origin' },
        pca: { features: ['mpg', 'cylinders', 'displacement', 'horsepower', 'weight', 'acceleration'], dropna: true, hue: 'origin' },
        anomaly: { features: ['horsepower', 'weight'], dropna: true, x: 'weight', y: 'horsepower' },
        eda: { num: 'mpg', cat: 'origin', x: 'weight', y: 'mpg' },
      },
    },
    flights: {
      title: TR('ผู้โดยสารสายการบิน'), en: 'Airline passengers', rows: 144, type: 'timeseries', url: SEABORN + 'flights.csv',
      desc: TR('จำนวนผู้โดยสารสายการบินรายเดือน ปี 1949–1960 (144 เดือน)'),
      tasks: { forecast: { value: 'passengers', start: '1949-01', freq: 'MS', lags: 12 }, trend: { value: 'passengers', start: '1949-01', freq: 'MS', window: 12 } },
    },
    thai_reviews: {
      title: TR('รีวิวสินค้าภาษาไทย'), en: 'Thai reviews', rows: 120, type: 'text', url: null,
      desc: TR('ข้อความรีวิวภาษาไทย 120 รายการ (บวก/ลบ) เขียนขึ้นเป็นตัวอย่างสำหรับสาธิต'),
      tasks: { text_classification: { text: 'text', target: 'label' }, text_clustering: { text: 'text', hue: 'label' } },
    },
    digits: {
      title: TR('ภาพตัวเลขลายมือ'), en: 'Handwritten digits', rows: 1797, type: 'image', url: null,
      desc: TR('ภาพตัวเลข 0–9 ขนาด 8×8 พิกเซล 1,797 ภาพ (ค่าความเข้ม 0–16)'),
      tasks: { image_classification: { target: 'target' }, image_pca: { target: 'target' } },
    },
    /* embedded: the Python code builds it from the CSV text (helper load_coffee_members) */
    coffee: {
      title: TR('สมาชิกร้านกาแฟ (ข้อมูลสกปรก)'), en: 'Coffee shop members (messy)', rows: 85, type: 'table', url: null, embed: 'load_coffee_members',
      desc: TR('ข้อมูลสมมติของสมาชิกร้านกาแฟ 85 แถวที่ยังไม่ได้ทำความสะอาด: มีแถวซ้ำ ค่าว่างและข้อความแทนค่าว่าง ("-", "?", "ไม่ระบุ") ช่องว่างเกิน ตัวพิมพ์ไม่ตรงกัน ตัวเลขที่เก็บเป็นข้อความ ("฿1,450", "2,380 บาท") อายุที่พิมพ์ผิด (199, 250, 999) และคอลัมน์ที่ว่างเกือบทั้งหมด'),
      tasks: {
        clean: { replace: [{ col: 'province', old: 'กทม', new: 'กรุงเทพ' }], outliers: { action: 'nan', cols: ['age'] }, missing: { num: 'median', cat: 'unknown' }, scale: { method: 'minmax', cols: ['age', 'visits', 'monthly_spend'] } }, /* th-data */
        eda: { num: 'age', cat: 'province', x: 'visits', y: 'age' },
      },
    },
    /* version 3.8: names spelled several ways and dates typed in many formats (helper load_shop_orders) */
    orders: {
      title: TR('คำสั่งซื้อร้านออนไลน์ (ข้อมูลสกปรก)'), en: 'Online shop orders (messy)', rows: 75, type: 'table', url: null, embed: 'load_shop_orders',
      desc: TR('ข้อมูลสมมติของคำสั่งซื้อ 75 แถว: ชื่อจังหวัด หมวดสินค้า และวิธีชำระเงินที่สะกดผิดหรือเขียนหลายแบบ ("เชียงไหม่", "ขอนเเก่น", "Electornics") วันที่สั่งซื้อที่พิมพ์หลายรูปแบบ (2026-01-15, 15/1/2569, 15 ม.ค. 2569, Jan 15, 2026) ค่าว่าง ยอดเงินที่เป็นข้อความ และแถวซ้ำ'),
      tasks: {
        clean: { replace: [{ col: 'province', old: 'กทม', new: 'กรุงเทพ' }, { col: 'province', old: 'กรุงเทพมหานคร', new: 'กรุงเทพ' }], missing: { num: 'median', cat: 'mode' } }, /* th-data */
        eda: { num: 'qty', cat: 'category' },
      },
    },
  };
  const cache = new Map();
  PB.loadSample = (name) => {
    if (!PB.DATASETS[name]) throw PB.err('ValueError', `Unknown dataset ${PB.repr(name)}`, TR`ไม่รู้จักชุดข้อมูล '${name}'`);
    if (!cache.has(name)) {
      let df;
      if (name === 'digits') {
        const { pixels, target } = PB.RAW.digits; const n = target.length; const m = new Map();
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const j = r * 8 + c; m.set(`pixel_${r}_${c}`, { values: PB.range(n).map((i) => pixels.charCodeAt(i * 64 + j) - 65), dtype: 'float64' }); }
        m.set('target', { values: Array.from(target, Number), dtype: 'int64' });
        df = new PB.DataFrame(m);
      } else df = PB.readCSV(PB.RAW[name]);
      cache.set(name, df);
    }
    return cache.get(name).copy();
  };
})();
