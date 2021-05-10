import React from "react"
import Sidebar from "./sidebar"
import Helmet from "react-helmet"

import "./application.scss"

export default function PostLayout(props) {
  return (
    <div className="layout-sidebar">
      <Helmet>
        <script async src="https://www.googletagmanager.com/gtag/js?id=UA-86991778-1"></script>
        <script>
          {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'UA-86991778-1');
          `}
        </script>
      </Helmet>

      <div className="layout-sidebar--sidebar pad pad-ew-l sm-hide lg-show">
        <Sidebar />
      </div>

      <div className="layout-sidebar--content pad-l">
        <div>{ props.children }</div>
        <div className="sm-show lg-hide">
          <hr />
          <Sidebar />
        </div>
      </div>
    </div>
  )
}