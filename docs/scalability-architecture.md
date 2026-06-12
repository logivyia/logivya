# Scalability Architecture

- Keep web functions stateless and horizontally scalable.
- Route asynchronous campaign, sync, notification, and email work through distributed queues.
- Partition high-volume audit and usage data by time when growth requires it.
- Preserve tenant and created-at compound indexes for operational queries.
- Use read replicas for admin analytics and long-running exports.
- Use Redis clustering and multiple isolated workers with idempotent jobs.
- Store files and encrypted sessions in versioned object storage.
- Prefer cursor pagination over large offsets for million-row operational tables.
- Aggregate metrics into daily fact tables instead of scanning raw events.
