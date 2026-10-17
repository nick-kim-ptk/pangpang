/*
 * 변형 문제 만들기
 *   원래 문제의 단어 하나를 같은 종류의 단어로 바꿔서(예: 咖啡 → 茶) 비슷한 문제를 만들어요.
 *   중국어·병음·한국어 뜻·정답 문장·판정 기준(must)을 함께 바꾸고, 하나라도 맞지 않으면 만들지 않아요.
 *   변형은 원문과 같은 id를 써서 진도·복습 기록은 원문 문제 기준으로 쌓여요.
 */
(function () {
  // proper: 병음이 늘 대문자로 시작하는 말 / only: 이 레슨에서만 / avoid: 이 말이 있으면 안 바꿈 / needs: 이 글자가 있어야 바꿈
  var GROUPS = [
    { id: 'drink', words: [['咖啡', 'kāfēi', '커피'], ['茶', 'chá', '차'], ['牛奶', 'niúnǎi', '우유'], ['果汁', 'guǒzhī', '주스']], ban: ['咖啡馆', '咖啡厅', '中国茶'] },
    { id: 'fruit', words: [['苹果', 'píngguǒ', '사과'], ['香蕉', 'xiāngjiāo', '바나나'], ['西瓜', 'xīguā', '수박']] },
    { id: 'meal', avoid: ['点', '半', '早上', '晚上'], words: [['早饭', 'zǎofàn', '아침'], ['午饭', 'wǔfàn', '점심'], ['晚饭', 'wǎnfàn', '저녁']] },
    { id: 'when', avoid: ['点', '半', '早饭', '午饭', '晚饭'], words: [['早上', 'zǎoshang', '아침'], ['晚上', 'wǎnshang', '저녁']] },
    { id: 'lang', proper: true, avoid: ['中国', '日本', '韩国'], words: [['汉语', 'Hànyǔ', '중국어'], ['英语', 'Yīngyǔ', '영어'], ['日语', 'Rìyǔ', '일본어']] },
    { id: 'country', proper: true, avoid: ['汉语', '英语', '日语'], words: [['中国', 'Zhōngguó', '중국'], ['日本', 'Rìběn', '일본'], ['韩国', 'Hánguó', '한국']] },
    { id: 'city', proper: true, words: [['北京', 'Běijīng', '베이징'], ['上海', 'Shànghǎi', '상하이']] },
    { id: 'thing', only: ['ba', 'result', 'passive'], words: [['手机', 'shǒujī', '휴대폰'], ['钥匙', 'yàoshi', '열쇠'], ['钱包', 'qiánbāo', '지갑']] },
    { id: 'person', words: [['朋友', 'péngyou', '친구'], ['同事', 'tóngshì', '동료']] },
    { id: 'place', needs: ['去', '比'], words: [['公司', 'gōngsī', '회사'], ['医院', 'yīyuàn', '병원'], ['银行', 'yínháng', '은행']] }
  ];
  // 오늘/어제/내일 같은 날짜 말은 정답(날짜·시제)과 얽혀서 바꾸지 않아요.

  var JOSA = [['을', '를'], ['이', '가'], ['은', '는'], ['과', '와']];

  function hasBatchim(ch) {
    var c = ch.charCodeAt(0);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  }
  function isHangul(ch) { return !!ch && ch.charCodeAt(0) >= 0xac00 && ch.charCodeAt(0) <= 0xd7a3; }
  function count(s, w) { return s.split(w).length - 1; }

  // 한국어: 단어를 바꾸고 바로 뒤의 조사(을/를 등)를 받침에 맞게 고쳐요.
  function swapKo(text, from, to) {
    var out = '', i = 0;
    while (i < text.length) {
      if (text.substr(i, from.length) === from) {
        out += to;
        i += from.length;
        var nx = text.charAt(i), after = text.charAt(i + 1);
        if (nx && !isHangul(after)) {
          for (var k = 0; k < JOSA.length; k++) {
            if (nx === JOSA[k][0] || nx === JOSA[k][1]) {
              out += hasBatchim(to.charAt(to.length - 1)) ? JOSA[k][0] : JOSA[k][1];
              i++;
              break;
            }
          }
        }
      } else { out += text.charAt(i); i++; }
    }
    return out;
  }
  var LETTER = /[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/;
  // 병음: 단어 경계를 지켜서 바꿔요. (chá 가 cháng 안에서 바뀌면 안 되니까요)
  function swapPy(text, from, to, proper) {
    var low = text.toLowerCase(), f = from.toLowerCase(), out = '', i = 0, hit = 0;
    while (i < text.length) {
      if (low.substr(i, f.length) === f) {
        var prev = text.charAt(i - 1), next = text.charAt(i + f.length);
        var okPrev = !prev || !LETTER.test(prev);
        var okNext = !next || !/[ngr]/i.test(next);
        if (okPrev && okNext) {
          var cap = text.charAt(i) !== text.charAt(i).toLowerCase();
          out += proper ? to : (cap ? to.charAt(0).toUpperCase() + to.slice(1) : to);
          i += f.length; hit++;
          continue;
        }
      }
      out += text.charAt(i); i++;
    }
    return { text: out, hit: hit };
  }

  function swapField(zh, py, ko, w, t, proper) {
    var n = count(zh, w[0]);
    if (n === 0) return { ok: true, zh: zh, py: py, ko: ko, changed: false };
    var p = swapPy(py, w[1], t[1], proper);
    if (p.hit !== n) return { ok: false };
    if (count(ko, w[2]) < 1) return { ok: false };
    return { ok: true, zh: zh.split(w[0]).join(t[0]), py: p.text, ko: swapKo(ko, w[2], t[2]), changed: true };
  }
  function swapMust(must, w, t) {
    return (must || []).map(function (g) {
      return g.map(function (x) { return x === w[0] ? t[0] : x; });
    });
  }

  function build(q, g, wi, ti) {
    var w = g.words[wi], t = g.words[ti];
    if (g.only && g.only.indexOf(q.lessonId) < 0) return null;
    if (g.skip && g.skip.indexOf(q.lessonId) >= 0) return null;
    var all = q.zh + q.a.zh;
    if (g.ban && g.ban.some(function (b) { return all.indexOf(b) >= 0; })) return null;
    if (g.avoid && g.avoid.some(function (b) { return all.indexOf(b) >= 0; })) return null;
    if (g.needs && !g.needs.some(function (b) { return all.indexOf(b) >= 0; })) return null;
    // 같은 종류의 다른 단어가 이미 들어 있으면 헷갈리니 건너뜀 (예: 苹果比香蕉)
    for (var k = 0; k < g.words.length; k++) if (k !== wi && all.indexOf(g.words[k][0]) >= 0) return null;
    var a = swapField(q.zh, q.py, q.ko, w, t, g.proper);
    var b = swapField(q.a.zh, q.a.py, q.a.ko, w, t, g.proper);
    if (!a.ok || !b.ok || (!a.changed && !b.changed)) return null;
    // 단어가 질문에 있는데 판정 기준(must)에만 쓰이면 함께 바뀌어야 해요.
    return {
      id: q.id, lessonId: q.lessonId, variant: true,
      zh: a.zh, py: a.py, ko: a.ko,
      a: { zh: b.zh, py: b.py, ko: b.ko },
      must: swapMust(q.must, w, t)
    };
  }

  var cache = {};
  function variantsOf(q) {
    if (cache[q.id]) return cache[q.id];
    var list = [];
    GROUPS.forEach(function (g) {
      for (var wi = 0; wi < g.words.length; wi++) {
        if ((q.zh + q.a.zh).indexOf(g.words[wi][0]) < 0) continue;
        for (var ti = 0; ti < g.words.length; ti++) {
          if (ti === wi) continue;
          var v = build(q, g, wi, ti);
          if (v) list.push(v);
        }
      }
    });
    cache[q.id] = list;
    return list;
  }
  function all(q) { return [q].concat(variantsOf(q)); }
  function make(q) {
    var v = variantsOf(q);
    return v.length ? v[Math.floor(Math.random() * v.length)] : q;
  }

  var api = { variantsOf: variantsOf, all: all, make: make, GROUPS: GROUPS };
  if (typeof window !== 'undefined') window.Variants = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
