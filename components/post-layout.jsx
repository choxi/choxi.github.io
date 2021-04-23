import React from "react"
import Sidebar from "./sidebar"

export default function PostLayout(props) {
  return (
    <div className="layout-sidebar">
      <Sidebar />

      <div className="layout-sidebar--content pad-l" dangerouslySetInnerHTML={{ __html: props.children }}>
      </div>
    </div>
  )
}