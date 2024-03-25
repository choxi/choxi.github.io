import React from "react";

export default function Sidebar() {
  return (
    <div>
      <a href="/" className="reset">
        <h1 className="mt-0 text-2xl font-bold mb-2"> roshan choxi </h1>
      </a>
      <p>
        Hi! I'm Roshan, a software engineer in Chicago. This is my site where I
        write about science, technology, and design.
      </p>

      <ul className="no-format mt-8">
        <li>
          <a href="https://twitter.com/choxi" target="_blank">
            Twitter
          </a>
        </li>
        <li>
          <a href="https://github.com/choxi" target="_blank">
            GitHub
          </a>
        </li>
        <li>
          <a href="https://www.linkedin.com/in/choxi" target="_blank">
            LinkedIn
          </a>
        </li>
      </ul>

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
