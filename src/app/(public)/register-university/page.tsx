import type { Metadata } from "next";
import { RegisterUniversityForm } from "@/components/auth/register-university-form";

export const metadata: Metadata = { title: "Register your university" };

export default function RegisterUniversityPage() {
  return <RegisterUniversityForm />;
}
