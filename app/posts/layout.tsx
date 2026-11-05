import React from "react";
import Fireflies from "../components/fireflies";
import PixelScene from "../components/pixel-scene";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a top bar with a drawer for the bio, links
// and post list, and the post itself on a centred sheet.
//
// Both scene pieces are always rendered; the theme's CSS shows one: the full
// scene behind the page at night, a band of sky across the top by day.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <PixelScene className="scene-backdrop" />
      <Fireflies className="scene-backdrop-flies" grid="cover" count={24} zone={[0.3, 0.98]} edges={0.16} />
      <PixelScene rows={[0, 84]} className="scene-band" />
      <PostChrome />
      <main className="post-sheet">{children}</main>
    </div>
  );
}
