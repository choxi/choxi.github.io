const jsdom = require("jsdom")
const { JSDOM } = jsdom
const virtualConsole = new jsdom.VirtualConsole();

const options = {
  resources: "usable",
  runScripts: "dangerously",
  virtualConsole
}

virtualConsole.on("jsdomError", (error) => {
  // Ignore Canvas/WebGL errors for now

  // console.log("Detail", error.detail)
  // console.log("Message", error.detail.message)
  // console.log("Desc", error.detail.description)
  // console.log("Name", error.name)
  // console.log("Name", error.name)

  // if (error.detail.message !== "Error creating webgl context") {
  // console.log(error.message)
  // }
})

class Renderer {
  render(url) {
    return new Promise(resolve => {
      JSDOM.fromURL(url, options)
      .catch(e => {})
      .then(dom => {
        dom.window.addEventListener("load", () => resolve(dom.serialize()))
      })
    })
  }
}

module.exports = Renderer
