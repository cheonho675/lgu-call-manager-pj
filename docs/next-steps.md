# 다음에 사용자가 해야 할 일

## 지금 바로 할 일

1. Supabase 프로젝트 생성
2. `supabase/schema.sql` 실행
3. Supabase Project URL과 service role key 확인
4. `.env` 작성
5. `npm run dev`로 로컬 서버 실행
6. 가짜 LGU+ 콜백 URL로 저장 테스트

## LGU+ 승인 후 할 일

1. LGU+ API 부가서비스 신청/승인 확인
2. 실제 상품이 `Centrex`, `DCS`, `IMS Centrex` 중 무엇인지 확인
3. LGU+ 로그인 ID와 비밀번호 준비
4. 비밀번호를 SHA512로 변환해서 `LGU_PASS_HASH`에 저장

```bash
npm run hash:password -- "실제비밀번호"
```

5. 고정 IPv4 VPS 준비
6. VPS에 이 백엔드 배포
7. 80 포트로 콜백을 받을 수 있게 방화벽/보안그룹 설정
8. LGU+ `setringcallback`에 아래 값 등록

```text
callbackhost = VPS 고정 IPv4
callbackport = 80
callbackurl  = /lgu/ring.html?secret=LGU_WEBHOOK_SECRET
```

9. 서버 cron 등록

```text
* * * * * curl -s -X POST "http://localhost:8080/api/lgu/sync?secret=SYNC_SECRET" >/dev/null 2>&1
```

## 프론트엔드 개발 순서

1. 전화 목록 화면
2. 부재중 필터
3. 처리완료 체크
4. 메모 수정
5. 새 전화/부재중 실시간 반영
6. 고객명 매칭 테이블 추가

## 아직 일부러 미뤄둔 것

- Supabase Auth 로그인
- 관리자 권한 정책 RLS
- 실제 DCS/IMS Centrex 분기
- SMS 수신 콜백
- 녹취 파일 다운로드/저장
- Sentry 같은 외부 모니터링
