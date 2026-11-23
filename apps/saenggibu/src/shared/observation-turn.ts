/**
 * 똑딱AI V10.1: a teacher's observation memo, however short or long, as a 생기부 paragraph of
 * the app's 보통 length. The memo is split into observations. The model rewrites one or two
 * observations at a time into a record sentence, and a rewrite that drops a negation, a word
 * of the memo or adds an event is refused (the plain clause with a record ending is used
 * instead). The rest of the paragraph comes from reviewed sentences chosen by the observation's
 * area (학습, 관계 …) and whether it reads as a strength, a concern or a change, so the
 * paragraph never says the opposite of what the teacher wrote.
 */
import { PHRASES } from './observation-phrases'

export type ObservationCategory = keyof typeof PHRASES
export interface Observation {
  category: ObservationCategory
  note: string
}
export interface ObservationExample {
  category: ObservationCategory
  memo: string
  answer: string
}

export function parseObservation(value: unknown): Observation | null {
  const input = value as Partial<Observation> | null
  if (!input || (input.category !== '행발' && input.category !== '평어' && input.category !== '창체') ||
    typeof input.note !== 'string' || !input.note.trim() || input.note.length > 20_000) return null
  return { category: input.category, note: input.note }
}

/* ------------------------------------------------------------------ the memo */

/** a sigh or a spoken connective at the start of an observation ("하 솔직히", "그리고") */
const OPENING_FILLER =
  /^(?:(?:하+|아휴|휴|음+|솔직히|사실|그리고|근데|그런데|그래서|또한|또)[\s,.!~]+)+/u

/** the memo's observations, in order, each once */
export function clausesOf(note: string): string[] {
  const parts = note.normalize('NFC')
    .split(/[.!?](?=\s|$)|[\n;]|,\s*(?!\d)|\s*\/\s*(?!\d)|\s+(?:그리고|근데|그런데)\s+/u)
    .map((part) => part.trim().replace(/\s+/g, ' ').replace(OPENING_FILLER, '')
      .replace(/[\s.,!?~ㅠㅜ]+$/u, '').trim())
    .filter((part) => part.length > 1)
  return [...new Set(parts)]
}

/** the paragraph each 보통 entry is written to (record-core.ts's 분량 가이드) */
const SHAPE: Record<ObservationCategory,
  { sentences: number; most: number; chars: number; max: number; clauses: number }> = {
  행발: { sentences: 3, most: 5, chars: 300, max: 420, clauses: 4 },
  평어: { sentences: 2, most: 3, chars: 110, max: 260, clauses: 2 },
  창체: { sentences: 3, most: 3, chars: 150, max: 280, clauses: 3 },
}

/** the teacher's spoken words as written ones (얘기 → 이야기, 친구랑 → 친구와) */
export function tidy(clause: string): string {
  return clause
    .replace(/^(?:본인은|본인이|얘는|얘가|걔는|걔가|이 친구는|이 아이는)\s*/u, '')
    .replace(/(^|\s)(?:좀|조금|그래도|그냥|진짜|정말|너무|되게|약간|완전|엄청|겁나|넘)(?=\s)/gu, '$1')
    .replace(/([가-힣])엔(?=\s)/gu, '$1에는')
    .replace(/(?:다소\s*)?(?:이기적|자기중심적)(?:이다|임|이에요|인 편(?:임|이다|이에요))/gu, '자신의 입장을 먼저 생각함')
    .replace(/산만(?:하다|함|해요|한 편임)/gu, '주의가 쉽게 흩어짐')
    .replace(/^어제는?\s*/u, '처음에는 ')
    .replace(/^오늘은?\s*/u, '이후 ')
    .replace(/\s본인(은|이)\s/gu, ' 자신$1 ')
    .replace(/(^|\s)([가-힣]*[^을를이가은는에도만서지게고며면히\s])\s(잘|못)(?=\s?[가-힣])/gu,
      (_, space: string, word: string, adverb: string) =>
        space + word + (batchim(word.at(-1) ?? '') > 0 ? '을' : '를') + ' ' + adverb)
    .replace(/(\S*[^을를이가은는에도만서지게고며면히\s])\s(그림|만듦|씀|읽음|맡음|모음|지킴|도움|만듦)$/u,
      (_, word: string, verb: string) => word + (batchim(word.at(-1) ?? '') > 0 ? '을 ' : '를 ') + verb)
    .replace(/(\S*[^을를이가은는에도만서지게고며면히\s])\s(담당|정리|안내|발표|조사|점검|청소|준비|기록|봉사|연습|관리|진행|제작|설명|홍보)(함|했음|했다|해요|했어요)?$/u,
      (_, word: string, noun: string, verb?: string) =>
        word + (batchim(word.at(-1) ?? '') > 0 ? '을 ' : '를 ') + noun + (verb ?? '함'))
    .replace(/(\S*[^을를이가은는에도만서지게고며면히\s])\s(정확함|정확하다|정확해요|능숙함|미숙함|서툶|우수함|뛰어남)$/u,
      (_, word: string, state: string) => word + (batchim(word.at(-1) ?? '') > 0 ? '이 ' : '가 ') + state)
    .replace(/얘기/gu, '이야기')
    .replace(/에선(?=\s|$)/gu, '에서는')
    .replace(/(^|\s)요즘(?:은|에는)?(?=\s)/gu, '$1최근에는')
    .replace(/애들/gu, '친구들')
    .replace(/([가-힣])한테(?=\s)/gu, '$1에게')
    .replace(/([가-힣])이랑(?=\s)/gu, '$1과')
    .replace(/([가-힣])랑(?=\s)/gu, (_, last: string) => last + (batchim(last) > 0 ? '과' : '와'))
    .replace(/\s+/g, ' ')
    .trim()
}

/** at most two observations a sentence: a long memo keeps its first, last and most varied */
function chooseClauses(clauses: string[], room: number): string[] {
  if (clauses.length <= room) return clauses
  const chosen = new Set([0, clauses.length - 1])
  const seen = terms(clauses[0] + clauses[clauses.length - 1])
  while (chosen.size < room) {
    let best = -1
    let gain = -1
    for (const [index, clause] of clauses.entries()) {
      if (chosen.has(index)) continue
      const added = [...terms(clause)].filter((term) => !seen.has(term)).length
      if (added > gain) {
        best = index
        gain = added
      }
    }
    chosen.add(best)
    terms(clauses[best]).forEach((term) => seen.add(term))
  }
  return clauses.filter((_, index) => chosen.has(index))
}

function terms(text: string): Set<string> {
  const result = new Set<string>()
  for (const word of text.toLowerCase().match(/[가-힣A-Za-z0-9]+/g) ?? [])
    for (let index = 0; index < Math.max(1, word.length - 1); index++)
      result.add(word.slice(index, index + 2))
  return result
}

/* ------------------------------------------------- what an observation is about */

type Area = '학습' | '관계' | '책임' | '표현' | '조절' | '흥미' | '생활' | '참여'
type Reading = 'strength' | 'concern' | 'growth'

const AREAS: readonly [Area, RegExp][] = [
  ['관계', /친절|동생|입장을 먼저|물어보|물어봄|허락|자기\s*(?:이야기|얘기|말)|끊|친구|짝|또래|다투|다툼|싸우|싸움|싸웠|사과|어울|양보|배려|도와|도움|이기적|자기중심|따돌|놀리|모둠원/u],
  ['조절', /주의가|울면|웃으며|화를|화가|짜증|울[고어음]|참[지는고]|집중|산만|떠들|장난|흥분|감정|차분|기다[리려]/u],
  ['흥미', /좋아|즐겨|즐기|관심|흥미|재미/u],
  ['표현', /발표|목소리|의견|말[을이하]|말해|설명|그림|노래|표현|글쓰기|일기/u],
  ['책임', /청소|정리|맡은|역할|당번|준비물|숙제|과제|약속|규칙|차례|순서|늦|우산|챙기|챙겨|성실|1인 1역/u],
  ['학습', /수학|국어|영어|과학|사회 시간|사회 과목|공부|문제|계산|읽|단어|분수|곱셈|나눗셈|덧셈|뺄셈|받아|수업|학습|시험|개념|실험/u],
  ['생활', /편식|급식|지각|등교|하교|인사|위생|손 씻|정리정돈|사물함|식습관|휴대폰|스마트폰|게임/u],
  ['참여', /리더십|사회를 보|사회 보|사회 봄|회장|이끌|적극|체육|운동|활동|행사|동아리|봉사|축제|참여|체험|운동회|대회|캠페인/u],
]

const CHANGE = /요즘|최근|이제는?|점점|점차|차츰|전보다|예전보다|처음에는|처음엔|뒤로는?|이후로|이후에는|다음부터|부터는|2학기에는|2학기엔|학기 말|나아졌|좋아졌|늘었|줄었|바뀌|달라졌/u
/** a change that follows the observation before it */
const AFTER = /뒤로는?|이후로|이후에는|다음부터|부터는|그\s?뒤/u

/** a change for the better: the old trouble is gone or less */
const BETTER = /않|안\s|원만|나아|좋아|줄었|줄어|줄|고쳐|바로잡/u
/** someone else does it: the clause is the setting of the student's part */
const OTHER_SUBJECT = /^(?:짝|친구|친구들|상대|다른 친구|모둠원|선생님|엄마|아빠|부모님)(?:이|가|은|는|들이|들은)\s/u
const NEGATIVE = /장난|고집|말대꾸|대꾸|무단|다치게|꼬집|욕설|핑계|거부|회피|포기|엎드려|졸|분실|잃어버|입장을 먼저 생각|주의가 쉽게 흩어|새치기|끼어들|끼어듦|말을 자르|딴짓|편식|남김|결석|잦|자꾸|심하|심함|허락 없이|가져가|빼앗|때리|때림|밀치|욕을|욕함|놀리|놀림|무시|거짓말|투정|미루|어지럽|함부로|던지|뛰어다|소리를 지|소리 지|큰소리|말이 없|말수가 적|별로 없|혼자만|자기\s*(?:이야기|얘기|말|생각)(?:부터|만)|이기적|자기중심|다투|다툼|싸우|싸움|싸웠|떠들|방해|산만|장난이 심|헷갈|빼먹|빠뜨|놓치|놓침|잊|어려워|어려움|서툴|부족|미흡|소극|짜증|화를|화가|늦|지각|안 해|안 함|하지 않|못 함|못함|못해|못한|작아|작음|작다|아직|실수|고집|울어|울음/u
const NEGATED = /(?:다투|싸우|떠들|늦|잊|빼먹|빠뜨|놓치|울|화내|방해하|장난치|끊)지\s*않|안\s*(?:싸우|싸워|다투|다퉈|떠들|늦|빼먹|울|화내)/u
const POSITIVE = /잘|꾸준|성실|열심|도와|도움|배려|양보|적극|정확|책임|끝까지|스스로|좋아|즐겨|칭찬|바르|예의|친절|100점|만점|리더십|솔선|앞장|모범/u

/**
 * what the teacher's words say of the student, from the words alone: null when someone else
 * acts, undefined when no word tells (the model is asked then)
 */
function readingOf(clause: string): Reading | null | undefined {
  if (OTHER_SUBJECT.test(clause)) return null
  if (NEGATED.test(clause)) return CHANGE.test(clause) ? 'growth' : 'strength'
  const negative = NEGATIVE.test(clause)
  if (CHANGE.test(clause) && (!negative || BETTER.test(clause))) return 'growth'
  if (negative) return 'concern'
  return POSITIVE.test(clause) ? 'strength' : undefined
}

const READING_SHOTS: readonly [string, string][] = [
  ['발표할 때 목소리가 작음', '보완'], ['친구를 잘 도와줌', '강점'], ['요즘은 숙제를 챙겨 옴', '변화'],
  ['짝이 먼저 인사함', '중립'], ['자주 다투지 않음', '강점'], ['쉬는 시간에 운동장에 나감', '중립'],
  ['수업 중 떠듦', '보완'], ['전보다 글씨가 바르게 됨', '변화'],
]
const READING_OF: Record<string, Reading | null> = { 강점: 'strength', 보완: 'concern', 변화: 'growth', 중립: null }

/** the words' reading, or the model's choice among four when no word tells */
async function classify(
  clause: string,
  model: string,
  lora: (scale: number) => unknown,
  complete: (body: Record<string, unknown>) => Promise<{ text: string; stopped: boolean }>,
): Promise<Reading | null> {
  const lexical = readingOf(clause)
  if (lexical !== undefined) return lexical
  const messages = [{
    role: 'system',
    content: '교사의 관찰 메모가 학생에 대해 무엇을 말하는지 하나로 고른다. 강점: 칭찬할 행동. ' +
      '보완: 고쳐야 하거나 어려워하는 점. 변화: 예전보다 나아진 점. 중립: 좋고 나쁨이 드러나지 않는 사실.',
  }]
  for (const [memo, answer] of READING_SHOTS)
    messages.push({ role: 'user', content: memo }, { role: 'assistant', content: answer })
  messages.push({ role: 'user', content: clause })
  const reply = await complete({
    model, messages, grammar: 'root ::= "강점" | "보완" | "변화" | "중립"', temperature: 0, max_tokens: 4,
    lora: lora(0), chat_template_kwargs: { enable_thinking: false },
  })
  // a concern no word of the memo names stays unsaid: the observation is stated as it is
  const reading = READING_OF[reply.text.trim()] ?? null
  return reading === 'concern' ? null : reading
}

function areaOf(clause: string, category: ObservationCategory): Area {
  if (category === '평어') return '학습'
  if (category === '창체') return '참여'
  return AREAS.find(([, pattern]) => pattern.test(clause))?.[0] ?? '생활'
}

/* --------------------------------------------------- the reviewed sentences */

/** one sentence that reads an observation's meaning, never its events (two to vary) */
const BEHAVIOR_READINGS: Record<Area, Record<Reading, readonly [string, string]>> = {
  학습: {
    strength: [
      '배운 내용을 이해하고 과제에 적용하려는 모습에서 학습에 대한 관심과 자신감이 드러나며, 이는 새로운 내용을 배울 때 든든한 바탕이 됨.',
      '학습에서 보이는 이러한 강점을 바탕으로 자신의 생각과 해결 과정을 말로 설명해 보는 경험을 쌓는다면 배움이 한층 깊어질 수 있음.',
    ],
    concern: [
      '학습 과정에서 놓치기 쉬운 부분을 스스로 점검하는 습관을 기르면 알고 있는 내용을 더욱 정확하게 익힐 수 있음.',
      '어려운 부분을 한 단계씩 나누어 연습하고 도움이 필요할 때 질문하는 경험을 쌓아 가며 학습에 대한 자신감을 기를 필요가 있음.',
    ],
    growth: [
      '꾸준한 노력을 통해 이전보다 나아진 모습을 보이며, 스스로 변화를 만들어 가는 경험이 학습에 대한 자신감으로 이어지고 있음.',
      '작은 변화를 꾸준히 이어 가는 태도를 지니고 있어 학습 전반에서 지속적인 성장이 보임.',
    ],
  },
  관계: {
    strength: [
      '함께 생활하는 친구에게 관심을 기울이고 상대를 존중하는 태도가 행동으로 드러나, 학급 안에서 서로 믿고 의지하는 분위기를 만드는 데 기여함.',
      '주변 사람의 마음을 헤아리는 따뜻한 성품을 지니고 있어 다양한 친구와 원만한 관계를 맺어 가는 힘이 돋보임.',
    ],
    concern: [
      '친구와 생각이 엇갈릴 때 자신의 입장을 차분히 전하고 상대의 이야기를 끝까지 들어 보는 경험을 꾸준히 쌓아 갈 필요가 있음.',
      '갈등 상황에서 누가 옳은지를 가리기보다 서로 바라는 점을 말로 나누어 보는 연습을 이어 가며 함께 지내는 방법을 익혀 갈 필요가 있음.',
    ],
    growth: [
      '친구와 관계를 맺는 방식이 점차 안정되어 가는 모습을 보여, 상대의 입장을 헤아리려는 노력이 행동으로 이어지고 있음.',
      '관계 속에서 스스로 달라지려는 노력을 이어 가며 친구와 서로 존중하며 지내는 힘을 키워 가고 있음.',
    ],
  },
  책임: {
    strength: [
      '맡은 일을 끝까지 해내고 공동의 약속을 지키려는 태도에서 책임감과 성실함이 드러나며, 학급 생활이 원활하게 이루어지는 데 보탬이 됨.',
      '작은 일도 소홀히 하지 않는 성실한 생활 태도를 지니고 있어 주변의 신뢰를 얻는 모습을 보임.',
    ],
    concern: [
      '해야 할 일을 미리 확인하고 차례대로 챙기는 습관을 기른다면 맡은 일을 더욱 책임감 있게 마무리할 수 있음.',
      '공동의 약속이 함께 생활하는 모든 사람을 위한 것임을 생각해 보고 하나씩 지켜 가는 경험을 쌓을 필요가 있음.',
    ],
    growth: [
      '맡은 일을 챙기는 모습이 점차 자리 잡아 가며 스스로 생활을 꾸려 가려는 의지가 드러남.',
      '생활 습관을 바르게 다듬어 가는 노력을 꾸준히 이어 가며 이전보다 성숙한 모습을 보임.',
    ],
  },
  표현: {
    strength: [
      '자신의 생각을 다른 사람에게 알맞게 전하려는 모습에서 표현에 대한 자신감이 드러나며, 이는 친구들과 생각을 나누는 데 좋은 바탕이 됨.',
      '표현하는 즐거움을 알고 있어 다양한 방식으로 자신의 생각을 드러내는 경험을 넓혀 간다면 자신만의 표현력이 한층 자랄 수 있음.',
    ],
    concern: [
      '자신의 생각을 편안하게 드러낼 수 있도록 짧은 발표부터 차근차근 경험을 쌓아 가며 표현에 대한 자신감을 기를 필요가 있음.',
      '말하고 싶은 내용을 미리 정리해 보고 작은 자리에서부터 의견을 나누는 경험을 쌓으며 자신의 생각을 전하는 힘을 길러 갈 필요가 있음.',
    ],
    growth: [
      '자신의 생각을 드러내는 데 점차 자신감을 얻어 가는 모습을 보이며, 표현하려는 노력이 꾸준히 이어지고 있음.',
      '표현에서 보이는 변화를 바탕으로 여러 자리에서 자신의 생각을 나누려는 모습이 늘어 가고 있음.',
    ],
  },
  조절: {
    strength: [
      '상황에 맞게 자신의 감정과 행동을 조절하는 모습이 돋보이며, 차분한 태도로 학교생활에 임함.',
      '스스로를 돌아보고 조절하는 힘을 지니고 있어 어려운 상황에서도 침착하게 대처하는 모습을 보임.',
    ],
    concern: [
      '감정이 앞설 때 잠시 멈추어 자신의 마음을 말로 표현해 보는 연습을 통해 상황에 맞게 행동을 조절하는 힘을 기를 필요가 있음.',
      '해야 할 일에 주의를 모으는 시간을 조금씩 늘려 가며 스스로를 조절하는 경험을 쌓아 갈 필요가 있음.',
    ],
    growth: [
      '자신의 감정과 행동을 다스리려는 노력이 점차 행동으로 이어지며 이전보다 차분해진 모습을 보임.',
      '스스로를 조절하려는 노력을 꾸준히 이어 가며 안정된 학교생활을 만들어 가고 있음.',
    ],
  },
  흥미: {
    strength: [
      '좋아하는 분야에 꾸준히 관심을 기울이며 즐겁게 몰입하는 모습에서 배움을 스스로 이어 가는 힘이 드러남.',
      '흥미를 느끼는 분야를 꾸준히 넓혀 간다면 자신만의 강점을 찾아 키워 가는 데 좋은 바탕이 될 수 있음.',
    ],
    concern: [
      '관심을 가질 만한 분야를 찾아 즐겁게 참여해 보는 경험을 늘려 갈 필요가 있음.',
      '작은 성공 경험을 쌓으며 스스로 흥미를 느끼는 활동을 찾아 가도록 도울 필요가 있음.',
    ],
    growth: [
      '새로운 분야에 대한 관심이 점차 넓어지며 배움을 즐기는 태도가 자라고 있음.',
      '관심의 폭을 넓혀 가는 변화를 바탕으로 여러 활동에 즐겁게 참여하는 모습을 보임.',
    ],
  },
  생활: {
    strength: [
      '바른 생활 습관을 스스로 지켜 가는 모습에서 자신의 생활을 책임 있게 꾸려 가려는 태도가 드러남.',
      '일상에서 지켜야 할 약속을 꾸준히 실천하며 건강한 학교생활의 바탕을 다져 가고 있음.',
    ],
    concern: [
      '바른 생활 습관을 몸에 익힐 수 있도록 스스로 실천할 수 있는 작은 목표부터 세워 볼 필요가 있음.',
      '일상에서 지켜야 할 습관이 왜 필요한지 생각해 보고 하나씩 실천해 가는 경험을 쌓을 필요가 있음.',
    ],
    growth: [
      '생활 습관을 바르게 다듬어 가는 노력이 점차 자리 잡아 가며 스스로 생활을 꾸려 가는 힘이 자라고 있음.',
      '일상에서 보이는 긍정적인 변화를 꾸준히 이어 가며 이전보다 안정된 학교생활을 하고 있음.',
    ],
  },
  참여: {
    strength: [
      '학급 활동에 관심을 가지고 즐겁게 참여하는 모습에서 공동체의 일원으로서 함께하려는 태도가 드러남.',
      '맡은 자리에서 자신이 할 수 있는 일을 찾아 실천하는 모습이 돋보여 함께하는 활동에 보탬이 됨.',
    ],
    concern: [
      '관심 있는 활동부터 조금씩 참여의 폭을 넓혀 가며 공동체 활동에 함께하는 즐거움을 느껴 볼 필요가 있음.',
      '활동 속에서 자신이 할 수 있는 역할을 찾아 작은 부분부터 맡아 보는 경험을 쌓아 갈 필요가 있음.',
    ],
    growth: [
      '활동에 참여하는 모습이 점차 적극적으로 바뀌어 가며 함께하는 경험의 폭을 넓혀 가고 있음.',
      '참여에서 보이는 변화를 바탕으로 여러 활동에서 자신의 역할을 찾아 가는 모습을 보임.',
    ],
  },
}

const SUBJECT_READINGS: Record<Reading, readonly [string, string]> = {
  strength: [
    '과제의 요구를 정확하게 파악하고 자신이 알고 있는 내용을 활용하여 해결하려는 태도가 돋보임.',
    '배운 내용을 자신의 말로 설명해 보는 경험을 더하면 이해가 한층 깊어질 수 있음.',
  ],
  concern: [
    '자신이 어려워하는 부분을 스스로 찾아 질문하고 확인하는 습관을 기르면 이해가 한층 단단해질 수 있음.',
    '어려운 부분을 나누어 반복해서 연습하며 자신감을 가지고 과제를 해결해 갈 필요가 있음.',
  ],
  growth: [
    '앞서 어려워하던 부분을 스스로 바로잡으며 이해를 넓혀 가는 모습이 돋보임.',
    '지금의 노력을 이어 가며 한층 안정적인 성취를 만들어 가고 있음.',
  ],
}

const ACTIVITY_READINGS: Record<Reading, readonly [string, string]> = {
  strength: [
    '공동의 활동이 원활하게 이루어지도록 자신의 몫을 성실하게 해내며 함께하는 즐거움을 경험함.',
    '활동 과정에서 자신이 할 수 있는 일을 찾아 실천하는 태도가 돋보임.',
  ],
  concern: [
    '함께하는 친구들의 역할을 살펴보며 자신이 보탤 수 있는 일을 찾아보는 경험이 필요함.',
    '함께하는 친구들과 역할을 나누어 보는 경험을 쌓으며 참여에 대한 자신감을 길러 갈 필요가 있음.',
  ],
  growth: [
    '활동 속에서 자신의 역할을 찾아 가며 함께하는 즐거움을 알아 가고 있음.',
    '지금의 변화를 바탕으로 여러 활동에서 자신의 역할을 찾아 가는 모습을 보임.',
  ],
}

/** one more 행발 sentence when a one-word memo leaves the paragraph short */
const BEHAVIOR_GENERAL: Record<Reading, string> = {
  strength: '꾸준히 보여 주는 이러한 장점은 친구들과 함께 생활하며 서로 배우고 성장해 가는 데 든든한 밑거름이 되며, 학급 안에서도 긍정적인 영향을 주고 있음.',
  concern: '구체적인 목표를 함께 정하고 작은 변화부터 실천해 보며 스스로 달라지는 경험을 쌓을 수 있도록 지도하고 있으며, 조금씩 나아지는 과정을 함께 살펴보고 있음.',
  growth: '이전보다 나아진 자신의 모습을 스스로 인식하며 긍정적인 변화를 꾸준히 이어 가려는 의지를 보이고, 그 과정에서 자신감도 함께 자라고 있음.',
}

/** the paragraph's own sentence when no observation reads as a strength, concern or change */
const NEUTRAL: Record<ObservationCategory, string> = {
  행발: '학교생활 전반에서 자신의 모습을 돌아보며 해야 할 일을 차근차근 해 나가는 과정에 있음.',
  평어: '학습 활동에 꾸준히 참여하며 배운 내용을 자신의 방식으로 정리해 감.',
  창체: '활동에 참여하며 자신이 맡은 일을 차근차근 해 나감.',
}

/** the 행발's last sentence: the only one that looks ahead */
function behaviorClosing(readings: Reading[]): string {
  const strong = readings.includes('strength') || readings.includes('growth')
  if (!readings.includes('concern'))
    return '학교생활 전반에서 보이는 이러한 모습을 바탕으로 다양한 경험을 쌓아 가며 자신의 가능성을 넓혀 갈 것으로 기대됨.'
  return strong
    ? '스스로를 돌아보고 조금씩 바꾸어 가는 경험이 쌓인다면 지닌 장점을 살려 한층 성장한 모습을 보일 것으로 기대됨.'
    : '작은 실천부터 꾸준히 이어 가며 스스로 변화를 만들어 간다면 한층 성장한 모습을 보일 것으로 기대됨.'
}

function readingsFor(category: ObservationCategory, area: Area, reading: Reading) {
  if (category === '평어') return SUBJECT_READINGS[reading]
  if (category === '창체') return ACTIVITY_READINGS[reading]
  return BEHAVIOR_READINGS[area][reading]
}

/* ----------------------------------- the teacher's words inside a record sentence */

/** "-하다" words that describe (성실한), the rest act (정리하는) */
const HA_ADJECTIVE = /(?:심|강|약|꾸준|원활|훌륭|성실|차분|조용|친절|꼼꼼|정확|산만|활발|부지런|착실|솔직|용감|씩씩|명랑|공손|다정|적극적|소극적|능숙|원만|깔끔|침착|신중|섬세|유쾌|온순|느긋|급|미숙|서툴|부족|우수|뛰어나지 않)$/u
const ADJECTIVE = /(?:잦|작|많|좋|높|낮|밝|착|넓|좁|짧|길|깊|얕|굵|싫|괜찮|같)$/u
const B_ADJECTIVE = /(?:어려|무서|귀여|즐거|반가|고마|가벼|무거|쉬|부끄러|외로|아름다|서러)$/u
const M_ADJECTIVE: Record<string, string> = {
  큼: '큰', 느림: '느린', 빠름: '빠른', 어려움: '어려운', 서투름: '서투른', 아픔: '아픈', 바쁨: '바쁜',
  다름: '다른', 기쁨: '기쁜', 슬픔: '슬픈', 부족함: '부족한', 서툶: '서툰',
}
/** words that end in ㅁ but name a thing (그림, 마음) */
const M_NOUN = /(?:그림|마음|사람|꿈|힘|시험|모둠|이름|처음|다음|요즘|게임|점|아침|점심|발음|질문)$/u

const MODIFIERS: readonly [RegExp, (match: RegExpExecArray) => string][] = [
  [/^(.+지\s*)않(?:았어요|았다|았음|았습니다)$/u, (m) => m[1] + '않은'],
  [/^(.+지\s*)않(?:아요|음|는다|다|습니다)$/u, (m) => m[1] + '않는'],
  [/^(.*[^보])(?:이다|이에요|예요|입니다|임)$/u, (m) => m[1] + '인'],
  [/^(.+?)(\s?)(?:해요|한다|함|합니다|하다|했다|했어요|했음|했습니다)$/u,
    (m) => m[1] + m[2] + (HA_ADJECTIVE.test(m[1]) ? '한' : '하는')],
  [/^(.+)있(?:어요|다|음|습니다)$/u, (m) => m[1] + '있는'],
  [/^(.+)없(?:어요|다|음|습니다)$/u, (m) => m[1] + '없는'],
  [/^(.+)려요$/u, (m) => m[1] + '리는'],
  [/^(.+)워요$/u, (m) => m[1] + (B_ADJECTIVE.test(m[1]) ? '운' : '우는')],
  [/^(.+)쳐요$/u, (m) => m[1] + '치는'],
  [/^(.+)줘요$/u, (m) => m[1] + '주는'],
  [/^(.+)봐요$/u, (m) => m[1] + '보는'],
  [/^(.+)와요$/u, (m) => m[1] + '오는'],
  [/^(.+)써요$/u, (m) => m[1] + '쓰는'],
  [/^(.+)내요$/u, (m) => m[1] + '내는'],
  [/^(.+)는다$/u, (m) => m[1] + '는'],
]

const DESCRIBING = /^(?:작|크|커|많|적|높|낮|느려|느리|빨라|빠르|어려|어렵|약해|약하|강해|강하|부족|서툴|좋)(?:아요|어요|다|음|아|은|해요|함|하다|워요|움|운|요)?$/u

/** "수학은 잘함" inside a sentence reads "수학을 잘하는": the topic marker becomes the object's */
function asObject(clause: string): string {
  return clause.replace(/^([가-힣]{2,}?)(은|는)(?=\s)/u, (whole, word: string) => {
    if (/(?:에서|에|때|께|에게|처음|최근|이후|본인)$/u.test(word)) return whole
    const consonant = batchim(word.at(-1) ?? '') > 0
    if (DESCRIBING.test(clause.split(' ').at(-1) ?? '')) return word + (consonant ? '이' : '가')
    return word + (consonant ? '을' : '를')
  })
}

/** the clause as the words before 모습 (자주 다툰다 → 자주 다투는), or null when unsure */
export function modifierOf(clause: string): string | null {
  const text = asObject(clause.replace(/[.!?~]+$/u, '').trim())
  for (const [pattern, build] of MODIFIERS.slice(0, 2)) {
    const match = pattern.exec(text)
    if (match) return build(match)
  }
  // a past event ("모아 뒀음") stays a sentence of its own
  const tense = /^(.*)(?:다|어요|음|습니다)$/u.exec(text)?.[1]
  if (tense && batchim(tense.at(-1) ?? '') === 20 && !tense.endsWith('있')) return null
  for (const [pattern, build] of MODIFIERS.slice(2)) {
    const match = pattern.exec(text)
    if (match) return build(match)
  }
  const last = text.at(-1) ?? ''
  const stem = text.slice(0, -1)
  const end = stem.at(-1) ?? ''
  if (/다$/u.test(text) && stem) {
    if (batchim(end) === 4) return stem.slice(0, -1) + String.fromCharCode(0xac00 + syllable(end) - 4) + '는'
    if (batchim(end) > 0) return stem + (ADJECTIVE.test(stem) ? '은' : '는')
    return null
  }
  if (/[아어]요$/u.test(text)) {
    const base = text.slice(0, -2)
    if (batchim(base.at(-1) ?? '') > 0) return base + (ADJECTIVE.test(base) ? '은' : '는')
    return null
  }
  const word = text.split(' ').at(-1) ?? ''
  if (M_ADJECTIVE[word]) return text.slice(0, -word.length) + M_ADJECTIVE[word]
  if (M_NOUN.test(text)) return null
  if (/음$/u.test(text) && batchim(end) > 0) return stem + (ADJECTIVE.test(stem) ? '은' : '는')
  if (batchim(last) === 16) return stem + String.fromCharCode(0xac00 + syllable(last) - 16) + '는'
  return null
}

/** the short reading that follows the observation inside its sentence */
const BEHAVIOR_FOLLOW: Record<Area, Record<Reading, string>> = {
  학습: {
    strength: '배운 내용을 과제에 적용하려는 관심과 자신감이 드러남.',
    concern: '놓치기 쉬운 부분을 스스로 점검하는 습관을 기를 필요가 있음.',
    growth: '꾸준한 노력이 학습에 대한 자신감으로 이어지고 있음.',
  },
  관계: {
    strength: '함께 생활하는 친구를 존중하는 태도가 행동으로 드러남.',
    concern: '친구와 생각이 엇갈릴 때 자신의 입장을 차분히 전하고 상대의 이야기를 끝까지 들어 보는 경험이 필요함.',
    growth: '친구와 관계를 맺는 방식이 점차 안정되어 가고 있음.',
  },
  책임: {
    strength: '맡은 일을 끝까지 해내려는 책임감과 성실함이 드러남.',
    concern: '해야 할 일을 미리 확인하고 차례대로 챙기는 습관을 기를 필요가 있음.',
    growth: '스스로 생활을 꾸려 가려는 의지가 점차 자리 잡아 가고 있음.',
  },
  표현: {
    strength: '자신의 생각을 다른 사람에게 알맞게 전하려는 자신감이 드러남.',
    concern: '짧은 발표부터 차근차근 경험을 쌓으며 표현에 대한 자신감을 기를 필요가 있음.',
    growth: '자신의 생각을 드러내는 데 점차 자신감을 얻어 가고 있음.',
  },
  조절: {
    strength: '상황에 맞게 감정과 행동을 조절하는 차분함이 돋보임.',
    concern: '감정이 앞설 때 잠시 멈추어 마음을 말로 표현해 보는 연습이 필요함.',
    growth: '감정과 행동을 다스리려는 노력이 점차 행동으로 이어지고 있음.',
  },
  흥미: {
    strength: '좋아하는 분야에 꾸준히 관심을 기울이며 즐겁게 몰입하는 태도가 돋보임.',
    concern: '관심을 가질 만한 분야를 찾아 즐겁게 참여해 보는 경험이 필요함.',
    growth: '새로운 분야에 대한 관심이 점차 넓어지고 있음.',
  },
  생활: {
    strength: '바른 생활 습관을 스스로 지켜 가는 태도가 돋보임.',
    concern: '작은 목표부터 세워 바른 생활 습관을 몸에 익혀 갈 필요가 있음.',
    growth: '생활 습관을 바르게 다듬어 가는 노력이 점차 자리 잡아 가고 있음.',
  },
  참여: {
    strength: '공동체의 일원으로서 함께하려는 태도가 드러남.',
    concern: '관심 있는 활동부터 조금씩 참여의 폭을 넓혀 갈 필요가 있음.',
    growth: '활동에 함께하는 경험의 폭을 점차 넓혀 가고 있음.',
  },
}
const SUBJECT_FOLLOW: Record<Reading, string> = {
  strength: '학습한 내용을 바탕으로 자신의 이해를 넓혀 감.',
  concern: '해결 과정을 한 단계씩 점검하는 습관을 기를 필요가 있음.',
  growth: '꾸준한 연습을 통해 학습에 대한 자신감을 키워 가고 있음.',
}
const ACTIVITY_FOLLOW: Record<Reading, string> = {
  strength: '맡은 역할을 책임감 있게 수행함.',
  concern: '활동 속에서 자신이 맡을 수 있는 역할을 찾아 참여의 폭을 넓혀 갈 필요가 있음.',
  growth: '참여하는 모습이 점차 적극적으로 바뀌어 가고 있음.',
}

function followOf(category: ObservationCategory, area: Area, reading: Reading): string {
  if (category === '평어') return SUBJECT_FOLLOW[reading]
  if (category === '창체') return ACTIVITY_FOLLOW[reading]
  return BEHAVIOR_FOLLOW[area][reading]
}

/** the ways an observation opens its sentence, in turn so that no two read alike */
const FRAMES: readonly { full: string; plain: string }[] = [
  { full: ' 모습을 보이며, ', plain: ' 모습을 보임.' },
  { full: ' 모습이 관찰되며, ', plain: ' 모습이 관찰됨.' },
  { full: ' 편으로, ', plain: ' 편임.' },
]


/* ---------------------------------------------- an observation as a sentence */

const syllable = (char: string): number => char.charCodeAt(0) - 0xac00
const isHangul = (char: string): boolean => syllable(char) >= 0 && syllable(char) < 11172
const batchim = (char: string): number => (isHangul(char) ? syllable(char) % 28 : -1)
/** the same syllable with ㅁ under it (크 → 큼, 툰 → 툼) */
const withMieum = (char: string): string =>
  String.fromCharCode(0xac00 + syllable(char) - batchim(char) + 16)

const ENDINGS: readonly [RegExp, string][] = [
  [/(?:이에요|예요|입니다|이다)$/u, '임'],
  [/(?:했어요|했습니다|했다|하였다|해요|합니다|한다|했음)$/u, '함'],
  [/(?:됐어요|돼요|됩니다|된다|됐다)$/u, '됨'],
  [/있(?:어요|습니다|다)$/u, '있음'],
  [/없(?:어요|습니다|다)$/u, '없음'],
  [/않(?:아요|습니다|는다|다|았다|았어요)$/u, '않음'],
  [/려요$/u, '림'],
  [/워요$/u, '움'],
  [/쳐요$/u, '침'],
  [/줘요$/u, '줌'],
  [/봐요$/u, '봄'],
  [/와요$/u, '옴'],
  [/써요$/u, '씀'],
  [/는다$/u, '음'],
]

/** the plain stem under a past ending: 냈 → 내, 봤 → 보, 골랐 → 고르 */
const CONTRACTED: Record<string, string> = {
  했: '하', 냈: '내', 봤: '보', 줬: '주', 왔: '오', 썼: '쓰', 졌: '지', 쳤: '치', 겼: '기', 렸: '리',
  웠: '우', 켰: '키', 혔: '히', 뒀: '두', 섰: '서', 갔: '가', 났: '나', 샀: '사', 였: '이', 됐: '되',
}

/** a past ending as the record's (찾아냈다 → 찾아냄, 놓았음 → 놓음, 골랐다 → 고름) */
function pastNominal(text: string): string | null {
  const match = /^(.*?)(었|았)?(?:다|어요|음|습니다)$/u.exec(text)
  if (!match) return null
  const body = match[1]
  if (match[2]) {
    const end = body.at(-1) ?? ''
    if (!isHangul(end)) return null
    return batchim(end) > 0 ? body + '음' : body.slice(0, -1) + withMieum(end)
  }
  const last = body.at(-1) ?? ''
  if (batchim(last) !== 20) return null
  if (last === '랐' || last === '렀') {
    const before = body.at(-2) ?? ''
    if (batchim(before) !== 8) return null
    return body.slice(0, -2) + String.fromCharCode(0xac00 + syllable(before) - 8) + '름'
  }
  const stem = CONTRACTED[last]
  return stem ? body.slice(0, -1) + withMieum(stem) : null
}

/** the teacher's own words with a record ending (다툰다 → 다툼, 잘해요 → 잘함) */
export function recordEnding(clause: string, category: ObservationCategory): string {
  const text = clause.replace(/[.!?~]+$/u, '').trim()
  const past = pastNominal(text)
  if (past) return past + '.'
  for (const [ending, nominal] of ENDINGS)
    if (ending.test(text)) return text.replace(ending, nominal) + '.'
  const last = text.at(-1) ?? ''
  if (batchim(last) === 16) return text + '.'
  const stem = text.replace(/(?:[아어]요|다)$/u, '')
  if (stem !== text && stem) {
    const end = stem.at(-1) ?? ''
    if (batchim(end) === 0 || batchim(end) === 4) return stem.slice(0, -1) + withMieum(end) + '.'
    return stem + '음.'
  }
  if (category === '창체') return text + ' 활동에 참여함.'
  if (category === '평어') return text + ' 학습에 참여함.'
  return text + (batchim(last) > 0 ? '을' : '를') + ' 꾸준히 실천함.'
}

const NEGATION = /않|안\s|못|없|말고/u
/** a plain-speech ending left inside a record sentence (살펴보았다 함) */
const SPOKEN = /[가-힣]다\s|[가-힣]다,|습니다|어요|아요/u
const INVENTED = /교사|선생님|부모|다행|입니다|습니다|학생은|이 학생|대회|수상|1등|만점|시험 점수|교체/u
const PARTICLE = /(?:에서|이랑|하고|으로|에게|까지|부터|처럼|보다|이나|은|는|이|가|을|를|에|와|과|랑|도|만|의|로|요)$/u
const SOFT = new Set(['그냥', '좀', '조금', '아주', '너무', '정말', '진짜', '많이', '항상', '늘', '되게', '약간', '그래도'])

/** the memo's words that a rewrite has to keep */
function keyStems(text: string): string[] {
  return (text.match(/[가-힣A-Za-z0-9]+/g) ?? [])
    .filter((word) => !SOFT.has(word))
    .map((word) => word.replace(PARTICLE, ''))
    .filter((word) => word.length >= 2)
    .map((word) => word.slice(0, 2))
}

/** words a record sentence may add around the teacher's (모습, 보임, 활동 …) */
const RECORD_WORDS = new Set(keyStems(
  '모습을 보임 보이며 활동에서 과정에서 자신의 스스로 꾸준히 최근에는 이전에는 있었으나 잦았으나 ' +
  '경우가 있음 친구와 친구들과 원만하게 지냄 함께 학습에서 수업에서 생활에서 태도를 노력함'))

/** a rewrite keeps the teacher's words, their sense and adds no event */
function keepsMeaning(source: string, sentence: string): boolean {
  const stems = keyStems(source)
  const kept = stems.filter((stem) => sentence.includes(stem)).length
  const added = keyStems(sentence).filter((stem) => !source.includes(stem) && !RECORD_WORDS.has(stem))
  const reading = readingOf(source)
  return kept >= Math.ceil(stems.length * 0.5) &&
    added.length <= 1 &&
    (!reading || reading === readingOf(sentence)) &&
    (NEGATION.test(source) || !NEGATION.test(sentence)) &&
    (reading !== 'concern' || !NEGATION.test(source) || NEGATION.test(sentence)) &&
    (reading !== undefined || !NEGATIVE.test(sentence) || NEGATIVE.test(source)) &&
    (!CHANGE.test(source) || CHANGE.test(sentence) || /으나|지만/u.test(sentence)) &&
    !SPOKEN.test(sentence) &&
    !(INVENTED.test(sentence) && !INVENTED.test(source))
}

const REWRITES: readonly [string, string][] = [
  ['친구 말을 끝까지 들어 줌', '친구가 이야기할 때 끝까지 귀 기울여 들어 주는 모습을 보임.'],
  ['발표할 때 목소리가 작음', '발표할 때 목소리가 작아 자신의 생각을 충분히 전하지 못하는 경우가 있음.'],
  ['자주 다투지 않음', '친구와 다투는 일 없이 원만하게 지냄.'],
  ['받아올림을 자주 놓침', '덧셈에서 받아올림을 자주 놓치는 모습을 보임.'],
  ['숙제를 자주 잊음. 요즘은 알림장을 보고 챙겨 옴',
    '숙제를 잊는 일이 잦았으나 최근에는 알림장을 확인하며 스스로 챙겨 오는 모습을 보임.'],
  ['우산꽂이에 남은 우산을 모아 둠', '우산꽂이에 남은 우산을 따로 모아 정리해 둠.'],
]

const SENTENCE_GRAMMAR = 'root ::= [가-힣0-9] [가-힣0-9 ,·()%~-]{6,150} ' +
  '("함" | "임" | "음" | "됨" | "봄" | "줌" | "냄" | "짐" | "움" | "림" | "김" | "힘" | "침" | "름" | "옴" | "씀" | "남" | "춤" | "킴" | "툼" | "듦" | "앎" | "품" | "늠" | "맴") "."'

/** one or two observations as one record sentence, or the teacher's words with a record ending */
async function rewrite(
  group: string[],
  category: ObservationCategory,
  example: ObservationExample | undefined,
  model: string,
  lora: (scale: number) => unknown,
  complete: (body: Record<string, unknown>) => Promise<{ text: string; stopped: boolean }>,
): Promise<string> {
  const source = group.map(tidy).join('. ')
  const messages: { role: string; content: string }[] = [{
    role: 'system',
    content: '교사의 짧은 관찰 메모를 학교생활기록부 문장 하나로 다듬는다. 메모에 적힌 행동, 빈도, 부정, 변화를 그대로 살리고 ' +
      '메모에 없는 사건이나 사람, 결과를 덧붙이지 않는다. 학생을 주어로 쓰지 않고 명사형으로 끝낸다.',
  }]
  const shots = example ? [...REWRITES, [example.memo, example.answer] as const] : REWRITES
  for (const [memo, answer] of shots)
    messages.push({ role: 'user', content: memo }, { role: 'assistant', content: answer })
  messages.push({ role: 'user', content: source })
  for (const scale of [0.3, 0]) {
    const reply = await complete({
      model, messages, grammar: SENTENCE_GRAMMAR, temperature: 0, seed: 29, max_tokens: 160,
      lora: lora(scale), chat_template_kwargs: { enable_thinking: false },
    })
    const sentence = reply.text.trim().replace(/(\d)\s(?=[월일점단학회번개명])/gu, '$1')
    if (reply.stopped && keepsMeaning(source, sentence)) return sentence
  }
  return group.map((clause) => recordEnding(tidy(clause), category)).join(' ')
}

/* ---------------------------------------------------------------- the paragraph */

function phrase(category: ObservationCategory, clauses: string[]): string | null {
  const lookup = (part: string): readonly string[] | undefined =>
    PHRASES[category].find(([pattern]) => new RegExp('^(?:' + pattern + ')$', 'u').test(part))?.[1]
  const groups = [...new Set(clauses.map(lookup))]
  if (!groups.length || groups.some((group) => !group)) return null
  const known = groups as (readonly string[])[]
  const limit = category === '행발' ? 4 : 3
  if (known.length > limit) return null
  if (known.length === 1) return known[0].slice(0, limit).join(' ')
  const choices: string[] = []
  const choose = (index: number, sentences: string[]) => {
    if (index === known.length) {
      if (sentences.length === limit) choices.push(sentences.join(' '))
      return
    }
    for (let count = 1; count <= known[index].length && sentences.length + count <= limit; count++)
      choose(index + 1, [...sentences, ...known[index].slice(0, count)])
  }
  choose(0, [])
  return choices.sort((a, b) => Math.abs(a.length - 350) - Math.abs(b.length - 350))[0] ?? null
}

/** a memo whose every observation has reviewed wording: no model needed */
export function draftFromObservation(observation: Observation): string | null {
  return phrase(observation.category, clausesOf(observation.note))
}

interface Part {
  full: string
  plain: string
  area: Area
  reading: Reading | null
}

export async function composeObservation(
  observation: Observation,
  examples: readonly ObservationExample[],
  model: string,
  lora: (scale: number) => unknown,
  complete: (body: Record<string, unknown>) => Promise<{ text: string; stopped: boolean }>,
): Promise<string> {
  const { category } = observation
  const shape = SHAPE[category]
  const clauses = chooseClauses(clausesOf(observation.note), shape.clauses)
  if (!clauses.length) throw new Error('관찰 메모를 입력해 주세요.')
  const reviewed = phrase(category, clauses)
  if (reviewed) return reviewed

  const query = terms(clauses.join(' '))
  let example: ObservationExample | undefined
  let best = 0
  for (const candidate of examples) {
    if (candidate.category !== category) continue
    const vocab = terms(candidate.memo)
    const shared = [...query].filter((term) => vocab.has(term)).length
    const score = shared / Math.max(1, query.size + vocab.size - shared)
    if (score > best) {
      example = candidate
      best = score
    }
  }

  // each observation in the teacher's own words, followed by what it shows
  const parts: Part[] = []
  const followed = new Set<string>()
  for (const clause of clauses) {
    const text = tidy(clause)
    const reading = await classify(text, model, lora, complete)
    // "이야기한 뒤로는 먼저 물어봄" changes what the clause before it described
    const previous = parts.at(-1)
    const area = reading === 'growth' && previous && AFTER.test(text) ? previous.area : areaOf(text, category)
    const modifier = reading ? modifierOf(text) : null
    if (reading && modifier) {
      const frame = FRAMES[parts.filter((part) => part.full !== part.plain).length % FRAMES.length]
      const follow = followOf(category, area, reading)
      const repeated = followed.has(follow)
      followed.add(follow)
      parts.push({
        full: repeated ? modifier + frame.plain : modifier + frame.full + follow,
        plain: modifier + frame.plain,
        area,
        reading,
      })
    } else {
      const sentence = OTHER_SUBJECT.test(text)
        ? recordEnding(text, category)
        : await rewrite([clause], category, example, model, lora, complete)
      parts.push({ full: sentence, plain: sentence, area, reading })
    }
  }
  const length = (list: string[]) => list.join(' ').length
  // too long: the later readings go first, the teacher's observations stay
  for (let index = parts.length - 1; index > 0 && length(parts.map((p) => p.full)) > shape.max; index--)
    parts[index].full = parts[index].plain

  const readings = parts.flatMap((part) => (part.reading ? [part] : []))
  const closing = category === '행발' ? behaviorClosing(readings.map((part) => part.reading as Reading)) : null
  const sentences = parts.map((part) => part.full)
  // an observation already read inside its sentence takes the other reading
  // a reading already said inside an observation's sentence goes on with its other wording
  const extra = [...new Set(readings.flatMap(({ area, reading }) => {
    const [first, second] = readingsFor(category, area, reading as Reading)
    return followed.has(followOf(category, area, reading as Reading)) && category === '행발'
      ? [second] : [first, second]
  }))]
  if (category === '행발') extra.push(...new Set(readings.map(({ reading }) => BEHAVIOR_GENERAL[reading as Reading])))
  if (!readings.length) extra.push(NEUTRAL[category])
  for (const sentence of extra) {
    const count = sentences.length + (closing ? 1 : 0)
    const chars = length([...sentences, ...(closing ? [closing] : [])])
    if ((count >= shape.sentences && chars >= shape.chars) || count >= shape.most) break
    if (chars + sentence.length <= shape.max) sentences.push(sentence)
  }
  if (closing) sentences.push(closing)
  return sentences.join(' ')
}


export async function completeObservation(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ text: string; stopped: boolean }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
  })
  if (!response.ok)
    throw new Error('똑딱AI가 관찰 기록에 답하지 못했어요 (' + response.status + ').')
  const data = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[]
  }
  const choice = data.choices?.[0]
  return { text: choice?.message?.content ?? '', stopped: choice?.finish_reason === 'stop' }
}
