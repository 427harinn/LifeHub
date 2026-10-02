import { useEffect, useRef, useState, type KeyboardEvent, type UIEvent } from "react";

const GUIDE_PAGES = [
  { src: "/guide/1.webp", alt: "カレンダーで予定とお金をまとめて確認する画面" },
  { src: "/guide/2.webp", alt: "デイリーで今日の予定、お金、メモを確認する画面" },
  { src: "/guide/3.webp", alt: "期間中にやりたい予定を登録する画面" },
  { src: "/guide/4.webp", alt: "予定ごとの通知をテンプレートやカスタムで設定する画面" },
  { src: "/guide/5.webp", alt: "繰り返す支出を登録する画面" },
  { src: "/guide/6.webp", alt: "今月の支出、収入、残額を確認する画面" },
  { src: "/guide/7.webp", alt: "年間のお金をカテゴリ別や月別に振り返る画面" }
] as const;

export function GuidePage({ onClose }: { onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const updateCurrentPage = (scroller: HTMLDivElement) => {
    const pageWidth = scroller.clientWidth;
    if (!pageWidth) return;
    const nextPage = Math.max(0, Math.min(GUIDE_PAGES.length - 1, Math.round(scroller.scrollLeft / pageWidth)));
    if (nextPage === currentPageRef.current) return;
    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (frameRef.current !== null) return;
    const scroller = event.currentTarget;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateCurrentPage(scroller);
    });
  };

  const moveByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextPage = Math.max(0, Math.min(GUIDE_PAGES.length - 1, currentPageRef.current + direction));
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left: nextPage * scroller.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <main className="guide-page" aria-label="使い方ガイド">
      <div
        ref={scrollerRef}
        className="guide-page__scroller"
        aria-label="使い方ガイドのページ。左右にスワイプして見られます"
        tabIndex={0}
        onKeyDown={moveByKeyboard}
        onScroll={handleScroll}
      >
        {GUIDE_PAGES.map((page, index) => (
          <section className="guide-page__slide" key={page.src} aria-label={`使い方 ${index + 1}ページ目`}>
            <img src={page.src} alt={page.alt} decoding="async" loading={index === 0 ? "eager" : "lazy"} draggable={false} />
          </section>
        ))}
      </div>
      <button type="button" className="guide-page__close" aria-label="使い方を閉じる" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
      <div className="guide-page__indicator" aria-hidden="true">
        {GUIDE_PAGES.map((page, index) => <span className={`guide-page__dot${index === currentPage ? " is-active" : ""}`} key={page.src} />)}
      </div>
      <p className="sr-only" aria-live="polite">現在のページ: {currentPage + 1}</p>
    </main>
  );
}
