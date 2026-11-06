import React from "react";
import Fireflies from "../components/fireflies";
import PixelGarden from "../components/pixel-garden";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a plain page with a top bar, a drawer for
// the bio, links and post list, and the post in a centred column.
//
// Nothing moves while you read; a scene waits at the very bottom. At night
// it's the painted pond (night-pond.webp) with fireflies drifting over it; by
// day, the pixel scene with koi, wildflowers and a dragonfly. post-page.css
// shows the one for the current theme.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <PostChrome />
      <main className="post-sheet">{children}</main>
      <footer className="post-ground" aria-hidden="true">
        <div className="night-pond" />
        <PixelGarden />
        <Fireflies className="ground-flies" count={14} zone={[0.45, 0.85]} />
      </footer>
    </div>
  );
}
