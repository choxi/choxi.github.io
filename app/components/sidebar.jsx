import React from "react";
import Link from "next/link";
import SocialLinks, { MapPinIcon } from "./social-links";

export default function Sidebar() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="reset">
        <h1 className="mt-0 text-2xl"> Roshan Choxi</h1>
      </Link>
      <div className="flex flex-col gap-0">
        <p className="text-sm">
          Founder at{" "}
          <a href="https://reverieapps.com" target="_blank" rel="noopener noreferrer">
            Reverie
          </a>
        </p>
        <p className="text-sm">
          <span className="inline-flex items-center gap-1 align-bottom">
            <MapPinIcon size={15} />
            Chicago
          </span>
        </p>
      </div>

      <SocialLinks className="text-[var(--color-primary)]" />

      <div>
        <h3>Posts</h3>
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
    </div>
  );
}
