import React from "react";
import Fireflies from "../components/fireflies";
import GlowPlants, { PLANT_PX } from "../components/glow-plants";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a plain page with a top bar, a drawer for
// the bio, links and post list, and the post in a centred column. A few
// glowing pixel plants grow at the bottom, with fireflies over them; at night
// more fireflies drift in the margins.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <Fireflies className="page-flies" grid="cover" count={18} zone={[0.3, 0.95]} edges={0.14} />
      <PostChrome />
      <main className="post-sheet">{children}</main>
      <footer className="post-ground" aria-hidden="true">
        <GlowPlants />
        <Fireflies pixel={PLANT_PX} count={7} zone={[0.15, 0.75]} edges={0.2} />
      </footer>
    </div>
  );
}
