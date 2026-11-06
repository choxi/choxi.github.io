import React from "react";
import Fireflies from "../components/fireflies";
import PixelGarden, { PLANT_PX } from "../components/pixel-garden";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a plain page with a top bar, a drawer for
// the bio, links and post list, and the post in a centred column.
//
// Nothing moves while you read; a little pixel garden waits at the very
// bottom. At night it's glowing plants with fireflies over them; by day,
// wildflowers and butterflies (the fireflies are hidden in post-page.css).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <PostChrome />
      <main className="post-sheet">{children}</main>
      <footer className="post-ground" aria-hidden="true">
        <PixelGarden />
        <Fireflies className="ground-flies" pixel={PLANT_PX} count={9} zone={[0.1, 0.75]} edges={0.2} />
      </footer>
    </div>
  );
}
