# ExamForge

AI-powered exam preparation platform for Indian competitive examinations.

## Supported Exams

| Category | Exams |
|----------|-------|
| Pharmacy | BPharm Assistant Professor, GPAT, NIPER JEE |
| Medical | NEET UG, NEET PG, AIIMS, FMGE |
| Civil Services | UPSC Prelims/Mains, State PSCs |
| Engineering | GATE, ESE/IES |

## Tech Stack

**Frontend:** Next.js 15, TypeScript, Tailwind v4, shadcn/ui, Zustand, TanStack Query
**Backend:** Fastify 5, tRPC v11, BullMQ, Drizzle ORM
**Database:** PostgreSQL 17 (pgvector), Redis 7
**AI:** Claude, Gemini, Mistral, OpenAI, Perplexity via Vercel AI SDK + Instructor.js
**Infrastructure:** AWS (App Runner → ECS Fargate → EKS), CDK TypeScript

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9+, Docker

# 1. Clone and install
git clone https://github.com/your-org/examforge.git
cd examforge
pnpm install

# 2. Start local databases
docker compose up -d postgres redis

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Run migrations
pnpm db:migrate

# 5. Start development
pnpm dev
# Web: http://localhost:3000
# API: http://localhost:4000
```

## Project Structure

```
examforge/
├── apps/
│   ├── web/                 # Next.js 15 frontend
│   └── api/                 # Fastify 5 + tRPC backend
├── packages/
│   └── shared/              # Shared types, schemas, DB
├── infra/                   # AWS CDK stacks
├── docs/
│   ├── aws/                 # AWS configuration guides
│   └── prompts/             # AI development prompts
├── CLAUDE.md                # Claude Code project memory
├── AGENTS.md                # Universal agent memory (Cursor, Copilot)
├── .cursor/rules/           # Cursor IDE rules
├── .claude/rules/           # Claude Code rules
└── .github/                 # PR templates, CI/CD workflows
```

## AI-Assisted Development

This project is designed for parallel use of **Claude Code** (terminal) and **Cursor** (IDE).

| Tool | Config File | Purpose |
|------|-------------|---------|
| Claude Code | `CLAUDE.md` + `.claude/rules/` | Terminal-based coding, migrations, AWS deploys |
| Cursor | `.cursor/rules/*.mdc` | IDE editing, component building, debugging |
| Both | `AGENTS.md` | Shared project context |

See [`docs/prompts/DEVELOPMENT_PROMPTS.md`](docs/prompts/DEVELOPMENT_PROMPTS.md) for tested prompts.

## AWS Deployment

See [`docs/aws/AWS_CONFIGURATION.md`](docs/aws/AWS_CONFIGURATION.md) for the complete setup guide.

```bash
# Preview changes
pnpm infra:diff

# Deploy
pnpm infra:deploy
```

## Contributing

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes following conventions in `CLAUDE.md`
3. Run checks: `pnpm lint && pnpm test && pnpm build`
4. Open PR using the template in `.github/PULL_REQUEST_TEMPLATE/`

## License

Proprietary. All rights reserved.
