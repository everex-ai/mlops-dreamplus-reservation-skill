import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog } from '../lib/catalog.mjs';

test('loadCatalog returns all 38 committed rooms', () => {
  const rooms = loadCatalog();
  assert.equal(rooms.length, 38);
});

test('catalog rooms carry the fields normalizeBoard needs', () => {
  const rooms = loadCatalog();
  const h = rooms.find((r) => r.roomCode === 208);
  assert.deepEqual(h, {
    roomCode: 208,
    roomName: 'Meeting Room 2H',
    floor: 2,
    maxMember: 4,
    equipment: 'TV, 화이트보드',
    point: 10000,
  });
});

test('catalog covers the real floor set', () => {
  const floors = [...new Set(loadCatalog().map((r) => r.floor))].sort((a, b) => a - b);
  assert.deepEqual(floors, [2, 3, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19]);
});
