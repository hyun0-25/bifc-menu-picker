// PRD nice ① 점검: 공지문이 200자 이내이고, 날짜·장소·인원만 담는지 확인한다.
import { describe, expect, it } from "vitest";
import { buildAnnouncement, formatDate, MAX_NOTICE_LENGTH } from "./notice";

const shop = { name: "성해루", pricePerPerson: 7500 };

describe("formatDate", () => {
  it("날짜를 '월 일(요일)'로 바꾼다", () => {
    expect(formatDate("2026-11-03")).toBe("11월 3일(화)");
    expect(formatDate("2026-11-14")).toBe("11월 14일(토)");
    expect(formatDate("2028-02-29")).toBe("2월 29일(화)"); // 윤년
  });

  it("형식이 틀리거나 없는 날짜는 undefined", () => {
    expect(formatDate("")).toBeUndefined();
    expect(formatDate("11/14")).toBeUndefined();
    expect(formatDate("2026-02-30")).toBeUndefined();
    expect(formatDate("2026-13-01")).toBeUndefined();
  });
});

describe("buildAnnouncement", () => {
  it("날짜·장소·인원·1인 비용과 안내 문장이 들어간다", () => {
    expect(buildAnnouncement({ restaurant: shop, people: 12, date: "2026-11-14" })).toBe(
      [
        "[팀 회식 안내]",
        "일시: 11월 14일(토)",
        "장소: 성해루",
        "인원: 12명",
        "1인 예상 비용: 7,500원",
        "예약은 담당자가 가게에 직접 전화로 진행합니다.",
        "참석 여부를 답글로 알려 주세요.",
      ].join("\n"),
    );
  });

  it("날짜를 비우거나 틀리면 '추후 공지'", () => {
    expect(buildAnnouncement({ restaurant: shop, people: 8 })).toContain("일시: 추후 공지");
    expect(buildAnnouncement({ restaurant: shop, people: 8, date: "2026-02-30" })).toContain("일시: 추후 공지");
  });

  it("200자 이내다 (평소 길이)", () => {
    expect(buildAnnouncement({ restaurant: shop, people: 30, date: "2026-11-14" }).length).toBeLessThanOrEqual(
      MAX_NOTICE_LENGTH,
    );
  });

  it("가게 이름이 아주 길어도 200자 이내로 줄이고 …로 표시한다", () => {
    const long = { name: "가".repeat(300), pricePerPerson: 200000 };
    const text = buildAnnouncement({ restaurant: long, people: 30, date: "2026-11-14" });
    expect(text.length).toBeLessThanOrEqual(MAX_NOTICE_LENGTH);
    expect(text).toMatch(/장소: 가+…\n/);
  });

  it("이름 칸은 없고 숫자(인원)만 받는다", () => {
    const text = buildAnnouncement({ restaurant: shop, people: 5, date: "2026-11-14" });
    expect(text).toContain("인원: 5명");
    expect(text).not.toMatch(/참석자:|님/);
  });
});
