"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrganisationFeatureKey } from "@/lib/tenant/organisation";
import { ORGANISATION_FEATURE_LABELS } from "@/lib/tenant/platform";

import { enterOrganisationAction } from "@/app/(app)/organisation/actions";

import {
  createOrganisationAction,
  inviteOrganisationOwnerAction,
  setOrganisationStatusAction,
  updateOrganisationFlagsAction,
  updateOrganisationHostnameAction,
  updateOrganisationLimitsAction,
  type PlatformFormState,
} from "./actions";

const initialState: PlatformFormState = { error: null, message: null };

function FormNotice({ state }: { state: PlatformFormState }) {
  if (state.error) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {state.message}
      </p>
    );
  }
  return null;
}

export function CreateOrganisationForm() {
  const [state, action] = useActionState(createOrganisationAction, initialState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <Label htmlFor="org-name">Name</Label>
        <Input id="org-name" name="name" required minLength={2} maxLength={80} autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="org-slug">Slug</Label>
        <Input
          id="org-slug"
          name="slug"
          required
          minLength={2}
          maxLength={40}
          autoComplete="off"
          placeholder="northwind"
          spellCheck={false}
        />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <FormSubmitButton pendingLabel="Creating…">Create organisation</FormSubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function OrganisationStatusForm({
  organisationId,
  status,
}: {
  organisationId: string;
  status: "ACTIVE" | "SUSPENDED";
}) {
  const [state, action] = useActionState(setOrganisationStatusAction, initialState);
  const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="status" value={next} />
      <FormSubmitButton
        pendingLabel="Saving…"
        variant={next === "SUSPENDED" ? "destructive" : "default"}
      >
        {next === "SUSPENDED" ? "Suspend organisation" : "Reactivate organisation"}
      </FormSubmitButton>
      <FormNotice state={state} />
    </form>
  );
}

export function OrganisationFlagsForm({
  organisationId,
  flags,
}: {
  organisationId: string;
  flags: Record<OrganisationFeatureKey, boolean>;
}) {
  const [state, action] = useActionState(updateOrganisationFlagsAction, initialState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="organisationId" value={organisationId} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(ORGANISATION_FEATURE_LABELS) as OrganisationFeatureKey[]).map((key) => (
          <li key={key}>
            <label className="flex min-h-11 items-center gap-3 rounded-md border border-border/70 px-3 py-2 text-sm">
              <input
                type="checkbox"
                name={`flag_${key}`}
                value="on"
                defaultChecked={flags[key]}
                className="size-4 accent-primary"
              />
              {ORGANISATION_FEATURE_LABELS[key]}
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <FormSubmitButton pendingLabel="Saving…">Save switches</FormSubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function OrganisationLimitsForm({
  organisationId,
  rocketReachCreditAllowance,
  aiSpendCapMicroUsd,
}: {
  organisationId: string;
  rocketReachCreditAllowance: number | null;
  aiSpendCapMicroUsd: number | null;
}) {
  const [state, action] = useActionState(updateOrganisationLimitsAction, initialState);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-2">
        <Label htmlFor="rr-allowance">RocketReach credit allowance</Label>
        <Input
          id="rr-allowance"
          name="rocketReachCreditAllowance"
          inputMode="numeric"
          defaultValue={rocketReachCreditAllowance ?? ""}
          placeholder="No cap"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ai-cap">AI spend cap (micro-USD)</Label>
        <Input
          id="ai-cap"
          name="aiSpendCapMicroUsd"
          inputMode="numeric"
          defaultValue={aiSpendCapMicroUsd ?? ""}
          placeholder="No cap"
        />
      </div>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <FormSubmitButton pendingLabel="Saving…">Save limits</FormSubmitButton>
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function OrganisationHostnameForm({
  organisationId,
  hostname,
}: {
  organisationId: string;
  hostname: string | null;
}) {
  const [state, action] = useActionState(updateOrganisationHostnameAction, initialState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-2">
        <Label htmlFor="org-hostname">Hostname</Label>
        <Input
          id="org-hostname"
          name="hostname"
          defaultValue={hostname ?? ""}
          placeholder="northwind.bidlow.co.uk"
          autoComplete="off"
          spellCheck={false}
          maxLength={253}
        />
      </div>
      <FormSubmitButton pendingLabel="Saving…">Save hostname</FormSubmitButton>
      <div className="sm:col-span-2">
        <FormNotice state={state} />
      </div>
    </form>
  );
}

export function EnterOrganisationForm({
  organisationId,
  size = "default",
}: {
  organisationId: string;
  size?: "default" | "sm";
}) {
  return (
    <form action={enterOrganisationAction}>
      <input type="hidden" name="organisationId" value={organisationId} />
      <FormSubmitButton pendingLabel="Opening…" size={size}>
        Enter workspace
      </FormSubmitButton>
    </form>
  );
}

export function InviteOrganisationOwnerForm({ organisationId }: { organisationId: string }) {
  const [state, action] = useActionState(inviteOrganisationOwnerAction, initialState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="organisationId" value={organisationId} />
      <div className="grid gap-2">
        <Label htmlFor="owner-email">Owner email</Label>
        <Input id="owner-email" name="email" type="email" required autoComplete="off" />
      </div>
      <FormSubmitButton pendingLabel="Sending…">Send invitation</FormSubmitButton>
      <div className="sm:col-span-2">
        <FormNotice state={state} />
      </div>
    </form>
  );
}
