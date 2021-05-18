import React from "react"
import P5 from "./p5"
import Vector from "./js/vector"
import Color from "./js/color"

export default class Orbits extends React.Component {
  render() {
    return <P5 width="2" height="1">
      {
        (p, width, height) => {
          class Point {
            constructor(location, color) {
              this.location = location
              this.color = color
            }

            render(p) {
              const { x, y } = this.location

              p.fill(this.color.toP5(p))
              p.ellipse(x, y, 3)
            }
          }

          class Body {
            constructor(id, position, velocity, mass, color) {
              this.id = id
              this.position = position
              this.mass = mass
              this.velocity = velocity
              this.color = color
            }

            render(p) {
              const { x, y } = this.position
              const { color } = this

              const newX = x * 200
              const newY = y * 200
              p.fill(color.toP5(p))
              p.ellipse(newX, newY, 15)
            }
          }

          // https://www.emis.de/journals/Annals/152_3/chencine.pdf
          const scale = 1
          const x1 = new Vector(0.970, 0.243).multiply(scale)
          const x2 = x1.multiply(-1)
          const x3 = new Vector(0, 0)

          const v3 = new Vector(-0.932, 0.864)
          const v2 = v3.multiply(-0.5)
          const v1 = v2

          let bodies = [
            new Body(1, x1, v1, 1, Color.palettes.flat.alizarin),
            new Body(2, x2, v2, 1, Color.palettes.flat.amethyst),
            new Body(3, x3, v3, 1, Color.palettes.flat.asbestos)
          ]

          let points = []
          let t = -1
          const deltaT = 0.01

          p.setup = () => {
            p.createCanvas(width, height, p.WEBGL)
            p.fill(255, 0, 0)
            p.noStroke()
          }

          p.draw = () => {
            t += 1

            p.clear(0)
            // p.fill(255, 255, 255, 1)
            // p.rect(-400, -400, 800, 800)
            // p.fill(255, 0, 0)

            points.forEach(point => point.render(p))
            bodies.forEach(body => body.render(p))

            const newBodies = []
            bodies.forEach(body => {
              let totalForce = new Vector(0, 0)

              bodies.forEach(otherBody => {
                if (body.id === otherBody.id) {
                  return
                }

                const vector = otherBody.position.subtract(body.position)
                const distance = vector.magnitude()
                const force = vector.unit().multiply(body.mass * otherBody.mass / Math.pow(distance, 2))

                totalForce = totalForce.add(force)
              })

              const newVelocity = body.velocity.add(totalForce.multiply(deltaT))
              const newPosition = body.position.add(newVelocity.multiply(deltaT))
              newBodies.push(new Body(body.id, newPosition, newVelocity, body.mass, body.color))

              if (t % 10 === 0) {
                points.push(new Point(newPosition.multiply(200), body.color))
              }
            })

            bodies = newBodies
            if (points.length > 100) {
              points = points.slice(1, points.length)
            }
          }
        }
      }
    </P5>
  }
}