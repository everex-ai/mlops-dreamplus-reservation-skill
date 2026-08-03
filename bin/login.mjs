#!/usr/bin/env node
// 로그인 확인 / 세션 관리.
//
// 최초 설정 후 한 번 실행해 자격증명이 맞는지 확인한다. 평소에는 다른 명령이
// 알아서 로그인하므로 직접 실행할 일은 없다.
//
// usage: node bin/login.mjs            현재 세션 확인 (없으면 로그인)
//        node bin/login.mjs --force    캐시를 무시하고 다시 로그인
//        node bin/login.mjs --logout   세션 캐시 삭제

import { parseArgs, run } from '../lib/cli.mjs';
import { loginAndCache, readSession, clearSession, SESSION_PATH, CRED_PATH } from '../lib/auth.mjs';

run(async () => {
  const a = parseArgs(process.argv.slice(2));

  if (a.logout) {
    clearSession();
    console.log(`세션 캐시를 삭제했습니다: ${SESSION_PATH}`);
    console.log(`(자격증명 ${CRED_PATH} 은 그대로입니다.)`);
    return;
  }

  const cached = a.force ? null : readSession();
  if (cached) {
    console.log(`✓ 캐시된 세션 사용 — ${cached.name || '(이름 없음)'} <${cached.email}> · id ${cached.myId}`);
    console.log(`  ${SESSION_PATH}`);
    console.log('  토큰이 만료됐다면 다른 명령 실행 시 자동으로 다시 로그인합니다. 강제로 갱신하려면 --force.');
    return;
  }

  // 로그인은 1회만 시도한다 — 비밀번호 실패가 누적되면 계정이 잠긴다.
  const session = await loginAndCache();
  console.log(`✅ 로그인 성공 — ${session.name || '(이름 없음)'} <${session.email}> · id ${session.myId}`);
  console.log(`  세션 저장: ${SESSION_PATH}`);
});
