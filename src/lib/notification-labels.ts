export const notificationOffsetLabel = (offset: number) => offset === 10 ? "10分前" : offset === 30 ? "30分前" : offset === 60 ? "1時間前" : offset === 1440 ? "1日前" : `${offset}分前`;
export const notificationSummary = (offsets: number[]) => {
  const values = [...new Set(offsets)].sort((left, right) => right - left);
  if (values.length === 0) return "なし";
  if (values.length > 2) return `${values.length}件`;
  return values.map(notificationOffsetLabel).join("、");
};
