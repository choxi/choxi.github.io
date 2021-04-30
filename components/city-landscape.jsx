import React from "react"
import p5 from "p5"
import Helmet from "react-helmet"
import CL from "../js/city-landscape"

export default class CityLandscape extends React.Component {
  componentDidMount() {
    const width = parseInt(this.props.width)
    const height = parseInt(this.props.height)
    new p5(p => new CL(width, height, p), "canvas")
  }

  render() {
    return <div id="city-landscape">
      <Helmet><title>City Landscape | choxi</title></Helmet>
      <div id="canvas"> </div>
    </div>
  }
}

CityLandscape.defaultProps = {
  width: 100,
  height: 100
}
