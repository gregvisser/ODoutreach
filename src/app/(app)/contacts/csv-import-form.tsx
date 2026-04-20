"use client";

import { useFormStatus } from "react-dom";

import { importContactsCsvAction } from "@/app/(app)/contacts/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Importing…" : "Import CSV"}
    </Button>
  );
}

export function CsvImportForm({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  return (
    <Card className="border-dashed border-primary/30 bg-primary/5 shadow-sm">
      <CardHeader>
        <CardTitle>CSV import</CardTitle>
        <CardDescription>
          Imports are scoped to one client workspace. Accepted headings (fields
          may be empty):{" "}
          <span className="font-mono text-foreground">
            Name, Employer, Title, First Name, Last Name, Location, City,
            Country, LinkedIn, Job1 Title, A Emails, Mobile Phone Number,
            Office Number
          </span>
          . A contact is <em>valid</em> if it is not suppressed and has at
          least one of: email, LinkedIn, mobile phone, or office phone. It is{" "}
          <em>email-sendable</em> only when it also has an email address.
          Email is still required for intake persistence today; rows without a
          valid email are skipped. Legacy aliases (email, full_name, first_name,
          last_name, company, title, domain, source) remain supported.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={importContactsCsvAction} className="space-y-4">
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="clientId">Client workspace</Label>
            <select
              id="clientId"
              name="clientId"
              required
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="file">CSV file</Label>
            <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <SubmitButton disabled={clients.length === 0} />
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accessible workspaces — ask an admin to grant membership or use an ADMIN
              account.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
