import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

type BottomSheetProps = {
  className?: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ className, open, title, onClose, children }: BottomSheetProps) {
  const titleId = useId();
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    setDragOffset(Math.max(0, Math.min(180, event.clientY - dragStartY.current)));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    const shouldClose = dragOffset > 64;
    dragStartY.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragOffset(0);
    if (shouldClose) onClose();
  };

  return (
    <div className="bottom-sheet-layer">
      <button aria-label="背景を閉じる" className="bottom-sheet__backdrop" onClick={onClose} type="button" />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`bottom-sheet${className ? ` ${className}` : ""}`}
        role="dialog"
        style={{ "--sheet-drag-offset": `${dragOffset}px` } as CSSProperties}
      >
        <div
          aria-hidden="true"
          className="bottom-sheet__handle"
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div className="bottom-sheet__header">
          <h2 id={titleId}>{title}</h2>
          <button className="bottom-sheet__close" onClick={onClose} type="button">閉じる</button>
        </div>
        <div className="bottom-sheet__content">{children}</div>
      </section>
    </div>
  );
}
