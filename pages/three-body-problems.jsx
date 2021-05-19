<PostLayout>
  <Helmet>
    <title>Three Body Problems | choxi</title>
    <meta property="og:url" content="https://choxi.github.io/three-body-problems" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="Three Body Problems | choxi" />
    <meta property="og:description"
          content="The Three Body Problem is a great example of a system that follows very basic rules individually (there's only one rule, the law of gravitation), but explodes in complexity when we add more units. How many problems are there like the Three Body Problem?" />
    <meta property="og:image" content="https://choxi.github.io/assets/unfurls/three-body-problems.png" />
  </Helmet>

  <div className="post">
    <h1 className="spc-n-zero"> Three Body Problems </h1>


    <p>
      The <a href="https://en.wikipedia.org/wiki/Three-body_problem">Three Body Problem</a> is a famous problem in physics. For any two orbiting bodies, we can predict their exact position and trajectory at any time in the future using Newton's Law of Gravitation. But if we introduce a third body, there is no known formula to predict the trajectory of each body into the future. We can still figure it out, but not formulaically. The only way to do it is to run a simulation where we start with the initial mass and velocity of each body, calculate the forces on each, move them one step forward, and repeat.
    </p>

    <Orbits />

    <p>
      Newton published his law of gravitation and effectively solved the "Two Body Problem" in 1686, but the problem takes such a leap in difficulty with any more bodies that we haven't solved it for > 2 bodies in the ~350 years since then. The challenge is well described in the plot of <a href="https://en.wikipedia.org/wiki/The_Three-Body_Problem_(novel)">The Three-Body Problem</a>, where an advanced alien civilization goes through repeated near-extinction events because of their inability to predict their planet's chaotic orbit in a system with three stars.
    </p>

    <p>
      The Three Body Problem is a great example of a system that follows very basic rules individually (there's only one rule, the law of gravitation), but explodes in complexity when we add more units. How many problems are there like the Three Body Problem?
    </p>

    <p>
      Genetics is one example that comes to mind. We sequenced the full human genome in 2003 and have some understanding of the rules of individual gene expression, but we still have no predictive understanding of the genome as a whole. In economics, we can predict the behavior of prototypical consumers in one market, but we know very little about how different markets interact on the macro scale. We could fully catalogue the trillions of bacteria in our guts, but would we understand how the entire microbiome behaves? You can imagine the same problem in predicting the behavior of a biosphere, climate change, condensed matter, or any other scenario that follows simple rules at a unit level but results in complex behavior when taken as a whole.
    </p>

    <p>
      Understanding how many problems there are that fit into this category has important implications on scientific and technological progress. Patrick Collison has a similar concept he calls <a href="https://noahpinion.substack.com/p/interview-patrick-collison-co-founder">Wicked Problems</a> and describes them as one possible factor in recent scientific stagnation:
    </p>

    <blockquote>
      ...the major open problems in many domains involve emergent phenomena and complex/unstable systems that often have lots of complex couplings and nonlinear effects and so on. In biology, cancer, autoimmune conditions, anything involving the microbiome... these are all just intrinsically harder problems than individual infectious diseases. In computing, modern machine learning is much more about experimentally figuring out what works in an emergent sense than, say, operating system or network protocol design, which are more about top-down architecture. ...You could probably extend the argument to materials science or condensed matter physics... these aren't as neatly characterizable in closed forms as, say, basic mechanics or thermodynamics. It's hard to say whether the proportion of important problems that are "wicked" has increased but I think it's plausible that it has.
    </blockquote>

    <p>
      Stephen Wolfram calls them <a href="https://en.wikipedia.org/wiki/Computational_irreducibility">computationally irreducible problems </a> and believes they might imply the future is fundamentally unpredictable if we can't find "pockets of reducibility" that give us shortcuts to a full simulation. Imagine that one day we did discover a Universal Theory of Everything: it’s just one simple rule, and with it we can explain the emergence of every particle, field, or force from the very beginning of the Big Bang. How much would we actually be able to <i>predict</i> though? If we knew the state of every atom in the galaxy, we may still have to simulate it to predict how its stars and planets will evolve.
    </p>

    <p>
      Maybe understanding the basic rules of physics and mathematics isn't even the hard part, and advanced civilizations ultimately have to rely on simulations to make technological progress. In addition to <a href="https://en.wikipedia.org/wiki/Simulation_hypothesis#The_simulation_hypothesis_in_physics">all the weird computer-like aspects of the universe</a>, I count this as one more point in favor of the <a href="https://en.wikipedia.org/wiki/Simulation_hypothesis">Simulation Hypothesis</a>.
    </p>
  </div>
</PostLayout>