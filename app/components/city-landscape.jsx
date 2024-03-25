"use client";

import React from "react";
import CL from "./js/city-landscape";
import Utils from "./js/utils";

const p5 = Utils.isBrowser() ? require("p5") : null;

export default class CityLandscape extends React.Component {
  constructor(props) {
    super(props);
    this.canvasRef = React.createRef();
  }

  componentDidMount() {
    const width = this.canvasRef.current.clientWidth;
    const height = width * 0.6;
    this.app = new p5((p) => new CL(width, height, p), "canvas");
  }

  componentWillUnmount() {
    this.app?.remove();
  }

  render() {
    return (
      <div id="city-landscape">
        <div id="canvas" width="100%" ref={this.canvasRef}>
          {" "}
        </div>
      </div>
    );
  }
}

CityLandscape.defaultProps = {
  width: 100,
  height: 100,
};
