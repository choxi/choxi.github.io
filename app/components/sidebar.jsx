import React from "react";
import Link from "next/link";
import SocialLinks, { MapPinIcon } from "./social-links";

export default function Sidebar() {
  return (
    <div>
      <Link href="/" className="reset">
        <h1 className="mt-0 text-2xl font-bold mb-2"> Roshan Choxi</h1>
      </Link>
      <p className="text-sm">
        <span className="inline-flex items-center gap-1 align-bottom">
          <MapPinIcon size={15} />
          Chicago
        </span>
      </p>
      <p className="text-sm mt-1">
        Founder at{" "}
        <a href="https://reverieapps.com" target="_blank" rel="noopener noreferrer">
          Reverie
        </a>
      </p>

      <SocialLinks className="mt-6 text-[var(--color-primary)]" />

      <h3 className="spc-n-l">Posts</h3>
      <ul className="no-format">
        <li>
          <a href="/posts/three-body-problems">Three Body Problems</a>
        </li>
        <li>
          <a href="/posts/idiom-static-site-generator">
            Idiom: A Simple Static Site Generator in React
          </a>
        </li>
        <li>
          <a href="/posts/procedural-landscapes">
            Procedurally Generated Landscapes
          </a>
        </li>
        <li>
          <a href="/posts/gesture-detection-using-tensorflowjs">
            Gesture Detection Using Tensorflow.js
          </a>
        </li>
      </ul>
    </div>
  );
}
