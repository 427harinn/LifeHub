import { describe, expect, it } from "vitest";
import { MONEY_CATEGORY_COLOR_KEYS, moneyCategoryColorKey, nextMoneyCategoryColorKey } from "./money-category-colors";

describe("money category colors", () => {
  it("exposes the expanded fixed palette", () => {
    expect(MONEY_CATEGORY_COLOR_KEYS).toHaveLength(15);
    expect(MONEY_CATEGORY_COLOR_KEYS).toEqual(expect.arrayContaining(["yellow", "teal", "cyan", "indigo", "brown", "lime", "blue-gray"]));
  });

  it("respects an explicit colorKey before any fallback", () => {
    expect(moneyCategoryColorKey({ id: "fixed", name: "固定費", colorKey: "pink" })).toBe("pink");
  });

  it("gives initial categories distinct stable colors", () => {
    const categories = ["食費", "固定費", "日用品", "交通", "医療", "娯楽", "その他"].map((name, index) => ({ id: `category-${index}`, name }));
    const colors = categories.map((category) => moneyCategoryColorKey(category));
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).toEqual(["orange", "blue", "green", "purple", "red", "pink", "gray"]);
    expect(moneyCategoryColorKey({ id: "category-1", name: "固定費" })).toBe("blue");
    expect(moneyCategoryColorKey({ id: "category-1", name: "固定費" })).toBe(moneyCategoryColorKey({ id: "category-1", name: "固定費" }));
  });

  it("uses a stable palette fallback for custom categories", () => {
    const category = { id: "custom-123", name: "ペット" };
    expect(moneyCategoryColorKey(category)).toBe(moneyCategoryColorKey({ ...category }));
    expect(MONEY_CATEGORY_COLOR_KEYS).toContain(moneyCategoryColorKey(category));
    expect(nextMoneyCategoryColorKey([{ id: "a", name: "A", colorKey: "orange" }])).not.toBe("orange");
  });

  it("keeps unknown legacy values backward compatible", () => {
    expect(moneyCategoryColorKey({ id: "legacy", name: "旧カテゴリ", colorKey: "unknown" })).toBe("gray");
  });
});
