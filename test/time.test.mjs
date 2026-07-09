import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayRange,
  toApiDateTime,
  SLOTS,
  slotIndex,
  dispWidth,
  normalizeDate,
} from '../lib/time.mjs';

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
