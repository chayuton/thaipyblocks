// Loads the ThaiPyBlocks engine into Node's global scope (same files the browser bundle uses).
const fs = require('fs');
const path = require('path');
global.window = global;
const SRC = path.join(__dirname, '..', 'src');
const FILES = ['engine/core.js', 'engine/frame.js', 'engine/ml_base.js', 'engine/clean.js', 'engine/linear.js', 'engine/tree.js', 'engine/others.js', 'engine/cluster.js', 'engine/text.js', 'engine/metrics.js', 'engine/search.js', 'engine/select.js', 'engine/textclean.js', 'engine/timeseries.js', 'engine/thai.js', 'thai_dict.js', 'engine/datasets.js', 'data.js'];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  (0, eval)(code);
}
module.exports = global.PB;
