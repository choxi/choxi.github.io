import Vector from "./vector"
import Color from "./color"

const Y_AXIS = 1
const X_AXIS = 2

export default class Utils {
  static isBrowser() {
    return typeof window !== `undefined`
  }

  static isSafari() {
    const ua = navigator.userAgent.toLowerCase()

    if (ua.indexOf('safari') != -1) {
      if (ua.indexOf('chrome') > -1) {
        return false
      } else {
        return true
      }
    }
  }

  static debugBezier(p, a1, c1, c2, a2) {
    p.push()
    p.noFill()
    p.stroke(255, 102, 0)
    p.line(a1.x, a1.y, c1.x, c1.y)
    p.line(c2.x, c2.y, a2.x, a2.y)
    p.stroke(0, 0, 0)
    p.bezier(a1.x, a1.y, c1.x, c1.y, c2.x, c2.y, a2.x, a2.y)
    p.pop()
  }

  static fromCenter(center, distance, theta) {
    let point = new Vector(distance, 0).rotate(theta)
    return center.add(point)
  }

  static clamp(number, min, max) {
    if (number < min) {
      return min
    }

    if (number > max) {
      return max
    }

    return number
  }

  // This implementation is intended to match p5.random()
  //
  //   `random(a)`    returns an integer value from 0 and up to a
  //   `random(a, b)` returns an integer value from a and up to b
  //
  static random(range, endRange) {
    if (endRange == undefined) {
      endRange = range
      range = 0
    }

    let rangeWidth = endRange - range

    return Math.floor(Math.random() * rangeWidth) + range
  }

  static randomColor(palette=Color.palettes.flat) {
    let names = Object.keys(palette)
    let index = Utils.random(names.length)
    let name = names[index]
    if (name == undefined) { debugger }
    let color = palette[name]
    return color
  }

  static setGradient(p, x, y, w, h, c1, c2, axis) {
    p.noStroke()
    if (axis === Y_AXIS) {
      // Top to bottom gradient
      for (let i = y; i <= y + h; i++) {
        let inter = p.map(i, y, y + h, 0, 1);
        let c = p.lerpColor(c1, c2, inter);
        p.fill(c);
        p.rect(x, i, w, 1);
      }
    } else if (axis === X_AXIS) {
      // Left to right gradient
      for (let i = x; i <= x + w; i++) {
        let inter = p.map(i, x, x + w, 0, 1);
        let c = p.lerpColor(c1, c2, inter);
        p.fill(c);
        p.rect(i, y, 1, h);
      }
    }
  }

  static drawGradient(x, y, colorA, colorB, radius) {
    for (let r = radius; r > 0; --r) {
      // let blended = blendColors(colorA, colorB, r / radius)
      let blended = lerpColor(colorA, colorB, r / radius)
      fill(blended);
      ellipse(x, y, r, r);
    }
  }

  static radialGradient(x, y, w, h, inner, outer) {
    noStroke();
    for (let i = Math.max(w, h); i > 0; i--) {
      const step = i / Math.max(w, h);
      const colour = lerpColor(inner, outer, step);
      fill(colour);
      ellipse(x, y, step * w, step * h);
    }
  }

  static toGPUCoordinate(x, y) {
    const height = Utils.isBrowser() ? window.innerHeight : 0
    const width = Utils.isBrowser() ? window.innerWidth : 0

    let centeredX = x - width / 2
    let centeredY = y - height / 2

    return { x: centeredX, y: centeredY }
  }
}