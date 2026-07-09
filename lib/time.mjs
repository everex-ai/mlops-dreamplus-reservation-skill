// 날짜/시간 포맷 및 슬롯 계산. 드림플러스 API는 'YYYY.MM.DD' 및
// 'YYYY.MM.DD HH:mm:ss' 형식을 사용한다. 운영시간 08:00~21:00, 30분 단위.

export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 21;

/** 'YYYY-MM-DD' 또는 'YYYY.MM.DD'를 점 구분 'YYYY.MM.DD'로 정규화 */
export function normalizeDate(date) {
  return String(date).trim().replace(/-/g, '.');
}

/** 예약 현황 조회용 하루 범위 (00:00:00 ~ 23:59:59) */
export function dayRange(date) {
  const d = normalizeDate(date);
  return {
    startTime: `${d} 00:00:00`,
    endTime: `${d} 23:59:59`,
    cancelDate: `${d} 00:00:00`,
  };
}

/** 예약 생성/취소용 타임스탬프 'YYYY.MM.DD HH:mm:00' */
export function toApiDateTime(date, hhmm) {
  return `${normalizeDate(date)} ${hhmm}:00`;
}

/** 08:00 ~ 20:30, 30분 간격 슬롯 시작 시각 26개 */
export const SLOTS = (() => {
  const out = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out; // 마지막은 20:30, 21:00은 배타적 종료라 미포함
})();

/** 'HH:mm' → 바 컬럼 인덱스. 08:00=0, 30분마다 +1, 21:00=26(배타적 종료) */
export function slotIndex(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h - OPEN_HOUR) * 2 + (m >= 30 ? 1 : 0);
}

/** 터미널 표시 폭 (CJK 문자는 2칸) */
export function dispWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1;
  }
  return w;
}

/** 표시 폭 기준 우측 공백 패딩 (CJK=2) */
export function padDisp(str, width) {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, width - dispWidth(s)));
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY.MM.DD' → 한글 요일 */
export function weekday(date) {
  const [y, m, d] = normalizeDate(date).split('.').map(Number);
  return DOW[new Date(y, m - 1, d).getDay()];
}
