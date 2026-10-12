import type { Metadata } from "next";
import { SubmissionForm } from "@/components/submit/submission-form";

export const metadata: Metadata = { title: "参与投稿" };
export const dynamic = "force-dynamic";
export default function SubmitPage() {
  // Read the public widget key at request time; secrets stay on the server.
  const siteKeyName = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
  return <SubmissionForm siteKey={process.env[siteKeyName] ?? ""} />;
}
