import React from "react";
import Fireflies from "../components/fireflies";
import PixelGarden, { PLANT_PX } from "../components/pixel-garden";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a plain page with a top bar, a drawer for
// the bio, links and post list, and the post in a centred column.
//
// Nothing moves while you read; a little pixel scene waits at the very
// bottom: shrubs and a pond with fish. At night it has glowing plants with
// fireflies over them; by day, wildflowers and a dragonfly (the fireflies are
// hidden in post-page.css).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <PostChrome />
      <main className="post-sheet">{children}</main>
      <footer className="post-ground" aria-hidden="true">
        <PixelGarden />
        <Fireflies className="ground-flies" pixel={PLANT_PX} count={12} zone={[0.08, 0.7]} />
      </footer>
    </div>
  );
}
