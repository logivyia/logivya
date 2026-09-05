# Email Deliverability

Before production release, `logivya.com` must have evidence for:

- SPF authorizing the selected sender
- DKIM keys supplied by the provider
- DMARC policy and reporting mailbox
- verified `From` domain and return path
- provider webhook signatures for delivery, bounce and complaint events

Verification procedure:

1. Query public DNS from two independent resolvers.
2. Confirm the provider dashboard marks the domain verified.
3. Send invitation, support-reply and security test messages.
4. Confirm HTML and plain-text bodies are non-empty.
5. Confirm provider acceptance and webhook delivery state.
6. Exercise bounce and complaint suppression with provider test addresses.

Source code does not prove DNS authentication. Until these checks are recorded, email-domain verification is a release blocker.
