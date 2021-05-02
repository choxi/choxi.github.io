const fs = require("fs")
const express = require("express")
const chokidar = require("chokidar")

const Builder = require("./builder")
const Renderer = require("./renderer")

const builder = new Builder()
const renderer = new Renderer()
const app = express()

const command = process.argv[2]

if (command === "build") {
  const port = 1111
  app.use(express.static("./dist"))

  const server = app.listen(port, () => {
    builder.build(pages => {
      const promises = pages.map(page => {
        const url = `http://localhost:${ port }/${ page.name }.html`
        return renderer.render(url).then(body => fs.writeFileSync(page.path, body))
      })

      Promise.all(promises).then(() => server.close())
    })
  })
}

if (command === "serve") {
  const port = 1234
  const watcher = chokidar.watch(".", {
    ignored: /dist|node_modules|.cache|.git/
  })

  watcher.on("ready", () => {
    watcher.on("all", (event, path) => {
      console.log(event, path)
      builder.build()
    })
  })

  builder.build()
  app.use(express.static("./dist"))

  app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`)
  })
}
