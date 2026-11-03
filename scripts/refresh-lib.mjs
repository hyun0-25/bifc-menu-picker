// 식당 목록 자동 갱신의 계산 부분 (네트워크 없이 시험할 수 있게 따로 둔다).
// 실제로 가게 정보를 가져오고 파일을 고치는 부분은 scripts/refresh-restaurants.mjs.
// 원칙: 자동으로 바꾸는 값과 사람이 확인한 값을 구분한다. 사람이 확인했을 수 있는 값은 덮어쓰지 않는다.

/** 도보 시간 기준점: BIFC몰(문현금융로 40) 위치 */
export const BIFC_POINT = { lat: 35.1465730347207, lon: 129.06589573525582 };
/** 직선거리에 곱하는 값 (길이 굽는 정도) */
export const DETOUR = 1.3;
/** 걸음 속도 (분당 미터, 시속 약 4km) */
export const METERS_PER_MINUTE = 67;
/** 목록에 넣을 수 있는 도보 시간 상한(분) */
export const MAX_WALK_MINUTES = 15;
/** 카카오맵 정보가 이 일수보다 오래 갱신되지 않았으면 알린다 */
export const STALE_DAYS = 365;
/** 가격이 이 비율 이상 달라지면 알린다 */
export const BIG_PRICE_CHANGE = 0.2;

/** 카카오맵 주소(source)에서 장소 번호를 뽑는다. 예: https://place.map.kakao.com/27485313 → "27485313" */
export function kakaoIdFromSource(source) {
  return /place\.map\.kakao\.com\/(\d+)/.exec(source ?? "")?.[1];
}

/** 두 지점 사이 직선거리(미터) */
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** BIFC에서 걸어서 걸리는 분 (직선거리 × 1.3 ÷ 분당 67m, 올림, 최소 1분) */
export function walkMinutes(point, ref = BIFC_POINT) {
  return Math.max(1, Math.ceil((distanceMeters(ref, point) * DETOUR) / METERS_PER_MINUTE));
}

/**
 * BIFC에서 차로 가는 분을 어림한다 (직선거리 × 1.4 ÷ 분당 333m(시속 약 20km, 도심 신호 포함) + 출발·주차 2분, 올림).
 * 실제 길찾기가 아니라 어림값이다.
 */
export function driveMinutes(point, ref = BIFC_POINT) {
  return Math.max(2, Math.ceil((distanceMeters(ref, point) * 1.4) / 333) + 2);
}

function median(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 대표 가격: 가격이 공개된 메뉴판 앞 8개의 중간값을 500원 단위로 반올림. 가격이 없으면 undefined */
export function representativePrice(items) {
  const prices = (items ?? []).filter((item) => item.price > 0).slice(0, 8).map((item) => item.price);
  return prices.length === 0 ? undefined : Math.round(median(prices) / 500) * 500;
}

/** 카카오맵 가게 상세(panel3 응답)에서 목록에 쓸 값을 뽑는다 */
export function derivePlace(panel, now = new Date()) {
  const summary = panel?.summary ?? {};
  const infos = JSON.stringify([
    panel?.place_add_info?.full_detail_infos ?? [],
    panel?.place_add_info?.simple_detail_infos ?? [],
  ]);
  const items = panel?.menu?.menus?.items ?? [];
  const menus = [...new Set(items.map((m) => (m.name ?? "").trim()).filter((n) => n && n.length <= 20))].slice(0, 6);
  const updated = summary.meta?.updated_at
    ? new Date(`${summary.meta.updated_at.replace(" ", "T")}+09:00`)
    : undefined;

  return {
    name: summary.name,
    open: summary.status === "Y",
    infoAgeDays: updated ? Math.floor((now - updated) / 86_400_000) : undefined,
    menus,
    price: representativePrice(items),
    walk: summary.point ? walkMinutes(summary.point) : undefined,
    drive: summary.point ? driveMinutes(summary.point) : undefined,
    groupSeating: infos.includes("단체석"),
    roomLabel: infos.includes("프라이빗룸"),
    booking: Boolean(panel?.my_store_notice?.is_available_booking),
  };
}

/**
 * 현재 목록의 가게 값(current)과 새로 읽은 값(derived)을 합친다.
 * - 자동으로 바꾸는 값: 이름, 대표 메뉴, 가격, 도보 시간, 그리고 "새로 확인된" 단체석·룸·카카오 예약
 * - 덮어쓰지 않는 값: 최대 인원, 룸 인원, 이미 확인된 룸·예약 (줄어들었으면 warnings로만 알린다)
 * - priceBasis가 있는 가게(뷔페처럼 가격을 사람이 정한 곳)는 가격·메뉴를 건드리지 않는다
 * - 폐업 의심·15분 초과·오래된 정보는 값을 바꾸지 않고 warnings로 알린다
 * 반환: { next: 바뀐 가게 값, changes: [{ field, from, to, note? }], warnings: [문장] }
 */
export function mergePlace(current, derived) {
  const next = { ...current };
  const changes = [];
  const warnings = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const set = (field, to, note) => {
    if (same(current[field], to)) return;
    next[field] = to;
    changes.push({ field, from: current[field], to, ...(note && { note }) });
  };

  if (!derived.open) {
    warnings.push("카카오맵 영업 상태가 정상이 아니에요. 폐업·이전인지 확인하고 목록에서 빼 주세요");
  }
  if (derived.infoAgeDays !== undefined && derived.infoAgeDays > STALE_DAYS) {
    warnings.push(`카카오맵 정보가 ${Math.floor(derived.infoAgeDays / 30)}개월 넘게 갱신되지 않았어요`);
  }

  if (derived.name && derived.name !== current.name) set("name", derived.name);

  if (current.priceBasis) {
    warnings.push(`가격은 "${current.priceBasis}" 기준으로 사람이 정한 값이라 갱신하지 않았어요`);
  } else {
    if (derived.menus.length > 0) set("menus", derived.menus);
    if (derived.price === undefined) {
      warnings.push("메뉴 가격이 공개되어 있지 않아 가격을 갱신하지 못했어요");
    } else {
      const big = Math.abs(derived.price - current.pricePerPerson) / current.pricePerPerson >= BIG_PRICE_CHANGE;
      set("pricePerPerson", derived.price, big ? "가격이 20% 이상 달라졌어요. 확인해 주세요" : undefined);
    }
  }

  if (derived.walk !== undefined) {
    if (derived.walk > MAX_WALK_MINUTES) {
      warnings.push(`도보 ${derived.walk}분으로 ${MAX_WALK_MINUTES}분을 넘어요. 목록에서 빼 주세요`);
    } else {
      set("walkMinutes", derived.walk);
    }
  }

  // 차량 시간은 어림값이라 항상 최신 계산값으로 맞춘다
  if (derived.drive !== undefined) set("driveMinutes", derived.drive);

  // 단체석: 새로 표시되면 켠다. 표시가 사라진 것은 직접 확인한 값일 수 있어 알리기만 한다.
  if (derived.groupSeating && !current.groupSeating) set("groupSeating", true);
  if (!derived.groupSeating && current.groupSeating) {
    warnings.push('카카오맵에서 "단체석" 표시가 사라졌어요. 직접 확인한 값이면 그대로 두세요');
  }

  // 룸: "정보 없음"이었는데 프라이빗룸 표시가 생기면 true로 (룸 인원은 그대로 "정보 없음")
  if (derived.roomLabel && current.hasRoom === "정보 없음") {
    set("hasRoom", true);
  }
  if (!derived.roomLabel && current.hasRoom === true) {
    warnings.push('카카오맵에서 "프라이빗룸" 표시가 사라졌어요. 직접 확인한 값이면 그대로 두세요');
  }

  // 예약: "정보 없음"이었는데 카카오 예약이 생기면 "가능"으로. 반대는 알리기만 한다.
  if (derived.booking && current.reservation === "정보 없음") set("reservation", "가능");
  if (!derived.booking && current.reservation === "가능") {
    warnings.push("카카오 예약이 사라졌어요. 전화로 확인한 값이면 그대로 두세요");
  }

  return { next, changes, warnings };
}

/** 목록을 파일에 쓸 모양으로 만든다 (가게 한 곳 = 한 줄) */
export function formatList(list) {
  const lines = list.map(
    (r) => "  { " + Object.entries(r).map(([k, v]) => `"${k}": ${JSON.stringify(v)}`).join(", ") + " }",
  );
  return `[\n${lines.join(",\n")}\n]\n`;
}

/**
 * 카카오 공식 검색(카테고리 FD6=음식점) 결과 중, 목록에 없는 새 가게만 골라 가까운 순으로 돌려준다.
 * documents: [{ id, place_name, category_name, distance, place_url, ... }]
 */
export function findNewPlaces(documents, knownIds) {
  return (documents ?? [])
    .filter((d) => d?.id && !knownIds.has(String(d.id)))
    .map((d) => ({
      id: String(d.id),
      name: d.place_name,
      category: d.category_name,
      distance: Number(d.distance),
      url: d.place_url,
    }))
    .sort((a, b) => a.distance - b.distance);
}
