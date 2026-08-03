// 인증 — 브라우저 없이 드림플러스에 로그인해 JWT를 얻는다.
//
//   자격증명  ~/.dreamplus/credentials  {email, password}          ← 사용자가 직접 작성
//   세션 캐시 ~/.dreamplus/session.json {jwtToken, refreshToken, myId, name}
//
// 로그인 절차(웹 번들에서 확인한 그대로):
//   1. POST /auth/publickey            → RSA 공개키(base64 SPKI)
//   2. 비밀번호를 RSA-1024 PKCS#1 v1.5로 암호화 → base64  (프론트의 JSEncrypt와 동일 규격)
//   3. POST /auth/login {email, password, finger_print, decryptRSA:1, publicKey}
//      → data.jwtToken / refreshToken / id / name
//
// finger_print는 프론트가 fingerprintjs2 값을 보내지만 서버가 검증하지 않는다(빈 문자열로
// 로그인 성공을 실측 확인). 그래서 상수 ''로 보낸다.
//
// 발급된 토큰은 표준 JWT가 아니라(헤더가 `eyJ`가 아님) 만료 시각을 로컬에서 읽을 수 없다.
// 따라서 캐시된 토큰으로 먼저 시도하고, code "301"이 오면 1회 재로그인 후 재시도한다.

import { createPublicKey, publicEncrypt, constants } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync, chmodSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { apiFetch, TokenExpiredError } from './api.mjs';

// 설정 디렉터리는 DP_HOME으로 덮어쓸 수 있다(테스트 격리·계정 분리용).
export const CONFIG_DIR = process.env.DP_HOME || join(homedir(), '.dreamplus');
export const CRED_PATH = join(CONFIG_DIR, 'credentials');
export const SESSION_PATH = join(CONFIG_DIR, 'session.json');

export class CredentialsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CredentialsError';
  }
}

const SETUP_HELP = `자격증명 파일이 필요합니다: ${CRED_PATH}

  mkdir -p ${CONFIG_DIR} && chmod 700 ${CONFIG_DIR}
  touch ${CRED_PATH} && chmod 600 ${CRED_PATH}
  $EDITOR ${CRED_PATH}

내용:

  { "email": "you@everex.co.kr", "password": "드림플러스 비밀번호" }

비밀번호가 대화 기록에 남지 않도록 본인 터미널에서 직접 작성하세요.`;

/** ~/.dreamplus/credentials 로드. 없거나 형식이 틀리면 안내와 함께 CredentialsError */
export function loadCredentials(path = CRED_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new CredentialsError(SETUP_HELP);
    throw new CredentialsError(`${path} 읽기 실패: ${e.message}`);
  }

  let cred;
  try {
    cred = JSON.parse(raw);
  } catch (e) {
    throw new CredentialsError(`${path} 가 올바른 JSON이 아닙니다: ${e.message}`);
  }
  if (!cred.email || !cred.password) {
    throw new CredentialsError(`${path} 에 email과 password가 모두 있어야 합니다.`);
  }

  // 다른 사용자가 읽을 수 있으면 경고(차단하지는 않는다). Windows는 모드 비트가 무의미.
  if (platform() !== 'win32') {
    try {
      if (statSync(path).mode & 0o077) {
        console.error(`⚠️  ${path} 권한이 너무 열려 있습니다 → chmod 600 ${path}`);
      }
    } catch {
      /* 권한 확인 실패는 무시 */
    }
  }
  return { email: cred.email, password: cred.password };
}

/** 서버 RSA 공개키(base64 SPKI) */
export async function fetchPublicKey(fetchImpl) {
  const j = await apiFetch(null, '/auth/publickey', 'POST', undefined, fetchImpl);
  const key = j.data?.publicKey;
  if (!key) throw new Error('서버가 공개키를 반환하지 않았습니다.');
  return key;
}

/** 프론트의 JSEncrypt와 동일: RSA PKCS#1 v1.5 → base64 */
export function encryptPassword(password, publicKeyB64) {
  const key = createPublicKey({
    key: Buffer.from(publicKeyB64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  return publicEncrypt(
    { key, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8'),
  ).toString('base64');
}

/**
 * 로그인 1회. 세션 객체를 반환하며 디스크에는 쓰지 않는다(캐싱은 호출자 몫).
 * 실패해도 재시도하지 않는다 — 비밀번호 오류가 누적되면 계정이 잠긴다.
 */
export async function login(cred, fetchImpl) {
  const publicKey = await fetchPublicKey(fetchImpl);
  const j = await apiFetch(
    null,
    '/auth/login',
    'POST',
    {
      email: cred.email,
      password: encryptPassword(cred.password, publicKey),
      finger_print: '', // 서버가 검증하지 않음
      decryptRSA: 1,
      publicKey,
    },
    fetchImpl,
  );

  const d = j.data || {};
  const jwtToken = d.jwtToken || d.accessToken;
  if (!jwtToken) {
    const why = d.failPasswordCount
      ? `비밀번호가 틀렸습니다 (실패 ${d.failPasswordCount}회 — 5회 초과 시 계정이 잠깁니다)`
      : j.message || '알 수 없는 이유';
    throw new CredentialsError(`로그인 실패: ${why}`);
  }

  return {
    jwtToken,
    refreshToken: d.refreshToken || null,
    myId: d.id ?? null,
    name: d.name || null,
    email: d.email || cred.email,
  };
}

/** 캐시된 세션. 없거나 깨졌으면 null */
export function readSession(path = SESSION_PATH) {
  try {
    const s = JSON.parse(readFileSync(path, 'utf8'));
    return s.jwtToken ? s : null;
  } catch {
    return null;
  }
}

/** 세션 캐시 저장 (0600) */
export function writeSession(session, path = SESSION_PATH) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(session, null, 2) + '\n', { mode: 0o600 });
  if (platform() !== 'win32') chmodSync(path, 0o600); // 기존 파일이면 mode 옵션이 적용되지 않는다
}

/** 세션 캐시 삭제 (로그아웃) */
export function clearSession(path = SESSION_PATH) {
  rmSync(path, { force: true });
}

/** 로그인 후 세션을 캐시에 저장 */
export async function loginAndCache(fetchImpl) {
  const session = await login(loadCredentials(), fetchImpl);
  writeSession(session);
  return session;
}

/**
 * 인증이 필요한 작업의 실행 래퍼.
 * 캐시된 토큰으로 먼저 시도하고, 만료(301)면 1회 재로그인 후 재시도한다.
 * fn(token, session) 형태로 호출되며, fn 안에서 여러 번 API를 호출해도 된다.
 *
 * 재시도는 fn 전체를 다시 실행한다. 301은 "요청이 인가되지 않았다"는 뜻이라
 * 만료로 실패한 쓰기는 서버에 반영되지 않았으므로 중복 예약이 생기지 않는다.
 */
export async function withAuth(fn, fetchImpl) {
  let session = readSession() || (await loginAndCache(fetchImpl));

  try {
    return await fn(session.jwtToken, session);
  } catch (e) {
    if (!(e instanceof TokenExpiredError)) throw e;
    session = await loginAndCache(fetchImpl); // 만료 → 재로그인 1회
    return await fn(session.jwtToken, session);
  }
}
