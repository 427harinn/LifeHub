import { addDateKey, getLocalDate } from "../lib/date-time";
import { MoneyOccurrenceOverrideRepository } from "../repositories/money-occurrence-override-repository";
import { MoneyOccurrenceSettlementRepository } from "../repositories/money-occurrence-settlement-repository";
import { MoneyRepository } from "../repositories/money-repository";
import { MoneyCategoryRepository } from "../repositories/money-category-repository";
import { RecurrenceRepository } from "../repositories/recurrence-repository";
import { SettingsRepository } from "../repositories/settings-repository";
import { UserStateRepository } from "../repositories/user-state-repository";
import { MoneyService } from "./money-service";

export const completedMoneyRange = (at: Date, timezone: string) => {
  const localDate = getLocalDate(at, timezone);
  const currentMonthStart = `${localDate.slice(0, 7)}-01`;
  return { startDate: "0001-01-01", endDate: addDateKey(currentMonthStart, -1), currentMonth: localDate.slice(0, 7) };
};

export class MoneySettlementService {
  private readonly settings: SettingsRepository;
  private readonly states: UserStateRepository;
  private readonly money: MoneyRepository;
  private readonly service: MoneyService;
  private readonly settlements: MoneyOccurrenceSettlementRepository;

  constructor(private readonly db: D1Database) {
    this.settings = new SettingsRepository(db);
    this.states = new UserStateRepository(db);
    this.money = new MoneyRepository(db);
    this.settlements = new MoneyOccurrenceSettlementRepository(db);
    this.service = new MoneyService(this.money, new MoneyCategoryRepository(db), new RecurrenceRepository(db), new MoneyOccurrenceOverrideRepository(db), this.settlements);
  }

  async run(at = new Date()): Promise<void> {
    for (const setting of await this.settings.listAll()) {
      try {
        if ((await this.states.getOrCreate(setting.userId, at.toISOString())).migrationState === "migration_locked") continue;
        await this.runForUser(setting.userId, setting.timezone, at);
      } catch (error) {
        console.error(JSON.stringify({ event: "lifehub_money_settlement_user_failed", userId: setting.userId, errorName: error instanceof Error ? error.name : "UnknownError" }));
      }
    }
  }

  private async runForUser(userId: string, timezone: string, at: Date) {
    const range = completedMoneyRange(at, timezone);
    const items = await this.money.listForSettlement(userId, range.endDate);
    for (const item of items) {
      const startDate = item.date < range.endDate ? item.date : range.endDate;
      if (startDate > range.endDate) continue;
      const projection = await this.service.project(userId, startDate, range.endDate, 1, at, timezone);
      for (const occurrence of projection.occurrences.filter((entry) => entry.id === item.id)) {
        if (occurrence.date > range.endDate || occurrence.settlementStatus) continue;
        await this.settlements.upsert(userId, item.id, occurrence.occurrenceKey, "estimated_actual", occurrence.effectivePlannedAmount, at.toISOString());
      }
    }
  }
}

export const runMoneySettlement = (env: Env, at: Date) => new MoneySettlementService(env.DB).run(at);
