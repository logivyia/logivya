# Synthetic Monitoring

## Safe production checks

- Multi-region `GET /api/health/live`: HTTP 200, exact minimal JSON and latency.
- `GET /api/health/ready`: HTTP 200/503 and exact minimal JSON; alert on sustained 503.
- Public home/login pages: TLS, DNS, redirect, response time and content marker.
- Authentication route: validate method/contract without real credentials; a designated synthetic account may be used only from a secrets manager and must not be an administrator.
- Admin guard: a normal designated account must receive 403 from detailed health.
- Detailed health: secure synthetic token, read-only request and no response leakage.
- Backup: latest workflow conclusion and verification age.

## Isolated non-production flows

- Create a namespaced support ticket, verify admin visibility, reply, verify user visibility, then close it.
- Queue a safe no-op job and prove worker completion.
- Exercise subscription resolution with fixture companies.

Never send a synthetic WhatsApp message to customer groups. Any WhatsApp synthetic target must be a dedicated test account and test recipient. Synthetic records must be tagged and deleted by the test environment's retention job.
