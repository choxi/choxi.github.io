import React from "react"
import { Link } from "gatsby"

export default function Sidebar() {
  return (
    <div>
      <Link to="/" className="reset">
        <h1> roshan choxi </h1>
      </Link>

      <p>
        Hi I'm Roshan, a software engineer in Chicago. This is my site where I write about science,
        technology, and design.
      </p>

      <ul>
        <li><a href="https://twitter.com/choxi" target="_blank">Twitter</a></li>
        <li><a href="https://github.com/choxi" target="_blank">GitHub</a></li>
        <li><a href="https://www.linkedin.com/in/choxi" target="_blank">LinkedIn</a></li>
      </ul>

      <h3 className="spc-n-l">Projects</h3>
      <ul>
        <li><a href="https://pixel.gl">Pixel</a></li>
      </ul>

      <h3 className="spc-n-l">Posts</h3>
      <ul>
        <li><a href="/idiom-static-site-generator.html">Idiom: A Simple Static Site Generator in React</a></li>
        <li>
          <a href="/procedural-landscapes.html">
            Procedurally Generated Landscapes
          </a>
        </li>
        <li>
          <a href="/gesture-detection-using-tensorflowjs">
            Gesture Detection Using Tensorflow.js
          </a>
        </li>
      </ul>
    </div>
  )
}