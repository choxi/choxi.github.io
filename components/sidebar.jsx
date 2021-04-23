import React from "react"

export default function Sidebar() {
  return (
    <div className="layout-sidebar--sidebar pad pad-ew-l">
      <a href="/index.html" className="reset">
        <h1> roshan choxi </h1>
      </a>
      <p>
        Hi I'm Roshan, a software engineer in Chicago. This is my site where I write about science,
        technology, and design.
      </p>
      <ul>
        <li><a href="https://twitter.com/choxi" target="_blank">Twitter</a></li>
        <li><a href="https://github.com/choxi" target="_blank">GitHub</a></li>
      </ul>

      <h3>Posts</h3>
      <ul>
        <li>
          <a href="/posts/gesture-detection-using-tensorflowjs.html">
            Gesture Detection Using Tensorflow.js
          </a>
        </li>
      </ul>
    </div>
  )
}
