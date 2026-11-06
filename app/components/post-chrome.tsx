"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type PointerEvent } from "react";
import { useGlassLens } from "./glass-card";
import Sidebar from "./sidebar";
import { TablerIcon } from "./social-links";

// The post pages' chrome: two glass controls floating at the top, a menu
// button on the left that opens the sidebar as a drawer (with your name,
// links and posts), and a day/night switch on the right. They slide away
// while you scroll down into a post and come back when you scroll up.
//
// The drawer is a native <dialog> opened with showModal(), which gives focus
// trapping, Escape to close and an inert page behind it for free.

type Theme = "night" | "day";

// The theme lives on <html data-theme> (set before paint by the script in
// layout.tsx), so read it from there and re-render when it changes.
const readTheme = (): Theme => (document.documentElement.dataset.theme === "day" ? "day" : "night");
const subscribeTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
};

const SunIcon = () => (
  <TablerIcon size={16}>
    <path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
    <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
  </TablerIcon>
);
const MoonIcon = () => (
  <TablerIcon size={16}>
    <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" />
  </TablerIcon>
);

// A day/night switch: a glass track with a sun at one end and a moon at the
// other, and a knob that slides over the one that's on. It's a switch for
// screen readers too ("Night theme", on or off). Remembers the choice.
function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "night" as Theme);
  const night = theme === "night";

  const toggle = () => {
    const next: Theme = night ? "day" : "night";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  return (
    <button type="button" role="switch" aria-checked={night} aria-label="Night theme" title={night ? "Night" : "Day"} className="theme-switch glass" onClick={toggle}>
      <span className="theme-switch-icon theme-switch-sun" aria-hidden="true">
        <SunIcon />
      </span>
      <span className="theme-switch-icon theme-switch-moon" aria-hidden="true">
        <MoonIcon />
      </span>
      <span className="theme-switch-knob" aria-hidden="true">
        {night ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

export default function PostChrome() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();
  useGlassLens(dialog);

  // Close the drawer after following one of its links.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.style.transform = "";
    d.close();
  }, [pathname]);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY) < 8) return;
      setHidden(y > lastY && y > 120);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const open = () => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    // Focus the drawer itself rather than its close button, so opening it
    // with a click doesn't ring the button in a focus outline. Tab still
    // reaches every control inside.
    d.focus();
  };

  // Slide the drawer shut, then close the dialog once the animation ends. If
  // it's been dragged part way, it slides on from where it is.
  const close = () => {
    const d = dialog.current;
    if (!d?.open || d.dataset.closing !== undefined) return;
    const finish = () => {
      delete d.dataset.closing;
      d.style.transform = "";
      d.style.transition = "";
      d.close();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    d.dataset.closing = "";
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      finish();
    };
    d.addEventListener("animationend", once, { once: true });
    window.setTimeout(once, 400); // in case the animation never runs
  };

  // Swipe it shut: on touch, the drawer follows your finger left; let go past
  // a short distance (or with a quick flick) and it closes, otherwise it
  // springs back.
  const drag = useRef<{ id: number; x0: number; t0: number; dx: number } | null>(null);
  const dragged = useRef(false);
  const onPointerDown = (e: PointerEvent<HTMLDialogElement>) => {
    if (e.pointerType === "mouse") return;
    drag.current = { id: e.pointerId, x0: e.clientX, t0: performance.now(), dx: 0 };
    dragged.current = false;
  };
  const onPointerMove = (e: PointerEvent<HTMLDialogElement>) => {
    const g = drag.current;
    if (!g || e.pointerId !== g.id) return;
    g.dx = Math.min(0, e.clientX - g.x0);
    if (g.dx < -6) dragged.current = true;
    if (!dragged.current) return;
    e.currentTarget.style.transition = "none";
    e.currentTarget.style.transform = `translateX(${g.dx}px)`;
  };
  const onPointerEnd = (e: PointerEvent<HTMLDialogElement>) => {
    const g = drag.current;
    if (!g || e.pointerId !== g.id) return;
    drag.current = null;
    if (!dragged.current) return;
    const el = e.currentTarget;
    const speed = g.dx / Math.max(1, performance.now() - g.t0); // px per ms, negative is left
    if (g.dx < -80 || speed < -0.5) close();
    else {
      el.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      el.style.transform = "";
    }
  };

  // A tap on the page beside the drawer lands on the dialog itself, outside
  // its box. (A swipe that ends there isn't a tap.)
  const onDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  };

  return (
    <>
      <header className="topbar" data-hidden={hidden || undefined}>
        <button
          type="button"
          className="topbar-button glass"
          onClick={open}
          aria-label="Open menu"
          title="Posts"
          aria-haspopup="dialog"
          aria-controls="site-drawer"
        >
          <TablerIcon size={19}>
            <path d="M4 6l16 0" />
            <path d="M4 12l16 0" />
            <path d="M4 18l16 0" />
          </TablerIcon>
        </button>
        <ThemeSwitch />
      </header>

      <dialog
        id="site-drawer"
        ref={dialog}
        className="drawer"
        aria-label="Menu"
        tabIndex={-1}
        onClick={onDialogClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        // Escape slides it shut too, instead of the dialog's instant close.
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <button type="button" className="drawer-close" onClick={close} aria-label="Close menu">
          <TablerIcon size={20}>
            <path d="M4 6l16 0" />
            <path d="M4 12l16 0" />
            <path d="M4 18l16 0" />
          </TablerIcon>
        </button>
        <Sidebar />
      </dialog>
    </>
  );
}
