import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../lib/cli.mjs';

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
