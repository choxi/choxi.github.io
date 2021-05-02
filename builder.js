const esbuild = require("esbuild")
const fs = require("fs")
const fse = require("fs-extra")
const pascalCase = require("pascalcase")
const sassPlugin = require('esbuild-plugin-sass')

class Totem {
  template(page) {
    return `
      <html>
        <head>
          <link rel="stylesheet" href="./index.css">
          <script src="./index.js"></script>
        </head>
        <body>
          <div id="${ page }"></div>
        </body>
      </html>
    `
  }

  build(callback=() => {}) {
    console.log("Creating dist directory...")
    fs.rmdirSync("./dist", { recursive: true, force: true })
    fs.mkdirSync("./dist")

    console.log("Buildings components...")
    const componentPaths = fs.readdirSync("./components")
                             .filter(p => p.split(".")[1] === "jsx")
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
        name: name,
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

          if (container && container.children.length === 0) {
            ReactDOM.render(<${ page.klass } />, container)
          }

          if (container && container.children.length > 0) {
            ReactDOM.hydrate(<${ page.klass } />, container)
          }
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

    esbuild.build({
      entryPoints: ["./dist/_index.jsx"],
      bundle: true,
      outfile: "./dist/index.js",
      plugins: [ sassPlugin() ]
    }).then(() => {
      fse.removeSync("./dist/_index.jsx")

      pageConfigs.forEach(page => {
        fs.writeFileSync(`./dist/${ page.name }.html`, this.template(page.klass))
      })

      fse.copySync("./assets", "./dist/assets")

      console.log("Site generated")

      const outputPages = pageConfigs.map(config => {
        return {
          name: config.name,
          path: `./dist/${ config.name }.html`
        }
      })

      callback(outputPages)
    })
  }
}

module.exports = Totem


// TODO
// - [X] Support SASS/assets
// - [ ] Add prerendering
// - [X] Allow multiple pages
// - [ ] Allow third-party modules (Helmet)
// - [X] Run a server (links don't work from filesystem)
//
// Open Questions
// - What should the directory structure be for images, other JS, and assets?

