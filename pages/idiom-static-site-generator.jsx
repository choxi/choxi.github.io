<PostLayout>
  <h1>Idiom: A Simple Static Site Generator in React</h1>
  <p>
    One of my favorite design choices of React is that it extends HTML and allows you to define your own elements. Using React (or Vue, Web Components, etc.) you can build your own markup language however you like and create rich, interactive web pages. I wanted to create my own type of markup language for this personal site so that I could write posts like:
  </p>

  <Code lang="jsx">
    {`
      <Post>
        <Title>Idiom: A Simple Static Site Generator in React</Title>

        <Snippet lang="bash">
          $ idiomjs build
        </Snippet>

        <Subscribe />
      </Post>
    `}
  </Code>

  <p>
    A popular framework for this type of React-based static site is GatsbyJS. Gatsby is powerful but complicated, it depends on GraphQL by default and. This seems like overkill for a static site generator, I wanted something that:
  </p>

  <ul>
    <li>Has an extendable markup language</li>
    <li>Is search-engine friendly</li>
    <li>Has a minimal number of dependencies</li>
    <li>Can easily be deployed to any static site host (e.g. GitHub Pages or S3)</li>
  </ul>
</PostLayout>