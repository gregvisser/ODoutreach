"use client";

import { useActionState } from "react";

import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { inviteOrganisationStaffAction, type OrganisationInviteState } from "./actions";

const initialState: OrganisationInviteState = { error: null, message: null };

export function InviteOrganisationStaffForm() {
  const [state, action] = useActionState(inviteOrganisationStaffAction, initialState);
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="staff-email">Email</Label>
        <Input id="staff-email" name="email" type="email" required autoComplete="off" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="staff-role">Access</Label>
        <select
          id="staff-role"
          name="role"
          defaultValue="OPERATOR"
          className="h-11 rounded-lg border border-input bg-transparent px-3 text-sm md:h-8"
        >
          <option value="OPERATOR">Operator</option>
          <option value="MANAGER">Manager</option>
          <option value="VIEWER">Viewer</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <FormSubmitButton pendingLabel="Sending…">Send invitation</FormSubmitButton>
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className="text-sm text-muted-foreground" role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
