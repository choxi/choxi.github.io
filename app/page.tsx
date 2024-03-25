"use client";

import Raindrops from "./components/raindrops";

export default function Home() {
  return (
    <div className="layout-absolute">
      <Raindrops />

      <div className="layout-absolute--center">
        <div className="box box--frost">
          <div className="text-center">
            <h1 className="text-lg font-bold">
              Hi! I'm Roshan, a software engineer in Chicago. This is my site
              where I write about science, technology, and design.
            </h1>

            <h3 className="spc-n-l">Recent Posts</h3>
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
      </div>
    </div>
  );
}
