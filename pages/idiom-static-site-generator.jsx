<PostLayout>
  <Helmet>
    <title> choxi | Idiom: A Simple Static Site Generator for React </title>
  </Helmet>

  <div className="post">
    <h1 className="spc-n-zero">Idiom: A Simple Static Site Generator in React</h1>
    <p>
      One of my favorite aspects of React is that it extends HTML and allows you to define your own elements. Using React (or Vue, Web Components, etc.) you can build your own markup language however you like and create rich, interactive web pages. I wanted to create my own markup for this personal site so that I could write posts like:
    </p>

    <Code lang="jsx">
      {`
        <Post>
          <Title>Idiom: A Simple Static Site Generator in React</Title>

          <Snippet lang="bash">
            $ idiomjs build
          </Snippet>

          <Subscribe newsletter="idiom" cta="Get updates on Idiom" />
        </Post>
      `}
    </Code>

    <p>
      A popular framework for this type of React-based static site is GatsbyJS. Gatsby is powerful but complex, it requires a lot of configuration, can be difficult to debug, and uses Webpack and GraphQL in its toolchain. This seems like overkill for a static site generator, I wanted something that:
    </p>

    <ul>
      <li>Has an extendable markup language</li>
      <li>Is search-engine friendly</li>
      <li>Has a simple toolchain with a minimal number of dependencies</li>
      <li>Can easily be deployed to any static site host (e.g. GitHub Pages or S3)</li>
    </ul>

    <p>
      In contrast, Idiom uses the very fast <a>esbuild</a> to compile your JS and <a>jsdom</a> for prerendering. It uses sensible defaults and favors convention over configuration, allowing you to write your pages as a pure JSX expression without any <code>import</code> boilerplate by autoloading your components assuming certain naming conventions.
    </p>

    <p>
      Idiom is still a work in progress, but if you'd like to try it out or send along any feedback check out the <Link href="https://github.com/choxi/idiomjs">GitHub repo</Link>.
    </p>
  </div>
</PostLayout>