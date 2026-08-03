import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';

// auth.mjs는 import 시점에 DP_HOME을 읽는다 → 정적 import 전에 샌드박스를 잡아야 한다.
const HOME = mkdtempSync(join(tmpdir(), 'dp-auth-'));
process.env.DP_HOME = HOME;
const auth = await import('../lib/auth.mjs');
const { TokenExpiredError } = await import('../lib/api.mjs');
const {
  encryptPassword,
  login,
  loadCredentials,
  readSession,
  writeSession,
  clearSession,
  withAuth,
  CredentialsError,
  CRED_PATH,
  SESSION_PATH,
} = auth;

// 서버 공개키를 흉내내기 위한 테스트용 RSA-1024 키쌍
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const PUB_B64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

/** 경로별로 미리 정한 봉투를 돌려주는 가짜 fetch */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, ...opts, json: opts.body ? JSON.parse(opts.body) : null });
    const path = new URL(url).pathname;
    const envelope = typeof routes[path] === 'function' ? routes[path](calls.length) : routes[path];
    if (!envelope) throw new Error(`가짜 fetch에 정의되지 않은 경로: ${path}`);
    return { json: async () => envelope };
  };
  impl.calls = calls;
  return impl;
}

const ok = (data) => ({ apiVersion: '1.0', result: true, code: '200', message: '', data });
const publicKeyRoute = { '/auth/publickey': ok({ publicKey: PUB_B64 }) };
const loginOk = ok({ jwtToken: 'JWT-1', refreshToken: 'REF-1', id: 107858, name: '김호준', email: 'a@b.c' });

// ── encryptPassword ─────────────────────────────────────────────────────────

test('encryptPassword produces ciphertext the matching private key can decrypt', () => {
  const cipher = encryptPassword('hunter2', PUB_B64);
  const plain = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(cipher, 'base64'),
  );
  assert.equal(plain.toString('utf8'), 'hunter2');
});

test('encryptPassword uses randomized PKCS#1 padding (same input, different output)', () => {
  const a = encryptPassword('same', PUB_B64);
  const b = encryptPassword('same', PUB_B64);
  assert.notEqual(a, b); // 결정적이면 패딩이 잘못된 것
  assert.equal(Buffer.from(a, 'base64').length, 128); // 1024bit
});

// ── login ───────────────────────────────────────────────────────────────────

test('login posts the flat body the server expects', async () => {
  const f = fakeFetch({ ...publicKeyRoute, '/auth/login': loginOk });
  await login({ email: 'a@b.c', password: 'pw' }, f);

  const body = f.calls[1].json;
  assert.deepEqual(Object.keys(body).sort(), ['decryptRSA', 'email', 'finger_print', 'password', 'publicKey'].sort());
  assert.equal(body.email, 'a@b.c');
  assert.equal(body.decryptRSA, 1);
  assert.equal(body.finger_print, ''); // 서버가 검증하지 않으므로 빈 문자열
  assert.equal(body.publicKey, PUB_B64);
  assert.notEqual(body.password, 'pw'); // 평문이 나가면 안 된다
});

test('login sends no Authorization header (auth endpoints are token-less)', async () => {
  const f = fakeFetch({ ...publicKeyRoute, '/auth/login': loginOk });
  await login({ email: 'a@b.c', password: 'pw' }, f);
  assert.equal(f.calls[0].headers.Authorization, undefined);
  assert.equal(f.calls[1].headers.Authorization, undefined);
});

test('login returns the session and does not touch disk', async () => {
  const f = fakeFetch({ ...publicKeyRoute, '/auth/login': loginOk });
  const s = await login({ email: 'a@b.c', password: 'pw' }, f);
  assert.deepEqual(s, {
    jwtToken: 'JWT-1',
    refreshToken: 'REF-1',
    myId: 107858,
    name: '김호준',
    email: 'a@b.c',
  });
  assert.equal(readSession(), null); // 캐싱은 호출자 몫
});

test('login surfaces the failed-password count instead of a generic error', async () => {
  const f = fakeFetch({ ...publicKeyRoute, '/auth/login': ok({ failPasswordCount: 3 }) });
  await assert.rejects(() => login({ email: 'a@b.c', password: 'wrong' }, f), (e) => {
    assert.ok(e instanceof CredentialsError);
    assert.match(e.message, /3회/);
    assert.match(e.message, /잠깁니다/);
    return true;
  });
});

// ── 자격증명 파일 ────────────────────────────────────────────────────────────

test('loadCredentials explains how to set the file up when it is missing', () => {
  assert.throws(() => loadCredentials(join(HOME, 'nope')), (e) => {
    assert.ok(e instanceof CredentialsError);
    assert.match(e.message, /chmod 600/);
    return true;
  });
});

test('loadCredentials rejects a file missing email or password', () => {
  const p = join(HOME, 'partial');
  writeFileSync(p, JSON.stringify({ email: 'a@b.c' }), { mode: 0o600 });
  assert.throws(() => loadCredentials(p), CredentialsError);
});

test('loadCredentials reads email and password', () => {
  writeFileSync(CRED_PATH, JSON.stringify({ email: 'a@b.c', password: 'pw' }), { mode: 0o600 });
  assert.deepEqual(loadCredentials(), { email: 'a@b.c', password: 'pw' });
});

// ── 세션 캐시 ────────────────────────────────────────────────────────────────

test('writeSession round-trips and is not readable by others', () => {
  writeSession({ jwtToken: 'T', myId: 1 });
  assert.equal(readSession().jwtToken, 'T');
  if (platform() !== 'win32') {
    assert.equal(statSync(SESSION_PATH).mode & 0o777, 0o600);
  }
  clearSession();
  assert.equal(readSession(), null);
});

test('readSession returns null for a corrupt or tokenless cache', () => {
  writeFileSync(SESSION_PATH, 'not json');
  assert.equal(readSession(), null);
  writeFileSync(SESSION_PATH, JSON.stringify({ myId: 1 }));
  assert.equal(readSession(), null);
  clearSession();
});

// ── withAuth ────────────────────────────────────────────────────────────────

test('withAuth logs in when no session is cached, then caches it', async () => {
  clearSession();
  const f = fakeFetch({ ...publicKeyRoute, '/auth/login': loginOk });
  const token = await withAuth((t) => t, f);
  assert.equal(token, 'JWT-1');
  assert.equal(readSession().jwtToken, 'JWT-1'); // 다음 실행에서 재사용된다
});

test('withAuth reuses the cached session without logging in again', async () => {
  writeSession({ jwtToken: 'CACHED', myId: 7 });
  const f = fakeFetch({}); // 어떤 경로든 호출하면 throw
  const seen = await withAuth((t, s) => ({ t, id: s.myId }), f);
  assert.deepEqual(seen, { t: 'CACHED', id: 7 });
  assert.equal(f.calls.length, 0);
});

test('withAuth re-logs in once and retries when the cached token has expired', async () => {
  writeSession({ jwtToken: 'STALE', myId: 7 });
  const f = fakeFetch({ ...publicKeyRoute, '/auth/login': loginOk });

  const tokens = [];
  const result = await withAuth((t) => {
    tokens.push(t);
    if (t === 'STALE') throw new TokenExpiredError();
    return 'done';
  }, f);

  assert.equal(result, 'done');
  assert.deepEqual(tokens, ['STALE', 'JWT-1']); // 만료된 토큰 1회 → 재로그인 후 1회
  assert.equal(readSession().jwtToken, 'JWT-1');
});

test('withAuth does not retry errors that are not token expiry', async () => {
  writeSession({ jwtToken: 'CACHED', myId: 7 });
  const f = fakeFetch({});
  let calls = 0;
  await assert.rejects(
    () => withAuth(() => { calls++; throw new Error('예약이 이미 있습니다'); }, f),
    /예약이 이미 있습니다/,
  );
  assert.equal(calls, 1); // 재시도하면 중복 쓰기가 된다
});
