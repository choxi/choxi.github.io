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
  // The panel follows the theme: its background, font and syntax colours all
  // come from globals.css (.code-block and the --code-* variables), so Prism
  // only supplies the token classes, not inline colours.
  const customStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: "0.8em",
    lineHeight: 1.6,
    background: "var(--code-bg)",
    borderRadius: "10px",
    padding: "1.1em 1.3em",
    margin: "1.8em auto",
  }
  const codeTagProps = { style: { fontFamily: "inherit" } }

  return (
    <SyntaxHighlighter language={ props.lang } style={ prism } useInlineStyles={ false } className="code-block" customStyle={ customStyle } codeTagProps={ codeTagProps }>
      { body }
    </SyntaxHighlighter>
  )
}