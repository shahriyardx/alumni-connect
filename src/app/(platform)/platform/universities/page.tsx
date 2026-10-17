import type { Metadata } from "next";
import { UniversitiesView } from "./universities-view";

export const metadata: Metadata = { title: "Universities" };

export default function Page() {
  return <UniversitiesView />;
}
