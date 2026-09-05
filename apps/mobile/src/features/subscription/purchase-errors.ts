export function isUserCancelledPurchase(error: unknown) {
  const record =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;

  const code = String(record?.code ?? "").toLowerCase();
  const message = String(
    record?.message ?? (error instanceof Error ? error.message : error ?? ""),
  ).toLowerCase();

  return (
    /user[-_\s]?cancel/u.test(code) ||
    /user (?:cancelled|canceled)(?: the)? purchase/u.test(message) ||
    /purchase (?:was )?(?:cancelled|canceled)/u.test(message)
  );
}
