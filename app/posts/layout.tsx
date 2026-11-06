import React from "react";
import Fireflies from "../components/fireflies";
import PondScene from "../components/pond-scene";
import PostChrome from "../components/post-chrome";
import SkyScene from "../components/sky-scene";
import "./post-page.css";

// Post pages focus on the writing: a plain page with a top bar, a drawer for
// the bio, links and post list, and the post in a centred column.
//
// The page opens under a sky (a moon and stars at night, a sun and drifting
// clouds by day) and ends at an animated pond scene, both fading into the
// page. The pond has a day and a night painting; at night fireflies drift
// over it (hidden by day in post-page.css), and by day dragonflies flit over
// the water (drawn by PondScene).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <div className="post-sky" aria-hidden="true">
        <SkyScene />
      </div>
      <PostChrome />
      <main className="post-sheet">{children}</main>
      <footer className="post-ground" aria-hidden="true">
        <PondScene />
        <Fireflies className="ground-flies" count={14} zone={[0.3, 0.82]} />
      </footer>
    </div>
  );
}
