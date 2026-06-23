# LGU+ 070 Call Manager Backend

LGU+ 070 인터넷전화 Centrex 콜백과 통화이력 조회를 받아 Supabase에 저장하는 백엔드 MVP입니다.

## 개발 방향

이 프로젝트는 LGU+ 070 인터넷전화에서 들어오는 전화 이벤트를 안정적으로 받아 Supabase에 저장하고, 이후 관리자 사이트에서 부재중/응답/처리완료 상태를 관리하는 방향으로 개발합니다.

전체 흐름은 아래와 같습니다.

```text
LGU+ 전화 수신 알림
  -> 고정 IPv4 백엔드 서버
  -> Supabase DB 저장
  -> 관리자 사이트에서 전화 목록/메모/처리상태 관리
```

1. HTTP 요청/응답
   - LGU+와 관리자 사이트는 HTTP 요청으로 백엔드와 통신합니다.
   - 백엔드는 요청을 받고 JSON 응답을 반환합니다.
   - 예: `GET /health`, `GET /api/calls`, `PATCH /api/calls/:id`

2. REST API
   - 전화 기록을 `calls`라는 자원으로 보고 API를 설계합니다.
   - 목록 조회는 `GET /api/calls`, 수정은 `PATCH /api/calls/:id`처럼 HTTP 메서드로 역할을 나눕니다.
   - 관리자 사이트는 이 API를 통해 전화 목록, 메모, 처리상태를 다룹니다.

3. Webhook
   - LGU+가 전화 수신 시 우리 백엔드 URL을 호출하는 구조입니다.
   - 현재 콜백 수신 API는 `GET|POST /lgu/ring.html`과 `GET|POST /api/lgu/ring`입니다.
   - Webhook은 "전화가 울렸다"는 빠른 알림이므로 처음에는 `status=ringing`으로 저장합니다.

4. Supabase 테이블과 CRUD
   - `call_events`는 LGU+가 보낸 원본 이벤트를 보관합니다.
   - `calls`는 관리자 화면에서 실제로 볼 전화 기록을 저장합니다.
   - 생성(Create), 조회(Read), 수정(Update), 삭제(Delete) 흐름을 Supabase DB에 연결합니다.

5. 환경변수와 비밀키 관리
   - Supabase secret key, LGU+ 비밀번호 해시, Webhook secret은 코드에 직접 쓰지 않습니다.
   - 로컬에서는 `.env`에 저장하고, `.env`는 Git에 올리지 않습니다.
   - 브라우저/프론트엔드에는 `SUPABASE_SERVICE_ROLE_KEY`, `LGU_PASS_HASH`, `LGU_WEBHOOK_SECRET`을 절대 노출하지 않습니다.

6. Cron 동기화
   - Webhook만으로는 최종 부재중 여부를 확정하기 어렵습니다.
   - `GET|POST /api/lgu/sync`가 LGU+ 통화이력 API를 조회해 최종 상태를 보정합니다.
   - 운영 서버에서는 cron으로 1분마다 sync API를 호출하는 방향을 기본으로 합니다.

7. 중복 방지와 upsert
   - Webhook, cron, 재시도 때문에 같은 통화가 여러 번 들어올 수 있습니다.
   - `dedupe_key`를 기준으로 같은 통화를 한 건으로 관리합니다.
   - 이미 있으면 update, 없으면 insert 하는 upsert 방식으로 중복 저장을 막습니다.

나중에 프론트엔드는 같은 저장소 안에 `web/` 또는 `apps/web/` 형태로 추가할 예정입니다. 프론트에서는 전화 목록, 부재중 필터, 메모 수정, 처리완료 체크, 실시간 갱신을 먼저 구현합니다.

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
