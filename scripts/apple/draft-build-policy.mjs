// App Store version records are needed for review, not for compiling an IPA.
// This build-only mode preserves the user's existing review submission.
export function canPrepareDraftWhileInReview(versions, candidateVersion) {
  if (!/^\d+\.\d+\.\d+$/.test(candidateVersion)) return false;
  const parts = candidateVersion.split(".").map(Number);
  return versions.some(({ attributes }) => {
    if (attributes?.platform !== "IOS" || !["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(attributes.appStoreState)) return false;
    if (!/^\d+\.\d+\.\d+$/.test(attributes.versionString ?? "")) return false;
    const previous = attributes.versionString.split(".").map(Number);
    const changed = parts.findIndex((part, index) => part !== previous[index]);
    return changed >= 0 && parts[changed] > previous[changed];
  });
}
