export type RocketReachConnectionStatus = {
  status: "connected" | "not_configured";
  label: "Connected" | "Not connected";
  tone: "ready" | "warning";
  description: string;
  actionLabel: string;
};

export function rocketReachStatusText(input: { configured: boolean }): RocketReachConnectionStatus {
  const { configured } = input;
  if (configured) {
    return {
      status: "connected",
      label: "Connected",
      tone: "ready",
      description:
        "RocketReach is connected. Run searches from each client’s Sources tab; saved people also appear in Universe for reuse.",
      actionLabel: "Import from RocketReach",
    };
  }
  return {
    status: "not_configured",
    label: "Not connected",
    tone: "warning",
    description:
      "RocketReach is not connected. Ask an administrator to add the API key, or import contacts by CSV.",
    actionLabel: "Open Sources",
  };
}

export function rocketReachConnectionStatus(configured: boolean): RocketReachConnectionStatus {
  return rocketReachStatusText({ configured });
}

export function rocketReachStatusBadgeTone(
  status: RocketReachConnectionStatus["status"],
): "default" | "secondary" | "outline" | "destructive" {
  return status === "connected" ? "default" : "outline";
}
