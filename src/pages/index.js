import * as React from "react"
import { Link } from "gatsby"

import Layout from "../components/layout"

const IndexPage = () => (
  <Layout>
    <h3>
      Hi I'm Roshan, a software engineer in Chicago. This is my site where I write about science,
      technology, and design.
    </h3>
    <Link to="/gesture-detection">Gesture</Link>
  </Layout>
)

export default IndexPage
