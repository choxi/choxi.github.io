import React from "react"
import ReactDOM from "react-dom"

import Sidebar from "./sidebar"
import PostLayout from "./post-layout"

const components = {
  "sidebar": Sidebar,
  "post-layout": PostLayout
}

document.addEventListener('DOMContentLoaded', (event) => {
  Object.keys(components).forEach(name => {
    const klass = components[name]
    const elements = document.getElementsByTagName(name)

    for(let i = 0; i < elements.length; i++) {
      const element = elements[i]
      const attributes = {}

      for(let a = 0; a < element.attributes.length; a++) {
        const attribute = element.attributes[a]
        attributes[attribute.name] = attribute.value
      }

      attributes["children"] = element.innerHTML

      const component = React.createElement(klass, attributes)
      ReactDOM.render(component, element )
    }
  })
})