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

const clausesOf = (text: string): string[] => [...new Set(text.normalize('NFC')
  .split(/[.!?](?=\s|$)|[\n;]|\s*\/\s*(?!\d)/)
  .map((clause) => clause.trim().replace(/\s+/g, ' ')).filter(Boolean))]

function phrase(category: ObservationCategory, note: string): string | null {
  const lookup = (part: string): readonly string[] | undefined =>
    PHRASES[category].find(([pattern]) => new RegExp('^(?:' + pattern + ')$', 'u').test(part.trim()))?.[1]
  const cleaned = note.trim().replace(/^[ /.,;]+|[ /.,;]+$/g, '')
  const whole = lookup(cleaned)
  if (whole) return whole.join(' ')
  const matches = [...new Set(cleaned.split(/\s*[/;,\n]\s*|\.\s+/).filter(Boolean).map(lookup))]
  if (!matches.length || matches.some((match) => !match)) return null
  const groups = matches.flatMap((match) => match ? [match as readonly string[]] : [])
  const limit = category === '행발' ? 4 : 3
  if (groups.length > limit) return null
  const choices: string[] = []
  const choose = (index: number, sentences: string[]) => {
    if (index === groups.length) {
      if (sentences.length === limit) choices.push(sentences.join(' '))
      return
    }
    for (let count = 1; count <= groups[index].length && sentences.length + count <= limit; count++)
      choose(index + 1, [...sentences, ...groups[index].slice(0, count)])
  }
  choose(0, [])
  return choices.sort((a, b) => Math.abs(a.length - 350) - Math.abs(b.length - 350))[0] ?? null
}

const ENDINGS: readonly [string, string, string][] = [
  ['했다', '함', '했고'], ['하였다', '함', '하였고'], ['냈다', '냄', '냈고'],
  ['세웠다', '세움', '세웠고'], ['배웠다', '배움', '배웠고'], ['도왔다', '도움', '도왔고'],
  ['놓았다', '놓음', '놓았고'], ['보였다', '보임', '보였고'], ['됐다', '됨', '됐고'],
  ['봤다', '봄', '봤고'], ['보았다', '봄', '보았고'], ['주었다', '줌', '주었고'],
  ['줬다', '줌', '줬고'], ['남겼다', '남김', '남겼고'], ['골랐다', '고름', '골랐고'],
  ['달랐다', '달랐음', '달랐고'], ['왔다', '옴', '왔고'], ['썼다', '씀', '썼고'],
  ['졌다', '짐', '졌고'], ['었다', '었음', '었고'], ['았다', '았음', '았고'],
]

function inflect(clause: string): { written: string; joined?: string } | null {
  const ending = ENDINGS.find(([suffix]) => clause.endsWith(suffix))
  if (ending) {
    const stem = clause.slice(0, -ending[0].length)
    return { written: stem + ending[1], joined: stem + ending[2] }
  }
  return /(?:함|보임|있음|없음|줌|냄|적음|읽음|찾음|맡음|놓침|했음)$/.test(clause)
    ? { written: clause } : null
}

function edit(category: ObservationCategory, clauses: string[]): string | null {
  if (clauses.length < 2 || clauses.join(' ').length > 620) return null
  const forms = clauses.map(inflect)
  if (forms.some((form) => !form)) return null
  const sentences: string[] = []
  const target = category === '행발' ? 4 : 3
  let pending = ''
  for (const [index, form] of forms.entries()) {
    if (!form) return null
    if (!pending && form.joined && index + 1 < forms.length &&
      sentences.length + forms.length - index > target) {
      pending = form.joined + ' '
    } else {
      sentences.push(pending + form.written + '.')
      pending = ''
    }
  }
  return sentences.join(' ')
}

export function draftFromObservation(observation: Observation): string | null {
  const { category, note } = observation
  return phrase(category, note) ?? edit(category, clausesOf(note))
}

function terms(text: string): Set<string> {
  const result = new Set<string>()
  for (const word of text.toLowerCase().match(/[가-힣A-Za-z0-9]+/g) ?? [])
    for (let index = 0; index < Math.max(1, word.length - 1); index++)
      result.add(word.slice(index, index + 2))
  return result
}

function overlap(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const value of a) if (b.has(value)) shared++
  return shared
}

function observations(note: string): string {
  const clauses = clausesOf(note)
  const whole = clauses.join('. ')
  if (whole.length <= 620) return whole
  const chunks = [...new Set(clauses.flatMap((clause) =>
    clause.match(/.{1,150}(?:\s+|$)|\S{1,150}/gu)?.map((chunk) => chunk.trim()).filter(Boolean) ?? []))]
  const selected = new Set([0, chunks.length - 1])
  const seen = terms([...selected].map((index) => chunks[index]).join(' '))
  let remaining = 620 - [...selected].reduce((n, index) => n + chunks[index].length + 2, 0)
  const features = chunks.map(terms)
  while (remaining > 0) {
    let best = -1
    let gain = 0
    for (const [index, chunk] of chunks.entries()) {
      if (selected.has(index) || chunk.length + 2 > remaining) continue
      const added = features[index].size - overlap(seen, features[index])
      if (added > gain) {
        best = index
        gain = added
      }
    }
    if (best < 0) break
    selected.add(best)
    features[best].forEach((term) => seen.add(term))
    remaining -= chunks[best].length + 2
  }
  return chunks.filter((_, index) => selected.has(index)).join('. ')
}

const EXAMPLES: Record<ObservationCategory, readonly [string, string][]> = {
  행발: [
    ['미술 잘함', '미술 활동에서 자신의 생각을 표현하는 능력이 돋보임.'],
    ['발표할 때 처음엔 목소리가 작았음. 연습한 뒤에는 자기 의견을 끝까지 얘기했음.', '발표 연습을 거치며 자신감을 기르고 자신의 의견을 끝까지 말하는 모습을 보임.'],
  ],
  평어: [
    ['거리 단위 바꾸기', '길이 단위 사이의 관계를 이해하고 거리를 알맞은 단위로 나타냄.'],
    ['지도에서 두 장소를 찾아 표시했음. 눈금을 세어 어느 길이 더 짧은지 설명함.', '지도에 두 장소를 표시하고 눈금을 활용하여 경로의 길이를 비교해 설명함.'],
  ],
  창체: [
    ['도서부 책 정리', '도서부 활동에서 책을 정리하며 공동으로 사용하는 공간을 가꾸는 데 기여함.'],
    ['축제 전 안내가 필요한 곳을 둘러보고 표지판을 만들어 붙임. 끝나고 표지판 회수함.', '학교 축제에서 안내가 필요한 곳을 찾아 표지판을 제작하고 행사 후 회수까지 맡아 마무리함.'],
  ],
}

export async function composeObservation(
  observation: Observation,
  examples: readonly ObservationExample[],
  model: string,
  lora: (scale: number) => unknown,
  complete: (body: Record<string, unknown>) => Promise<{ text: string; stopped: boolean }>,
): Promise<string> {
  const { category } = observation
  const memo = observations(observation.note)
  if (!memo) throw new Error('관찰 메모를 입력해 주세요.')
  const query = terms(memo)
  let closest: ObservationExample | undefined
  let best = -1
  for (const example of examples) {
    if (example.category !== category) continue
    const vocab = terms(example.memo)
    const shared = overlap(query, vocab)
    const score = shared / Math.max(1, query.size + vocab.size - shared)
    if (score > best) {
      closest = example
      best = score
    }
  }
  const messages = [{
    role: 'system',
    content: '학생의 관찰을 바탕으로 초등학교 ' + category +
      ' 문단을 쓴다. 메모의 부족한 점, 변화와 행동의 주체를 보존한다. ' +
      { 행발: '3~4문장, 300~400자.', 평어: '2~3문장.', 창체: '3문장.' }[category],
  }]
  for (const [source, answer] of [
    ...(closest ? [[closest.memo, closest.answer]] : []), ...EXAMPLES[category],
  ]) {
    messages.push({ role: 'user', content: source.replace(/\.$/, '') }, { role: 'assistant', content: answer })
  }
  messages.push({ role: 'user', content: memo })
  const count = { 행발: 4, 평어: 2, 창체: 3 }[category]
  const grammar = 'root ::= sentence (" " sentence){' + (count - 1) + '}\n' +
    'sentence ::= [가-힣0-9A-Za-z] [가-힣0-9A-Za-z ,·%()/~㎡㎝-]* ("함" | "임" | "음" | "됨" | "냄" | "줌" | "짐" | "씀" | "룸" | "춤" | "름" | "움" | "킴" | "봄" | "듦" | "앎" | "품" | "띔" | "남" | "듬" | "툼") "."'
  let selected = ''
  let bestQuality = -Infinity
  for (const scale of [0.18, 0.45]) {
    const candidate = await complete({
      model, messages, grammar, temperature: 0.32, seed: 29, max_tokens: 650,
      dry_multiplier: 0.85, dry_penalty_last_n: 512, lora: lora(scale),
      chat_template_kwargs: { enable_thinking: false },
    })
    const draft = candidate.text.trim()
    if (!candidate.stopped || !draft) continue
    const sentences = draft.split(/(?<=\.)\s+/)
    const novel = ['교사는', '교사가', '교체', '수상', '대회', '시험 점수', '방송 중단']
      .some((word) => draft.includes(word) && !memo.includes(word))
    const score = overlap(query, terms(draft)) / Math.max(1, query.size) -
      Number(novel) * 3 - Number(new Set(sentences).size !== sentences.length) -
      Number(category === '행발' && (draft.length < 300 || draft.length > 400))
    if (score > bestQuality) {
      selected = draft
      bestQuality = score
    }
  }
  if (!selected) throw new Error('문장이 완결되지 않았어요. 다시 생성해 주세요.')
  return selected
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
