/** A list created for this import is removed when nobody was added to it. */
export function shouldDiscardNewImportList(createdForThisImport: boolean, memberCount: number): boolean {
  return createdForThisImport && memberCount === 0;
}
