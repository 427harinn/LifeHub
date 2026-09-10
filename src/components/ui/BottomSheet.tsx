import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

type BottomSheetProps = {
  className?: string;
  headerActions?: ReactNode;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ className, headerActions, open, title, onClose, children }: BottomSheetProps) {
  const titleId = useId();
  const dragStart = useRef<{ x: number; y: number; axis: "pending" | "vertical" } | null>(null);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) {
      dragStart.current = null;
      dragOffsetRef.current = 0;
    }
  }, [open]);

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

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const content = target?.closest(".bottom-sheet__content");
    if (content instanceof HTMLElement && content.scrollTop > 0) return;
    dragStart.current = { axis: "pending", x: event.clientX, y: event.clientY };
    dragOffsetRef.current = 0;
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = dragStart.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (dy <= 0 || Math.abs(dy) <= Math.abs(dx)) {
        dragStart.current = null;
        return;
      }
      gesture.axis = "vertical";
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (gesture.axis === "vertical") {
      event.preventDefault();
      const nextOffset = Math.max(0, Math.min(220, dy));
      dragOffsetRef.current = nextOffset;
      setDragOffset(nextOffset);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const gesture = dragStart.current;
    if (!gesture) return;
    const shouldClose = gesture.axis === "vertical" && dragOffsetRef.current > 64;
    dragStart.current = null;
    dragOffsetRef.current = 0;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragOffset(0);
    if (shouldClose) onClose();
  };

  return createPortal((
    <div className="bottom-sheet-layer" onClick={(event) => event.stopPropagation()}>
      <button aria-label="背景を閉じる" className="bottom-sheet__backdrop" onClick={onClose} type="button" />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`bottom-sheet${className ? ` ${className}` : ""}${dragging ? " is-dragging" : ""}`}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="dialog"
        style={{ "--sheet-drag-offset": `${dragOffset}px` } as CSSProperties}
      >
        <div aria-hidden="true" className="bottom-sheet__handle" />
        <div className="bottom-sheet__header">
          <h2 id={titleId}>{title}</h2>
          {headerActions ? <div className="bottom-sheet__header-actions">{headerActions}</div> : null}
          <button className="bottom-sheet__close" onClick={onClose} type="button">閉じる</button>
        </div>
        <div className="bottom-sheet__content">{children}</div>
      </section>
    </div>
  ), document.body);
}
