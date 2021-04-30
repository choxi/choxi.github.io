import React from "react"
import p5 from "p5"
import Helmet from "react-helmet"

export default class P5Canvas extends React.Component {
  componentDidMount() {
    window.p5 = p5

    eval(`
      const app = new p5(p => {
        ${ this.props.children }
      }, "p5-canvas")
    `)
  }

  render() {
    return <div id="p5-canvas"></div>
  }
}