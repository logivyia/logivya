# Deployment

Logivya is a Next.js 16 application deployed to Vercel with PostgreSQL and Redis.

1. Configure production environment variables without committing secrets.
2. Run `npm install`, `npx prisma generate`, `npx prisma validate`, `npm run lint`, and `npm run build`.
3. Apply reviewed schema changes with the production database workflow.
4. Deploy with the connected Git/Vercel project.
5. Verify public, authenticated, admin, database, Redis, and queue health routes.
