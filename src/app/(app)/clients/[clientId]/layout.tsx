import { Suspense } from "react";

import { ClientWorkspaceSubnav } from "@/components/clients/client-workspace-subnav";

export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Suspense fallback={<div className="h-10 border-b border-border/80 pb-3" aria-hidden />}>
        <ClientWorkspaceSubnav clientId={clientId} />
      </Suspense>
      {children}
    </div>
  );
}
