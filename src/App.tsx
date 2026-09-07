import { useCallback, useState } from "react";
import { BottomSheet, Button, FormRow, Input, MobileShell } from "./components/ui";

export function App() {
  const [draftLabel, setDraftLabel] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  return (
    <MobileShell activeNavigation="calendar" onAdd={() => setSheetOpen(true)}>
      <header className="app-header">
        <div>
          <p className="eyebrow">APPLICATION FOUNDATION</p>
          <h1>LifeHub</h1>
        </div>
        <span className="status-pill">M1</span>
      </header>

      <main className="foundation-page">
        <section className="intro-card" aria-labelledby="foundation-title">
          <div className="intro-card__mark" aria-hidden="true">L</div>
          <div>
            <p className="eyebrow">WARM ORANGE THEME</p>
            <h2 id="foundation-title">暮らしを見渡す準備</h2>
            <p>共通UIとmobile shellを確認するためのM1プレビューです。</p>
          </div>
        </section>

        <section className="foundation-section" aria-labelledby="components-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REUSABLE UI</p>
              <h2 id="components-title">共通コンポーネント</h2>
            </div>
            <span className="section-count">01</span>
          </div>

          <form className="foundation-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
            <label className="input-field" htmlFor="preview-label">
              <span>ラベル入力</span>
              <Input
                aria-describedby="preview-label-hint"
                id="preview-label"
                onChange={(value) => { setDraftLabel(value); setSaved(false); }}
                placeholder="例: 今日の予定"
                value={draftLabel}
              />
              <small id="preview-label-hint">Inputはtoken経由の8px radiusです。</small>
            </label>

            <FormRow label="フォーム行" summary={draftLabel || "未入力のサマリー"} />
            <FormRow ariaLabel="表示設定" label="表示設定" onClick={() => setSheetOpen(true)} summary="BottomSheetで開く" />

            <Button type="submit">保存する</Button>
            {saved ? <p className="success-note" role="status">ローカルプレビューに保存しました。</p> : null}
          </form>
        </section>

        <section className="token-section" aria-labelledby="tokens-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DESIGN TOKENS</p>
              <h2 id="tokens-title">同じ密度、別の色</h2>
            </div>
          </div>
          <div className="token-list">
            <span className="token-chip token-chip--primary">primary</span>
            <span className="token-chip token-chip--soft">primary-soft</span>
            <span className="token-chip token-chip--neutral">space 4 / 8 / 16</span>
          </div>
        </section>
      </main>

      <BottomSheet open={sheetOpen} onClose={closeSheet} title="表示設定">
        <p className="sheet-copy">LifeHubの画面設定をここへ重ねていくための共通BottomSheetです。</p>
        <FormRow label="テーマ" summary="やわらかいオレンジ" />
        <FormRow label="角丸" summary="8 / 10 / 16px" />
        <Button onClick={closeSheet} variant="secondary">閉じる</Button>
      </BottomSheet>
    </MobileShell>
  );
}
