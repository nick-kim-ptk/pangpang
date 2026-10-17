/*
 * 병음 → 한글 독음 (초보자용 근사 표기)
 *   Nǐ xǐhuan hē kāfēi ma?  →  니 시환 허 카페이 마?
 * 병음만 적어 두면 레슨 화면에서 자동으로 한글 독음이 붙어요.
 * 성조와 정확한 발음은 병음 표기와 음성(🔊)으로 확인해 주세요.
 */
(function () {
  var LEAD = { g: 0, n: 2, d: 3, l: 5, m: 6, b: 7, s: 9, '': 11, j: 12, z: 13, c: 14, k: 15, t: 16, p: 17, h: 18 };
  // 병음 초성 → 한글 초성 인덱스
  var INIT_L = {
    b: 7, p: 17, m: 6, f: 17, d: 3, t: 16, n: 2, l: 5, g: 0, k: 15, h: 18,
    j: 12, q: 14, x: 9, zh: 12, ch: 14, sh: 9, r: 5, z: 13, c: 14, s: 10, '': 11
  };
  var INITS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's'];
  var FINALS = ['a', 'o', 'e', 'ai', 'ei', 'ao', 'ou', 'an', 'en', 'ang', 'eng', 'ong',
    'i', 'ia', 'ie', 'iao', 'iu', 'ian', 'in', 'iang', 'ing', 'iong',
    'u', 'ua', 'uo', 'uai', 'ui', 'uan', 'un', 'uang', 'ue',
    'ü', 'üe', 'üan', 'ün'];
  var ZERO = { a: '아', o: '오', e: '어', ai: '아이', ei: '에이', ao: '아오', ou: '어우', an: '안', en: '언', ang: '앙', eng: '엉', er: '얼',
    yi: '이', ya: '야', ye: '예', yao: '야오', you: '요우', yan: '옌', yin: '인', yang: '양', ying: '잉', yong: '용',
    yu: '위', yue: '위에', yuan: '위엔', yun: '윈',
    wu: '우', wa: '와', wo: '워', wai: '와이', wei: '웨이', wan: '완', wen: '원', wang: '왕', weng: '웡' };

  function compose(l, v, t) { return String.fromCharCode(0xac00 + (l * 21 + v) * 28 + (t || 0)); }

  var TONES = {
    'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a', 'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
    'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i', 'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
    'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u', 'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü', 'v': 'ü'
  };
  function strip(s) {
    return s.toLowerCase().replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜv]/g, function (c) { return TONES[c]; });
  }

  // 쓰는 그대로의 음절 → [초성, 운모]
  var SYL = {};
  Object.keys(ZERO).forEach(function (k) { SYL[k] = ['!', k]; });
  INITS.forEach(function (ini) {
    FINALS.forEach(function (fin) { if (!SYL[ini + fin]) SYL[ini + fin] = [ini, fin]; });
  });

  function seg(s, memo) {
    if (s === '') return [];
    if (memo[s] !== undefined) return memo[s];
    var out = null;
    if (s === 'r') out = [['#', '']];  // 얼화(儿) 표시
    for (var len = Math.min(6, s.length); len >= 1 && !out; len--) {
      var head = s.slice(0, len);
      if (SYL[head]) {
        var rest = seg(s.slice(len), memo);
        if (rest) out = [SYL[head]].concat(rest);
      }
    }
    memo[s] = out;
    return out;
  }

  function syllable(ini, fin) {
    if (ini === '!') return ZERO[fin];
    var l = INIT_L[ini];
    if (/^[jqx]$/.test(ini) && fin.charAt(0) === 'u') fin = 'ü' + fin.slice(1); // ju → jü
    if (fin === 'ue') fin = 'üe';
    var sh = ini === 'sh';
    var retro = /^(zh|ch|sh|r|z|c|s)$/.test(ini);
    switch (fin) {
      case 'a': return compose(l, 0);
      case 'o': return compose(l, 8);
      case 'e': return compose(l, sh ? 6 : 4);
      case 'ai': return compose(l, 0) + '이';
      case 'ei': return compose(l, 5) + '이';
      case 'ao': return compose(l, 0) + '오';
      case 'ou': return compose(l, 4) + '우';
      case 'an': return compose(l, 0, 4);
      case 'en': return compose(l, sh ? 6 : 4, 4);
      case 'ang': return compose(l, 0, 21);
      case 'eng': return compose(l, sh ? 6 : 4, 21);
      case 'ong': return compose(l, 13, 21);
      case 'i': return compose(l, retro ? 18 : 20);
      case 'ia': return compose(l, 20) + '아';
      case 'ie': return compose(l, 20) + '에';
      case 'iao': return compose(l, 20) + '아오';
      case 'iu': return compose(l, 20) + '우';
      case 'ian': return compose(l, 20) + '엔';
      case 'in': return compose(l, 20, 4);
      case 'iang': return compose(l, 20) + '앙';
      case 'ing': return compose(l, 20, 21);
      case 'iong': return compose(l, 20) + '옹';
      case 'u': return compose(l, 13);
      case 'ua': return compose(l, 9);
      case 'uo': return compose(l, 14);
      case 'uai': return compose(l, 9) + '이';
      case 'ui': return compose(l, 13) + '이';
      case 'uan': return compose(l, 9, 4);
      case 'un': return compose(l, 13, 4);
      case 'uang': return compose(l, 9, 21);
      case 'ü': return compose(l, 16);
      case 'üe': return compose(l, 16) + '에';
      case 'üan': return compose(l, 16) + '엔';
      case 'ün': return compose(l, 16, 4);
    }
    return '';
  }

  function word(run) {
    var parts = seg(strip(run), {});
    if (!parts) return null;
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p[0] === '#') { // 얼화: 앞 음절에 ㄹ 받침을 붙임
        var last = out.charCodeAt(out.length - 1);
        if (out && last >= 0xac00 && (last - 0xac00) % 28 === 0) {
          out = out.slice(0, -1) + String.fromCharCode(last + 8);
        } else { out += '르'; }
      } else {
        out += syllable(p[0], p[1]);
      }
    }
    return out;
  }

  var RUN = /[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+/g;
  function fromPinyin(py) {
    return String(py || '').replace(RUN, function (run) {
      var w = word(run);
      return w === null ? run : w;
    }).replace(/['’]/g, '');
  }

  var api = { fromPinyin: fromPinyin };
  if (typeof window !== 'undefined') window.Hangul = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
