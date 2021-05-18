<PostLayout>
  <Helmet>
    <title>Three Body Problems | choxi</title>
  </Helmet>
  <div className="post">
    <h1 className="spc-n-zero"> Three Body Problems </h1>

    <Orbits />

    <p>
      The <a href="https://en.wikipedia.org/wiki/Three-body_problem">Three Body Problem</a> is a famous problem in physics. For any two orbiting bodies, we can calculate their exact position and trajectory at any point in the future analytically (i.e. with a formula). But if we introduce a third body into the scenario, there is no known equation (i.e. a closed form or analytic solution) to predict the trajectory of each body into the future. The only way to do it is to run a simulation where we have an initial condition, calculate the forces on each, move them forward one step, and calculate again.
    </p>

    {/* <!-- explanation of analytical vs numerical solutions-- > */}

    <p>
      It’s fascinating that the problem takes such a leap in difficulty by adding one more body. We can dervice a formula for two bodies just with a few simple Newton’s Laws. But when we need to apply them to a model with N > 2 bodies, we can’t figure it out without simulating it.
    </p>

    <p>
      How many problems are there like the three body problem?
    </p>

    <p>
      Genetics may be in the same category. We sequenced the full genome in 2003 but have found that it’s still much more complicated to predict how individual gene changes will affect an organism. Even if we knew exactly what a gene does in isolation and how it responds to different biochemistry, can we predict what will happen with two or three genes if they affect each other? We might know how individual bacteria behave, but how do we model the microbiome? You can imagine the same problem in predicting the behavior of a biosphere, an economy, condensed matter, or any other situation where we have agents that follow simple rules individually but result in complex behavior when taken as a whole.
    </p>

    <p>
      Understanding how many problems there are that fit into this category has important implications on scientific and technological progress. Patrick Collison calls these <a href="https://noahpinion.substack.com/p/interview-patrick-collison-co-founder">Wicked Problems</a> and describes them as one possible factor in recent scientific stagnation:
    </p>

    <blockquote>
      ...the major open problems in many domains involve emergent phenomena and complex/unstable systems that often have lots of complex couplings and nonlinear effects and so on. In biology, cancer, autoimmune conditions, anything involving the microbiome... these are all just intrinsically harder problems than individual infectious diseases. In computing, modern machine learning is much more about experimentally figuring out what works in an emergent sense than, say, operating system or network protocol design, which are more about top-down architecture. ...You could probably extend the argument to materials science or condensed matter physics... these aren't as neatly characterizable in closed forms as, say, basic mechanics or thermodynamics. It's hard to say whether the proportion of important problems that are "wicked" has increased but I think it's plausible that it has.
    </blockquote>

    <p>
      Stephen Wolfram calls them <a href="https://en.wikipedia.org/wiki/Computational_irreducibility">computationally irreducible</a> problems and believes they might imply the future is fundamentally unpredictable. Imagine that one day we did discover a Universal Theory of Everything. It’s just one simple rule or equation, and with it we can explain the emergence of every particle, field, or force from the very beginning of the Big Bang. How much would we actually be able to <i>predict</i> though? If we knew the state of every atom in the galaxy, we may still have to simulate it to predict how its stars and planets evolve. Instead of deriving theories with mathematical formula, maybe scientists in the future will be huddled around a simulation of the solar system tinkering with the configs to see how mankind emerged.
    </p>
  </div>
</PostLayout>