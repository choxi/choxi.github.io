import React from "react"
import p5 from "p5"
import Helmet from "react-helmet"
import CL from "./js/city-landscape"

export default class CityLandscape extends React.Component {
  constructor(props) {
    super(props)
    this.canvasRef = React.createRef()
  }

  componentDidMount() {
    const width = this.canvasRef.current.clientWidth
    const height = width * 0.6
    new p5(p => new CL(width, height, p), "canvas")
  }

  render() {
    return <div id="city-landscape">
      <Helmet><title>City Landscape | choxi</title></Helmet>
      <div id="canvas" width="100%" ref={ this.canvasRef }> </div>
    </div>
  }
}

CityLandscape.defaultProps = {
  width: 100,
  height: 100
}
