import React from "react"
import ReactDOM from "react-dom"

import Sidebar from "./sidebar"

document.addEventListener('DOMContentLoaded', (event) => {
  const elements = document.getElementsByTagName("sidebar")
  for(let i = 0; i < elements.length; i++) {
    const element = elements[i]
    const attributes = {}

    for(let a = 0; a < element.attributes.length; a++) {
      const attribute = element.attributes[a]
      attributes[attribute.name] = attribute.value
    }

    ReactDOM.render(<Sidebar { ...attributes }>{ element.innerHTML }</Sidebar>, element )
  }
})