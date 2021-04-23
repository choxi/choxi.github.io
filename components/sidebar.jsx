import React from "react"

export default function Sidebar() {
  return (
    <div className="layout-sidebar--sidebar pad pad-ew-l layout-absolute">
      <a href="/index.html">
        <h1> roshan choxi </h1>
      </a>
      <h3>Posts</h3>
      <a href="/posts/gesture-detection-using-tensorflowjs.html">Gesture Detection Using Tensorflowjs</a>
      <div className="layout-absolute--bottom spc-s text-center">
        Follow me on <a href="https://twitter.com/choxi" target="_blank">Twitter</a>
      </div>
    </div>
  )
}
