import type { Metadata } from "next";
import { SignUpWizard } from "@/components/auth/sign-up-wizard";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return <SignUpWizard />;
}
