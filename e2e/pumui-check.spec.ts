import { test, expect, type Page } from '@playwright/test'
import { launchShell, closeAndSaveVideo, screenshotPath } from './helpers'

/**
 * 품의서 생성's money check (pumui/verifier.ts) in the desktop app. A work saved with 임시 저장
 * keeps its cart, so loading it checks the rows against that cart without calling the AI:
 * the three states, a hand edit that checks again, and the extra yes before a flagged 품의
 * goes to K-에듀파인.
 */
const CART = [
  '모나미 153 볼펜 흑색 12개입',
  '3,600원 수량 5',
  '3M 포스트잇 노랑 100매',
  '2,500원 수량 3',
  '배송비 3,000원',
  '총 결제금액 28,500원',
].join('\n')
const ROWS = [
  {
    description: '모나미 153 볼펜',
    specification: '흑색 12개입',
    unit: '개',
    quantity: 5,
    unitPrice: 3600,
    amount: 18000,
  },
  {
    description: '3M 포스트잇',
    specification: '노랑 100매',
    unit: '팩',
    quantity: 3,
    unitPrice: 2500,
    amount: 7500,
  },
  {
    description: '배송비',
    specification: '',
    unit: '식',
    quantity: 1,
    unitPrice: 3000,
    amount: 3000,
  },
]

async function loadWork(page: Page, cart: string, rows: typeof ROWS): Promise<void> {
  await page.evaluate(
    (work) => localStorage.setItem('procurement_temp_storage', JSON.stringify(work)),
    {
      title: '2026학년도 4학년 학급 용품 구입',
      shoppingCartText: cart,
      estimateData: rows,
      generatedArticle: '기안문',
    },
  )
  await page
    .getByRole('group', { name: '임시 저장' })
    .getByRole('button', { name: '불러오기' })
    .click()
}

test('품의서 생성 checks the amounts against the cart and asks again before sending a flagged 품의', async () => {
  const launched = await launchShell({ videoDir: 'pumui-check', onboardingSeen: true, lang: 'ko' })
  const { page } = launched
  try {
    await page.getByTestId('trial-features').click()
    await page.getByTestId('special-feature-proposal').click()
    await loadWork(page, CART, ROWS)
    await page.getByRole('button', { name: '업무포털 시작 주소 등록' }).click()
    const address = page.getByRole('textbox', { name: '업무포털 시작 주소' })
    await address.fill('https://example.org/')
    await page.getByRole('button', { name: '주소 저장' }).click()
    await expect(
      page.getByText('HTTPS로 시작하는 교육청 업무포털 주소(*.go.kr)를 확인해 주세요.'),
    ).toBeVisible()
    await address.fill('https://fixture.go.kr/portal')
    await page.getByRole('button', { name: '주소 저장' }).click()
    await page.getByRole('button', { name: '업무포털 시작 주소 변경' }).click()
    await expect(address).toHaveValue('https://fixture.go.kr')
    await page.getByRole('button', { name: '주소 삭제' }).click()
    await expect(page.getByRole('button', { name: '업무포털 시작 주소 등록' })).toBeVisible()
    const check = page.getByTestId('pumui-check')
    // the 품의 목록: the check above the table and the table
    const list = page.locator('.sf-field').filter({ has: check })

    // the written total equals the rows: 금액 확인됨
    await expect(check).toHaveAttribute('data-status', 'confirmed')
    await expect(check).toContainText('금액 확인됨')
    await list.screenshot({ path: screenshotPath('pumui-check-confirmed') })

    // a hand edit is checked again: the row is marked with its reason
    await page.getByLabel('1번 단가').fill('3700')
    await expect(check).toHaveAttribute('data-status', 'needs_review')
    await expect(check).toContainText('원문의 합계와 품목 합계가 다릅니다')
    await expect(page.getByTestId('pumui-flagged-row')).toHaveCount(1)
    await expect(page.getByText('이 줄의 단가를 원문에서 찾지 못했습니다')).toBeVisible()
    await list.screenshot({ path: screenshotPath('pumui-check-needs-review') })

    // a flagged 품의 goes to K-에듀파인 only after one more yes
    await page.getByTestId('pumui-send').click()
    await expect(page.getByTestId('pumui-send-confirm')).toBeVisible()
    await page.screenshot({ path: screenshotPath('pumui-check-send-confirm') })
    await page.getByRole('button', { name: '돌아가서 확인' }).click()
    await expect(page.getByTestId('pumui-send-confirm')).toHaveCount(0)
    await expect(page.getByTestId('pumui-send-note')).toHaveCount(0)

    // no total in the cart: nothing to compare with, 미확인
    await loadWork(page, CART.split('\n').slice(0, 4).join('\n'), ROWS.slice(0, 2))
    await expect(check).toHaveAttribute('data-status', 'unconfirmed')
    await expect(check).toContainText('원문에 합계가 없어 대조하지 못했습니다')
    await list.screenshot({ path: screenshotPath('pumui-check-unconfirmed') })
  } finally {
    await closeAndSaveVideo(launched, 'pumui-check')
  }
})
