# Template System

`NotificationTemplate` stores versioned, channel-specific and locale-specific templates. Status and activation are explicit.

Templates declare every required variable. Creation and approval validate:

- variable name syntax
- placeholders referenced by the source
- registry-required variables
- non-empty body and channel-specific title/subject constraints

Missing variables fail with a stable error and never produce an empty email. The administrator UI supports safe preview and a controlled test sent only to the authorized administrator account. Legal and security templates require professional content review before activation.
