# 배포 준비 점검표 (Vercel)

> PLAN 작업 24 결과. 실제 배포는 Part 5에서 한다. 점검일: 2026-11-02

## 1. 점검 결과 요약

| 항목 | 결과 | 확인 방법 |
|---|---|---|
| 프로덕션 빌드 | ✅ 통과 (경고 0건) | `npm run build` |
| 프로덕션 서버 동작 | ✅ 화면 200, 추천 API 200(실제 AI 약 2초), 입력 오류 400, GET 요청 405 | `npx next start` 후 호출 |
| 목록 파일이 배포에 포함되는지 | ✅ `data/restaurants.json` 포함, 소스 파일·`.env`는 포함 안 됨 | 빌드 결과의 파일 추적 목록(`route.js.nft.json`) |
| 비밀 값 유출 | ✅ git에 `.env`·키 모양 문자열 없음, 커밋 이력에도 없음 | `git ls-files`, `git grep`, `git log -- .env` |
| 브라우저로 키가 새는지 | ✅ 브라우저용 파일 23개 중 키 포함 0개, `NEXT_PUBLIC_` 사용 없음 | 작업 7에서 점검 |
| 키가 없을 때 | ✅ 화면은 "추천을 받지 못했어요"(502), 서버 기록에 원인 표시 | `OPENAI_API_KEY`를 비우고 실행 |
| API 실행 시간 제한 | ✅ `maxDuration = 60`초로 지정 | `app/api/recommend/route.ts` |
| 자동 점검 | ✅ 105개 통과 | `npm test` |

## 2. Vercel에 넣을 환경 변수

Vercel 프로젝트 → Settings → Environment Variables에 **직접 입력**한다. `.env` 파일은 올리지 않는다.

| 이름 | 필수 | 값 | 비고 |
|---|---|---|---|
| `OPENAI_API_KEY` | **필수** | OpenAI API 키 | 서버에서만 읽음. 이름에 `NEXT_PUBLIC_`을 붙이지 않는다. |
| `OPENAI_MODEL` | 선택 | 예: `gpt-5.4-mini` | 비우면 코드의 기본 모델(`gpt-5.4-mini`)을 쓴다. |

`.env`의 `GITHUB_TOKEN`·`SUPABASE_ACCESS_TOKEN`·`VERCEL_TOKEN`은 **앱 실행에 필요 없다.** Vercel 환경 변수에 넣지 않는다.
(`VERCEL_TOKEN`은 Part 5에서 Vercel CLI로 배포할 때 내 컴퓨터에서만 쓴다.)

## 3. Part 5 배포 순서 (예정)

1. OpenAI 관리 화면에서 **월 사용 한도**를 정해 둔다 (작성자).
2. 식당 목록 파일에 실제 가게 20~30곳이 들어갔는지, `(예시)` 가게를 지웠는지 확인한다.
3. `npm test`, `npm run lint`, `npm run build`가 모두 통과하는지 확인한다.
4. Vercel CLI를 설치하고 `.env`의 `VERCEL_TOKEN`으로 인증한다 (토큰 값은 화면에 출력하지 않는다).
5. Vercel 프로젝트에 위 2장의 환경 변수를 넣는다.
6. 배포한 뒤 주소에서 점심·회식 추천을 한 번씩 해 본다.

## 4. 배포 후 알아 둘 것

- **식당 목록 수정**: 내 컴퓨터에서는 파일을 고치면 바로 반영되지만, Vercel에서는 **고친 파일을 다시 배포해야** 반영된다.
- **식당 목록 최신화**: 배포 전이나 한 달에 한 번 `npm run refresh:data`로 미리보기 → `-- --write`로 반영 → `npm test` → 커밋 → 재배포 (자세한 내용은 data-sources.md 5장).
- **추가 조건 입력 칸의 개인정보**: 사용자가 쓴 문장(최대 60자)이 OpenAI로 전송된다. 전화번호·이메일 모양은 막고 안내 문구를 보여 주지만, 이름은 걸러 낼 수 없다. 서버는 이 문장을 저장하거나 로그에 남기지 않는다.
- **AI 오류가 나면**: Vercel 프로젝트의 Logs에서 "AI 추천 실패"로 시작하는 기록을 확인한다. 키 누락·만료·사용 한도 초과를 구분할 수 있다.
- **키가 노출된 것 같으면**: OpenAI에서 즉시 폐기·재발급하고 Vercel 환경 변수를 바꾼 뒤 다시 배포한다.

## 5. 남은 것 (배포 전에 하면 좋음)

- [ ] 실제 식당 데이터 20~30곳 (PLAN 작업 3, 작성자)
- [ ] 테스트 질문 10개로 성공 기준 점검 (PLAN 작업 22·23)
- [ ] `public/`의 기본 이미지(`next.svg`, `vercel.svg` 등)는 쓰지 않는다. 정리하려면 `trash-can/`으로 옮긴다 (선택)
