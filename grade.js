/*
 * 음성 인식 결과 채점
 * - 숫자를 한자 숫자로 바꾸고(9:05 → 九点零五分), 문장부호를 지운 뒤
 * - 질문의 must 묶음을 모두 만족하는지 확인합니다.
 */
(function () {
  var CN = '零一二三四五六七八九';

  function numToCN(n) {
    if (n < 10) return CN[n];
    if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
    if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
    return String(n).split('').map(function (d) { return CN[+d]; }).join('');
  }

  function normalize(input) {
    var s = String(input || '').toLowerCase();
    // 전각 숫자 → 반각
    s = s.replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xfee0); });
    // 9:05 → 9点05分, 2:00 → 2点
    s = s.replace(/(\d{1,2})\s*[:：]\s*(\d{2})/g, function (m, h, mi) {
      return h + '点' + (mi === '00' ? '' : mi + '分');
    });
    // 숫자 → 한자 숫자 (05 → 零五)
    s = s.replace(/\d+/g, function (m) {
      if (m.length > 1 && m[0] === '0') return '零' + numToCN(parseInt(m, 10));
      return numToCN(parseInt(m, 10));
    });
    // 공백·문장부호 제거
    s = s.replace(/[\s，。！？、,.!?;；:：'"“”‘’…—\-~·（）()]/g, '');
    return s;
  }

  function matchesMust(n, must) {
    return (must || []).every(function (group) {
      return group.some(function (w) { return n.indexOf(normalize(w)) !== -1; });
    });
  }

  // transcripts: 음성 인식 후보 문자열 배열 (신뢰도 순)
  function check(question, transcripts) {
    var list = (transcripts || []).filter(Boolean);
    if (!list.length) return { pass: false, heard: '' };
    for (var i = 0; i < list.length; i++) {
      var n = normalize(list[i]);
      if (n.length >= 2 && matchesMust(n, question.must)) {
        return { pass: true, heard: list[i] };
      }
    }
    return { pass: false, heard: list[0] };
  }

  var api = { normalize: normalize, check: check, numToCN: numToCN };
  if (typeof window !== 'undefined') window.Grade = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
