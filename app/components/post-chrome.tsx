"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import Sidebar from "./sidebar";
import { TablerIcon } from "./social-links";

// The post pages' chrome: a slim top bar with your name (back to the landing
// page) and a "Posts" button that opens the sidebar as a drawer. The bar slides
// away while you scroll down into a post and comes back when you scroll up.
//
// The drawer is a native <dialog> opened with showModal(), which gives focus
// trapping, Escape to close and an inert page behind it for free.

export default function PostChrome() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hidden, setHidden] = useState(false);
  const pathname = usePathname();

  // Close the drawer after following one of its links.
  useEffect(() => {
    dialog.current?.close();
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

  const open = () => dialog.current?.showModal();
  const close = () => dialog.current?.close();

  // A click on the dimmed page beside the drawer lands on the dialog itself,
  // outside its box.
  const onDialogClick = (e: MouseEvent<HTMLDialogElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  };

  return (
    <>
      <header className="topbar" data-hidden={hidden || undefined}>
        <Link href="/" className="topbar-name">
          Roshan Choxi
        </Link>
        <div className="topbar-actions">
          <button type="button" className="topbar-button" onClick={open} aria-haspopup="dialog" aria-controls="site-drawer">
            <TablerIcon size={18}>
              <path d="M4 6l16 0" />
              <path d="M4 12l16 0" />
              <path d="M4 18l16 0" />
            </TablerIcon>
            <span>Posts</span>
          </button>
        </div>
      </header>

      <dialog id="site-drawer" ref={dialog} className="drawer" aria-label="Menu" onClick={onDialogClick}>
        <button type="button" className="drawer-close" onClick={close} aria-label="Close menu">
          <TablerIcon size={20}>
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </TablerIcon>
        </button>
        <Sidebar />
      </dialog>
    </>
  );
}
