const esbuild = require("esbuild")
const fs = require("fs")
const pascalCase = require("pascalcase")

function template(page) {
  return `
<html>
  <head>
    <link rel="stylesheet" href="../assets/application.scss">
    <script src="./index.js"></script>
  </head>
  <body>
    <div id="${ page }"></div>
  </body>
</html>
`
}

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

const pagePaths = fs.readdirSync("./pages")
const pageConfigs = pagePaths.map(path => {
  const name = path.split(".")[0]
  const klass = pascalCase(name)
  const body = fs.readFileSync(`./pages/${ path }`)

  return {
    path: path,
    klass: klass,
    body: body
  }
})

const pageComponents = pageConfigs.map(page => {
  return `
    class ${ page.klass } extends React.Component {
      render() {
        return (
          ${ page.body }
        )
      }
    }

    document.addEventListener('DOMContentLoaded', (event) => {
      const container = document.getElementById("${ page.klass }")
      if (container) ReactDOM.render(<${ page.klass } />, container)
    })
  `
})


const componentsEntrypoint = `
  import React from "react"
  import ReactDOM from "react-dom"

  ${ importStatements.join("\n") }

  ${ pageComponents.join("\n") }
`

fs.writeFileSync("./dist/_index.jsx", componentsEntrypoint)

esbuild.buildSync({
  entryPoints: ["./dist/_index.jsx"],
  bundle: true,
  outfile: "./dist/index.js"
})

pageConfigs.forEach(page => {
  fs.writeFileSync(`./dist/${ page.path }`, template(page.klass))
})

console.log("Site generated")

// TODO
// - [ ] Support SASS
// - [X] Allow multiple pages
// - [ ] Allow third-party modules (Helmet)

