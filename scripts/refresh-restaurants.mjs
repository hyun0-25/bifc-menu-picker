// 식당 목록 자동 갱신 도구 (작성자가 가끔 실행한다. 앱 서비스 코드가 아니다)
//
//   npm run refresh:data              → 미리보기: 무엇이 바뀌는지 보고서만 보여 준다 (파일은 안 고침)
//   npm run refresh:data -- --write   → 보고서의 "자동 반영" 항목을 data/restaurants.json에 쓴다
//   npm run refresh:data -- --discover → 목록에 없는 새 가게도 찾는다 (.env에 KAKAO_REST_API_KEY 필요)
//
// 어떤 값을 자동으로 바꾸고 어떤 값은 건드리지 않는지는 scripts/refresh-lib.mjs의 mergePlace에 적혀 있다.
// 주의: 카카오맵 가게 상세 정보는 카카오맵 화면이 쓰는 비공식 주소에서 읽는다. 개인 점검용으로만 쓰고,
// 요청 사이에 간격을 두며(0.4초), 앱이 사용자 요청마다 호출하지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import {
  BIFC_POINT,
  derivePlace,
  findNewPlaces,
  formatList,
  kakaoIdFromSource,
  mergePlace,
} from "./refresh-lib.mjs";

const FILE = new URL("../data/restaurants.json", import.meta.url);
const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const wantDiscover = args.has("--discover");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 카카오맵 가게 상세를 읽는다. 실패하면 2번까지 다시 시도하고, 그래도 안 되면 null */
async function fetchPanel(id) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`https://place.map.kakao.com/places/panel3/${id}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      // 잠깐 쉬고 다시 시도
    }
    await sleep(1000);
  }
  return null;
}

const show = (value) => (Array.isArray(value) ? `[${value.join(", ")}]` : String(value));

async function refresh() {
  const list = JSON.parse(readFileSync(FILE, "utf8"));
  const updated = [];
  const knownIds = new Set();
  const lines = { changed: [], warned: [], unchanged: 0 };
  let applied = 0;

  console.log(`식당 ${list.length}곳을 카카오맵과 비교합니다. (${write ? "반영 모드" : "미리보기: 파일은 고치지 않아요"})\n`);

  for (const restaurant of list) {
    const id = kakaoIdFromSource(restaurant.source);
    if (!id) {
      lines.warned.push(`${restaurant.id} ${restaurant.name}: 카카오맵 출처(source)가 없어 건너뛰었어요`);
      updated.push(restaurant);
      continue;
    }
    knownIds.add(id);

    const panel = await fetchPanel(id);
    await sleep(400);
    if (!panel?.summary) {
      lines.warned.push(`${restaurant.id} ${restaurant.name}: 카카오맵에서 정보를 읽지 못했어요 (가게가 사라졌을 수 있어요)`);
      updated.push(restaurant);
      continue;
    }

    const { next, changes, warnings } = mergePlace(restaurant, derivePlace(panel));
    updated.push(next);
    applied += changes.length;

    if (changes.length > 0) {
      lines.changed.push(
        `${restaurant.id} ${restaurant.name}\n` +
          changes
            .map((c) => `    - ${c.field}: ${show(c.from)} → ${show(c.to)}${c.note ? `  ⚠ ${c.note}` : ""}`)
            .join("\n"),
      );
    } else if (warnings.length === 0) {
      lines.unchanged += 1;
    }
    for (const warning of warnings) lines.warned.push(`${restaurant.id} ${restaurant.name}: ${warning}`);
  }

  console.log(`■ 바뀌는 값 (${lines.changed.length}곳, ${applied}항목)`);
  console.log(lines.changed.length > 0 ? lines.changed.join("\n") : "  없음");
  console.log(`\n■ 확인이 필요한 것 (${lines.warned.length}건) — 자동으로 고치지 않았어요`);
  console.log(lines.warned.length > 0 ? lines.warned.map((w) => `  - ${w}`).join("\n") : "  없음");
  console.log(`\n■ 변화 없음: ${lines.unchanged}곳`);

  if (write && applied > 0) {
    writeFileSync(FILE, formatList(updated));
    console.log("\n✅ data/restaurants.json에 반영했어요. 이어서 `npm test`로 형식을 확인하고 커밋해 주세요.");
  } else if (write) {
    console.log("\n반영할 값이 없어 파일은 그대로예요.");
  } else if (applied > 0) {
    console.log("\n위 값을 반영하려면 `npm run refresh:data -- --write`를 실행하세요.");
  }
  return knownIds;
}

/** 카카오 공식 검색으로 BIFC 반경 1km 음식점 중 목록에 없는 새 가게를 찾는다 (키가 있을 때만) */
async function discover(knownIds) {
  console.log("\n■ 새 가게 찾기");
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    console.log("  .env에 KAKAO_REST_API_KEY가 없어 건너뛰어요. (카카오 개발자 사이트에서 REST API 키를 발급받아 .env에 넣으면 돼요)");
    return;
  }

  const found = [];
  for (let page = 1; page <= 3; page += 1) {
    const url =
      "https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6" +
      `&x=${BIFC_POINT.lon}&y=${BIFC_POINT.lat}&radius=1000&sort=distance&size=15&page=${page}`;
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.log(`  검색에 실패했어요 (HTTP ${res.status}). 키가 맞는지 확인해 주세요.`);
      return;
    }
    const data = await res.json();
    found.push(...(data.documents ?? []));
    if (data.meta?.is_end) break;
    await sleep(300);
  }

  const fresh = findNewPlaces(found, knownIds).slice(0, 30);
  if (fresh.length === 0) {
    console.log("  목록에 없는 새 가게가 없어요.");
    return;
  }
  console.log(`  목록에 없는 가게 ${fresh.length}곳 (가까운 순). 넣을지는 직접 골라 주세요:`);
  for (const place of fresh) {
    const panel = await fetchPanel(place.id);
    await sleep(400);
    const priced = (panel?.menu?.menus?.items ?? []).some((m) => m.price > 0);
    console.log(`  - ${place.name} | ${place.category} | ${place.distance}m | 메뉴 가격 ${priced ? "공개" : "없음(목록에 못 넣어요)"} | ${place.url}`);
  }
}

const knownIds = await refresh();
if (wantDiscover) await discover(knownIds);
