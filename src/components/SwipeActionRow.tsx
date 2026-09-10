import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

type SwipeAction = { label: string; onClick: () => void; variant?: "primary" | "danger" };
type SwipeActionRowProps = {
  ariaLabel: string;
  actions: SwipeAction[];
  children: ReactNode;
  expandedContent?: ReactNode;
  onHorizontalSwipeStart?: () => void;
  onMainClick?: () => void;
  onOtherRowTouch?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function SwipeActionRow({ ariaLabel, actions, children, expandedContent, onHorizontalSwipeStart, onMainClick, onOtherRowTouch, open: controlledOpen, onOpenChange }: SwipeActionRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number; axis: "pending" | "horizontal" | "vertical" } | null>(null);
  const suppressClick = useRef(false);
  const isOpen = controlledOpen ?? open;
  const setOpenState = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  const actionWidth = 80 * actions.length;
  const move = (event: PointerEvent<HTMLElement>) => {
    const gesture = start.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.axis === "pending") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) { gesture.axis = "vertical"; start.current = null; setOffset(isOpen ? -actionWidth : 0); return; }
      gesture.axis = "horizontal";
      onHorizontalSwipeStart?.();
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (gesture.axis === "horizontal") { event.preventDefault(); setOffset(Math.max(-actionWidth, Math.min(0, (isOpen ? -actionWidth : 0) + dx))); }
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const gesture = start.current;
    if (!gesture) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    start.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (gesture.axis === "horizontal" && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      const nextOpen = dx < 0;
      setOpenState(nextOpen); setOffset(nextOpen ? -actionWidth : 0); suppressClick.current = true;
    } else setOffset(isOpen ? -actionWidth : 0);
  };
  return <article aria-label={ariaLabel} className={`event-swipe-row${isOpen ? " is-actions-open" : ""}${dragging ? " is-dragging" : ""}`} onClickCapture={(event) => { if (!suppressClick.current) return; event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }} onPointerCancel={() => { start.current = null; setDragging(false); setOffset(isOpen ? -actionWidth : 0); }} onPointerDown={(event) => { if (event.target instanceof Element && event.target.closest(".event-swipe-row__actions")) return; onOtherRowTouch?.(); start.current = { x: event.clientX, y: event.clientY, axis: "pending" }; }} onPointerMove={move} onPointerUp={end}>
    <div className="event-swipe-row__content" style={{ "--event-swipe-offset": `${dragging ? offset : 0}px`, width: dragging ? "100%" : isOpen ? `calc(100% - ${actionWidth}px)` : "100%" } as CSSProperties} onClick={() => { if (!isOpen) onMainClick?.(); }}>
      {children}
    </div>
    {isOpen ? <div aria-label={`${ariaLabel}の操作メニュー`} className="event-swipe-row__actions" style={{ width: `${actionWidth}px` }}>{actions.map((action) => <button className={action.variant === "danger" ? "swipe-action--danger" : ""} key={action.label} onClick={() => { setOpenState(false); setOffset(0); action.onClick(); }} onPointerDown={(event) => event.stopPropagation()} type="button">{action.label}</button>)}</div> : null}
    {expandedContent}
  </article>;
}
