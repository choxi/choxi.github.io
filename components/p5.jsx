import React from "react"
import p5 from "p5"

export default class P5 extends React.Component {
  componentDidMount() {
    const { children } = this.props
    new p5(children, "p5-canvas")
  }

  render() {
    const { width, height } = this.props
    return <div id="p5" width={ width } height={ height }></div>
  }
}

P5.defaultProps = {
  width: 100,
  height: 100
}