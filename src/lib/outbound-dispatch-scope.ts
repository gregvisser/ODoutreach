export type OutboundDispatchScope = { clientId: string; outboundEmailIds: string[] };
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 200 && id.trim() === id;

export function isOutboundDispatchScope(value: unknown): value is OutboundDispatchScope {
  if (!value || typeof value !== "object") return false;
  const scope = value as Partial<OutboundDispatchScope>;
  return validId(scope.clientId) && Array.isArray(scope.outboundEmailIds) &&
    scope.outboundEmailIds.length > 0 && scope.outboundEmailIds.length <= 50 &&
    scope.outboundEmailIds.every(validId) && new Set(scope.outboundEmailIds).size === scope.outboundEmailIds.length;
}
