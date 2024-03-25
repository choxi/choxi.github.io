"use client";

import React from "react";
import P5 from "./p5";
import Vector from "./js/vector";
import Color from "./js/color";

export default class Orbits extends React.Component {
  constructor(props) {
    super(props);
    this.state = { mass: 1 };
  }

  handleSlider(event) {
    const mass = parseFloat(event.target.value);
    this.setState({ mass: mass });
  }

  render() {
    const { mass, renderID } = this.state;

    return (
      <div>
        <P5 width="2" height="1">
          {(p, width, height) => {
            class Point {
              constructor(location, color) {
                this.location = location;
                this.color = color;
              }

              render(p) {
                const { x, y } = this.location;

                p.fill(this.color.toP5(p));
                p.ellipse(x, y, 3);
              }
            }

            class Body {
              constructor(id, position, velocity, mass, color) {
                this.id = id;
                this.position = position;
                this.mass = mass;
                this.velocity = velocity;
                this.color = color;
              }

              render(p) {
                const { x, y } = this.position;
                const { color, mass } = this;
                const size = Math.sqrt(mass) * 15;

                const newX = x * 200;
                const newY = y * 200;
                p.fill(color.toP5(p));
                p.ellipse(newX, newY, size);
              }
            }

            // https://www.emis.de/journals/Annals/152_3/chencine.pdf
            const scale = 1;
            const x1 = new Vector(0.97, 0.243).multiply(scale);
            const x2 = x1.multiply(-1);
            const x3 = new Vector(0, 0);

            const v3 = new Vector(-0.932, 0.864);
            const v2 = v3.multiply(-0.5);
            const v1 = v2;

            let bodies = [
              new Body(1, x1, v1, 1, Color.palettes.flat.emerald),
              new Body(2, x2, v2, 1, Color.palettes.flat.amethyst),
              new Body(3, x3, v3, 1, Color.palettes.flat.peterRiver),
            ];

            let t = -1;
            const deltaT = 0.01;
            let trace;

            p.setup = () => {
              p.createCanvas(width, height, p.WEBGL);
              p.fill(255, 0, 0);
              p.noStroke();
              trace = p.createGraphics(width, height, p.WEBGL);
              trace.fill(255, 0, 0);
              trace.noStroke();
            };

            p.draw = () => {
              t += 1;

              p.clear(0);
              // p.fill(255, 255, 255, 1)
              // p.rect(-400, -400, 800, 800)
              // p.fill(255, 0, 0)

              p.image(trace, -width / 2, -height / 2);
              bodies.forEach((body) => body.render(p));

              const newBodies = [];
              bodies.forEach((body) => {
                let totalForce = new Vector(0, 0);

                bodies.forEach((otherBody) => {
                  if (body.id === otherBody.id) {
                    return;
                  }

                  const vector = otherBody.position.subtract(body.position);
                  const distance = vector.magnitude();
                  const force = vector
                    .unit()
                    .multiply(
                      (body.mass * otherBody.mass) / Math.pow(distance, 2)
                    );

                  totalForce = totalForce.add(force);
                });

                const newVelocity = body.velocity.add(
                  totalForce.multiply(deltaT)
                );
                const newPosition = body.position.add(
                  newVelocity.multiply(deltaT)
                );

                if (body.id === 1) {
                  newBodies.push(
                    new Body(
                      body.id,
                      newPosition,
                      newVelocity,
                      this.state.mass,
                      body.color
                    )
                  );
                } else {
                  newBodies.push(
                    new Body(
                      body.id,
                      newPosition,
                      newVelocity,
                      body.mass,
                      body.color
                    )
                  );
                }

                const point = new Point(newPosition.multiply(200), body.color);
                point.render(trace);
              });

              bodies = newBodies;
            };
          }}
        </P5>

        <div className="caption">
          While there are no general solutions to the three body problem, there
          are a few for specific cases. This is a simulation of the "Figure 8",
          one of the few known stable three body orbits. Try changing the mass
          of the green body below to see how chaotic the orbits become.
          <div className="spc-n">
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.1}
              defaultValue={mass}
              onChange={(e) => this.handleSlider(e)}
              style={{ verticalAlign: "bottom" }}
            />
            <span>{mass}</span>
          </div>
        </div>
      </div>
    );
  }
}
