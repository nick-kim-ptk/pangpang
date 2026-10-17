// Supabase 대시보드 → Project Settings → API 에서 복사해 붙여넣으세요.
// anon(공개) 키는 브라우저에 노출돼도 괜찮은 키예요. (RLS 정책이 데이터를 지켜줘요)
// 비워 두면 '미리보기 모드'로 동작하고, 기록은 이 브라우저에만 저장돼요.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://qvbxgxfdfjjwcycxqibp.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Uvcz-llc1Zc_VeaW2RbF_g_WT6VPT9X',
  // 복습 알림(웹 푸시)용 공개 키. README의 '알림 켜기' 순서대로 만든 VAPID 공개 키를 넣으세요.
  VAPID_PUBLIC_KEY: ''
};
