/* ThaiPyBlocks: Blockly theme (light/dark) and the toolbox (block palette). */
(function () {
  const BK = PB.blocks, R = PB.R;
  const V = (name) => ({ name });
  function mix(hex, other, t) { const a = hex.match(/\w\w/g).map((x) => parseInt(x, 16)), b = other.match(/\w\w/g).map((x) => parseInt(x, 16)); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  const STD = { logic_blocks: '#4c6aa3', loop_blocks: '#3b7f45', math_blocks: '#5a5fc2', text_blocks: '#2a7f74', list_blocks: '#7d4cb3', variable_blocks: '#b0466f', variable_dynamic_blocks: '#b0466f', procedure_blocks: '#934aa8', colour_blocks: '#a5745b', hat_blocks: '#4c6aa3' };
  function styles() {
    const blockStyles = {};
    const add = (k, c) => { blockStyles[k] = { colourPrimary: c, colourSecondary: mix(c, '#ffffff', 0.35), colourTertiary: mix(c, '#000000', 0.25), hat: '' }; };
    for (const [k, c] of Object.entries(BK.CATS)) add('pb_' + k, c.colour);
    for (const [k, c] of Object.entries(STD)) add(k, c);
    const categoryStyles = {};
    for (const [k, c] of Object.entries(BK.CATS)) categoryStyles['c_' + k] = { colour: c.colour };
    Object.assign(categoryStyles, { c_logic: { colour: STD.logic_blocks }, c_loop: { colour: STD.loop_blocks }, c_math: { colour: STD.math_blocks }, c_text: { colour: STD.text_blocks }, c_list: { colour: STD.list_blocks }, c_var: { colour: STD.variable_blocks }, c_proc: { colour: STD.procedure_blocks }, c_models: { colour: '#5a4cc0' } });
    return { blockStyles, categoryStyles };
  }
  PB.makeThemes = () => {
    const { blockStyles, categoryStyles } = styles();
    const font = { family: '"IBM Plex Sans Thai", "Noto Sans Thai", "Leelawadee UI", system-ui, sans-serif', weight: '500', size: 11.5 };
    const light = Blockly.Theme.defineTheme('pb-light', {
      base: Blockly.Themes.Classic, blockStyles, categoryStyles, fontStyle: font, startHats: false,
      componentStyles: { workspaceBackgroundColour: '#f7f9fc', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#132132', flyoutBackgroundColour: '#edf1f6', flyoutForegroundColour: '#485869', flyoutOpacity: 0.98, scrollbarColour: '#b4bfcc', scrollbarOpacity: 0.7, insertionMarkerColour: '#2c69b0', insertionMarkerOpacity: 0.35, cursorColour: '#2c69b0', selectedGlowColour: '#f2c53d', selectedGlowOpacity: 0.7, replacementGlowColour: '#2c69b0', replacementGlowOpacity: 0.5 },
    });
    const dark = Blockly.Theme.defineTheme('pb-dark', {
      base: Blockly.Themes.Classic, blockStyles, categoryStyles, fontStyle: font, startHats: false,
      componentStyles: { workspaceBackgroundColour: '#0f161e', toolboxBackgroundColour: '#121a23', toolboxForegroundColour: '#e4ebf3', flyoutBackgroundColour: '#17212c', flyoutForegroundColour: '#a6b3c2', flyoutOpacity: 0.98, scrollbarColour: '#3a4859', scrollbarOpacity: 0.8, insertionMarkerColour: '#79aeeb', insertionMarkerOpacity: 0.35, cursorColour: '#79aeeb', selectedGlowColour: '#f2c94c', selectedGlowOpacity: 0.7, replacementGlowColour: '#79aeeb', replacementGlowOpacity: 0.5 },
    });
    return { light, dark };
  };

  /* ---------- toolbox ---------- */
  const blk = (type, fields, inputs) => Object.assign({ kind: 'block' }, R.b(type, fields || {}, inputs || {}));
  const setTo = (name, type, fields, inputs) => ({ kind: 'block', type: 'variables_set', fields: { VAR: V(name) }, inputs: { VALUE: { block: R.b(type, fields || {}, inputs || {}) } } });
  const printOf = (type, fields, inputs) => ({ kind: 'block', type: 'text_print', inputs: { TEXT: { block: R.b(type, fields || {}, inputs || {}) } } });
  const label = (text) => ({ kind: 'label', text });
  const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
  const txt = (t) => ({ shadow: { type: 'text', fields: { TEXT: t } } });
  const modelSet = (M) => ({ kind: 'block', type: 'variables_set', fields: { VAR: V(M.cls === 'PCA' ? 'pca' : 'model') }, inputs: { VALUE: { block: Object.assign(R.b(M.type), { inputs: BK.modelShadows(M.cls) }) } } });
  const models = (cat) => BK.MODELS.filter((m) => m.cat === cat).map(modelSet);
  PB.makeToolbox = () => ({
    kind: 'categoryToolbox',
    contents: [
      { kind: 'category', name: TR('ข้อมูล'), categorystyle: 'c_data', contents: [
        { kind: 'category', name: TR('โหลด & สำรวจ'), categorystyle: 'c_data', contents: [
          label(TR('โหลดข้อมูลเป็น DataFrame (pandas)')),
          setTo('df', 'pb_dataset', { NAME: 'iris' }), setTo('df', 'pb_read_file'),
          label(TR('ดูและสรุป')),
          printOf('pb_df_view', { DF: V('df'), FN: 'head', N: 5 }), printOf('pb_df_info', { DF: V('df'), FN: 'describe' }), printOf('pb_df_info', { DF: V('df'), FN: 'isnull' }), blk('pb_df_view', { DF: V('df') }), blk('pb_df_info', { DF: V('df') }), blk('pb_series_stat', { DF: V('df') }),
          label(TR('บันทึกผล')), blk('pb_to_csv', { DF: V('df') }),
        ] },
        { kind: 'category', name: TR('เลือก & กรอง'), categorystyle: 'c_data', contents: [
          blk('pb_col', { DF: V('df') }), blk('pb_cols', { DF: V('df') }), blk('pb_filter', { DF: V('df') }, { VAL: num(0) }), blk('pb_sort', { DF: V('df') }), blk('pb_groupby', { DF: V('df') }),
        ] },
        { kind: 'category', name: TR('คำนวณคอลัมน์'), categorystyle: 'c_data', contents: [
          blk('pb_set_col', { DF: V('df'), NAME: 'new_col' }), blk('pb_col_math', { DF: V('df') }, { VAL: num(2) }), blk('pb_col_func', { DF: V('df') }), blk('pb_np_func', { DF: V('df') }), blk('pb_rolling', { DF: V('df') }), blk('pb_to_datetime', { DF: V('df') }),
          label(TR('อนุกรมเวลา')), blk('pb_date_range', { DF: V('df') }), blk('pb_lags', { DF: V('df') }),
        ] },
        { kind: 'category', name: TR('ข้อความภาษาไทย'), categorystyle: 'c_other', contents: [
          label(TR('ตัดคำภาษาไทยด้วย PyThaiNLP')),
          printOf('pb_th_tokenize', { KW: 'False' }, { TEXT: txt('อาหารอร่อยมาก ส่งไวด้วย') }), /* th-data */
          printOf('pb_th_tokenize', { ENG: 'longest', KW: 'False' }, { TEXT: txt('อาหารอร่อยมาก ส่งไวด้วย') }), /* th-data */
          printOf('pb_th_subword', { FN: 'syllable', KW: 'False' }, { TEXT: txt('ประเทศไทยสวยงาม') }), printOf('pb_th_subword', { FN: 'tcc', KW: 'False' }, { TEXT: txt('ประเทศไทยสวยงาม') }), /* th-data */
          { kind: 'block', type: 'pb_set_col', fields: { DF: V('df'), NAME: 'tokens' }, inputs: { VAL: { block: R.b('pb_th_tokens', { DF: V('df'), FN: 'thai_tokenize_nostop' }) } } },
          printOf('pb_word_count', { DF: V('df'), COL: 'tokens', N: 10 }),
          blk('pb_th_tokens', { DF: V('df') }), blk('pb_cell', { DF: V('df') }),
          label(TR('ข้อความ → ตัวเลข (ใช้กับโมเดล)')),
          setTo('vectorizer', 'pb_vectorizer', { CLS: 'TfidfVectorizer', AN: 'thai', N1: 1, N2: 2 }),
        ] },
      ] },
      /* data cleansing + normalization: inspect → missing → duplicates/text/types → outliers → scaling */
      { kind: 'category', name: TR('ทำความสะอาด & ปรับสเกล'), categorystyle: 'c_clean', contents: [
        { kind: 'category', name: TR('ตรวจคุณภาพข้อมูล'), categorystyle: 'c_clean', contents: [
          label(TR('ดูปัญหาก่อนแก้ แล้วตรวจซ้ำหลังแก้')),
          printOf('pb_quality', { DF: V('df') }), printOf('pb_df_info', { DF: V('df'), FN: 'isnull' }),
          { kind: 'block', type: 'pb_print2', fields: { LABEL: TR('จำนวนแถวซ้ำ:') }, inputs: { VAL: { block: R.b('pb_df_info', { DF: V('df'), FN: 'dups' }) } } },
          printOf('pb_find_rows', { DF: V('df'), WHAT: 'dups' }), printOf('pb_find_rows', { DF: V('df'), WHAT: 'nulls' }),
          label(TR('ค่าที่พิมพ์ต่างกัน · ชนิดข้อมูล · ค่าผิดปกติ')),
          printOf('pb_series_stat', { DF: V('df'), FN: 'value_counts' }), printOf('pb_df_info', { DF: V('df'), FN: 'dtypes' }), blk('pb_plot_box_cols', { DF: V('df') }),
        ] },
        { kind: 'category', name: TR('ค่าว่าง'), categorystyle: 'c_clean', contents: [
          label(TR('ข้อความที่ใช้แทนค่าว่าง → NaN')), setTo('df', 'pb_na_values', { DF: V('df') }),
          label(TR('เติมค่าว่าง')), blk('pb_fillna', { DF: V('df') }), blk('pb_fill_value', { DF: V('df') }, { VAL: txt(TR('ไม่ทราบ')) }), blk('pb_fill_group', { DF: V('df') }), blk('pb_fill_method', { DF: V('df') }),
          label(TR('ลบแถว / คอลัมน์ที่ว่าง')), setTo('df', 'pb_df_clean', { DF: V('df'), FN: 'dropna' }), setTo('df', 'pb_dropna_cols', { DF: V('df') }), setTo('df', 'pb_drop_sparse', { DF: V('df') }),
        ] },
        { kind: 'category', name: TR('แถวซ้ำ & ข้อความ'), categorystyle: 'c_clean', contents: [
          label(TR('แถวซ้ำ')), setTo('df', 'pb_drop_dups', { DF: V('df') }), setTo('df', 'pb_df_clean', { DF: V('df'), FN: 'reset' }),
          label(TR('ข้อความที่พิมพ์ไม่ตรงกัน')), blk('pb_clean_text', { DF: V('df'), FN: 'strip' }), blk('pb_clean_text', { DF: V('df'), FN: 'title' }), blk('pb_replace_val', { DF: V('df') }, { OLD: txt('กทม'), NEW: txt('กรุงเทพ') }), blk('pb_str_replace', { DF: V('df') }), /* th-data */
          label(TR('ชื่อเดียวกันที่สะกดต่างกัน (fuzzy matching) → ดูคู่ที่คล้ายกัน แล้วแทนค่า')), printOf('pb_similar_values', { DF: V('df'), CUT: 0.8 }),
          label(TR('ชนิดข้อมูล')), blk('pb_to_numeric', { DF: V('df'), MODE: 'strip' }), blk('pb_col_func', { DF: V('df'), FN: 'float' }), blk('pb_parse_dates', { DF: V('df') }), blk('pb_to_datetime', { DF: V('df') }),
        ] },
        { kind: 'category', name: TR('ค่าผิดปกติ'), categorystyle: 'c_clean', contents: [
          label(TR('หาค่าผิดปกติ (IQR หรือ z-score)')),
          { kind: 'block', type: 'pb_print2', fields: { LABEL: TR('ขอบเขตค่าปกติ:') }, inputs: { VAL: { block: R.b('pb_outlier_bounds', { DF: V('df') }) } } },
          printOf('pb_outlier_rows', { DF: V('df') }), blk('pb_plot_box_cols', { DF: V('df') }),
          label(TR('จัดการค่าผิดปกติ')), blk('pb_outlier_fix', { DF: V('df'), ACT: 'nan' }), blk('pb_outlier_fix', { DF: V('df'), ACT: 'clip' }),
        ] },
        { kind: 'category', name: TR('ปรับสเกล (Normalize)'), categorystyle: 'c_clean', contents: [
          label(TR('ปรับหลายคอลัมน์ในตาราง (scikit-learn)')), blk('pb_scale_cols', { DF: V('df'), CLS: 'MinMaxScaler' }), blk('pb_scale_cols', { DF: V('df'), CLS: 'StandardScaler' }),
          label(TR('เขียนสูตรเอง (pandas / numpy)')),
          { kind: 'block', type: 'pb_set_col', fields: { DF: V('df'), NAME: 'scaled' }, inputs: { VAL: { block: R.b('pb_scale_formula', { FN: 'minmax', DF: V('df') }) } } },
          blk('pb_scale_formula', { FN: 'zscore', DF: V('df') }), blk('pb_np_func', { FN: 'log1p', DF: V('df') }),
          label(TR('ตรวจผลหลังปรับสเกล')), printOf('pb_df_info', { DF: V('df'), FN: 'describe' }), blk('pb_plot_box_cols', { DF: V('df') }),
          label(TR('ก่อนสร้างโมเดล: เรียนสเกลจากชุดฝึกเท่านั้น')),
          setTo('scaler', 'pb_scaler', { CLS: 'MinMaxScaler' }), setTo('X_train', 'pb_transform', { M: V('scaler'), FN: 'fit_transform', X: V('X_train') }), setTo('X_test', 'pb_transform', { M: V('scaler'), FN: 'transform', X: V('X_test') }),
        ] },
        { kind: 'category', name: TR('แปลงหมวดหมู่ & บันทึก'), categorystyle: 'c_clean', contents: [
          label(TR('หมวดหมู่ → ตัวเลข')), setTo('df', 'pb_get_dummies', { DF: V('df') }), blk('pb_label_encode', { DF: V('df') }),
          label(TR('บันทึกข้อมูลที่สะอาดแล้ว')), blk('pb_to_csv', { DF: V('df'), NAME: 'clean_data.csv' }),
        ] },
      ] },
      { kind: 'category', name: TR('เตรียมข้อมูล'), categorystyle: 'c_prep', contents: [
        label(TR('แยกฟีเจอร์ X และเป้าหมาย y')),
        setTo('X', 'pb_drop_cols', { DF: V('df') }), setTo('y', 'pb_col', { DF: V('df') }),
        blk('pb_split'),
        label(TR('ปรับสเกล / เติมค่าว่าง (scikit-learn)')),
        setTo('scaler', 'pb_scaler'), setTo('X_train', 'pb_transform', { M: V('scaler'), FN: 'fit_transform', X: V('X_train') }), setTo('X_test', 'pb_transform', { M: V('scaler'), FN: 'transform', X: V('X_test') }), blk('pb_imputer'),
        label(TR('เลือกฟีเจอร์อัตโนมัติ (SelectKBest) · ให้คะแนนจากชุดฝึกเท่านั้น')),
        setTo('selector', 'pb_selectk', { FN: 'f_classif', K: 3 }), setTo('X_train', 'pb_selectk_fit', { M: V('selector'), X: V('X_train'), Y: V('y_train') }), setTo('X_test', 'pb_transform', { M: V('selector'), FN: 'transform', X: V('X_test') }),
        printOf('pb_selectk_scores', { M: V('selector') }), blk('pb_plot_importance', { M: V('selector'), ATTR: 'scores_', X: V('X') }),
        label(TR('ต่อขั้นตอนเป็นไปป์ไลน์')),
        blk('pb_pipeline', {}, { A: { block: R.b('pb_scaler') } }), blk('pb_pipeline', {}, { A: { block: R.b('pb_selectk', { FN: 'f_classif', K: 3 }) } }), blk('pb_to_frame'),
      ] },
      { kind: 'category', name: TR('โมเดล'), categorystyle: 'c_models', contents: [
        { kind: 'category', name: TR('จำแนกประเภท'), categorystyle: 'c_cls', contents: [label(TR('Classification — ทายกลุ่ม/คลาส')), ...models('cls')] },
        { kind: 'category', name: TR('พยากรณ์ค่า'), categorystyle: 'c_reg', contents: [label(TR('Regression — ทายตัวเลข')), ...models('reg')] },
        { kind: 'category', name: TR('จัดกลุ่ม & ลดมิติ'), categorystyle: 'c_clu', contents: [label(TR('Clustering / PCA — ไม่ต้องมีคำตอบ')), ...models('clu')] },
        { kind: 'category', name: TR('ข้อความ & ค่าผิดปกติ'), categorystyle: 'c_other', contents: [label(TR('ข้อความ → ตัวเลข')), setTo('vectorizer', 'pb_vectorizer'), label(TR('หาค่าผิดปกติ')), ...models('other')] },
      ] },
      { kind: 'category', name: TR('ฝึก & ทำนาย'), categorystyle: 'c_train', contents: [
        blk('pb_fit'), blk('pb_fit_x'), setTo('y_pred', 'pb_predict', { M: V('model'), FN: 'predict', X: V('X_test') }), blk('pb_score'), blk('pb_attr'),
        label(TR('วัดผลแบบไขว้ (cross-validation)')),
        { kind: 'block', type: 'variables_set', fields: { VAR: V('scores') }, inputs: { VALUE: { block: R.b('pb_cv', {}, { M: R.get('model') }) } } },
        { kind: 'block', type: 'pb_print2', fields: { LABEL: TR('คะแนนเฉลี่ย:') }, inputs: { VAL: { block: R.b('pb_arr_stat', { FN: 'mean' }, { X: R.get('scores') }) } } },
        label(TR('หาค่าพารามิเตอร์ที่ดีที่สุด (GridSearchCV)')),
        { kind: 'block', type: 'variables_set', fields: { VAR: V('grid') }, inputs: { VALUE: { block: R.b('pb_grid', {}, { M: R.get('model') }) } } },
        blk('pb_fit', { M: V('grid'), X: V('X_train'), Y: V('y_train') }),
        { kind: 'block', type: 'pb_print2', fields: { LABEL: TR('พารามิเตอร์ที่ดีที่สุด:') }, inputs: { VAL: { block: R.b('pb_grid_attr', { G: V('grid'), ATTR: 'best_params_' }) } } },
        printOf('pb_grid_attr', { G: V('grid'), ATTR: 'cv_results_' }), blk('pb_grid_attr', { G: V('grid'), ATTR: 'best_score_' }),
        label(TR('เปรียบเทียบหลายโมเดล')),
        { kind: 'block', type: 'pb_compare', inputs: { MODELS: { block: R.list([Object.assign(R.b('pb_m_LogisticRegression'), { inputs: BK.modelShadows('LogisticRegression') }), Object.assign(R.b('pb_m_RandomForestClassifier'), { inputs: BK.modelShadows('RandomForestClassifier') })]) } } },
        { kind: 'block', type: 'pb_compare_cv', inputs: { MODELS: { block: R.list([Object.assign(R.b('pb_m_LogisticRegression'), { inputs: BK.modelShadows('LogisticRegression') }), Object.assign(R.b('pb_m_KNeighborsClassifier'), { inputs: BK.modelShadows('KNeighborsClassifier') })]) } } },
        label(TR('ใช้งานโมเดล')),
        blk('pb_predict_row'), blk('pb_predict_text'), setTo('forecast', 'pb_forecast', { DF: V('df') }),
      ] },
      { kind: 'category', name: TR('วัดผล'), categorystyle: 'c_metric', contents: [
        { kind: 'block', type: 'pb_print2', fields: { LABEL: 'Accuracy:' }, inputs: { VAL: { block: R.b('pb_metric', { FN: 'accuracy_score' }) } } },
        { kind: 'block', type: 'pb_print2', fields: { LABEL: 'R²:' }, inputs: { VAL: { block: R.b('pb_metric', { FN: 'r2_score' }) } } },
        blk('pb_metric'), printOf('pb_report'), blk('pb_silhouette'), blk('pb_arr_stat'),
      ] },
      { kind: 'category', name: TR('กราฟ'), categorystyle: 'c_viz', contents: [
        blk('pb_plot_xy', { DF: V('df'), KIND: 'scatterplot' }), blk('pb_plot_dist', { DF: V('df') }), blk('pb_plot_heat', {}, { M: { block: R.b('pb_df_info', { DF: V('df'), FN: 'corr' }) } }),
        blk('pb_plot_cm'), blk('pb_plot_pred'), blk('pb_plot_importance'), blk('pb_plot_forecast'), blk('pb_plot_list'), blk('pb_plot_images', { DF: V('df') }),
      ] },
      { kind: 'sep' },
      { kind: 'category', name: 'Python', categorystyle: 'c_pybasic', contents: [
        { kind: 'category', name: TR('แสดงผล'), categorystyle: 'c_pybasic', contents: [
          { kind: 'block', type: 'text_print', inputs: { TEXT: txt(TR('สวัสดี')) } }, { kind: 'block', type: 'pb_print2', inputs: { VAL: num(42) } }, blk('pb_comment'), blk('pb_len'), blk('pb_round'), blk('pb_type'), blk('pb_range'), blk('pb_append', {}, {}),
        ] },
        { kind: 'category', name: TR('ตรรกะ'), categorystyle: 'c_logic', contents: [blk('controls_if'), { kind: 'block', type: 'controls_if', extraState: { hasElse: true } }, blk('logic_compare'), blk('logic_operation'), blk('logic_negate'), blk('logic_boolean'), blk('logic_null'), blk('logic_ternary')] },
        { kind: 'category', name: TR('ลูป'), categorystyle: 'c_loop', contents: [
          { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } }, blk('controls_whileUntil'),
          { kind: 'block', type: 'controls_for', fields: { VAR: V('i') }, inputs: { FROM: num(1), TO: num(10), BY: num(1) } }, { kind: 'block', type: 'controls_forEach', fields: { VAR: V('item') } }, blk('controls_flow_statements'),
        ] },
        { kind: 'category', name: TR('คณิต'), categorystyle: 'c_math', contents: [
          blk('math_number', { NUM: 0 }), { kind: 'block', type: 'math_arithmetic', inputs: { A: num(1), B: num(1) } }, { kind: 'block', type: 'math_single', inputs: { NUM: num(9) } }, { kind: 'block', type: 'math_round', inputs: { NUM: num(3.1) } },
          { kind: 'block', type: 'math_on_list', fields: { OP: 'AVERAGE' } }, { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: num(64), DIVISOR: num(10) } }, { kind: 'block', type: 'math_number_property', inputs: { NUMBER_TO_CHECK: num(0) } },
          { kind: 'block', type: 'math_random_int', inputs: { FROM: num(1), TO: num(100) } }, blk('math_random_float'), blk('math_constant'), { kind: 'block', type: 'math_constrain', inputs: { VALUE: num(50), LOW: num(1), HIGH: num(100) } },
          { kind: 'block', type: 'math_change', fields: { VAR: V('i') }, inputs: { DELTA: num(1) } },
        ] },
        { kind: 'category', name: TR('ข้อความ'), categorystyle: 'c_text', contents: [
          blk('text'), blk('text_join'), { kind: 'block', type: 'text_append', fields: { VAR: V('text') }, inputs: { TEXT: txt('') } }, { kind: 'block', type: 'text_length', inputs: { VALUE: txt('abc') } }, blk('text_isEmpty'),
          { kind: 'block', type: 'text_indexOf', inputs: { FIND: txt('a') } }, { kind: 'block', type: 'text_charAt' }, { kind: 'block', type: 'text_getSubstring' }, blk('text_changeCase'), blk('text_trim'),
          { kind: 'block', type: 'text_count', inputs: { SUB: txt('a') } }, { kind: 'block', type: 'text_replace', inputs: { FROM: txt('m'), TO: txt('w') } }, blk('text_reverse'),
        ] },
        { kind: 'category', name: TR('ลิสต์'), categorystyle: 'c_list', contents: [
          blk('lists_create_empty'), blk('lists_create_with'), { kind: 'block', type: 'lists_repeat', inputs: { NUM: num(5) } }, blk('lists_length'), blk('lists_isEmpty'), blk('lists_indexOf'), blk('lists_getIndex'), blk('lists_setIndex'), blk('lists_getSublist'),
          { kind: 'block', type: 'lists_split', inputs: { DELIM: txt(',') } }, blk('lists_sort'), blk('lists_reverse'),
        ] },
        { kind: 'category', name: TR('ตัวแปร'), categorystyle: 'c_var', custom: 'VARIABLE' },
        { kind: 'category', name: TR('ฟังก์ชัน'), categorystyle: 'c_proc', custom: 'PROCEDURE' },
      ] },
    ],
  });
})();
