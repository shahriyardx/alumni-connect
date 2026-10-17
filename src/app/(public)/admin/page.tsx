import type { Metadata } from "next";
import { ClaimAdminForm } from "@/components/auth/claim-admin-form";

export const metadata: Metadata = { title: "Set up" };

export default function AdminPage() {
  return <ClaimAdminForm />;
}
