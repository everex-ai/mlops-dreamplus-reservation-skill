import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeBoard,
  resolveRoom,
  isFree,
  nearestFreeRooms,
  myReservations,
  expandReservations,
} from '../lib/board.mjs';

const rooms = JSON.parse(readFileSync(new URL('./fixtures/rooms.json', import.meta.url)));
const reservations = JSON.parse(
  readFileSync(new URL('./fixtures/reservations-2026.07.09.json', import.meta.url)),
);
const MY_ID = 107858;
const board = normalizeBoard(rooms, reservations, '2026.07.09', MY_ID);

const room = (code) => board.rooms.find((r) => r.roomCode === code);

test('expandReservations turns compact [code,start,end] rows into full objects', () => {
  const out = expandReservations([[201, '13:00', '16:00']], '2026.07.09');
  assert.deepEqual(out, [
    { roomCode: 201, startTime: '2026.07.09 13:00', endTime: '2026.07.09 16:00', title: '', memberId: null, id: null },
  ]);
});

test('expandReservations passes full objects through unchanged', () => {
  const obj = { roomCode: 201, startTime: '2026.07.09 13:00', endTime: '2026.07.09 16:00', title: 'x', memberId: 1 };
  assert.deepEqual(expandReservations([obj], '2026.07.09'), [obj]);
});

test('normalizeBoard keeps the date and every room', () => {
  assert.equal(board.date, '2026.07.09');
  assert.equal(board.rooms.length, 7);
});

test('busy intervals are extracted as HH:mm and sorted by start', () => {
  assert.deepEqual(
    room(201).busy.map((b) => [b.start, b.end, b.title]),
    [
      ['10:00', '14:00', '온보딩세션'],
      ['17:00', '19:00', '팀 회의'],
    ],
  );
});

test('mine flag is set for the current member', () => {
  assert.equal(room(201).busy[0].mine, false); // 타사
  assert.equal(room(201).busy[1].mine, true); // 나(107858)
});

test('busy intervals carry the reservation id (needed for cancel)', () => {
  assert.equal(room(201).busy[0].id, 1001);
  assert.equal(room(201).busy[1].id, 1002);
});

test('myReservations lists only the current member reservations with ids', () => {
  const mine = myReservations(board);
  assert.deepEqual(
    mine.map((m) => [m.id, m.roomCode, m.start, m.title]),
    [[1002, 201, '17:00', '팀 회의']],
  );
});

test('free intervals are the complement within operating hours', () => {
  assert.deepEqual(
    room(201).free.map((f) => [f.start, f.end]),
    [
      ['08:00', '10:00'],
      ['14:00', '17:00'],
      ['19:00', '21:00'],
    ],
  );
});

test('a fully-booked room has no free intervals', () => {
  assert.equal(room(203).free.length, 0);
});

test('a fully-free room has one free interval spanning the day', () => {
  assert.deepEqual(
    room(204).free.map((f) => [f.start, f.end]),
    [['08:00', '21:00']],
  );
});

test('isFree respects existing reservations', () => {
  assert.equal(isFree(board, 201, '12:00', '13:00'), false); // overlaps 10-14
  assert.equal(isFree(board, 201, '14:00', '17:00'), true); // in the gap
  assert.equal(isFree(board, 201, '13:00', '15:00'), false); // partial overlap
  assert.equal(isFree(board, 204, '09:00', '10:00'), true); // free room
});

test('resolveRoom matches by code, short name, and full name', () => {
  assert.equal(resolveRoom(board, 208).roomCode, 208);
  assert.equal(resolveRoom(board, '2H').roomCode, 208);
  assert.equal(resolveRoom(board, '2h').roomCode, 208);
  assert.equal(resolveRoom(board, 'Meeting Room 2A').roomCode, 201);
  assert.equal(resolveRoom(board, '없는방'), null);
});

test('nearestFreeRooms ranks same floor first, then by floor distance', () => {
  const near = nearestFreeRooms(board, { roomCode: 201, start: '12:00', end: '13:00' });
  assert.deepEqual(
    near.map((r) => r.roomCode),
    [202, 204, 208, 301, 1101], // floor2 (by code) → 3A → 11A ; 2C excluded (booked)
  );
});

test('nearestFreeRooms honors minimum capacity', () => {
  const near = nearestFreeRooms(board, {
    roomCode: 201,
    start: '12:00',
    end: '13:00',
    minCap: 8,
  });
  assert.deepEqual(
    near.map((r) => r.roomCode),
    [202, 1101], // only cap>=8 free rooms: 2B(18), 11A(8)
  );
});
