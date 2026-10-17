/*
 * 상황 대화 연습 — 상대방 말(zh)에 내가 대답(a)하는 짧은 대화예요.
 * must: 대답에 꼭 들어가야 하는 표현 묶음(묶음마다 하나만 말해도 됨). 마음대로 추가·수정해도 돼요.
 */
(function () {
  var DIALOGS = [
    {
      id: 'meet', title: '처음 만났을 때', intro: '새 친구와 처음 인사해요',
      turns: [
        { zh: '你好！我叫王明，你叫什么名字？', py: 'Nǐ hǎo! Wǒ jiào Wáng Míng, nǐ jiào shénme míngzi?', ko: '안녕하세요! 저는 왕밍이에요, 이름이 뭐예요?',
          a: { zh: '你好！我叫金民秀。', py: 'Nǐ hǎo! Wǒ jiào Jīn Mínxiù.', ko: '안녕하세요! 저는 김민수예요.' }, must: [['我叫', '我是', '叫']] },
        { zh: '你是哪国人？', py: 'Nǐ shì nǎ guó rén?', ko: '어느 나라 사람이에요?',
          a: { zh: '我是韩国人。', py: 'Wǒ shì Hánguó rén.', ko: '저는 한국 사람이에요.' }, must: [['韩国']] },
        { zh: '你会说汉语吗？', py: 'Nǐ huì shuō Hànyǔ ma?', ko: '중국어 할 줄 알아요?',
          a: { zh: '我会说一点儿。', py: 'Wǒ huì shuō yìdiǎnr.', ko: '조금 할 줄 알아요.' }, must: [['会', '一点']] },
        { zh: '认识你很高兴！', py: 'Rènshi nǐ hěn gāoxìng!', ko: '만나서 반가워요!',
          a: { zh: '认识你我也很高兴。', py: 'Rènshi nǐ wǒ yě hěn gāoxìng.', ko: '저도 만나서 반가워요.' }, must: [['高兴', '开心']] }
      ]
    },
    {
      id: 'restaurant', title: '식당에서 주문', intro: '식당에서 음식을 주문해요',
      turns: [
        { zh: '欢迎光临！几位？', py: 'Huānyíng guānglín! Jǐ wèi?', ko: '어서 오세요! 몇 분이세요?',
          a: { zh: '我们两个人。', py: 'Wǒmen liǎng ge rén.', ko: '두 명이에요.' }, must: [['两', '二', '2']] },
        { zh: '您想吃什么？', py: 'Nín xiǎng chī shénme?', ko: '뭘 드시겠어요?',
          a: { zh: '我要一碗面条。', py: 'Wǒ yào yì wǎn miàntiáo.', ko: '국수 한 그릇 주세요.' }, must: [['要', '想'], ['面']] },
        { zh: '要不要辣的？', py: 'Yào bu yào là de?', ko: '매운 걸로 드릴까요?',
          a: { zh: '不要太辣，谢谢。', py: 'Búyào tài là, xièxie.', ko: '너무 맵지 않게 해 주세요, 감사합니다.' }, must: [['不要', '不辣', '不太辣', '别太辣', '少辣']] },
        { zh: '还需要别的吗？', py: 'Hái xūyào bié de ma?', ko: '다른 건 더 필요하세요?',
          a: { zh: '不用了，买单。', py: 'Búyòng le, mǎidān.', ko: '괜찮아요, 계산해 주세요.' }, must: [['买单', '结账', '不用', '不需要']] }
      ]
    },
    {
      id: 'cafe', title: '카페에서 주문', intro: '커피를 주문해요',
      turns: [
        { zh: '你好，想喝点儿什么？', py: 'Nǐ hǎo, xiǎng hē diǎnr shénme?', ko: '안녕하세요, 뭐 드시겠어요?',
          a: { zh: '我要一杯咖啡。', py: 'Wǒ yào yì bēi kāfēi.', ko: '커피 한 잔 주세요.' }, must: [['咖啡', '拿铁', '美式']] },
        { zh: '热的还是冰的？', py: 'Rè de háishi bīng de?', ko: '뜨거운 걸로요, 아이스로요?',
          a: { zh: '我要冰的。', py: 'Wǒ yào bīng de.', ko: '아이스로 주세요.' }, must: [['冰', '热']] },
        { zh: '要大杯还是中杯？', py: 'Yào dà bēi háishi zhōng bēi?', ko: '큰 컵으로요, 중간 컵으로요?',
          a: { zh: '大杯，谢谢。', py: 'Dà bēi, xièxie.', ko: '큰 컵으로 주세요, 감사합니다.' }, must: [['大', '中']] },
        { zh: '在这儿喝还是带走？', py: 'Zài zhèr hē háishi dàizǒu?', ko: '여기서 드세요, 가져가세요?',
          a: { zh: '我在这儿喝。', py: 'Wǒ zài zhèr hē.', ko: '여기서 마실게요.' }, must: [['这儿', '这里', '带走', '打包']] }
      ]
    },
    {
      id: 'directions', title: '길 묻기', intro: '지나가는 사람에게 길을 물어요',
      turns: [
        { zh: '你好，需要帮忙吗？', py: 'Nǐ hǎo, xūyào bāngmáng ma?', ko: '안녕하세요, 도움이 필요하세요?',
          a: { zh: '请问，地铁站在哪儿？', py: 'Qǐngwèn, dìtiězhàn zài nǎr?', ko: '실례지만 지하철역이 어디예요?' }, must: [['地铁'], ['哪']] },
        { zh: '一直往前走，然后在路口左拐。', py: 'Yìzhí wǎng qián zǒu, ránhòu zài lùkǒu zuǒ guǎi.', ko: '곧장 가다가 사거리에서 좌회전하세요.',
          a: { zh: '离这儿远吗？', py: 'Lí zhèr yuǎn ma?', ko: '여기서 멀어요?' }, must: [['远']] },
        { zh: '不太远，走路大概五分钟。', py: 'Bú tài yuǎn, zǒulù dàgài wǔ fēnzhōng.', ko: '별로 안 멀어요, 걸어서 5분쯤이에요.',
          a: { zh: '好的，谢谢你。', py: 'Hǎo de, xièxie nǐ.', ko: '네, 감사합니다.' }, must: [['谢谢', '多谢']] },
        { zh: '不客气，再见！', py: 'Bú kèqi, zàijiàn!', ko: '천만에요, 안녕히 가세요!',
          a: { zh: '再见！', py: 'Zàijiàn!', ko: '안녕히 계세요!' }, must: [['再见', '拜拜']] }
      ]
    },
    {
      id: 'shopping', title: '쇼핑하며 가격 묻기', intro: '가게에서 물건을 사요',
      turns: [
        { zh: '欢迎！您想买什么？', py: 'Huānyíng! Nín xiǎng mǎi shénme?', ko: '어서 오세요! 뭘 사고 싶으세요?',
          a: { zh: '我想看看这件衣服。', py: 'Wǒ xiǎng kànkan zhè jiàn yīfu.', ko: '이 옷을 좀 보고 싶어요.' }, must: [['衣服', '这件', '看看']] },
        { zh: '可以，您可以试试。', py: 'Kěyǐ, nín kěyǐ shìshi.', ko: '네, 입어 보셔도 돼요.',
          a: { zh: '这件多少钱？', py: 'Zhè jiàn duōshao qián?', ko: '이건 얼마예요?' }, must: [['多少钱', '多少', '几']] },
        { zh: '三百块。', py: 'Sānbǎi kuài.', ko: '300위안이에요.',
          a: { zh: '太贵了，可以便宜一点儿吗？', py: 'Tài guì le, kěyǐ piányi yìdiǎnr ma?', ko: '너무 비싸요, 좀 깎아 주실 수 있나요?' }, must: [['贵', '便宜']] },
        { zh: '好吧，两百五十块。', py: 'Hǎo ba, liǎngbǎi wǔshí kuài.', ko: '좋아요, 250위안이에요.',
          a: { zh: '好的，我买了。', py: 'Hǎo de, wǒ mǎi le.', ko: '좋아요, 살게요.' }, must: [['买', '要', '好']] }
      ]
    },
    {
      id: 'taxi', title: '택시 타기', intro: '택시를 타고 목적지에 가요',
      turns: [
        { zh: '您好，去哪儿？', py: 'Nín hǎo, qù nǎr?', ko: '안녕하세요, 어디 가세요?',
          a: { zh: '我要去机场。', py: 'Wǒ yào qù jīchǎng.', ko: '공항에 가요.' }, must: [['机场', '火车站', '酒店']] },
        { zh: '好的。您赶时间吗？', py: 'Hǎo de. Nín gǎn shíjiān ma?', ko: '네. 시간이 급하세요?',
          a: { zh: '有点儿赶，请开快一点儿。', py: 'Yǒudiǎnr gǎn, qǐng kāi kuài yìdiǎnr.', ko: '좀 급해요, 조금 빨리 가 주세요.' }, must: [['快', '赶']] },
        { zh: '大概三十分钟就到。', py: 'Dàgài sānshí fēnzhōng jiù dào.', ko: '대략 30분이면 도착해요.',
          a: { zh: '好的，谢谢。', py: 'Hǎo de, xièxie.', ko: '네, 감사합니다.' }, must: [['谢谢', '好']] },
        { zh: '到了，一共八十块。', py: 'Dào le, yígòng bāshí kuài.', ko: '도착했어요, 모두 80위안이에요.',
          a: { zh: '可以用手机付款吗？', py: 'Kěyǐ yòng shǒujī fùkuǎn ma?', ko: '휴대폰으로 결제할 수 있어요?' }, must: [['手机', '付款', '刷卡', '支付']] }
      ]
    },
    {
      id: 'hotel', title: '호텔 체크인', intro: '호텔에서 체크인해요',
      turns: [
        { zh: '您好，欢迎入住。请问有预订吗？', py: 'Nín hǎo, huānyíng rùzhù. Qǐngwèn yǒu yùdìng ma?', ko: '안녕하세요, 어서 오세요. 예약하셨나요?',
          a: { zh: '有，我订了一个房间。', py: 'Yǒu, wǒ dìng le yí ge fángjiān.', ko: '네, 방을 하나 예약했어요.' }, must: [['订', '预订', '有']] },
        { zh: '请出示您的护照。', py: 'Qǐng chūshì nín de hùzhào.', ko: '여권을 보여 주세요.',
          a: { zh: '好的，我的护照在这儿。', py: 'Hǎo de, wǒ de hùzhào zài zhèr.', ko: '네, 제 여권 여기 있어요.' }, must: [['护照']] },
        { zh: '您的房间在八楼。', py: 'Nín de fángjiān zài bā lóu.', ko: '객실은 8층이에요.',
          a: { zh: '房间里有网络吗？', py: 'Fángjiān li yǒu wǎngluò ma?', ko: '방에 인터넷 있어요?' }, must: [['网', '无线', 'wifi', 'WiFi']] },
        { zh: '有的，密码在桌子上。', py: 'Yǒu de, mìmǎ zài zhuōzi shang.', ko: '있어요, 비밀번호는 탁자 위에 있어요.',
          a: { zh: '好的，谢谢你。', py: 'Hǎo de, xièxie nǐ.', ko: '네, 감사합니다.' }, must: [['谢谢', '好']] }
      ]
    },
    {
      id: 'clinic', title: '아파서 병원에서', intro: '몸이 안 좋아 진료를 받아요',
      turns: [
        { zh: '你哪儿不舒服？', py: 'Nǐ nǎr bù shūfu?', ko: '어디가 불편하세요?',
          a: { zh: '我头疼，还有点儿发烧。', py: 'Wǒ tóu téng, hái yǒudiǎnr fāshāo.', ko: '머리가 아프고 열도 좀 나요.' }, must: [['头', '烧', '疼', '不舒服', '感冒']] },
        { zh: '从什么时候开始的？', py: 'Cóng shénme shíhou kāishǐ de?', ko: '언제부터 그랬어요?',
          a: { zh: '从昨天开始的。', py: 'Cóng zuótiān kāishǐ de.', ko: '어제부터요.' }, must: [['昨天', '今天', '前天', '从']] },
        { zh: '你应该多喝水，好好休息。', py: 'Nǐ yīnggāi duō hē shuǐ, hǎohāo xiūxi.', ko: '물을 많이 마시고 푹 쉬세요.',
          a: { zh: '好的，我明白了。', py: 'Hǎo de, wǒ míngbai le.', ko: '네, 알겠어요.' }, must: [['明白', '好']] },
        { zh: '这是药，一天吃三次。', py: 'Zhè shì yào, yì tiān chī sān cì.', ko: '이건 약이에요, 하루 세 번 드세요.',
          a: { zh: '谢谢医生。', py: 'Xièxie yīshēng.', ko: '감사합니다, 선생님.' }, must: [['谢谢', '多谢']] }
      ]
    },
    {
      id: 'plan', title: '친구와 약속 잡기', intro: '주말 약속을 정해요',
      turns: [
        { zh: '这个周末你有空吗？', py: 'Zhège zhōumò nǐ yǒu kòng ma?', ko: '이번 주말에 시간 있어요?',
          a: { zh: '有空，怎么了？', py: 'Yǒu kòng, zěnme le?', ko: '시간 있어요, 왜요?' }, must: [['有空', '有时间', '没有', '没空', '有']] },
        { zh: '我们一起去看电影吧。', py: 'Wǒmen yìqǐ qù kàn diànyǐng ba.', ko: '우리 같이 영화 보러 가요.',
          a: { zh: '好啊，几点见面？', py: 'Hǎo a, jǐ diǎn jiànmiàn?', ko: '좋아요, 몇 시에 만나요?' }, must: [['几点', '什么时候', '好']] },
        { zh: '下午三点，在地铁站见。', py: 'Xiàwǔ sān diǎn, zài dìtiězhàn jiàn.', ko: '오후 3시에 지하철역에서 만나요.',
          a: { zh: '没问题，不见不散！', py: 'Méi wèntí, bú jiàn bú sàn!', ko: '좋아요, 꼭 만나요!' }, must: [['没问题', '好', '可以', '行']] },
        { zh: '到时候给我打电话。', py: 'Dào shíhou gěi wǒ dǎ diànhuà.', ko: '그때 전화해요.',
          a: { zh: '好的，周末见！', py: 'Hǎo de, zhōumò jiàn!', ko: '네, 주말에 봐요!' }, must: [['好', '见']] }
      ]
    }
  ];
  if (typeof window !== 'undefined') window.DIALOGS = DIALOGS;
  if (typeof module !== 'undefined') module.exports = DIALOGS;
})();
