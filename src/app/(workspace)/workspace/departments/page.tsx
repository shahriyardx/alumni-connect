import type { Metadata } from "next";
import { DepartmentsPanel } from "@/components/workspace/departments-panel";

export const metadata: Metadata = { title: "Departments" };

export default function Page() {
  return <DepartmentsPanel />;
}
