# M9 Money UI polish evidence

390×844 screenshots are captured by `e2e/m9-money-occurrence.spec.ts`:

- `money-planned-390x844.png` — Money header, three-row summary, planned row, and donut
- `money-form-actual-default-390x844.png` — new Money form defaults to 実績
- `money-form-recurrence-planned-390x844.png` — recurrence selection auto-switches to 予定
- `money-planned-expanded-390x844.png` — planned row inline detail and 実績を登録
- `money-actual-input-390x844.png` — actual amount BottomSheet
- `money-actual-expanded-390x844.png` — actual row inline detail and 実績を変更
- `money-actual-saved-390x844.png` — checked state and effective amount after save
- `money-next-month-swipe-390x844.png` — shared horizontal month gesture
- `calendar-actual-390x844.png` / `daily-actual-390x844.png` — shared projection in Calendar and Daily
- `settings-category-color-390x844.png` — category palette used by the donut legend

Videos for the Money tap → actual flow, month swipe, and recurring edit flow are produced under the Playwright artifact directory by the same test.
