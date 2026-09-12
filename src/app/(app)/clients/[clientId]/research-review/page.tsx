import Link from "next/link";
import { requireOpensDoorsStaff } from "@/server/auth/staff";
import { loadResearchCandidateReview } from "@/server/prospect-research/review";
export const dynamic = "force-dynamic";
const labels: Record<string, string> = { MATCH: "Matches the saved criteria", NO_MATCH: "Does not match the saved criteria", REVIEW: "Needs review", BLOCKED: "Blocked" };
export default async function ResearchReviewPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ page?: string }> }) {
  const staff = await requireOpensDoorsStaff();
  const { clientId } = await params;
  const rawPage = Number((await searchParams).page ?? 0);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 0 && rawPage <= 10000 ? rawPage : 0;
  const data = await loadResearchCandidateReview(staff, clientId, page);
  const base = `/clients/${clientId}/research-review`;
  return <section aria-label="Research candidate review" className="space-y-5">
    <h1 className="text-2xl font-semibold">Research candidates</h1>
    <p>Review the evidence before adding anyone to a contact list. Original decisions are historical; the current check below rechecks targeting and do-not-contact protection when you open this page.</p>
    <p>This page does not import contacts or send emails. Acceptance and automatic research are not yet available.</p>
    <a href={`${base}?page=${page}`} className="underline">Refresh current checks</a>
    {!data.candidates.length && <p>No research candidates on this page.</p>}
    {data.candidates.map(candidate => <article key={candidate.id} className="space-y-2 rounded border p-4" aria-label={candidate.email ?? "Candidate without email"}>
      <h2 className="font-semibold">{candidate.email ?? "Email unavailable"}</h2>
      <p>{candidate.company ?? "Company unavailable"} · Plan: {candidate.planName}</p>
      <p>Original decision: {labels[candidate.original.status]} · {candidate.evaluatedAt}</p>
      <ul>{candidate.original.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
      <p className="font-semibold">Current check: {labels[candidate.current.status]}</p>
      <ul>{candidate.current.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
      <p>Job title: {candidate.evidence.titles ?? "Missing"} · Industry: {candidate.evidence.industries ?? "Missing"}</p>
      <p>Seniority: {candidate.evidence.seniorities ?? "Missing"} · Region: {candidate.evidence.regions ?? "Missing"}</p>
    </article>)}
    <nav aria-label="Research candidate pages" className="flex gap-4">
      {page > 0 && <Link href={`${base}?page=${page - 1}`} prefetch={false}>Previous candidates</Link>}
      {data.hasNext && <Link href={`${base}?page=${page + 1}`} prefetch={false}>Next candidates</Link>}
    </nav>
  </section>;
}
