<PostLayout>
  <Helmet>
    <title> choxi | Idiom: A Simple Static Site Generator for React </title>
  </Helmet>

  <div className="post">
    <h1 className="spc-n-zero">Idiom: A Simple Static Site Generator in React</h1>
    <p>
      One of my favorite aspects of React is that it extends HTML and allows you to define your own elements to build up your own markup language. I wanted to do this for my personal site, so that I could write a post like this:
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
      Idiom is like a slimmed down version of Gatsby. It runs faster by using <a>esbuild</a> to compile your JS and <a>jsdom</a> for prerendering. It uses sensible defaults and favors convention over configuration, allowing you to write your pages as a pure JSX expression by autoloading your components.
    </p>

    <p>
      An Idiom site looks like this:
    </p>

    <Code>
      {`
        my-site/
          components/
            layout.jsx
            layout.scss
          pages/
            index.jsx
      `}
    </Code>

    <p>
      Idiom is still a work in progress, but if you'd like to try it out or send along any feedback check out the <Link href="https://github.com/choxi/idiomjs">GitHub repo</Link>.
    </p>
  </div>
</PostLayout>