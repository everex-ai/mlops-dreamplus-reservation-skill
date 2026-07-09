import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayRange,
  toApiDateTime,
  SLOTS,
  slotIndex,
  dispWidth,
  normalizeDate,
  weekday,
  padDisp,
  addMinutes,
} from '../lib/time.mjs';

test('weekday returns the Korean day-of-week', () => {
  assert.equal(weekday('2026.07.09'), '목'); // Thursday
  assert.equal(weekday('2026-07-11'), '토'); // Saturday
});

test('padDisp pads to a display width, counting CJK as 2', () => {
  assert.equal(padDisp('2A', 6), '2A    '); // 2 + 4 spaces
  assert.equal(padDisp('8인', 6), '8인   '); // width 3 + 3 spaces
});

test('addMinutes advances a HH:mm time', () => {
  assert.equal(addMinutes('12:30', 30), '13:00');
  assert.equal(addMinutes('20:30', 30), '21:00');
  assert.equal(addMinutes('09:00', 90), '10:30');
});

test('normalizeDate accepts YYYY.MM.DD and passes it through', () => {
  assert.equal(normalizeDate('2026.07.09'), '2026.07.09');
});

test('normalizeDate accepts YYYY-MM-DD and converts to dotted', () => {
  assert.equal(normalizeDate('2026-07-09'), '2026.07.09');
});

test('dayRange builds the reservations query window for a date', () => {
  assert.deepEqual(dayRange('2026.07.09'), {
    startTime: '2026.07.09 00:00:00',
    endTime: '2026.07.09 23:59:59',
    cancelDate: '2026.07.09 00:00:00',
  });
});

test('toApiDateTime formats a create/cancel timestamp with seconds', () => {
  assert.equal(toApiDateTime('2026.07.09', '12:30'), '2026.07.09 12:30:00');
});

test('SLOTS covers 08:00 to 20:30 in 30-minute steps (26 slots)', () => {
  assert.equal(SLOTS.length, 26);
  assert.equal(SLOTS[0], '08:00');
  assert.equal(SLOTS[1], '08:30');
  assert.equal(SLOTS[25], '20:30');
});

test('slotIndex maps a HH:mm to its column, 21:00 is the exclusive end', () => {
  assert.equal(slotIndex('08:00'), 0);
  assert.equal(slotIndex('08:30'), 1);
  assert.equal(slotIndex('12:30'), 9);
  assert.equal(slotIndex('21:00'), 26);
});

test('dispWidth counts CJK characters as width 2', () => {
  assert.equal(dispWidth('2A'), 2);
  assert.equal(dispWidth('8인'), 3); // '8'=1, '인'=2
  assert.equal(dispWidth('예약'), 4);
});
