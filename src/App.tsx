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
        <h1>LifeHub</h1>
      </header>

      <main className="foundation-page">
        <section className="foundation-section" aria-labelledby="components-title">
          <h2 id="components-title">共通コンポーネント</h2>
          <form className="foundation-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
            <label className="input-field" htmlFor="preview-label">
              <span>ラベル入力</span>
              <Input
                id="preview-label"
                onChange={(value) => { setDraftLabel(value); setSaved(false); }}
                placeholder="例: 今日の予定"
                value={draftLabel}
              />
            </label>

            <FormRow label="フォーム行" summary={draftLabel || "未入力のサマリー"} />
            <FormRow ariaLabel="表示設定" label="表示設定" onClick={() => setSheetOpen(true)} summary="BottomSheetで開く" />

            <Button type="submit">保存する</Button>
            {saved ? <p className="success-note" role="status">ローカルプレビューに保存しました。</p> : null}
          </form>
        </section>
      </main>

      <BottomSheet open={sheetOpen} onClose={closeSheet} title="表示設定">
        <FormRow label="テーマ" summary="オレンジ" />
        <FormRow label="背景" summary="白" />
        <Button onClick={closeSheet} variant="secondary">閉じる</Button>
      </BottomSheet>
    </MobileShell>
  );
}
