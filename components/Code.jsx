import React from "react"
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import prism from 'react-syntax-highlighter/dist/esm/styles/prism/prism'

SyntaxHighlighter.registerLanguage('jsx', jsx)

function padLevel(body) {
  const lines = body.split("\n").filter(l => l.trim().length > 0)
  const levels = lines.map(l => {
    const match = l.match(/^\s+/)

    if (match) {
      return match[0].length
    }

    return 0
  })

  const padLevel = Math.min(...levels)
  const regex = new RegExp(`^ {${ padLevel }}`, "gm")

  return body.replace(regex, "").trim()
}

export default function Code(props) {
  const body = padLevel(String(props.children))

  return (
    <SyntaxHighlighter language={ props.lang } style={ prism }>
      { body }
    </SyntaxHighlighter>
  )
}