export const MONEY_CATEGORY_COLOR_KEYS = ["orange", "blue", "green", "purple", "red", "pink", "gold", "gray"] as const;

export type MoneyCategoryColorKey = typeof MONEY_CATEGORY_COLOR_KEYS[number];

export const MONEY_CATEGORY_COLORS: Record<MoneyCategoryColorKey, string> = {
  orange: "#d47b4f",
  blue: "#527c9c",
  green: "#5f8b6d",
  purple: "#806b9b",
  red: "#b65445",
  pink: "#ba7188",
  gold: "#b38a3d",
  gray: "#858b86"
};

const DEFAULT_CATEGORY_COLOR_KEYS: Record<string, MoneyCategoryColorKey> = {
  "食費": "orange",
  "日用品": "green",
  "固定費": "blue",
  "交通": "purple",
  "医療": "red",
  "娯楽": "pink",
  "その他": "gray",
  "給料": "gold",
  "臨時収入": "blue"
};

export const isMoneyCategoryColorKey = (value: unknown): value is MoneyCategoryColorKey => typeof value === "string" && MONEY_CATEGORY_COLOR_KEYS.includes(value as MoneyCategoryColorKey);

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
};

export type MoneyCategoryColorInput = { id?: string | null; name?: string | null; colorKey?: string | null };

export const moneyCategoryColorKey = (category?: MoneyCategoryColorInput | null): MoneyCategoryColorKey => {
  if (isMoneyCategoryColorKey(category?.colorKey)) return category.colorKey;
  const namedColor = category?.name ? DEFAULT_CATEGORY_COLOR_KEYS[category.name] : undefined;
  if (namedColor) return namedColor;
  if (!category?.id && !category?.name) return "gray";
  return MONEY_CATEGORY_COLOR_KEYS[stableHash(category.id ?? category.name ?? "other") % MONEY_CATEGORY_COLOR_KEYS.length];
};

export const moneyCategoryColor = (category?: MoneyCategoryColorInput | null) => MONEY_CATEGORY_COLORS[moneyCategoryColorKey(category)];

export const nextMoneyCategoryColorKey = (categories: MoneyCategoryColorInput[], type = "expense"): MoneyCategoryColorKey => {
  const used = new Set(categories.map((category) => moneyCategoryColorKey(category)));
  const available = MONEY_CATEGORY_COLOR_KEYS.find((key) => !used.has(key));
  return available ?? MONEY_CATEGORY_COLOR_KEYS[stableHash(`${type}:${categories.length}`) % MONEY_CATEGORY_COLOR_KEYS.length];
};
