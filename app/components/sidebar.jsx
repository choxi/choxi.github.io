"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SocialLinks, { MapPinIcon } from "./social-links";

// The bio, social links and list of posts. Shown in the drawer that the
// "Posts" button in the post pages' top bar opens (see post-chrome.tsx).

const POSTS = [
  { href: "/posts/three-body-problems", title: "Three Body Problems" },
  { href: "/posts/idiom-static-site-generator", title: "Idiom: A Simple Static Site Generator in React" },
  { href: "/posts/procedural-landscapes", title: "Procedurally Generated Landscapes" },
  { href: "/posts/gesture-detection-using-tensorflowjs", title: "Gesture Detection Using Tensorflow.js" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="sidebar">
      <Link href="/" className="sidebar-name">
        Roshan Choxi
      </Link>
      <div className="sidebar-bio">
        <p>
          Founder at{" "}
          <a href="https://reverieapps.com" target="_blank" rel="noopener noreferrer">
            Reverie
          </a>
        </p>
        <p>
          <span className="inline-flex items-center gap-1 align-bottom">
            <MapPinIcon size={15} />
            Chicago
          </span>
        </p>
      </div>

      <SocialLinks className="sidebar-social" />

      <nav aria-labelledby="sidebar-posts">
        <h2 id="sidebar-posts" className="sidebar-label">
          Posts
        </h2>
        <ul className="sidebar-posts">
          {POSTS.map((post) => (
            <li key={post.href}>
              <Link href={post.href} aria-current={pathname === post.href ? "page" : undefined}>
                {post.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
