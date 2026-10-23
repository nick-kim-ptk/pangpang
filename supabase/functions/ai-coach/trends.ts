// AI 대화 상대가 '오늘 날짜와 요즘 분위기'를 알게 해 주는 자료예요.
//  1) todayContext(): 날짜·요일·계절·가까운 명절/행사는 코드가 매번 자동으로 계산해요(갱신 필요 없음).
//  2) TRENDS: 요즘 화제 목록(한국·중국). 확인된 것만 짧게 적었어요. TRENDS_ASOF 날짜가 45일 넘게 지나면 AI에게 '오래된 정보'라고 알려 줘요.
//     갱신할 때는 TRENDS_ASOF 와 목록만 바꿔서 이 함수를 다시 배포하면 돼요.
export const TRENDS_ASOF = '2026-10-23';
export const TRENDS = {
  korea: [
    '넷플릭스 비영어 시리즈 1위: SBS 드라마 "닥터 X: 마피아 인 화이트"(김지원 주연, 10월 5~18일 2주 연속)',
    '넷플릭스 글로벌 1위 했던 SBS 드라마 "김 요원 재가동"(소지섭 주연, 3주 연속 1위)',
    '요즘 한국에서 드라마·예능·K팝 이야기는 거의 늘 화제',
  ],
  china: [
    '10월 국경절 연휴 극장가 1위: 범죄 수사물 영화 "Traces of Justice"(전체 박스오피스는 작년보다 줄었다는 보도)',
    '쌍십일(双十一) 쇼핑: 티몰 예약 판매 10월 15일 시작, 잔금 결제 10월 20일부터. 라이브 방송 쇼핑이 화제',
  ],
};

// 달별 가까운 행사(해마다 비슷해서 날짜 계산 없이 월 기준으로만 적었어요)
const KR_BY_MONTH: Record<number, string> = {
  1: '새해, 설 연휴 준비(설날은 음력)', 2: '설날 전후, 졸업·입학 시즌', 3: '새 학기 시작, 벚꽃 시작', 4: '벚꽃과 봄 나들이',
  5: '가정의 달(어린이날·어버이날), 초여름', 6: '여름 시작, 장마 준비', 7: '장마, 휴가철 시작', 8: '한여름 휴가, 폭염',
  9: '추석 전후(음력), 선선한 가을', 10: '단풍 시즌, 한글날(10/9), 할로윈 분위기', 11: '수능(11월 중순), 빼빼로데이(11/11), 김장 철', 12: '크리스마스, 연말 모임, 첫눈',
};
const CN_BY_MONTH: Record<number, string> = {
  1: '春节 준비, 연말 결산', 2: '春节(음력 설) 전후, 元宵节', 3: '봄 시작, 两会', 4: '清明节, 봄 나들이', 5: '五一 연휴, 母亲节',
  6: '端午节(음력 5/5), 高考(6월 초), 618 쇼핑', 7: '여름방학, 무더위', 8: '七夕(음력 7/7), 여름 끝자락', 9: '中秋节(음력 8/15), 월병, 개학',
  10: '国庆节 연휴(10/1~7), 단풍, 双十一 준비', 11: '双十一(11/11) 쇼핑, 날씨가 추워짐, 火锅 철', 12: '圣诞节, 冬至(물만두·탕위안), 연말',
};

export function todayContext(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600_000);   // 한국 시간 기준
  const m = kst.getUTCMonth() + 1;
  const season = m >= 3 && m <= 5 ? '봄' : m >= 6 && m <= 8 ? '여름' : m >= 9 && m <= 11 ? '가을' : '겨울';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const asofMs = Date.parse(TRENDS_ASOF + 'T00:00:00Z');
  const stale = !Number.isFinite(asofMs) || now.getTime() - asofMs > 45 * 86_400_000;
  return {
    today: `${kst.getUTCFullYear()}-${String(m).padStart(2, '0')}-${String(kst.getUTCDate()).padStart(2, '0')} (${days[kst.getUTCDay()]}요일, ${season})`,
    korea_now: KR_BY_MONTH[m], china_now: CN_BY_MONTH[m],
    trends: stale ? { note: '아래 목록은 오래된 정보일 수 있어요. 구체적인 작품·소식은 꺼내지 말고 날짜와 계절 이야기만 쓰세요.', ...TRENDS } : { as_of: TRENDS_ASOF, ...TRENDS },
  };
}
