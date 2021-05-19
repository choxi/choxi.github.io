import React from "react"
import p5 from "p5"

export default class P5 extends React.Component {
  constructor(props) {
    super(props)
    this.canvasRef = React.createRef()
  }

  componentDidMount() {
    const { children, width, height } = this.props

    const w = parseInt(width.replace("px", ""))
    const h = parseInt(height.replace("px", ""))

    const pageWidth = this.canvasRef.current.clientWidth
    const pageHeight = pageWidth * h / w

    new p5(p => children(p, pageWidth, pageHeight), "p5-canvas")
  }

  render() {
    return <div id="p5-canvas" ref={ this.canvasRef } width="100%"></div>
  }
}

P5.defaultProps = {
  width: 100,
  height: 100
}