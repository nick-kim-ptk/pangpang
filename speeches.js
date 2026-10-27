// 발표 레슨 콘텐츠 30개: [중국어, 병음, 한국어]. lv 1=초급 2=중급 3=고급
var SPEECHES = [
 {
  "id": "sp1",
  "lv": 1,
  "icon": "🙋",
  "title": "자기소개",
  "lines": [
   [
    "大家好，我叫小明。",
    "Dàjiā hǎo, wǒ jiào Xiǎomíng.",
    "여러분 안녕하세요, 저는 샤오밍이라고 합니다."
   ],
   [
    "今年二十五岁，住在首尔。",
    "Jīnnián èrshíwǔ suì, zhù zài Shǒu'ěr.",
    "올해 스물다섯 살이고, 서울에 살고 있습니다."
   ],
   [
    "平时在公司上班，每天都很忙。",
    "Píngshí zài gōngsī shàngbān, měitiān dōu hěn máng.",
    "평소 회사에 다니고, 매일 매우 바쁩니다."
   ],
   [
    "下班以后，喜欢听音乐和看电影。",
    "Xiàbān yǐhòu, xǐhuan tīng yīnyuè hé kàn diànyǐng.",
    "퇴근한 후에는 음악 듣기와 영화 보기를 좋아합니다."
   ],
   [
    "周末常常和朋友一起吃饭、聊天。",
    "Zhōumò chángcháng hé péngyou yìqǐ chīfàn, liáotiān.",
    "주말에는 자주 친구와 함께 밥을 먹고 이야기합니다."
   ]
  ]
 },
 {
  "id": "sp2",
  "lv": 1,
  "icon": "👨‍👩‍👧",
  "title": "우리 가족",
  "lines": [
   [
    "我家有四口人。",
    "Wǒ jiā yǒu sì kǒu rén.",
    "우리 가족은 네 명입니다."
   ],
   [
    "爸爸、妈妈、姐姐和我。",
    "Bàba, māma, jiějie hé wǒ.",
    "아빠, 엄마, 언니(누나), 그리고 저입니다."
   ],
   [
    "爸爸每天去公司上班。",
    "Bàba měitiān qù gōngsī shàngbān.",
    "아빠는 매일 회사에 출근합니다."
   ],
   [
    "妈妈喜欢在家做饭。",
    "Māma xǐhuan zài jiā zuò fàn.",
    "엄마는 집에서 요리하는 것을 좋아합니다."
   ],
   [
    "晚上我们常常一起吃饭。",
    "Wǎnshang wǒmen chángcháng yìqǐ chī fàn.",
    "저녁에는 우리가 자주 함께 식사합니다."
   ]
  ]
 },
 {
  "id": "sp3",
  "lv": 1,
  "icon": "🍜",
  "title": "내가 좋아하는 음식",
  "lines": [
   [
    "我最喜欢吃面条。",
    "Wǒ zuì xǐhuan chī miàntiáo.",
    "저는 면을 먹는 것을 가장 좋아합니다."
   ],
   [
    "面条很好吃，也不太贵。",
    "Miàntiáo hěn hǎochī, yě bú tài guì.",
    "면은 맛있고, 가격도 그다지 비싸지 않습니다."
   ],
   [
    "中午常常和朋友一起吃。",
    "Zhōngwǔ chángcháng hé péngyou yìqǐ chī.",
    "점심에는 자주 친구와 함께 먹습니다."
   ],
   [
    "有时候也在家自己做。",
    "Yǒu shíhou yě zài jiā zìjǐ zuò.",
    "가끔은 집에서 직접 만들기도 합니다."
   ],
   [
    "吃到喜欢的东西，我很开心。",
    "Chī dào xǐhuan de dōngxi, wǒ hěn kāixīn.",
    "좋아하는 음식을 먹으면 저는 매우 기쁩니다."
   ]
  ]
 },
 {
  "id": "sp4",
  "lv": 1,
  "icon": "⏰",
  "title": "나의 하루 일과",
  "lines": [
   [
    "我每天早上七点起床。",
    "Wǒ měitiān zǎoshang qī diǎn qǐchuáng.",
    "저는 매일 아침 일곱 시에 일어납니다."
   ],
   [
    "洗脸以后，吃早饭。",
    "Xǐ liǎn yǐhòu, chī zǎofàn.",
    "세수한 후 아침을 먹습니다."
   ],
   [
    "八点出门，坐地铁去公司。",
    "Bā diǎn chūmén, zuò dìtiě qù gōngsī.",
    "여덟 시에 집을 나서 지하철을 타고 회사에 갑니다."
   ],
   [
    "下午工作，晚上回家。",
    "Xiàwǔ gōngzuò, wǎnshang huí jiā.",
    "오후에는 일하고, 저녁에는 집에 돌아옵니다."
   ],
   [
    "睡觉以前，喜欢看一会儿书。",
    "Shuìjiào yǐqián, xǐhuan kàn yíhuìr shū.",
    "잠자기 전에 잠깐 책을 읽는 것을 좋아합니다."
   ]
  ]
 },
 {
  "id": "sp5",
  "lv": 1,
  "icon": "🏠",
  "title": "나의 집",
  "lines": [
   [
    "我家在首尔。",
    "Wǒ jiā zài Shǒu'ěr.",
    "우리 집은 서울에 있습니다."
   ],
   [
    "家附近有很多商店。",
    "Jiā fùjìn yǒu hěn duō shāngdiàn.",
    "집 근처에는 상점이 많이 있습니다."
   ],
   [
    "房子不大，但是很干净。",
    "Fángzi bú dà, dànshì hěn gānjìng.",
    "집은 크지 않지만 매우 깨끗합니다."
   ],
   [
    "我的房间有一张床和一张桌子。",
    "Wǒ de fángjiān yǒu yì zhāng chuáng hé yì zhāng zhuōzi.",
    "제 방에는 침대 하나와 책상 하나가 있습니다."
   ],
   [
    "我喜欢在家休息。",
    "Wǒ xǐhuan zài jiā xiūxi.",
    "저는 집에서 쉬는 것을 좋아합니다."
   ]
  ]
 },
 {
  "id": "sp6",
  "lv": 1,
  "icon": "🌸",
  "title": "좋아하는 계절",
  "lines": [
   [
    "我最喜欢春天。",
    "Wǒ zuì xǐhuan chūntiān.",
    "저는 봄을 가장 좋아합니다."
   ],
   [
    "春天天气很好，不冷也不热。",
    "Chūntiān tiānqì hěn hǎo, bù lěng yě bú rè.",
    "봄에는 날씨가 좋고, 춥지도 덥지도 않습니다."
   ],
   [
    "树和草慢慢变绿了。",
    "Shù hé cǎo mànmàn biàn lǜ le.",
    "나무와 풀이 점점 푸르게 변했습니다."
   ],
   [
    "我常常和朋友去公园。",
    "Wǒ chángcháng hé péngyou qù gōngyuán.",
    "저는 자주 친구와 공원에 갑니다."
   ],
   [
    "一边散步，一边拍照片。",
    "Yìbiān sànbù, yìbiān pāi zhàopiàn.",
    "산책하면서 사진을 찍습니다."
   ]
  ]
 },
 {
  "id": "sp7",
  "lv": 1,
  "icon": "🤝",
  "title": "나의 친구",
  "lines": [
   [
    "我有一个好朋友。",
    "Wǒ yǒu yí ge hǎo péngyou.",
    "저에게는 좋은 친구가 한 명 있습니다."
   ],
   [
    "我们认识很多年了。",
    "Wǒmen rènshi hěn duō nián le.",
    "우리는 알고 지낸 지 여러 해가 되었습니다."
   ],
   [
    "他很开朗，也很爱笑。",
    "Tā hěn kāilǎng, yě hěn ài xiào.",
    "그 친구는 매우 활발하고 웃는 것을 좋아합니다."
   ],
   [
    "我们常常一起吃饭、看电影。",
    "Wǒmen chángcháng yìqǐ chīfàn, kàn diànyǐng.",
    "우리는 자주 함께 밥을 먹고 영화를 봅니다."
   ],
   [
    "有他在，我觉得很开心。",
    "Yǒu tā zài, wǒ juéde hěn kāixīn.",
    "그 친구가 곁에 있으면 저는 매우 즐겁습니다."
   ]
  ]
 },
 {
  "id": "sp8",
  "lv": 1,
  "icon": "📅",
  "title": "주말 계획",
  "lines": [
   [
    "这个周末我没有工作。",
    "Zhège zhōumò wǒ méiyǒu gōngzuò.",
    "이번 주말에는 일이 없습니다."
   ],
   [
    "星期六想和朋友出去玩。",
    "Xīngqīliù xiǎng hé péngyou chūqù wán.",
    "토요일에는 친구와 놀러 나가고 싶습니다."
   ],
   [
    "我们打算去看电影。",
    "Wǒmen dǎsuàn qù kàn diànyǐng.",
    "우리는 영화를 보러 갈 계획입니다."
   ],
   [
    "看完电影，再去吃饭。",
    "Kàn wán diànyǐng, zài qù chīfàn.",
    "영화를 다 보고 나서, 그다음에 밥을 먹으러 갑니다."
   ],
   [
    "星期天想在家好好休息。",
    "Xīngqītiān xiǎng zài jiā hǎohāo xiūxi.",
    "일요일에는 집에서 푹 쉬고 싶습니다."
   ]
  ]
 },
 {
  "id": "sp9",
  "lv": 1,
  "icon": "🎧",
  "title": "나의 취미",
  "lines": [
   [
    "我的爱好是听音乐。",
    "Wǒ de àihào shì tīng yīnyuè.",
    "제 취미는 음악 듣기입니다."
   ],
   [
    "每天回家以后，我都会听音乐。",
    "Měitiān huí jiā yǐhòu, wǒ dōu huì tīng yīnyuè.",
    "매일 집에 돌아온 후에 저는 음악을 듣습니다."
   ],
   [
    "喜欢听轻松的歌曲。",
    "Xǐhuan tīng qīngsōng de gēqǔ.",
    "편안한 노래를 듣는 것을 좋아합니다."
   ],
   [
    "心情不好的时候，也会听音乐。",
    "Xīnqíng bù hǎo de shíhou, yě huì tīng yīnyuè.",
    "기분이 좋지 않을 때도 음악을 듣습니다."
   ],
   [
    "听着音乐，心情会变好。",
    "Tīng zhe yīnyuè, xīnqíng huì biàn hǎo.",
    "음악을 들으면 기분이 좋아집니다."
   ]
  ]
 },
 {
  "id": "sp10",
  "lv": 1,
  "icon": "🏙️",
  "title": "내가 사는 도시",
  "lines": [
   [
    "我住在首尔。",
    "Wǒ zhù zài Shǒu'ěr.",
    "저는 서울에 살고 있습니다."
   ],
   [
    "这里有很多人，也有很多商店。",
    "Zhèlǐ yǒu hěn duō rén, yě yǒu hěn duō shāngdiàn.",
    "이곳에는 사람이 많고 상점도 많습니다."
   ],
   [
    "坐地铁去哪里都很方便。",
    "Zuò dìtiě qù nǎlǐ dōu hěn fāngbiàn.",
    "지하철을 타면 어디에 가든 매우 편리합니다."
   ],
   [
    "周末可以去公园，也可以去商场。",
    "Zhōumò kěyǐ qù gōngyuán, yě kěyǐ qù shāngchǎng.",
    "주말에는 공원에 갈 수도 있고 쇼핑몰에 갈 수도 있습니다."
   ],
   [
    "我在这里生活得很开心。",
    "Wǒ zài zhèlǐ shēnghuó de hěn kāixīn.",
    "저는 이곳에서 즐겁게 생활하고 있습니다."
   ]
  ]
 },
 {
  "id": "sp11",
  "lv": 2,
  "icon": "💼",
  "title": "나의 직장 생활",
  "lines": [
   [
    "我已经工作三年了。",
    "Wǒ yǐjīng gōngzuò sān nián le.",
    "저는 이미 3년 동안 일했습니다."
   ],
   [
    "每天早上九点开始工作。",
    "Měitiān zǎoshang jiǔ diǎn kāishǐ gōngzuò.",
    "매일 아침 아홉 시에 일을 시작합니다."
   ],
   [
    "平时要开会，也要完成很多任务。",
    "Píngshí yào kāihuì, yě yào wánchéng hěn duō rènwu.",
    "평소 회의도 해야 하고 많은 업무도 완수해야 합니다."
   ],
   [
    "虽然有时候很累，但是学到了很多东西。",
    "Suīrán yǒu shíhou hěn lèi, dànshì xuédào le hěn duō dōngxi.",
    "가끔 매우 피곤하지만 많은 것을 배웠습니다."
   ],
   [
    "和同事一起解决问题，也让我很有成就感。",
    "Hé tóngshì yìqǐ jiějué wèntí, yě ràng wǒ hěn yǒu chéngjiùgǎn.",
    "동료와 함께 문제를 해결하는 것도 저에게 큰 성취감을 줍니다."
   ],
   [
    "希望以后能积累更多经验。",
    "Xīwàng yǐhòu néng jīlěi gèng duō jīngyàn.",
    "앞으로 더 많은 경험을 쌓을 수 있기를 바랍니다."
   ]
  ]
 },
 {
  "id": "sp12",
  "lv": 2,
  "icon": "✈️",
  "title": "기억에 남는 여행",
  "lines": [
   [
    "去年夏天，我去了日本旅行。",
    "Qùnián xiàtiān, wǒ qù le Rìběn lǚxíng.",
    "작년 여름에 일본으로 여행을 갔습니다."
   ],
   [
    "这次旅行是和朋友一起计划的。",
    "Zhè cì lǚxíng shì hé péngyou yìqǐ jìhuà de.",
    "이번 여행은 친구와 함께 계획한 것입니다."
   ],
   [
    "我们参观了很多有名的地方。",
    "Wǒmen cānguān le hěn duō yǒumíng de dìfang.",
    "우리는 유명한 장소를 많이 방문했습니다."
   ],
   [
    "当地的食物很好吃，价格也不贵。",
    "Dāngdì de shíwù hěn hǎochī, jiàgé yě bú guì.",
    "현지 음식은 맛있고 가격도 비싸지 않았습니다."
   ],
   [
    "最让我难忘的是当地人的热情。",
    "Zuì ràng wǒ nánwàng de shì dāngdì rén de rèqíng.",
    "저에게 가장 잊기 어려운 것은 현지 사람들의 친절함이었습니다."
   ],
   [
    "以后有机会，还想再去一次。",
    "Yǐhòu yǒu jīhuì, hái xiǎng zài qù yí cì.",
    "앞으로 기회가 있으면 다시 한 번 가고 싶습니다."
   ]
  ]
 },
 {
  "id": "sp13",
  "lv": 2,
  "icon": "🏃",
  "title": "건강한 생활 습관",
  "lines": [
   [
    "最近，我开始注意自己的身体。",
    "Zuìjìn, wǒ kāishǐ zhùyì zìjǐ de shēntǐ.",
    "최근 저는 자신의 몸에 주의를 기울이기 시작했습니다."
   ],
   [
    "每天尽量吃三顿饭。",
    "Měitiān jǐnliàng chī sān dùn fàn.",
    "매일 되도록 세 끼를 먹습니다."
   ],
   [
    "下班以后，会去附近的公园散步。",
    "Xiàbān yǐhòu, huì qù fùjìn de gōngyuán sànbù.",
    "퇴근 후에는 근처 공원에 산책하러 갑니다."
   ],
   [
    "周末有时间的话，也会做一些运动。",
    "Zhōumò yǒu shíjiān de huà, yě huì zuò yìxiē yùndòng.",
    "주말에 시간이 있으면 운동도 조금 합니다."
   ],
   [
    "我发现睡得好，精神也会更好。",
    "Wǒ fāxiàn shuì de hǎo, jīngshén yě huì gèng hǎo.",
    "잠을 잘 자면 정신 상태도 더 좋아진다는 것을 알게 되었습니다."
   ],
   [
    "所以，我想把这些习惯坚持下去。",
    "Suǒyǐ, wǒ xiǎng bǎ zhèxiē xíguàn jiānchí xiàqù.",
    "그래서 이런 습관들을 계속 유지하고 싶습니다."
   ]
  ]
 },
 {
  "id": "sp14",
  "lv": 2,
  "icon": "💰",
  "title": "나의 소비 습관",
  "lines": [
   [
    "以前买东西的时候，我很少考虑价格。",
    "Yǐqián mǎi dōngxi de shíhou, wǒ hěn shǎo kǎolǜ jiàgé.",
    "예전에는 물건을 살 때 가격을 거의 고려하지 않았습니다."
   ],
   [
    "看到喜欢的东西，就想马上买下来。",
    "Kàndào xǐhuan de dōngxi, jiù xiǎng mǎshàng mǎi xiàlái.",
    "좋아하는 물건을 보면 바로 사고 싶었습니다."
   ],
   [
    "后来发现，这样很容易花掉太多钱。",
    "Hòulái fāxiàn, zhèyàng hěn róngyì huā diào tài duō qián.",
    "나중에 이렇게 하면 돈을 너무 많이 쓰기 쉽다는 것을 알게 되었습니다."
   ],
   [
    "现在买东西以前，会先比较价格。",
    "Xiànzài mǎi dōngxi yǐqián, huì xiān bǐjiào jiàgé.",
    "지금은 물건을 사기 전에 먼저 가격을 비교합니다."
   ],
   [
    "不太需要的东西，就不会随便买。",
    "Bú tài xūyào de dōngxi, jiù bú huì suíbiàn mǎi.",
    "그다지 필요하지 않은 물건은 함부로 사지 않습니다."
   ],
   [
    "我觉得合理安排钱很重要。",
    "Wǒ juéde hélǐ ānpái qián hěn zhòngyào.",
    "저는 돈을 합리적으로 관리하는 것이 중요하다고 생각합니다."
   ]
  ]
 },
 {
  "id": "sp15",
  "lv": 2,
  "icon": "📚",
  "title": "중국어를 배우는 이유",
  "lines": [
   [
    "我学习中文已经有一段时间了。",
    "Wǒ xuéxí Zhōngwén yǐjīng yǒu yí duàn shíjiān le.",
    "저는 중국어를 배운 지 이미 한동안 되었습니다."
   ],
   [
    "一开始，只是觉得中文很有意思。",
    "Yì kāishǐ, zhǐshì juéde Zhōngwén hěn yǒu yìsi.",
    "처음에는 단지 중국어가 재미있다고 생각했습니다."
   ],
   [
    "后来发现，学会中文可以认识更多朋友。",
    "Hòulái fāxiàn, xuéhuì Zhōngwén kěyǐ rènshi gèng duō péngyou.",
    "나중에는 중국어를 배우면 더 많은 친구를 사귈 수 있다는 것을 알게 되었습니다."
   ],
   [
    "不过，记住汉字和声调并不容易。",
    "Búguò, jìzhù Hànzì hé shēngdiào bìng bù róngyì.",
    "하지만 한자와 성조를 기억하는 것은 결코 쉽지 않습니다."
   ],
   [
    "所以，我每天都会练习听和说。",
    "Suǒyǐ, wǒ měitiān dōu huì liànxí tīng hé shuō.",
    "그래서 저는 매일 듣기와 말하기를 연습합니다."
   ],
   [
    "希望有一天，能用中文自然地交流。",
    "Xīwàng yǒu yì tiān, néng yòng Zhōngwén zìrán de jiāoliú.",
    "언젠가 중국어로 자연스럽게 소통할 수 있기를 바랍니다."
   ]
  ]
 },
 {
  "id": "sp16",
  "lv": 2,
  "icon": "🎬",
  "title": "내가 좋아하는 영화",
  "lines": [
   [
    "我平时很喜欢看电影。",
    "Wǒ píngshí hěn xǐhuan kàn diànyǐng.",
    "저는 평소 영화를 보는 것을 매우 좋아합니다."
   ],
   [
    "尤其是有意思的故事片。",
    "Yóuqí shì yǒu yìsi de gùshìpiàn.",
    "특히 재미있는 극영화(스토리 영화)입니다."
   ],
   [
    "看电影的时候，可以暂时忘记工作的压力。",
    "Kàn diànyǐng de shíhou, kěyǐ zànshí wàngjì gōngzuò de yālì.",
    "영화를 볼 때는 잠시 업무의 압박을 잊을 수 있습니다."
   ],
   [
    "有些电影还会让我重新思考生活。",
    "Yǒuxiē diànyǐng hái huì ràng wǒ chóngxīn sīkǎo shēnghuó.",
    "어떤 영화는 제가 삶을 다시 생각하게 만들기도 합니다."
   ],
   [
    "看完以后，我常常会和朋友讨论情节。",
    "Kàn wán yǐhòu, wǒ chángcháng huì hé péngyou tǎolùn qíngjié.",
    "영화를 다 본 후에는 자주 친구와 줄거리를 토론합니다."
   ],
   [
    "对我来说，电影不只是娱乐。",
    "Duì wǒ lái shuō, diànyǐng bù zhǐ shì yúlè.",
    "저에게 영화는 단순한 오락만은 아닙니다."
   ]
  ]
 },
 {
  "id": "sp17",
  "lv": 2,
  "icon": "🚇",
  "title": "대중교통 이용하기",
  "lines": [
   [
    "我平时主要坐地铁上班。",
    "Wǒ píngshí zhǔyào zuò dìtiě shàngbān.",
    "저는 평소 주로 지하철을 타고 출근합니다."
   ],
   [
    "虽然早上人很多，但是速度比较快。",
    "Suīrán zǎoshang rén hěn duō, dànshì sùdù bǐjiào kuài.",
    "아침에는 사람이 많지만 속도가 비교적 빠릅니다."
   ],
   [
    "路上可以听音乐，也可以看新闻。",
    "Lùshang kěyǐ tīng yīnyuè, yě kěyǐ kàn xīnwén.",
    "이동 중에 음악을 들을 수도 있고 뉴스를 볼 수도 있습니다."
   ],
   [
    "如果开车，可能会遇到交通堵塞。",
    "Rúguǒ kāichē, kěnéng huì yùdào jiāotōng dǔsè.",
    "운전하면 교통 체증을 만날 수도 있습니다."
   ],
   [
    "所以，在市区坐地铁通常更方便。",
    "Suǒyǐ, zài shìqū zuò dìtiě tōngcháng gèng fāngbiàn.",
    "그래서 시내에서는 지하철을 타는 것이 보통 더 편리합니다."
   ],
   [
    "我也希望公共交通越来越好。",
    "Wǒ yě xīwàng gōnggòng jiāotōng yuè lái yuè hǎo.",
    "대중교통도 점점 더 좋아지기를 바랍니다."
   ]
  ]
 },
 {
  "id": "sp18",
  "lv": 2,
  "icon": "🎂",
  "title": "특별한 기념일",
  "lines": [
   [
    "去年生日的时候，朋友给了我一个惊喜。",
    "Qùnián shēngrì de shíhou, péngyou gěi le wǒ yí ge jīngxǐ.",
    "작년 생일에 친구가 저에게 깜짝 선물을 주었습니다."
   ],
   [
    "他们提前准备了蛋糕和礼物。",
    "Tāmen tíqián zhǔnbèi le dàngāo hé lǐwù.",
    "그들은 미리 케이크와 선물을 준비했습니다."
   ],
   [
    "下班以后，我们一起去餐厅吃饭。",
    "Xiàbān yǐhòu, wǒmen yìqǐ qù cāntīng chīfàn.",
    "퇴근 후 우리는 함께 식당에 가서 식사했습니다."
   ],
   [
    "大家一边吃饭，一边聊天。",
    "Dàjiā yìbiān chīfàn, yìbiān liáotiān.",
    "모두 식사하면서 이야기를 나누었습니다."
   ],
   [
    "那天没有特别贵的礼物，却让我很感动。",
    "Nà tiān méiyǒu tèbié guì de lǐwù, què ràng wǒ hěn gǎndòng.",
    "그날 특별히 비싼 선물은 없었지만 저를 매우 감동하게 했습니다."
   ],
   [
    "到现在，我还记得那天的快乐。",
    "Dào xiànzài, wǒ hái jìde nà tiān de kuàilè.",
    "지금까지도 저는 그날의 즐거움을 기억합니다."
   ]
  ]
 },
 {
  "id": "sp19",
  "lv": 2,
  "icon": "🧘",
  "title": "나의 스트레스 해소법",
  "lines": [
   [
    "工作忙的时候，我常常觉得压力很大。",
    "Gōngzuò máng de shíhou, wǒ chángcháng juéde yālì hěn dà.",
    "일이 바쁠 때 저는 자주 압박감이 크다고 느낍니다."
   ],
   [
    "如果一直想着工作，就很难放松。",
    "Rúguǒ yìzhí xiǎng zhe gōngzuò, jiù hěn nán fàngsōng.",
    "계속 일을 생각하면 긴장을 풀기가 어렵습니다."
   ],
   [
    "所以，我会出去散步或者听音乐。",
    "Suǒyǐ, wǒ huì chūqù sànbù huòzhě tīng yīnyuè.",
    "그래서 저는 밖에 나가 산책하거나 음악을 듣습니다."
   ],
   [
    "有时候也会找朋友聊聊天。",
    "Yǒu shíhou yě huì zhǎo péngyou liáo liáotiān.",
    "가끔 친구를 찾아 이야기를 나누기도 합니다."
   ],
   [
    "说出自己的想法以后，心里会舒服一些。",
    "Shuō chū zìjǐ de xiǎngfǎ yǐhòu, xīnlǐ huì shūfu yìxiē.",
    "자신의 생각을 말하고 나면 마음이 조금 편해집니다."
   ],
   [
    "我觉得找到适合自己的方法很重要。",
    "Wǒ juéde zhǎodào shìhé zìjǐ de fāngfǎ hěn zhòngyào.",
    "자신에게 맞는 방법을 찾는 것이 중요하다고 생각합니다."
   ]
  ]
 },
 {
  "id": "sp20",
  "lv": 2,
  "icon": "🗺️",
  "title": "앞으로의 여행 계획",
  "lines": [
   [
    "明年，我想去中国旅行。",
    "Míngnián, wǒ xiǎng qù Zhōngguó lǚxíng.",
    "내년에 중국으로 여행을 가고 싶습니다."
   ],
   [
    "这次最想去的地方是上海。",
    "Zhè cì zuì xiǎng qù de dìfang shì Shànghǎi.",
    "이번에 가장 가고 싶은 곳은 상하이입니다."
   ],
   [
    "出发以前，我会先订好机票和酒店。",
    "Chūfā yǐqián, wǒ huì xiān dìng hǎo jīpiào hé jiǔdiàn.",
    "출발하기 전에 먼저 비행기 표와 호텔을 예약할 것입니다."
   ],
   [
    "还想了解当地的文化和美食。",
    "Hái xiǎng liǎojiě dāngdì de wénhuà hé měishí.",
    "현지의 문화와 음식도 알아보고 싶습니다."
   ],
   [
    "如果时间允许，也想去附近的城市看看。",
    "Rúguǒ shíjiān yǔnxǔ, yě xiǎng qù fùjìn de chéngshì kànkan.",
    "시간이 허락한다면 근처 도시에도 가 보고 싶습니다."
   ],
   [
    "希望这次旅行能带来新的体验。",
    "Xīwàng zhè cì lǚxíng néng dàilái xīn de tǐyàn.",
    "이번 여행이 새로운 경험을 가져다주기를 바랍니다."
   ]
  ]
 },
 {
  "id": "sp21",
  "lv": 3,
  "icon": "😊",
  "title": "내가 생각하는 행복",
  "lines": [
   [
    "对我来说，幸福并不一定意味着拥有很多东西。",
    "Duì wǒ lái shuō, xìngfú bìng bù yídìng yìwèizhe yōngyǒu hěn duō dōngxi.",
    "저에게 행복은 반드시 많은 것을 소유한다는 의미는 아닙니다."
   ],
   [
    "有时候，一顿简单的晚餐就能让我满足。",
    "Yǒu shíhou, yí dùn jiǎndān de wǎncān jiù néng ràng wǒ mǎnzú.",
    "때로는 간단한 저녁 한 끼만으로도 저를 만족시킬 수 있습니다."
   ],
   [
    "和家人朋友相处的时间也非常珍贵。",
    "Hé jiārén péngyou xiāngchǔ de shíjiān yě fēicháng zhēnguì.",
    "가족과 친구와 함께 지내는 시간도 매우 소중합니다."
   ],
   [
    "生活越忙，越应该留出时间照顾自己。",
    "Shēnghuó yuè máng, yuè yīnggāi liú chū shíjiān zhàogù zìjǐ.",
    "생활이 바쁠수록 자신을 돌볼 시간을 남겨 두어야 합니다."
   ],
   [
    "如果总是和别人比较，就很难发现自己的幸福。",
    "Rúguǒ zǒng shì hé biérén bǐjiào, jiù hěn nán fāxiàn zìjǐ de xìngfú.",
    "항상 다른 사람과 비교한다면 자신의 행복을 발견하기 어렵습니다."
   ],
   [
    "因此，我更愿意珍惜眼前拥有的一切。",
    "Yīncǐ, wǒ gèng yuànyì zhēnxī yǎnqián yōngyǒu de yíqiè.",
    "따라서 저는 눈앞에 가진 모든 것을 더욱 소중히 여기고 싶습니다."
   ]
  ]
 },
 {
  "id": "sp22",
  "lv": 3,
  "icon": "📱",
  "title": "기술이 바꾸는 일상",
  "lines": [
   [
    "近年来，科技的发展改变了我们的生活方式。",
    "Jìnnián lái, kējì de fāzhǎn gǎibiàn le wǒmen de shēnghuó fāngshì.",
    "최근 몇 년간 기술의 발전은 우리의 생활 방식을 바꾸었습니다."
   ],
   [
    "通过手机，我们可以随时获取各种信息。",
    "Tōngguò shǒujī, wǒmen kěyǐ suíshí huòqǔ gè zhǒng xìnxī.",
    "휴대전화를 통해 우리는 언제든 각종 정보를 얻을 수 있습니다."
   ],
   [
    "人工智能也让许多工作变得更加高效。",
    "Réngōng zhìnéng yě ràng xǔduō gōngzuò biàn de gèngjiā gāoxiào.",
    "인공지능은 많은 업무를 더욱 효율적으로 만들기도 합니다."
   ],
   [
    "然而，过度依赖技术也可能带来问题。",
    "Rán'ér, guòdù yīlài jìshù yě kěnéng dàilái wèntí.",
    "그러나 기술에 지나치게 의존하는 것도 문제를 가져올 수 있습니다."
   ],
   [
    "例如，人们可能减少面对面的交流。",
    "Lìrú, rénmen kěnéng jiǎnshǎo miànduìmiàn de jiāoliú.",
    "예를 들어, 사람들은 대면 소통을 줄일 수 있습니다."
   ],
   [
    "因此，我们需要合理地使用这些工具。",
    "Yīncǐ, wǒmen xūyào hélǐ de shǐyòng zhèxiē gōngjù.",
    "따라서 우리는 이러한 도구를 합리적으로 사용할 필요가 있습니다."
   ],
   [
    "只有这样，科技才能真正改善生活。",
    "Zhǐyǒu zhèyàng, kējì cái néng zhēnzhèng gǎishàn shēnghuó.",
    "이렇게 해야만 기술이 진정으로 생활을 개선할 수 있습니다."
   ]
  ]
 },
 {
  "id": "sp23",
  "lv": 3,
  "icon": "⚖️",
  "title": "일과 삶의 균형",
  "lines": [
   [
    "随着工作节奏越来越快，生活压力也在增加。",
    "Suízhe gōngzuò jiézòu yuè lái yuè kuài, shēnghuó yālì yě zài zēngjiā.",
    "업무 속도가 점점 빨라짐에 따라 생활의 압박도 증가하고 있습니다."
   ],
   [
    "有些人为了事业，不得不牺牲休息时间。",
    "Yǒuxiē rén wèile shìyè, bùdébù xīshēng xiūxi shíjiān.",
    "어떤 사람들은 일을 위해 어쩔 수 없이 휴식 시간을 희생합니다."
   ],
   [
    "短期来看，这样做可能提高工作效率。",
    "Duǎnqī lái kàn, zhèyàng zuò kěnéng tígāo gōngzuò xiàolǜ.",
    "단기적으로 보면 이렇게 하는 것이 업무 효율을 높일 수 있습니다."
   ],
   [
    "但从长远来看，身体和心理健康同样重要。",
    "Dàn cóng chángyuǎn lái kàn, shēntǐ hé xīnlǐ jiànkāng tóngyàng zhòngyào.",
    "하지만 장기적으로 보면 신체와 정신 건강도 똑같이 중요합니다."
   ],
   [
    "合理安排时间，有助于提高生活质量。",
    "Hélǐ ānpái shíjiān, yǒuzhù yú tígāo shēnghuó zhìliàng.",
    "시간을 합리적으로 배분하는 것은 삶의 질을 높이는 데 도움이 됩니다."
   ],
   [
    "我认为，努力工作不应该以失去生活为代价。",
    "Wǒ rènwéi, nǔlì gōngzuò bù yīnggāi yǐ shīqù shēnghuó wéi dàijià.",
    "저는 열심히 일하는 것이 삶을 잃는 대가를 치러서는 안 된다고 생각합니다."
   ],
   [
    "真正的平衡，需要个人和企业共同努力。",
    "Zhēnzhèng de pínghéng, xūyào gèrén hé qǐyè gòngtóng nǔlì.",
    "진정한 균형에는 개인과 기업의 공동 노력이 필요합니다."
   ]
  ]
 },
 {
  "id": "sp24",
  "lv": 3,
  "icon": "🌱",
  "title": "환경 보호와 실천",
  "lines": [
   [
    "环境问题已经成为全球关注的重要议题。",
    "Huánjìng wèntí yǐjīng chéngwéi quánqiú guānzhù de zhòngyào yìtí.",
    "환경 문제는 이미 전 세계가 주목하는 중요한 의제가 되었습니다."
   ],
   [
    "气候变化和资源浪费都值得我们重视。",
    "Qìhòu biànhuà hé zīyuán làngfèi dōu zhíde wǒmen zhòngshì.",
    "기후 변화와 자원 낭비는 모두 우리가 중요하게 여길 가치가 있습니다."
   ],
   [
    "保护环境，不应该只停留在口号上。",
    "Bǎohù huánjìng, bù yīnggāi zhǐ tíngliú zài kǒuhào shàng.",
    "환경 보호는 구호에만 머물러서는 안 됩니다."
   ],
   [
    "日常生活中，我们可以减少一次性用品的使用。",
    "Rìcháng shēnghuó zhōng, wǒmen kěyǐ jiǎnshǎo yí cì xìng yòngpǐn de shǐyòng.",
    "일상생활에서 우리는 일회용품의 사용을 줄일 수 있습니다."
   ],
   [
    "购买商品时，也应该考虑是否真正需要。",
    "Gòumǎi shāngpǐn shí, yě yīnggāi kǎolǜ shìfǒu zhēnzhèng xūyào.",
    "상품을 구매할 때도 정말 필요한지 고려해야 합니다."
   ],
   [
    "除了个人行动，企业和政府也负有责任。",
    "Chúle gèrén xíngdòng, qǐyè hé zhèngfǔ yě fùyǒu zérèn.",
    "개인의 행동 외에도 기업과 정부 역시 책임이 있습니다."
   ],
   [
    "只有各方合作，环境改善才更有可能。",
    "Zhǐyǒu gè fāng hézuò, huánjìng gǎishàn cái gèng yǒu kěnéng.",
    "여러 주체가 협력해야만 환경 개선의 가능성이 더 커집니다."
   ]
  ]
 },
 {
  "id": "sp25",
  "lv": 3,
  "icon": "💪",
  "title": "실패를 통해 배운 것",
  "lines": [
   [
    "以前，我总希望每件事都能顺利完成。",
    "Yǐqián, wǒ zǒng xīwàng měi jiàn shì dōu néng shùnlì wánchéng.",
    "예전에는 모든 일이 순조롭게 완성되기를 늘 바랐습니다."
   ],
   [
    "一旦遇到失败，就容易怀疑自己的能力。",
    "Yídàn yùdào shībài, jiù róngyì huáiyí zìjǐ de nénglì.",
    "일단 실패를 만나면 자신의 능력을 의심하기 쉬웠습니다."
   ],
   [
    "后来我逐渐明白，失败并不代表没有价值。",
    "Hòulái wǒ zhújiàn míngbai, shībài bìng bù dàibiǎo méiyǒu jiàzhí.",
    "나중에 저는 실패가 가치가 없다는 것을 의미하지는 않는다는 점을 점차 이해했습니다."
   ],
   [
    "相反，它能帮助我们发现自己的不足。",
    "Xiāngfǎn, tā néng bāngzhù wǒmen fāxiàn zìjǐ de bùzú.",
    "반대로 실패는 우리가 자신의 부족한 점을 발견하도록 도울 수 있습니다."
   ],
   [
    "重要的是分析原因，而不是一味地责怪自己。",
    "Zhòngyào de shì fēnxī yuányīn, ér bú shì yíwèi de zéguài zìjǐ.",
    "중요한 것은 원인을 분석하는 것이지, 무조건 자신을 탓하는 것이 아닙니다."
   ],
   [
    "每次经历困难，我都会重新调整方法。",
    "Měi cì jīnglì kùnnan, wǒ dōu huì chóngxīn tiáozhěng fāngfǎ.",
    "어려움을 겪을 때마다 저는 방법을 다시 조정합니다."
   ],
   [
    "这样一来，失败也能成为成长的机会。",
    "Zhèyàng yì lái, shībài yě néng chéngwéi chéngzhǎng de jīhuì.",
    "이렇게 하면 실패도 성장의 기회가 될 수 있습니다."
   ]
  ]
 },
 {
  "id": "sp26",
  "lv": 3,
  "icon": "🫂",
  "title": "나에게 중요한 인간관계",
  "lines": [
   [
    "我认为，良好的人际关系离不开信任。",
    "Wǒ rènwéi, liánghǎo de rénjì guānxì lí bù kāi xìnrèn.",
    "저는 좋은 인간관계에 신뢰가 빠질 수 없다고 생각합니다."
   ],
   [
    "无论是朋友还是家人，都需要相互理解。",
    "Wúlùn shì péngyou háishi jiārén, dōu xūyào xiānghù lǐjiě.",
    "친구든 가족이든 서로 이해할 필요가 있습니다."
   ],
   [
    "当意见不同时，沟通比争论更重要。",
    "Dāng yìjiàn bù tóng shí, gōutōng bǐ zhēnglùn gèng zhòngyào.",
    "의견이 다를 때는 논쟁보다 소통이 더 중요합니다."
   ],
   [
    "如果只坚持自己的看法，就很难解决矛盾。",
    "Rúguǒ zhǐ jiānchí zìjǐ de kànfǎ, jiù hěn nán jiějué máodùn.",
    "자신의 견해만 고집한다면 갈등을 해결하기 어렵습니다."
   ],
   [
    "适当地表达感受，也能减少误会。",
    "Shìdàng de biǎodá gǎnshòu, yě néng jiǎnshǎo wùhuì.",
    "감정을 적절하게 표현하는 것도 오해를 줄일 수 있습니다."
   ],
   [
    "真正的关系，不需要每个人都完全相同。",
    "Zhēnzhèng de guānxì, bù xūyào měi ge rén dōu wánquán xiāngtóng.",
    "진정한 관계에는 모든 사람이 완전히 같을 필요가 없습니다."
   ],
   [
    "彼此尊重，才能让关系维持得更长久。",
    "Bǐcǐ zūnzhòng, cái néng ràng guānxì wéichí de gèng chángjiǔ.",
    "서로 존중해야만 관계를 더 오래 유지할 수 있습니다."
   ]
  ]
 },
 {
  "id": "sp27",
  "lv": 3,
  "icon": "🔍",
  "title": "온라인 정보와 판단",
  "lines": [
   [
    "如今，网络已经成为获取信息的重要渠道。",
    "Rújīn, wǎngluò yǐjīng chéngwéi huòqǔ xìnxī de zhòngyào qúdào.",
    "오늘날 인터넷은 정보를 얻는 중요한 경로가 되었습니다."
   ],
   [
    "只要打开手机，就能看到大量新闻。",
    "Zhǐyào dǎkāi shǒujī, jiù néng kàndào dàliàng xīnwén.",
    "휴대전화를 열기만 하면 많은 뉴스를 볼 수 있습니다."
   ],
   [
    "然而，信息越多，并不代表内容越可靠。",
    "Rán'ér, xìnxī yuè duō, bìng bù dàibiǎo nèiróng yuè kěkào.",
    "그러나 정보가 많을수록 내용이 더 신뢰할 만하다는 뜻은 아닙니다."
   ],
   [
    "有些消息缺乏证据，甚至可能误导读者。",
    "Yǒuxiē xiāoxi quēfá zhèngjù, shènzhì kěnéng wùdǎo dúzhě.",
    "어떤 소식은 증거가 부족하고 심지어 독자를 오도할 수도 있습니다."
   ],
   [
    "因此，看到重要信息时，应该先确认来源。",
    "Yīncǐ, kàndào zhòngyào xìnxī shí, yīnggāi xiān quèrèn láiyuán.",
    "따라서 중요한 정보를 보면 먼저 출처를 확인해야 합니다."
   ],
   [
    "也可以通过不同渠道进行比较和核实。",
    "Yě kěyǐ tōngguò bù tóng qúdào jìnxíng bǐjiào hé héshí.",
    "서로 다른 경로를 통해 비교하고 확인할 수도 있습니다."
   ],
   [
    "培养独立判断的能力，比盲目接受信息更重要。",
    "Péiyǎng dúlì pànduàn de nénglì, bǐ mángmù jiēshòu xìnxī gèng zhòngyào.",
    "독립적으로 판단하는 능력을 기르는 것이 정보를 맹목적으로 받아들이는 것보다 더 중요합니다."
   ]
  ]
 },
 {
  "id": "sp28",
  "lv": 3,
  "icon": "🌅",
  "title": "내가 원하는 미래의 삶",
  "lines": [
   [
    "对未来，我有一些明确的期待。",
    "Duì wèilái, wǒ yǒu yìxiē míngquè de qīdài.",
    "미래에 대해 저는 몇 가지 명확한 기대를 가지고 있습니다."
   ],
   [
    "我希望拥有一份有意义的工作。",
    "Wǒ xīwàng yōngyǒu yí fèn yǒu yìyì de gōngzuò.",
    "저는 의미 있는 일을 갖기를 바랍니다."
   ],
   [
    "除了事业，也想留出时间陪伴家人。",
    "Chúle shìyè, yě xiǎng liú chū shíjiān péibàn jiārén.",
    "일뿐만 아니라 가족과 함께할 시간도 남겨 두고 싶습니다."
   ],
   [
    "有机会的话，希望能住在不同的城市。",
    "Yǒu jīhuì de huà, xīwàng néng zhù zài bù tóng de chéngshì.",
    "기회가 있다면 서로 다른 도시에 살아 볼 수 있기를 바랍니다."
   ],
   [
    "通过新的经历，不断拓宽自己的视野。",
    "Tōngguò xīn de jīnglì, búduàn tuòkuān zìjǐ de shìyě.",
    "새로운 경험을 통해 자신의 시야를 끊임없이 넓히고 싶습니다."
   ],
   [
    "我知道，理想的生活需要长期努力。",
    "Wǒ zhīdào, lǐxiǎng de shēnghuó xūyào chángqī nǔlì.",
    "저는 이상적인 삶에는 장기적인 노력이 필요하다는 것을 알고 있습니다."
   ],
   [
    "所以，我会从现在开始，一步一步实现目标。",
    "Suǒyǐ, wǒ huì cóng xiànzài kāishǐ, yí bù yí bù shíxiàn mùbiāo.",
    "그래서 저는 지금부터 한 걸음씩 목표를 실현해 나갈 것입니다."
   ]
  ]
 },
 {
  "id": "sp29",
  "lv": 3,
  "icon": "🧳",
  "title": "여행이 주는 가치",
  "lines": [
   [
    "在我看来，旅行的意义不只是欣赏风景。",
    "Zài wǒ kàn lái, lǚxíng de yìyì bù zhǐ shì xīnshǎng fēngjǐng.",
    "제가 보기에 여행의 의미는 단지 풍경을 감상하는 것만이 아닙니다."
   ],
   [
    "通过旅行，我们能够接触不同的文化。",
    "Tōngguò lǚxíng, wǒmen nénggòu jiēchù bù tóng de wénhuà.",
    "여행을 통해 우리는 서로 다른 문화를 접할 수 있습니다."
   ],
   [
    "当地人的生活方式，也能带来新的启发。",
    "Dāngdì rén de shēnghuó fāngshì, yě néng dàilái xīn de qǐfā.",
    "현지 사람들의 생활 방식도 새로운 깨달음을 가져다줄 수 있습니다."
   ],
   [
    "有时候，陌生的环境会让我们重新认识自己。",
    "Yǒu shíhou, mòshēng de huánjìng huì ràng wǒmen chóngxīn rènshi zìjǐ.",
    "때로는 낯선 환경이 우리로 하여금 자신을 다시 알게 합니다."
   ],
   [
    "旅行中遇到的困难，也是一种宝贵的经验。",
    "Lǚxíng zhōng yùdào de kùnnan, yě shì yì zhǒng bǎoguì de jīngyàn.",
    "여행 중에 겪는 어려움도 소중한 경험입니다."
   ],
   [
    "它能帮助我们学会适应变化。",
    "Tā néng bāngzhù wǒmen xuéhuì shìyìng biànhuà.",
    "그것은 우리가 변화에 적응하는 법을 배우도록 도울 수 있습니다."
   ],
   [
    "因此，每次旅行都可能成为成长的机会。",
    "Yīncǐ, měi cì lǚxíng dōu kěnéng chéngwéi chéngzhǎng de jīhuì.",
    "따라서 모든 여행은 성장의 기회가 될 수 있습니다."
   ]
  ]
 },
 {
  "id": "sp30",
  "lv": 3,
  "icon": "🌏",
  "title": "내가 생각하는 좋은 사회",
  "lines": [
   [
    "我认为，好的社会应该让每个人都有机会发展。",
    "Wǒ rènwéi, hǎo de shèhuì yīnggāi ràng měi ge rén dōu yǒu jīhuì fāzhǎn.",
    "저는 좋은 사회는 모든 사람이 발전할 기회를 갖게 해야 한다고 생각합니다."
   ],
   [
    "人们的背景虽然不同，但都应该受到尊重。",
    "Rénmen de bèijǐng suīrán bù tóng, dàn dōu yīnggāi shòudào zūnzhòng.",
    "사람들의 배경은 서로 다르지만 모두 존중받아야 합니다."
   ],
   [
    "遇到困难的人，也应该得到适当的帮助。",
    "Yùdào kùnnan de rén, yě yīnggāi dédào shìdàng de bāngzhù.",
    "어려움을 겪는 사람도 적절한 도움을 받아야 합니다."
   ],
   [
    "一个社会的发展，不应该只看经济数字。",
    "Yí ge shèhuì de fāzhǎn, bù yīnggāi zhǐ kàn jīngjì shùzì.",
    "한 사회의 발전은 경제 수치만 보아서는 안 됩니다."
   ],
   [
    "人们是否生活得安心，同样值得关注。",
    "Rénmen shìfǒu shēnghuó de ānxīn, tóngyàng zhíde guānzhù.",
    "사람들이 안심하고 생활하는지도 똑같이 주목할 가치가 있습니다."
   ],
   [
    "要实现这样的目标，需要大家共同参与。",
    "Yào shíxiàn zhèyàng de mùbiāo, xūyào dàjiā gòngtóng cānyù.",
    "이러한 목표를 실현하려면 모두가 함께 참여해야 합니다."
   ],
   [
    "每个人都可以从身边的小事做起。",
    "Měi ge rén dōu kěyǐ cóng shēnbiān de xiǎoshì zuò qǐ.",
    "모든 사람은 주변의 작은 일부터 시작할 수 있습니다."
   ],
   [
    "只有相互理解、共同努力，社会才能不断进步。",
    "Zhǐyǒu xiānghù lǐjiě, gòngtóng nǔlì, shèhuì cái néng búduàn jìnbù.",
    "서로 이해하고 함께 노력해야만 사회가 끊임없이 발전할 수 있습니다."
   ]
  ]
 }
];
