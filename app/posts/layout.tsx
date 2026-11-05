import React from "react";
import PostChrome from "../components/post-chrome";
import "./post-page.css";

// Post pages focus on the writing: a top bar with a drawer for the bio, links
// and post list, and the post itself on a centred sheet.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="post-page">
      <PostChrome />
      <main className="post-sheet">{children}</main>
    </div>
  );
}
