import * as React from "react"
import { Link } from "gatsby"

import Layout from "../components/layout"

const SecondPage = () => (
  <Layout>
    <h3>
      Hi I'm Roshan, a software engineer in Chicago. This is my site where I write about science,
      technology, and design.
    </h3>
    <p>Welcome to page 2</p>
    <Link to="/">Go back to the homepage</Link>
  </Layout>
)

export default SecondPage
