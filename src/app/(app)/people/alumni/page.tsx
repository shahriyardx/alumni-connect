import type { Metadata } from "next";
import { Suspense } from "react";
import { AlumniView } from "./alumni-view";

export const metadata: Metadata = { title: "Alumni" };

export default function AlumniPage() {
  return (
    <div className="flex flex-col gap-5 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Alumni in your department
      </h1>
      <Suspense>
        <AlumniView />
      </Suspense>
    </div>
  );
}
