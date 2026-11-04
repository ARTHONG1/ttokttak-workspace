/**
 * The 품의서 생성 instruction for reading a shopping cart into 품의 목록 rows. Units come
 * from PUMUI_UNITS, names the 똑딱작업실 extension matches to K-에듀파인's unit
 * codes, so a 품의 sent to K-에듀파인 does not stop on an unknown unit; 배송비 is one 식.
 */
export const PUMUI_UNITS = [
  '개',
  'SET',
  '상자',
  '권',
  '팩',
  '매',
  '롤',
  '병',
  '켤레',
  '대',
  '명',
  '식',
] as const

export const PARSE_SYSTEM = [
  '너는 학교 물품 구입 품의를 돕는 도우미다. 사용자가 붙여 넣은 쇼핑몰 장바구니 내용에서 구입할 품목을 뽑아 JSON 하나로만 답한다.',
  '형식: {"items":[{"description":"품명","specification":"규격","unit":"단위","quantity":수량,"unitPrice":단가}]}',
  '규칙:',
  '- description은 브랜드와 상품 이름이다. 옵션·색상·용량·묶음 수 같은 사양은 specification에 넣는다.',
  '- unit은 다음 중 하나만 쓴다: ' +
    PUMUI_UNITS.join(', ') +
    '. 세트는 SET, 박스는 상자, EA는 개로 쓴다. 알 수 없으면 개로 쓴다.',
  '- quantity와 unitPrice는 쉼표 없는 숫자다. unitPrice는 한 단위의 가격(원)이다. 장바구니에 줄 합계만 있으면 수량으로 나눈다.',
  '- 할인가와 정가가 함께 있으면 실제로 내는 가격을 쓴다.',
  '- 배송비가 따로 적혀 있으면 description을 배송비, unit을 식, quantity를 1로 한 줄을 더한다.',
  '- 품목이 아닌 안내 문구, 쿠폰, 적립금 줄은 넣지 않는다.',
  '설명, 머리말, 코드 블록 없이 JSON만 출력한다.',
].join('\n')
