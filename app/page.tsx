import NightMesh from "./components/night-mesh";
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
      <NightMesh />

      <div className={styles.glass}>
        <h1 className={styles.name}>Roshan Choxi</h1>
        <p className={styles.intro}>
          Software engineer in Chicago, writing about science, technology, and design.
        </p>

        <h2 className={styles.label}>Recent writing</h2>
        <ul className={styles.posts}>
          {POSTS.map((post) => (
            <li key={post.href}>
              <a href={post.href}>{post.title}</a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
