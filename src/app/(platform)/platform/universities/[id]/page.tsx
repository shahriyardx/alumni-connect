import type { Metadata } from "next";
import { UniversityDetailView } from "./university-detail-view";

export const metadata: Metadata = { title: "University" };

// The view reads the id with useParams() (inside the layout's Suspense).
export default function Page() {
  return <UniversityDetailView />;
}
