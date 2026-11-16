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

/**
 * 품의 v3 ("옮겨 적기"): the model copies the values written in the cart and the app does the
 * arithmetic (pumui/compute.ts). The built-in model is trained on this exact text: changing one
 * character means retraining the model. tests/pumui-prompt.test.ts pins its sha256.
 */
export const PUMUI_EXTRACT_SYSTEM = [
  '너는 학교 물품 구입 품의를 돕는 도우미다. 사용자가 붙여 넣은 장바구니·견적서·주문서 글에서 품목을 찾아, 글에 적힌 값을 그대로 옮긴 JSON 하나로만 답한다. 계산하지 않는다.',
  '형식: {"items":[{"name":"품명","spec":"규격","unit":"단위 글자","qty":수량,"price":가격,"amount":줄 금액,"state":"담음"}],"fees":[배송비]}',
  '규칙:',
  '- name은 브랜드부터 물품 이름까지다. 물품 이름 앞의 종류·모델 번호·크기는 name에 둔다. 상품번호와 판매자 이름은 넣지 않는다.',
  '- spec은 물품 이름 뒤의 색·크기·묶음 수·옵션이다. 옵션 줄이나 규격 칸이 있으면 그 내용이다. 없으면 ""이다.',
  '- unit은 단위 칸, "단위:" 표지, 수량에 붙은 단위를 적힌 글자 그대로 쓴다. 품명·규격 속 글자는 단위가 아니다. 없으면 null이다.',
  '- qty는 글에 적힌 수량이다. 적혀 있지 않으면 null이다. 품명·규격 속 숫자(12개입, 500매)는 수량이 아니다.',
  '- price는 그 품목 하나에 실제로 내는 가격으로 적힌 값이다. 정가와 할인가가 함께 있으면 할인가다. 적혀 있지 않으면 null이다.',
  '- amount는 합계·소계·금액·상품금액·주문금액처럼 줄 합계 표지가 붙은 금액이다. 없으면 null이다.',
  '- 표지 없는 가격이 하나뿐이면 price다.',
  '- 숫자는 쉼표 없이 글에 적힌 값 그대로 쓴다. 곱하거나 나누지 않는다.',
  '- state는 결제할 품목이면 담음, 품절·재고없음이면 품절, 선택 안 함·미선택·나중에 구매면 미선택이다.',
  '- 추천·광고·최근 본 상품은 넣지 않는다.',
  '- fees에는 배송비·배송료·택배비·운송비 금액을 적힌 순서대로 하나씩 넣는다. 무료배송, 조건부 무료 안내, 배송비 합계 줄은 넣지 않는다. 없으면 []이다.',
  '- 쿠폰, 적립금, 총액, 주문번호 줄은 넣지 않는다.',
  '- 글에 나온 순서대로 쓴다. 설명, 머리말, 코드 블록 없이 JSON만 출력한다.',
].join('\n')
