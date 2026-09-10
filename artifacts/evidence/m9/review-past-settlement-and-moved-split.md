# M9 review follow-up evidence

Date: 2026-09-10

## Settled past occurrence after series recurrence change

- Original series: `2026-09-09`, monthly, planned `70,000`
- Historical settlement anchor: `money:rent:2026-09-09`, actual `70,000`
- Current series after series edit: day `15`, planned `75,000`
- Projection result: the old `2026-09-09` occurrence is restored from the settlement anchor with effective amount `70,000`; future occurrences use day `15` and planned `75,000`.

Covered by `money-service.test.ts` test `restores a settled past occurrence after the series recurrence date changes`.

## Following split after a moved occurrence

- Original occurrence key date: `2026-09-10`
- Occurrence-only date override: effective date `2026-09-12`
- Following boundary: old series ends `2026-09-09`; new series starts `2026-09-10`
- The moved override and settlement are copied to the new series under its new stable occurrence key.

Covered by `money-service.test.ts` test `splits a moved occurrence at its original key date and carries its override forward`, plus `moneyFollowingBoundary` unit coverage.

No occurrence rows are pre-generated; both cases use the existing recurrence projection and stable occurrence keys.
