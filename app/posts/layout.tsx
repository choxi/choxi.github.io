import React from "react";
import Sidebar from "../components/sidebar";

export default function PostLayout(props) {
  return (
    <div className="layout-sidebar">
      <div className="layout-sidebar--sidebar pad-l sm-hide lg-show">
        <Sidebar />
      </div>

      <div className="layout-sidebar--content pad-l">
        <div>{props.children}</div>
        <div className="sm-show lg-hide">
          <hr />
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
