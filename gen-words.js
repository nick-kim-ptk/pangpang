// hsk.js + hangul.js 로 words.json(알림 서버가 쓰는 단어표)을 다시 만들어요: node gen-words.js
global.window = {}; require('./hsk.js'); require('./hangul.js');
var H = window.HSK, Hg = window.Hangul, out = {};
Object.keys(H).forEach(function (l) { out[l] = H[l].map(function (w) { return [w[0], w[1], Hg.fromPinyin(w[1]), w[2]]; }); });
require('fs').writeFileSync('words.json', JSON.stringify(out));
