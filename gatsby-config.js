module.exports = {
  siteMetadata: {
    title: `Choxi`,
    author: `Roshan Choxi`,
  },
  plugins: [
    `gatsby-plugin-react-helmet`,
    `gatsby-plugin-image`,
    `gatsby-plugin-sass`,
    {
      resolve: `gatsby-source-filesystem`,
      options: {
        name: `images`,
        path: `${__dirname}/src/images`,
      },
    },
    {
      resolve: `gatsby-plugin-google-gtag`,
      options: { trackingIds: [ "GA-TRACKING_ID", "UA-86991778-1" ] },
    },
    `gatsby-transformer-sharp`,
    `gatsby-plugin-sharp`
  ],
}
