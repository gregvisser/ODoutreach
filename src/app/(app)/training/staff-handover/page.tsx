import Link from "next/link";

import { PrintButton } from "@/components/training/print-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAFF_HANDOVER_SECTIONS } from "@/lib/training/staff-handover-guide";
import { requireStaffUser } from "@/server/auth/staff";

export const dynamic = "force-dynamic";

export default async function StaffHandoverGuidePage() {
  await requireStaffUser();

  return (
    <main className="mx-auto max-w-4xl space-y-8 print:max-w-none print:space-y-6">
      <header className="space-y-3 print:break-after-avoid">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Printable guide</Badge>
            <Badge variant="secondary">OpensDoors staff</Badge>
          </div>
          <PrintButton />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">
          ODoutreach Staff Training Guide
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Plain-English handover guide for OpensDoors staff using ODoutreach.
          Print or save as PDF before the morning walkthrough.
        </p>
        <p className="text-sm text-muted-foreground print:hidden">
          Back to{" "}
          <Link prefetch={false} href="/training" className="underline underline-offset-2">
            Training
          </Link>
        </p>
      </header>

      {STAFF_HANDOVER_SECTIONS.map((section, index) => (
        <Card
          key={section.title}
          id={`handover-section-${String(index)}`}
          className="scroll-mt-24 break-inside-avoid border-border/80 shadow-sm print:border print:shadow-none"
        >
          <CardHeader>
            <CardTitle className="text-xl">
              {String(index + 1)}. {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground/90">
              {section.bullets.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
