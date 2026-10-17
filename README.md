# Alumni Connect

Multi-university Q&A platform: students ask questions, and verified alumni answer.

## Features

- Separate workspace for each university: approvals, rosters, departments, moderation
- Verified sign-up with ID card and roster check; students become alumni automatically after graduation
- Feed with questions, accepted answers, votes, tags, announcements and "Most relevant" ranking
- Search with filters
- File attachments: images, documents, code
- Live updates and notifications
- Platform console for managing universities, users and admins

## Stack

Next.js 16 · tRPC · Drizzle · PostgreSQL (row-level security) · better-auth · MinIO · Tailwind · Bun

## Setup

```bash
bun install
cp .env.example .env
bun run db:up
bun run db:migrate
bun run dev
```

Open `http://localhost:3000/admin` to create the first admin. If SMTP is not configured, email codes are printed in the server log.

## Scripts

| Command | |
| --- | --- |
| `bun run dev` | Dev server |
| `bun run build` | Production build |
| `bun run db:migrate` | Apply migrations |
| `bun run db:seed` | Reset database with sample data |
| `bun run db:demo` | Add sample posts without resetting |
| `bun test` | Tests |
| `bun run lint` | Lint |

## Production

- Set `SETUP_TOKEN`, so `/admin` can't be claimed by anyone else.
- Use strong values for `BETTER_AUTH_SECRET` and `STUDENT_ID_PEPPER`.
- Run behind a reverse proxy; the rate limits rely on its `X-Forwarded-For` header.
