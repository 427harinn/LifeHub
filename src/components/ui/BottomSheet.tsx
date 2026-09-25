import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { lockBodyScroll } from "./body-scroll-lock";

type BottomSheetProps = {
  className?: string;
  headerActions?: ReactNode;
  open: boolean;
  title: string;
  onClose: () => void;
  closable?: boolean;
  /** CSS selector inside the sheet for the element that should receive initial focus. */
  initialFocus?: string;
  children: ReactNode;
};

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

type DragStart = {
  axis: "pending" | "vertical";
  x: number;
  y: number;
  scrollContainer: HTMLElement | null;
};

const findVerticalScrollContainer = (target: Element | null, dialog: HTMLElement | null) => {
  let element = target;
  while (element instanceof HTMLElement && element !== dialog) {
    const style = window.getComputedStyle(element);
    const canScrollVertically = (style.overflowY === "auto" || style.overflowY === "scroll") && element.scrollHeight > element.clientHeight;
    if (canScrollVertically) return element;
    element = element.parentElement;
  }
  return null;
};

export function BottomSheet({ className, headerActions, open, title, onClose, closable = true, initialFocus, children }: BottomSheetProps) {
  const titleId = useId();
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<DragStart | null>(null);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    dragStart.current = null;
    dragOffsetRef.current = 0;
    const releaseBodyScroll = lockBodyScroll();
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = layerRef.current;
    const backgroundState = new Map<HTMLElement, boolean>();
    if (layer) {
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement) || child === layer) continue;
        backgroundState.set(child, child.inert);
        child.inert = true;
      }
    }
    const focusInitialElement = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      let target: Element | null = null;
      if (initialFocus) {
        try { target = dialog.querySelector(initialFocus); } catch { target = null; }
      }
      target ??= contentRef.current?.querySelector(focusableSelector) ?? dialog.querySelector(focusableSelector);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
      else dialog.focus({ preventScroll: true });
    };
    const focusTimer = window.setTimeout(focusInitialElement, 0);
    return () => {
      window.clearTimeout(focusTimer);
      releaseBodyScroll();
      backgroundState.forEach((inert, element) => { element.inert = inert; });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [initialFocus, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (layerRef.current !== document.body.lastElementChild) return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        if (closable) { event.preventDefault(); onClose(); }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
        : currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (layerRef.current !== document.body.lastElementChild) return;
      if (!(event.target instanceof Node) || !dialogRef.current?.contains(event.target)) {
        const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
        (first ?? dialogRef.current)?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [closable, onClose, open]);

  if (!open) return null;

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const scrollContainer = findVerticalScrollContainer(target, dialogRef.current);
    if (scrollContainer && scrollContainer.scrollTop > 0) return;
    dragStart.current = { axis: "pending", x: event.clientX, y: event.clientY, scrollContainer };
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
      if (gesture.scrollContainer && gesture.scrollContainer.scrollTop > 0) {
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
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragOffset(0);
    if (shouldClose) onClose();
  };

  const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
    dragStart.current = null;
    dragOffsetRef.current = 0;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragOffset(0);
  };

  return createPortal((
    <div className="bottom-sheet-layer" onClick={(event) => event.stopPropagation()} ref={layerRef}>
      <button aria-label="背景を閉じる" className="bottom-sheet__backdrop" onClick={closable ? onClose : undefined} tabIndex={-1} type="button" />
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`bottom-sheet${className ? ` ${className}` : ""}${dragging ? " is-dragging" : ""}`}
        onPointerCancel={handlePointerCancel}
        onPointerDownCapture={handlePointerDown}
        onPointerMoveCapture={handlePointerMove}
        onPointerUpCapture={handlePointerUp}
        role="dialog"
        ref={dialogRef}
        tabIndex={-1}
        style={{ "--sheet-drag-offset": `${dragOffset}px` } as CSSProperties}
      >
        <div aria-hidden="true" className="bottom-sheet__handle" />
        <div className="bottom-sheet__header">
          <h2 id={titleId}>{title}</h2>
          {headerActions ? <div className="bottom-sheet__header-actions">{headerActions}</div> : null}
          <button className="bottom-sheet__close" onClick={closable ? onClose : undefined} type="button">閉じる</button>
        </div>
        <div className="bottom-sheet__content" ref={contentRef}>{children}</div>
      </section>
    </div>
  ), document.body);
}
