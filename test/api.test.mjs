import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFetch,
  getRooms,
  getReservations,
  createReservation,
  cancelReservation,
  TokenExpiredError,
  ApiError,
} from '../lib/api.mjs';

// 요청을 캡처하고 미리 정한 봉투를 돌려주는 가짜 fetch
function fakeFetch(envelope) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, ...opts, json: opts.body ? JSON.parse(opts.body) : null });
    return { json: async () => envelope };
  };
  impl.calls = calls;
  return impl;
}

const ok = (extra = {}) => ({ apiVersion: '1.0', result: true, code: '200', message: '', ...extra });

test('apiFetch returns the envelope on code 200', async () => {
  const f = fakeFetch(ok({ list: [1, 2] }));
  const j = await apiFetch('TOK', '/api2/x', 'POST', { a: 1 }, f);
  assert.deepEqual(j.list, [1, 2]);
});

test('apiFetch sends raw token in Authorization and JSON body', async () => {
  const f = fakeFetch(ok());
  await apiFetch('TOK', '/api2/x', 'POST', { a: 1 }, f);
  const c = f.calls[0];
  assert.equal(c.headers.Authorization, 'TOK'); // no "Bearer "
  assert.equal(c.headers['Content-Type'], 'application/json');
  assert.deepEqual(c.json, { a: 1 });
  assert.match(c.url, /\/api2\/x$/);
});

test('apiFetch throws TokenExpiredError on code 301', async () => {
  const f = fakeFetch({ code: '301', message: 'JWT 토큰이 만료되었습니다.' });
  await assert.rejects(() => apiFetch('TOK', '/api2/x', 'POST', {}, f), TokenExpiredError);
});

test('apiFetch throws ApiError on other non-200 codes', async () => {
  const f = fakeFetch({ code: '500', message: '서버 오류' });
  await assert.rejects(() => apiFetch('TOK', '/api2/x', 'POST', {}, f), (e) => {
    assert.ok(e instanceof ApiError);
    assert.match(e.message, /서버 오류/);
    return true;
  });
});

test('getRooms posts reservationDate and returns list', async () => {
  const f = fakeFetch(ok({ list: [{ roomCode: 201 }] }));
  const rooms = await getRooms('TOK', '2026-07-09', f);
  assert.match(f.calls[0].url, /\/api2\/meetingrooms$/);
  assert.deepEqual(f.calls[0].json, { data: { reservationDate: '2026.07.09' } });
  assert.deepEqual(rooms, [{ roomCode: 201 }]);
});

test('getReservations posts the full-day window', async () => {
  const f = fakeFetch(ok({ list: [] }));
  await getReservations('TOK', '2026.07.09', f);
  assert.match(f.calls[0].url, /\/api2\/meetingroom\/reservations$/);
  assert.deepEqual(f.calls[0].json, {
    data: {
      searchType: 'startTime',
      startTime: '2026.07.09 00:00:00',
      endTime: '2026.07.09 23:59:59',
      cancelDate: '2026.07.09 00:00:00',
    },
  });
});

test('createReservation posts flat body with second-precision times', async () => {
  const f = fakeFetch(ok());
  await createReservation(
    'TOK',
    { roomCode: 208, date: '2026.07.09', start: '12:30', end: '13:00', title: '회의' },
    f,
  );
  assert.equal(f.calls[0].method, 'POST');
  assert.match(f.calls[0].url, /\/api2\/meetingroom\/reservation$/);
  assert.deepEqual(f.calls[0].json, {
    roomCode: 208,
    startTime: '2026.07.09 12:30:00',
    endTime: '2026.07.09 13:00:00',
    title: '회의',
  });
});

test('cancelReservation sends DELETE with {id}', async () => {
  const f = fakeFetch(ok());
  await cancelReservation('TOK', 474524, f);
  assert.equal(f.calls[0].method, 'DELETE');
  assert.match(f.calls[0].url, /\/api2\/meetingroom\/reservation$/);
  assert.deepEqual(f.calls[0].json, { id: 474524 });
});
