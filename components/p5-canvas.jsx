import React from "react"
import p5 from "p5"
import Helmet from "react-helmet"

export default class P5Canvas extends React.Component {
  componentDidMount() {
    window.p5 = p5

    // eval in context
    // https://stackoverflow.com/questions/8403108/calling-eval-in-particular-context
    eval(`
      const app = new p5(p => {
        ${ this.props.children }
      }, "p5-canvas")
    `)
  }

  render() {
    const { width, height } = this.props
    return <div id="p5-canvas" width={ width } height={ height }></div>
  }
}

P5Canvas.defaultProps = {
  width: 100,
  height: 100
}