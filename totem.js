const esbuild = require("esbuild")
const fs = require("fs")
const pascalCase = require("pascalcase")
const HTML_TEMPLATE = `
<html>
  <head>
    <link rel="stylesheet" href="../assets/application.scss">
    <script src="./index.js"></script>
  </head>
  <body>
    <div id="site"></div>
  </body>
</html>
`

console.log("Creating dist directory...")
fs.rmdirSync("./dist", { recursive: true, force: true })
fs.mkdirSync("./dist")

console.log("Buildings components...")
const componentPaths = fs.readdirSync("./components").filter(path => path != "index.js")
const componentConfigs = componentPaths.map(path => {
  const tag = path.split(".")[0]
  const klass = pascalCase(tag)

  return {
    tag: tag,
    klass: klass,
    path: path
  }
})

const importStatements = componentConfigs.map(config => {
  return `import ${ config.klass } from "../components/${ config.path }"`
})

const inFile = fs.readFileSync("./posts/demo.html")

const componentsEntrypoint = `
  import React from "react"
  import ReactDOM from "react-dom"

  ${ importStatements.join("\n") }

  class Site extends React.Component {
    render() {
      return (
        ${ inFile }
      )
    }
  }

  document.addEventListener('DOMContentLoaded', (event) => {
    ReactDOM.render(<Site />, document.getElementById("site"))
  })
`

fs.writeFileSync("./dist/_index.jsx", componentsEntrypoint)

esbuild.buildSync({
  entryPoints: ["./dist/_index.jsx"],
  bundle: true,
  outfile: "./dist/index.js"
})

fs.writeFileSync("./dist/index.html", HTML_TEMPLATE)

console.log("Site generated")

// TODO
// - [ ] Support SASS
// - [ ] Output all pages

