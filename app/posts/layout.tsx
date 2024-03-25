import React, { FC } from "react";
import Sidebar from "../components/sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout-sidebar">
      <div className="layout-sidebar--sidebar pad-l sm-hide lg-show">
        <Sidebar />
      </div>

      <div className="layout-sidebar--content pad-l">
        <div>{children}</div>
        <div className="sm-show lg-hide">
          <hr className="pt-4" />
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
