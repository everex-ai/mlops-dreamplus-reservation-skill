// 회의실 카탈로그 로더. 회의실 목록(코드·이름·층·정원·장비·포인트)은
// 사실상 정적이라 data/rooms.catalog.json에 커밋해 두고, 예약 조회 시 조인한다.
// 구성이 바뀌면 `node bin/refresh-catalog.mjs`로 재생성.

import { readFileSync } from 'node:fs';

let cache = null;

/** 커밋된 카탈로그의 rooms 배열 반환 (프로세스 내 캐시) */
export function loadCatalog() {
  if (!cache) {
    const url = new URL('../data/rooms.catalog.json', import.meta.url);
    cache = JSON.parse(readFileSync(url)).rooms;
  }
  return cache;
}
