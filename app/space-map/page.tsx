import type { Metadata } from "next";
import Orbits from "../components/orbits";
import SpaceMap from "./index";

export const metadata: Metadata = {
  title: "Three Body Problems | choxi",
};

export default function Post() {
  return (
    <>
      <SpaceMap />
    </>
  );
}
