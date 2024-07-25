// import mercuryURL from "url-loader!../../data/ephemeris/mercury.txt"
// import venusURL from "url-loader!../../data/ephemeris/venus.txt"
// import earthURL from "url-loader!../../data/ephemeris/earth.txt"
// import marsURL from "url-loader!../../data/ephemeris/mars.txt"
// import jupiterURL from "url-loader!../../data/ephemeris/jupiter.txt"
// import saturnURL from "url-loader!../../data/ephemeris/saturn.txt"
// import neptuneURL from "url-loader!../../data/ephemeris/neptune.txt"
// import uranusURL from "url-loader!../../data/ephemeris/uranus.txt"

const mercuryURL = "/ephemeris/mercury.txt";
const venusURL = "/ephemeris/venus.txt";
const earthURL = "/ephemeris/earth.txt";
const marsURL = "/ephemeris/mars.txt";
const jupiterURL = "/ephemeris/jupiter.txt";
const saturnURL = "/ephemeris/saturn.txt";
const neptuneURL = "/ephemeris/neptune.txt";
const uranusURL = "/ephemeris/uranus.txt";

const planets = [
  {
    name: "mercury",
    dataURL: mercuryURL,
  },
  {
    name: "venus",
    dataURL: venusURL,
  },
  {
    name: "earth",
    dataURL: earthURL,
  },
  {
    name: "mars",
    dataURL: marsURL,
  },
  {
    name: "jupiter",
    dataURL: jupiterURL,
  },
  {
    name: "saturn",
    dataURL: saturnURL,
  },
  {
    name: "neptune",
    dataURL: neptuneURL,
  },
  {
    name: "uranus",
    dataURL: uranusURL,
  },
];

export default class JPL {
  static async ephemerisData() {
    const data = await Promise.all(
      planets.map((planet) =>
        fetch(planet.dataURL)
          .then((response) => response.text())
          .then((text) => {
            const lines = text.split("\n").map((l) => l.trim());
            const start = lines.findIndex((line) => line === "$$SOE");
            const end = lines.findIndex((line) => line === "$$EOE");
            const data = lines.slice(start + 1, end);
            const results = {};
            for (let i = 0; i < data.length / 4; i++) {
              try {
                const date = data[i * 4].match(/(\d{4})-\w{3}-\d{2}/)[1];
                const x = parseFloat(data[i * 4 + 1].match(/X =\s?(\S+)/)[1]);
                const y = parseFloat(data[i * 4 + 1].match(/Y =\s?(\S+)/)[1]);
                const z = parseFloat(data[i * 4 + 1].match(/Z =\s?(\S+)/)[1]);
                const vx = parseFloat(
                  data[i * 4 + 2].match(/VX\s?=\s?(\S+)/)[1]
                );
                const vy = parseFloat(
                  data[i * 4 + 2].match(/VY\s?=\s?(\S+)/)[1]
                );
                const vz = parseFloat(
                  data[i * 4 + 2].match(/VZ\s?=\s?(\S+)/)[1]
                );
                results[date] = { x, y, z, vx, vy, vz };
              } catch (e) {
                debugger;
              }
            }

            return Promise.resolve({ [planet.name]: results });
          })
      )
    );

    return data.reduce((acc, d) => (acc = { ...acc, ...d }));
  }
}
