import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, boardFromFixture, fetchBoard } from '../lib/cli.mjs';

const FIXTURE = new URL('./fixtures/reservations-2026.07.09.json', import.meta.url).pathname;

test('parseArgs collects positionals under _', () => {
  assert.deepEqual(parseArgs(['2H', '2026-07-09'])._, ['2H', '2026-07-09']);
});

test('parseArgs reads --key value pairs', () => {
  const a = parseArgs(['--floor', '7', '--start', '14:00']);
  assert.equal(a.floor, '7');
  assert.equal(a.start, '14:00');
});

test('parseArgs treats a trailing --flag as boolean true', () => {
  const a = parseArgs(['--confirm']);
  assert.equal(a.confirm, true);
});

test('parseArgs mixes flags and positionals', () => {
  const a = parseArgs(['2H', '--confirm', '--title', '팀 회의']);
  assert.deepEqual(a._, ['2H']);
  assert.equal(a.confirm, true);
  assert.equal(a.title, '팀 회의');
});

test('boardFromFixture builds a Board from a file without any network', () => {
  const board = boardFromFixture(FIXTURE, '2026.07.09');
  assert.equal(board.date, '2026.07.09');
  assert.equal(board.rooms.length, 38); // 카탈로그의 모든 방
  const busy = board.rooms.filter((r) => r.busy.length > 0);
  assert.ok(busy.length > 0, '픽스처에 예약이 있어야 한다');
});

test('boardFromFixture marks my reservations when myId is given', () => {
  const anyRes = boardFromFixture(FIXTURE, '2026.07.09')
    .rooms.flatMap((r) => r.busy)[0];
  assert.equal(anyRes.mine, false); // myId 없이는 내 예약을 구분하지 않는다
});

test('fetchBoard turns the API list into a Board with the caller as myId', async () => {
  const list = [
    { id: 1, roomCode: 208, startTime: '2026.07.09 12:30', endTime: '2026.07.09 13:00', title: '내 회의', memberId: 107858 },
    { id: 2, roomCode: 208, startTime: '2026.07.09 15:00', endTime: '2026.07.09 16:00', title: '남의 회의', memberId: 999 },
  ];
  const fake = async () => ({ json: async () => ({ code: '200', list }) });

  const board = await fetchBoard('TOK', '2026.07.09', 107858, fake);
  const room = board.rooms.find((r) => r.roomCode === 208);
  assert.deepEqual(room.busy.map((b) => b.mine), [true, false]);
  assert.deepEqual(room.free, [
    { start: '08:00', end: '12:30' },
    { start: '13:00', end: '15:00' },
    { start: '16:00', end: '21:00' },
  ]);
});
