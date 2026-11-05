import GlassCard from "./components/glass-card";
import GoldenForest from "./components/golden-forest";
import SocialLinks, { MapPinIcon } from "./components/social-links";
import styles from "./home.module.css";

const POSTS = [
  { href: "/posts/three-body-problems", title: "Three Body Problems" },
  {
    href: "/posts/idiom-static-site-generator",
    title: "Idiom: A Simple Static Site Generator in React",
  },
  { href: "/posts/procedural-landscapes", title: "Procedurally Generated Landscapes" },
  {
    href: "/posts/gesture-detection-using-tensorflowjs",
    title: "Gesture Detection Using Tensorflow.js",
  },
];

export default function Home() {
  return (
    <main className={styles.home}>
      <GoldenForest />

      <GlassCard className={styles.glass}>
        <h1 className={styles.name}>Roshan Choxi</h1>
        <p className={styles.intro}>
          Software engineer in{" "}
          <span className={styles.place}>
            <MapPinIcon />
            Chicago
          </span>
          <br />
          Writing about science, technology, and design.
        </p>

        <SocialLinks className={styles.social} />

        <h2 className={styles.label}>Recent writing</h2>
        <ul className={styles.posts}>
          {POSTS.map((post) => (
            <li key={post.href}>
              <a href={post.href}>{post.title}</a>
            </li>
          ))}
        </ul>
      </GlassCard>
    </main>
  );
}
