# Billing and Subscriptions

Paid activation requires a complete billing profile. Manual activation loads standard prices from the Plan record, creates payment and invoice placeholders, records subscription events, notifies the owner, and writes audit logs. Enterprise custom pricing is the only flow that accepts a custom amount.

## Entitlement ownership

Subscription capabilities are calculated on the backend by the canonical subscription serializer. Mobile and web clients consume the resulting entitlement contract and never infer paid access from a plan name, cached role, local storage, or UI state.

The contact workflow uses `entitlements.contactMessaging` for every canonical plan:

- `true`: Trial, Starter, and Professional users may see the `Kişiler` card and contact APIs may return tenant-owned contacts.
- `false`: the card is omitted and the backend remains authoritative for contact access.
- Expiry, cancellation, company membership, and plan changes take effect after the next backend refresh.

The mobile subscription action uses the customer-facing `Hesapları yönet` wording and opens the existing membership workflow. Internal seat fields remain separate for authorization and migration compatibility. Payment-provider checkout remains backend/web-led; mobile does not duplicate billing logic.
