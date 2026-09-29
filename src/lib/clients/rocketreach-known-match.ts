/**
 * Decide whether a RocketReach search row is already known before a paid lookup.
 * Matching uses the profile id, LinkedIn URL, or email when the search result exposes them.
 */

export type RocketReachSearchIdentity = {
  id: number;
  name: string | null;
  title: string | null;
  employer: string | null;
  location: string | null;
  linkedinUrl: string | null;
  linkedinNormalized: string | null;
  emails: string[];
};

export type UniverseReuseFields = {
  universeId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  linkedinUrl: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
};

export type KnownProfileMatch =
  | { kind: "client"; contactId: string }
  | { kind: "universe"; fields: UniverseReuseFields }
  | { kind: "known-incomplete" };

export type KnownProfileIndexes = {
  clientContactIdByProfileId: Map<string, string>;
  clientContactIdByEmail: Map<string, string>;
  clientContactIdByLinkedIn: Map<string, string>;
  universeByProfileId: Map<string, UniverseReuseFields>;
  universeByEmail: Map<string, UniverseReuseFields>;
  universeByLinkedIn: Map<string, UniverseReuseFields>;
};

function clientHit(indexes: KnownProfileIndexes, profile: RocketReachSearchIdentity): string | null {
  const byId = indexes.clientContactIdByProfileId.get(String(profile.id));
  if (byId) return byId;
  for (const email of profile.emails) {
    const byEmail = indexes.clientContactIdByEmail.get(email);
    if (byEmail) return byEmail;
  }
  if (profile.linkedinNormalized) {
    const byLinkedIn = indexes.clientContactIdByLinkedIn.get(profile.linkedinNormalized);
    if (byLinkedIn) return byLinkedIn;
  }
  return null;
}

function universeHit(
  indexes: KnownProfileIndexes,
  profile: RocketReachSearchIdentity,
): UniverseReuseFields | null {
  return (
    indexes.universeByProfileId.get(String(profile.id)) ??
    profile.emails.map((email) => indexes.universeByEmail.get(email)).find(Boolean) ??
    (profile.linkedinNormalized
      ? indexes.universeByLinkedIn.get(profile.linkedinNormalized) ?? null
      : null)
  );
}

export function matchKnownSearchProfile(
  profile: RocketReachSearchIdentity,
  indexes: KnownProfileIndexes,
): KnownProfileMatch | null {
  const contactId = clientHit(indexes, profile);
  if (contactId) return { kind: "client", contactId };
  const universe = universeHit(indexes, profile);
  if (!universe && profile.emails.length === 0) return null;
  if (!universe) return null;
  const email = universe.email || profile.emails[0] || "";
  if (!email) return { kind: "known-incomplete" };
  return { kind: "universe", fields: { ...universe, email } };
}

export function emptyKnownProfileIndexes(): KnownProfileIndexes {
  return {
    clientContactIdByProfileId: new Map(),
    clientContactIdByEmail: new Map(),
    clientContactIdByLinkedIn: new Map(),
    universeByProfileId: new Map(),
    universeByEmail: new Map(),
    universeByLinkedIn: new Map(),
  };
}
