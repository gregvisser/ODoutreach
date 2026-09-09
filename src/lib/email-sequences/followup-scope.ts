/** A supplied scope must never widen to every client or campaign. */
export function validateFollowUpScope(scope?: { clientId?: string; sequenceIds?: readonly string[] }): void {
  if (!scope) return;
  const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 200 && id.trim() === id;
  if (scope.clientId !== undefined && !validId(scope.clientId)) throw new Error("Invalid follow-up client scope");
  if (scope.sequenceIds !== undefined && (
    !validId(scope.clientId) || !Array.isArray(scope.sequenceIds) ||
    scope.sequenceIds.length === 0 || scope.sequenceIds.length > 50 ||
    !scope.sequenceIds.every(validId) || new Set(scope.sequenceIds).size !== scope.sequenceIds.length
  )) throw new Error("Invalid follow-up campaign scope");
}
