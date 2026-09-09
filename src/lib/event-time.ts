const pad = (value: number) => String(value).padStart(2, "0");

export const defaultEndTimeForStart = (startTime: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(startTime);
  if (!match) return startTime;
  const minutes = Number(match[1]) * 60 + Number(match[2]) + 60;
  const sameDayMinutes = Math.min(minutes, 23 * 60 + 59);
  return `${pad(Math.floor(sameDayMinutes / 60))}:${pad(sameDayMinutes % 60)}`;
};
