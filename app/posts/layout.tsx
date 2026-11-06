import React from "react";
import Fireflies from "../components/fireflies";
import PondScene from "../components/pond-scene";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a plain page with a top bar, a drawer for
// the bio, links and post list, and the post in a centred column.
//
// Nothing moves while you read; an animated pond scene waits at the very
// bottom, fading in from the page. It has a day and a night painting; at
// night fireflies drift over it (hidden by day in post-page.css), and by day
// a dragonfly flits over the water (drawn by PondScene).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <PostChrome />
      <main className="post-sheet">{children}</main>
      <footer className="post-ground" aria-hidden="true">
        <PondScene />
        <Fireflies className="ground-flies" count={12} zone={[0.15, 0.7]} />
      </footer>
    </div>
  );
}
