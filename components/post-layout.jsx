import React from "react"
import Sidebar from "./sidebar"

export default function PostLayout(props) {
  return (
    <div className="layout-sidebar">
      <div className="layout-sidebar--sidebar pad pad-ew-l sm-hide lg-show">
        <Sidebar />
      </div>

      <div className="layout-sidebar--content pad-l">
        <div dangerouslySetInnerHTML={{ __html: props.children }}></div>
        <div className="sm-show lg-hide">
          <hr />
          <Sidebar />
        </div>
      </div>
    </div>
  )
}