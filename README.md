# LGU+ 070 Call Manager Backend

LGU+ 070 인터넷전화 Centrex 콜백과 통화이력 조회를 받아 Supabase에 저장하는 백엔드 MVP입니다.

## 지금 구현된 것

- `GET /health`: 서버 상태 확인
- `GET|POST /lgu/ring.html`: LGU+ 전화 수신 콜백 수신
- `GET|POST /api/lgu/ring`: 같은 콜백을 API 경로로도 수신
- `GET|POST /api/lgu/sync`: LGU+ `getinboundcall` 조회 후 `calls`에 upsert
- `GET /api/calls`: 전화 목록 조회
- `PATCH /api/calls/:id`: 메모, 처리상태, 상태 수정
- `DELETE /api/calls/:id`: 전화 기록 삭제

## 개발 시작

1. Supabase 프로젝트를 만들고 `supabase/schema.sql`을 SQL Editor에서 실행합니다.
2. `.env.example`을 참고해서 `.env`를 만듭니다.
3. 실행합니다.

```bash
npm run dev
```

`Automatically expose new tables`를 꺼둔 경우에도 `schema.sql`에 필요한 `service_role` 권한 부여가 포함되어 있습니다. 이미 예전 버전의 스키마를 실행했다면 `supabase/grants.sql`만 SQL Editor에서 한 번 더 실행하면 됩니다.

LGU+ 비밀번호 SHA512 해시 만들기:

```bash
npm run hash:password -- "실제비밀번호"
```

## 로컬 테스트

서버 상태:

```bash
curl http://localhost:8080/health
```

LGU+ 승인 전 가짜 콜백 테스트:

```bash
curl "http://localhost:8080/lgu/ring.html?secret=change-me-webhook-secret&sender=01012345678&receiver=07012345678&kind=1&inner_num=302&message="
```

전화 목록 조회:

```bash
curl "http://localhost:8080/api/calls?secret=change-me-admin-secret"
```

LGU+ 승인 후 통화이력 동기화:

```bash
curl -X POST "http://localhost:8080/api/lgu/sync?secret=change-me-sync-secret"
```

## 운영 배치

LGU+ 규격상 콜백은 `https`가 아니라 `http`, 그리고 `callbackhost`가 IPv4를 요구합니다. 그래서 콜백 수신 서버는 Vercel/Netlify보다 고정 IPv4가 있는 작은 VPS에 두는 편이 좋습니다.

관리 사이트 프론트엔드는 Vercel/Netlify에 올리고, 데이터는 Supabase에서 읽는 구조를 추천합니다.
