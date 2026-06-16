# Google Play Data Safety Form Guide

This guide prepares the Data Safety answers for Logivya. Final submission must be reviewed by the product/legal owner before publishing.

## Data Collected

### Account Information

- Examples: full name, username, role, account status.
- Purpose: authentication, account management, security, support.
- Shared with third parties: no, except service providers required for hosting, email, push notifications, monitoring, or legal compliance.
- Encrypted in transit: yes, HTTPS/TLS required.
- Deletion supported: yes, through account/data request process.

### Email Address

- Purpose: login, password reset, notifications, support, account communication.
- Shared with third parties: only with email delivery providers when needed.
- Encrypted in transit: yes.
- Deletion supported: yes.

### Phone Number

- Purpose: account profile, WhatsApp pairing support, business contact identity.
- Shared with third parties: only as required to perform requested connection or notification functions.
- Encrypted in transit: yes.
- Deletion supported: yes.

### Company Information

- Examples: company name, address, billing profile, tax metadata.
- Purpose: subscription management, billing, invoice readiness, support.
- Shared with third parties: only with payment, invoice, hosting, or compliance providers where required.
- Encrypted in transit: yes.
- Deletion supported: yes, subject to legal retention requirements.

### Messages Entered By User

- Purpose: creating and sending user-requested campaigns, scheduled messages, and message history.
- Shared with third parties: only with messaging infrastructure required to deliver the user-requested action.
- Encrypted in transit: yes.
- Deletion supported: yes, subject to audit/legal requirements.

### Support Messages

- Purpose: customer support, troubleshooting, product operations.
- Shared with third parties: no, except support/hosting providers if used.
- Encrypted in transit: yes.
- Deletion supported: yes.

### Subscription and Payment Metadata

- Examples: plan, status, payment status, subscription dates, invoice metadata.
- Purpose: subscription access, billing, support, compliance.
- Shared with third parties: payment and billing providers where applicable.
- Encrypted in transit: yes.
- Deletion supported: limited by financial/legal retention obligations.

### Device Identifiers

- Examples: device id, platform, app version, notification delivery metadata.
- Purpose: secure mobile sessions, push notifications, diagnostics, fraud prevention.
- Shared with third parties: push, analytics, crash reporting providers if enabled.
- Encrypted in transit: yes.
- Deletion supported: yes.

### Push Notification Tokens

- Purpose: send account, support, subscription, WhatsApp, and campaign notifications to registered devices.
- Shared with third parties: push notification provider.
- Encrypted in transit: yes.
- Deletion supported: yes; removed on logout/device unregister.

## Data Sharing Statement

Logivya should state that data is not sold. Data may be processed by infrastructure, email, push, analytics, crash reporting, payment, and compliance providers only to operate the service.

## Security Practices

- Data encrypted in transit using HTTPS/TLS.
- Tokens stored in secure device storage.
- Access controlled by authenticated user and tenant boundaries.
- Sensitive credentials and WhatsApp sessions are not exposed to mobile clients.

## Deletion Request

Users must be able to request data deletion through published support or privacy channels. Recommended contact:

- `support@logivya.com`
