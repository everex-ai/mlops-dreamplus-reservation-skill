// 드림플러스 REST API 클라이언트.
// 인증: Authorization 헤더에 raw JWT(Bearer 없음). 응답은 {code,result,message,list} 봉투.
// code "301"=토큰 만료, "200"=성공. 요청 본문은 평문 JSON.

import { normalizeDate, dayRange, toApiDateTime } from './time.mjs';

export const BASE = 'https://gangnam.dreamplus.asia';

export class TokenExpiredError extends Error {
  constructor(message = 'JWT 토큰이 만료되었습니다.') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class ApiError extends Error {
  constructor(message, code) {
    super(message || 'API 오류');
    this.name = 'ApiError';
    this.code = code;
  }
}

/** 저수준 호출: 봉투 검사 후 파싱된 JSON 반환. fetchImpl 주입 가능(테스트용) */
export async function apiFetch(token, path, method, body, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (String(json.code) === '301') throw new TokenExpiredError(json.message);
  if (String(json.code) !== '200') throw new ApiError(json.message, json.code);
  return json;
}

/** 회의실 목록 (보통은 catalog 사용, 갱신 시에만 호출) */
export async function getRooms(token, date, fetchImpl) {
  const j = await apiFetch(
    token,
    '/api2/meetingrooms',
    'POST',
    { data: { reservationDate: normalizeDate(date) } },
    fetchImpl,
  );
  return j.list || [];
}

/** 특정 날짜 하루의 예약 목록(전 회의실) */
export async function getReservations(token, date, fetchImpl) {
  const { startTime, endTime, cancelDate } = dayRange(date);
  const j = await apiFetch(
    token,
    '/api2/meetingroom/reservations',
    'POST',
    { data: { searchType: 'startTime', startTime, endTime, cancelDate } },
    fetchImpl,
  );
  return j.list || [];
}

/** 예약 생성. body는 flat(데이터 래핑 없음), 시간은 초 포함 */
export async function createReservation(token, { roomCode, date, start, end, title }, fetchImpl) {
  return apiFetch(
    token,
    '/api2/meetingroom/reservation',
    'POST',
    {
      roomCode,
      startTime: toApiDateTime(date, start),
      endTime: toApiDateTime(date, end),
      title,
    },
    fetchImpl,
  );
}

/** 예약 취소 (DELETE, body {id}) */
export async function cancelReservation(token, id, fetchImpl) {
  return apiFetch(token, '/api2/meetingroom/reservation', 'DELETE', { id }, fetchImpl);
}
