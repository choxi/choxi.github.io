const jsdom = require("jsdom")
const { JSDOM } = jsdom

const options = { resources: "usable", runScripts: "dangerously" }
JSDOM.fromURL("http://localhost:1234/index.html", options).then(dom => {
  dom.window.addEventListener("load", () => {
    console.log(dom.serialize())
  })
})

