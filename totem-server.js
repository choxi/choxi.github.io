const express = require("express")
const app = express()
const port = 1234
const Totem = require("./totem")
const totem = new Totem()
const chokidar = require('chokidar');

totem.build()

const watcher = chokidar.watch(".", {
  ignored: /dist|node_modules|.cache|.git/
})

watcher.on("ready", () => {
  watcher.on("all", (event, path) => {
    console.log(event, path)
    totem.build()
  })
})


app.use(express.static("./dist"))

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`)
})