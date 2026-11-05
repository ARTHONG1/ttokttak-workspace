import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  answerText,
  blooketCsv,
  chosungOf,
  fillQuiznSheet,
  generationPrompt,
  isCorrect,
  mergeTranslation,
  normalizeQuestion,
  parseQuizReply,
  quiznRow,
} from '../src/renderer/src/quiz-model'
import { captionText, readYoutubeTranscript, youtubeIdOf } from '../src/main/quiz-source'
import {
  checkSaveRequest,
  isFeatureAsset,
  withSaveExtension,
} from '../src/main/special-feature-files'

/**
 * 특화 기능 > 퀴즈 생성기 follows the author's ACE QUIZ LAB. The quiz below is the one that
 * site made on 2026-10-31 from a paragraph on photosynthesis, one question of each type.
 */
const SITE_REPLY = JSON.stringify({
  questions: [
    {
      type: 'multiple-choice',
      question: '다음 중 식물의 광합성에 영향을 주는 요인이 아닌 것은 무엇입니까?',
      options: ['빛의 세기', '이산화탄소의 농도', '토양의 깊이', '온도'],
      answer: '토양의 깊이',
      explanation: '광합성에 영향을 주는 요인에는 빛의 세기, 이산화탄소의 농도, 온도가 있습니다.',
    },
    {
      type: 'ox',
      question: '식물의 광합성 결과 생성되는 물질에는 포도당과 산소가 있다.',
      options: ['O', 'X'],
      answer: 'O',
    },
    {
      type: 'short-answer',
      question: '광합성은 주로 식물의 어느 기관에 있는 엽록체에서 일어나는가?',
      answer: '잎',
    },
    {
      type: 'ordering',
      question: '광합성이 일어나는 순서대로 배열하시오.',
      options: ['엽록소가 빛을 흡수한다', '뿌리에서 물을 흡수한다', '포도당과 산소가 만들어진다'],
      answer: '2,1,3',
    },
    {
      type: 'initial-consonant',
      question: '엽록체 안에서 빛을 흡수하는 색소는?',
      options: ['ㅇㄹㅋ'],
      answer: '엽록소',
    },
  ],
})

describe('the quiz the AI writes', () => {
  const quiz = parseQuizReply('여기 있어요\n' + SITE_REPLY + '\n끝')

  it('keeps one question of each of the five types', () => {
    expect(quiz.questions.map((q) => q.type)).toEqual([
      'multiple-choice',
      'ox',
      'short-answer',
      'ordering',
      'initial-consonant',
    ])
    expect(new Set(quiz.questions.map((q) => q.id)).size).toBe(5)
  })

  it('makes the 초성 hint from the answer, so a wrong hint from the AI is fixed', () => {
    expect(chosungOf('엽록소')).toBe('ㅇㄹㅅ')
    expect(quiz.questions[4].options).toEqual(['ㅇㄹㅅ'])
  })

  it('reads a 선택형 answer given as a number, and drops one that names no option', () => {
    const q = normalizeQuestion({
      type: 'multiple-choice',
      question: 'q',
      options: ['가', '나', '다', '라'],
      answer: '3',
    })
    expect(q?.answer).toBe('다')
    expect(
      normalizeQuestion({
        type: 'multiple-choice',
        question: 'q',
        options: ['가', '나'],
        answer: '마',
      }),
    ).toBeNull()
  })

  it('reads 참/거짓 as O and X', () => {
    expect(normalizeQuestion({ type: 'ox', question: 'q', answer: '참' })?.answer).toBe('O')
    expect(normalizeQuestion({ type: 'ox', question: 'q', answer: 'false' })?.answer).toBe('X')
  })

  it('takes a 순서 answer as positions or as the items in order, and refuses a partial one', () => {
    const items = ['a', 'b', 'c']
    expect(
      normalizeQuestion({ type: 'ordering', question: 'q', options: items, answer: 'b → a → c' })
        ?.answer,
    ).toBe('2,1,3')
    expect(
      normalizeQuestion({ type: 'ordering', question: 'q', options: items, answer: '2,1' }),
    ).toBeNull()
  })

  it('checks a learner the way the original does', () => {
    const [mc, ox, short, order, initial] = quiz.questions
    expect(isCorrect(mc, '토양의 깊이')).toBe(true)
    expect(isCorrect(ox, 'X')).toBe(false)
    expect(isCorrect(short, ' 잎 ')).toBe(true)
    expect(
      isCorrect(order, [
        '뿌리에서 물을 흡수한다',
        '엽록소가 빛을 흡수한다',
        '포도당과 산소가 만들어진다',
      ]),
    ).toBe(true)
    expect(answerText(order)).toBe(
      '뿌리에서 물을 흡수한다 → 엽록소가 빛을 흡수한다 → 포도당과 산소가 만들어진다',
    )
    expect(isCorrect(initial, '엽 록 소')).toBe(true)
  })

  it('refuses a reply without questions', () => {
    expect(() => parseQuizReply('문제를 만들 수 없어요')).toThrow()
    expect(() =>
      parseQuizReply('{"questions":[{"type":"essay","question":"q","answer":"a"}]}'),
    ).toThrow()
  })

  it('asks for exactly the counts the user set', () => {
    const prompt = generationPrompt(
      { multipleChoice: 2, ox: 0, shortAnswer: 1, ordering: 0, initialConsonant: 3 },
      'hard',
    )
    expect(prompt).toContain('- multiple-choice: 2문제')
    expect(prompt).toContain('- initial-consonant: 3문제')
    expect(prompt).not.toMatch(/- ox: \d+문제/)
  })

  it('keeps ids, OX answers and the ordering when a translation comes back', () => {
    const reply = JSON.stringify({
      questions: quiz.questions.map((q) => ({
        ...q,
        question: 'EN ' + q.question,
        options:
          q.type === 'multiple-choice' ? ['Light', 'CO2', 'Soil depth', 'Temperature'] : q.options,
        answer: q.type === 'multiple-choice' ? 'Soil depth' : q.type === 'ox' ? 'True' : q.answer,
      })),
    })
    const en = mergeTranslation(quiz, reply)
    expect(en.questions.map((q) => q.id)).toEqual(quiz.questions.map((q) => q.id))
    expect(en.questions[0].answer).toBe('Soil depth')
    expect(en.questions[1].answer).toBe('O')
    expect(en.questions[3].answer).toBe('2,1,3')
  })
})

describe('the exports', () => {
  const quiz = parseQuizReply(SITE_REPLY)

  it('writes Blooket CSV with 선택형 and OX only, the right answer as its position', () => {
    const lines = blooketCsv(quiz)
      .replace(/^\uFEFF/, '')
      .split('\n')
    expect(lines[0]).toBe('Blooket Import Template,,,,,,,')
    expect(lines).toHaveLength(4)
    expect(lines[2].endsWith(',20,3')).toBe(true)
    expect(lines[3]).toContain(',O,X,,,20,1')
  })

  it('fills QuizN rows as the original does', () => {
    expect(quiznRow(quiz.questions[0])).toEqual([
      '선택형',
      quiz.questions[0].question,
      '빛의 세기',
      '이산화탄소의 농도',
      '토양의 깊이',
      '온도',
      20,
      '3',
      'On',
      'Off',
    ])
    expect(quiznRow(quiz.questions[3])[0]).toBe('순서완성형')
  })

  it('writes into the shipped QuizN template from row 22 and keeps its cell styles', async () => {
    const bytes = readFileSync(join(__dirname, '../resources/special-features/quizn-template.xlsx'))
    const zip = await JSZip.loadAsync(bytes)
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    const filled = fillQuiznSheet(sheet, quiz)
    expect(filled).toContain(
      '<c r="B22" s="25" t="inlineStr"><is><t xml:space="preserve">선택형</t></is></c>',
    )
    expect(filled).toContain('<c r="H22" s="27"><v>20</v></c>')
    expect(filled).toContain('<t xml:space="preserve">초성퀴즈</t>')
    // the rows above the questions, the guide and the examples, are untouched
    expect(filled.slice(0, filled.indexOf('<row r="22"'))).toBe(
      sheet.slice(0, sheet.indexOf('<row r="22"')),
    )
  })
})

describe('the 학습 자료 from YouTube', () => {
  it('finds the video id in the addresses the original accepts', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=tJFNP2XkQDs',
      'https://youtu.be/tJFNP2XkQDs?si=x',
      'https://www.youtube.com/shorts/tJFNP2XkQDs',
      'tJFNP2XkQDs',
    ]) {
      expect(youtubeIdOf(url)).toBe('tJFNP2XkQDs')
    }
    expect(youtubeIdOf('https://example.com')).toBeNull()
  })

  it('reads the words out of a caption document', () => {
    const xml =
      '<timedtext format="3"><body><p t="760" d="5519"><s ac="0">선생님</s><s t="520"> 안녕하세요.</s></p>' +
      '<p t="6000">광합성&#39;은 &amp; 빛</p></body></timedtext>'
    expect(captionText(xml)).toBe("선생님 안녕하세요. 광합성'은 & 빛")
  })

  it('picks the Korean captions and says when a video has none', async () => {
    const calls: string[] = []
    const fake = (async (url: string) => {
      calls.push(url)
      if (url.includes('/player')) {
        return new Response(
          JSON.stringify({
            playabilityStatus: { status: 'OK' },
            videoDetails: { title: '광합성 수업' },
            captions: {
              playerCaptionsTracklistRenderer: {
                captionTracks: [
                  { baseUrl: 'https://cap/en', languageCode: 'en' },
                  { baseUrl: 'https://cap/ko', languageCode: 'ko', kind: 'asr' },
                ],
              },
            },
          }),
        )
      }
      return new Response('<p>엽록소가 빛을 흡수한다</p>')
    }) as typeof fetch
    const r = await readYoutubeTranscript('https://youtu.be/tJFNP2XkQDs', fake)
    expect(r).toEqual({
      ok: true,
      name: '광합성 수업',
      text: '엽록소가 빛을 흡수한다',
      truncated: false,
    })
    expect(calls[1]).toBe('https://cap/ko')
    const none = (async () =>
      new Response(
        JSON.stringify({ playabilityStatus: { status: 'OK' } }),
      )) as unknown as typeof fetch
    expect(await readYoutubeTranscript('tJFNP2XkQDs', none)).toMatchObject({ ok: false })
  })
})

describe('what a feature page may save and read', () => {
  it('names only the shipped templates', () => {
    expect(isFeatureAsset('quiz-worksheet.pdf')).toBe(true)
    expect(isFeatureAsset('../../NOTICE')).toBe(false)
  })

  it('takes a plain name of an allowed kind and adds the extension', () => {
    const bytes = new Uint8Array([1])
    expect(
      checkSaveRequest({ name: '정답지_완료.pdf', filterName: 'PDF', extensions: ['pdf'], bytes })
        ?.name,
    ).toBe('정답지_완료.pdf')
    expect(
      checkSaveRequest({ name: '../../x', filterName: 'PDF', extensions: ['pdf'], bytes })?.name,
    ).toBe('.._.._x.pdf')
    expect(
      checkSaveRequest({ name: 'a.exe', filterName: 'x', extensions: ['exe'], bytes }),
    ).toBeNull()
    expect(
      checkSaveRequest({
        name: 'a.pdf',
        filterName: 'PDF',
        extensions: ['pdf'],
        bytes: new Uint8Array(),
      }),
    ).toBeNull()
    expect(withSaveExtension('/tmp/문제지', ['pdf'])).toBe('/tmp/문제지.pdf')
    // 똑딱서명 saves a signature picture
    expect(
      checkSaveRequest({ name: '서명.png', filterName: 'PNG 그림', extensions: ['png'], bytes })
        ?.name,
    ).toBe('서명.png')
  })
})
