import * as React from "react"
import PropTypes from "prop-types"

import Sidebar from "./sidebar"
import "./layout.scss"

const Layout = ({ children }) => {
  return (
    <div className="layout-sidebar">
      <div className="layout-sidebar--sidebar pad pad-ew-l zero-hide lg-show">
        <Sidebar />
      </div>

      <div className="layout-sidebar--content pad-l">
        <div>{ children }</div>
        <div className="zero-show lg-hide">
          <hr />
          <Sidebar />
        </div>
      </div>
    </div>
  )
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
