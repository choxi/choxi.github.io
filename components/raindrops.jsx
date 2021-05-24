import React from "react"

import Utils from "./js/utils"
import Color from "./js/color"
import Vector from "./js/vector"
import { v4 as uuid } from "uuid"

const p5 = Utils.isBrowser() ? require("p5") : null

export default class Raindrops extends React.Component {
  componentDidMount() {
    const { width, height } = this.props
    const w = width ? width : (Utils.isBrowser() ? window.innerWidth : 0)
    const h = height ? height : (Utils.isBrowser() ? window.innerHeight : 0)

    console.log("starting playground")
    const app = new p5(p => sketch(w, h, p), "p5-canvas")
  }

  render() {
    const { width, height } = this.props
    const w = width ? width : (Utils.isBrowser() ? window.innerWidth : 0)
    const h = height ? height : (Utils.isBrowser() ? window.innerHeight : 0)
    return <div id="p5-canvas" width={ w } height={ h } style={{ background: "black" }}></div>
  }
}

class Bubble {
  constructor(location) {
    this.id = uuid()
    this.location = location
    this.radius = Utils.random(10, 100)
    this.alpha = 255 * 10 / this.radius
  }

  render(p) {
    const { x, y } = this.location
    const { alpha, radius } = this

    p.push()
    p.noFill()
    p.stroke(Color.palettes.tron.blue.alpha(alpha).toP5(p))
    p.ellipse(x, y, radius)
    p.pop()
  }

  step() {
    this.radius += 0.2
    this.alpha = this.alpha * 0.99
  }
}

const sketch = (width, height, p) => {
  const bubbles = {}

  p.setup = () => {
    p.frameRate(30)
    p.createCanvas(width, height, p.WEBGL)

    for(let i = 0; i < 1; i++) {
      const x = Utils.random(- width / 2, width / 2)
      const y = Utils.random(- height / 2, height / 2)
      const bubble = new Bubble(new Vector(x, y))
      bubbles[bubble.id] = bubble
    }
  }

  function updateBubbles(id) {
    let bubble = bubbles[id]
    bubble.render(p)
    bubble.step()

    if (bubble.alpha < 1) {
      delete bubbles[bubble.id]
    }
  }

  p.draw = () => {
    p.background(30)

    Object.keys(bubbles).forEach(updateBubbles)

    if (Utils.random(20) < 1) {
      const x = Utils.random(- width / 2, width / 2)
      const y = Utils.random(- height / 2, height / 2)
      const newBubble = new Bubble(new Vector(x, y))
      bubbles[newBubble.id] = newBubble
    }
  }
}