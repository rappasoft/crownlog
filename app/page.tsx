import type { Metadata } from "next";
import WatchCollection from "./WatchCollection";

export const metadata: Metadata = {
  title: "Crownlog — Personal Watch Index",
  description: "A private place to collect, organize, and track the watches on your list.",
};

export default function Home() {
  return <WatchCollection />;
}
