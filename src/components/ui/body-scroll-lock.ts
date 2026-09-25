type ScrollLockSnapshot = {
  bodyHadStyle: boolean;
  bodyStyle: string | null;
  scrollX: number;
  scrollY: number;
};

let activeLocks = 0;
let snapshot: ScrollLockSnapshot | null = null;

const restoreInlineStyle = (element: HTMLElement, hadStyle: boolean, style: string | null) => {
  if (hadStyle && style !== null) element.setAttribute("style", style);
  else element.removeAttribute("style");
};

export function lockBodyScroll() {
  if (typeof window === "undefined" || typeof document === "undefined" || !document.body) return () => undefined;

  if (activeLocks === 0) {
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    snapshot = { bodyHadStyle: body.hasAttribute("style"), bodyStyle: body.getAttribute("style"), scrollX, scrollY };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }
  activeLocks += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks > 0 || !snapshot || !document.body) return;

    const currentSnapshot = snapshot;
    snapshot = null;
    restoreInlineStyle(document.body, currentSnapshot.bodyHadStyle, currentSnapshot.bodyStyle);
    window.scrollTo(currentSnapshot.scrollX, currentSnapshot.scrollY);
  };
}
