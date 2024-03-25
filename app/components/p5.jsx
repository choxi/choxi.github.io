"use client";

import React from "react";
import Utils from "./js/utils";

const p5 = Utils.isBrowser() ? require("p5") : null;

export default class P5 extends React.Component {
  constructor(props) {
    super(props);
    this.canvasRef = React.createRef();
    this.canvas = null;
  }

  componentDidMount() {
    const { children, width, height } = this.props;

    const w = parseInt(width.replace("px", ""));
    const h = parseInt(height.replace("px", ""));

    const pageWidth = this.canvasRef.current.clientWidth;
    const pageHeight = (pageWidth * h) / w;

    this.canvas = new p5(
      (p) => children(p, pageWidth, pageHeight),
      "p5-canvas"
    );
  }

  componentWillUnmount() {
    this.canvas.remove();
  }

  render() {
    return <div id="p5-canvas" ref={this.canvasRef} width="100%"></div>;
  }
}

P5.defaultProps = {
  width: 100,
  height: 100,
};
