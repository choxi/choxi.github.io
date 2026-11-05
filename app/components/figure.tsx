import type { ReactNode } from "react";

// A figure in a post: an image, video, chart or interactive demo, with an
// optional caption.
//
// size="text" keeps it to the reading column; size="wide" lets it spread to
// the full width of the content area, for charts and demos that need room.
// framed adds a hairline border, for screenshots whose own edges are pale.

type Props = {
  size?: "text" | "wide";
  framed?: boolean;
  caption?: ReactNode;
  children: ReactNode;
};

export default function Figure({ size = "text", framed = false, caption, children }: Props) {
  const className = ["figure", `figure--${size}`, framed && "figure--framed"].filter(Boolean).join(" ");

  return (
    <figure className={className}>
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
