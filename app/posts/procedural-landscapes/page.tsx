import type { Metadata } from "next";
import CityLandscape from "../../components/city-landscape";

export const metadata: Metadata = {
  title: "Procedurally Generated Landscapes | choxi",
};

export default function Post() {
  return (
    <div className="post">
      <h1 className="spc-n-zero">Procedurally Generated Landscapes</h1>

      <p>
        I've recenty been investigating the generative art field and came across
        this{" "}
        <a href="https://github.com/LingDong-/shan-shui-inf">
          Procedurally Generated Chinese Landscape
        </a>
        .
      </p>

      <video src="/assets/chinese-landscape.mov#t=0.001" controls></video>

      <p>
        You can view{" "}
        <a href="https://lingdong-.github.io/shan-shui-inf/">
          the live project here
        </a>{" "}
        or the{" "}
        <a href="https://github.com/LingDong-/shan-shui-inf">
          source code here
        </a>
        . The landscape is completely generated from geometric primitives, and
        scrolls infinitely. I wanted to explore some of the techniques used, so
        I made my own version inspired by the landscape in Chicago right now:
      </p>

      <CityLandscape />

      <p>
        I built it with <a href="http://p5js.org">p5.js</a> to generate the
        graphics. The key techniques I used are the procedurally generated
        buildings and the infinite scrolling effect. Performance can be very
        slow if objects need to be re-rendered on each frame, so the scrolling
        effect is done by generating windows of the landscape offscreen and then
        stitching them together as the scroll moves horizontally. For more
        detail on the implementation, you can view the relatively short{" "}
        <a href="https://github.com/choxi/generative-experiments">
          source code here
        </a>
        .
      </p>

      <p>
        Most graphics tools emulate the physical experience of drawing and
        painting, but that misses some interesting opportunities to approach art
        differently. I like these infinitely scrolling landscapes as an example
        of a form of art that couldn’t be done by hand, and maybe wasn’t even
        imaginable, without computers.
      </p>
    </div>
  );
}
