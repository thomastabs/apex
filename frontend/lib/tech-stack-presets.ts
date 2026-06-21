// Curated starting points for the Phase 2 tech stack. Picking one seeds the
// editable Technology Choices draft directly — no AI call. The body is plain
// markdown matching the tech-stack.md shape; the user edits it before locking.

export type TechStackPreset = { label: string; body: string };

export const TECH_STACK_PRESETS: TechStackPreset[] = [
  {
    label: "Next.js + FastAPI + Postgres",
    body: [
      "**Frontend:** Next.js (App Router) + TypeScript + React Query + Tailwind CSS",
      "**Backend:** Python 3.12 + FastAPI + Pydantic v2",
      "**Database:** PostgreSQL (SQLAlchemy + Alembic migrations)",
      "**Auth:** JWT bearer tokens",
      "**Deployment:** Docker + a container host (e.g. Azure Container Apps)",
    ].join("\n"),
  },
  {
    label: "Django + React + Postgres",
    body: [
      "**Frontend:** React + TypeScript + Vite + TanStack Query",
      "**Backend:** Python + Django + Django REST Framework",
      "**Database:** PostgreSQL (Django ORM migrations)",
      "**Auth:** Django sessions / DRF token auth",
      "**Deployment:** Docker + Gunicorn behind nginx",
    ].join("\n"),
  },
  {
    label: "Express + React + MongoDB",
    body: [
      "**Frontend:** React + TypeScript + Vite",
      "**Backend:** Node.js + Express + TypeScript",
      "**Database:** MongoDB (Mongoose ODM)",
      "**Auth:** JWT bearer tokens",
      "**Deployment:** Docker + a Node host",
    ].join("\n"),
  },
  {
    label: "T3 (Next.js + tRPC + Prisma)",
    body: [
      "**Frontend + Backend:** Next.js (App Router) + TypeScript (full-stack)",
      "**API:** tRPC (end-to-end typesafe)",
      "**Database:** PostgreSQL via Prisma ORM",
      "**Auth:** NextAuth.js",
      "**Deployment:** Vercel or Docker",
    ].join("\n"),
  },
  {
    label: "Spring Boot + React",
    body: [
      "**Frontend:** React + TypeScript + Vite",
      "**Backend:** Java + Spring Boot (Spring Web + Spring Data JPA)",
      "**Database:** PostgreSQL (JPA/Hibernate + Flyway migrations)",
      "**Auth:** Spring Security + JWT",
      "**Deployment:** Docker + JVM container",
    ].join("\n"),
  },
  {
    label: "FastAPI + HTMX (server-rendered)",
    body: [
      "**Frontend:** Server-rendered Jinja2 templates + HTMX (minimal JS)",
      "**Backend:** Python 3.12 + FastAPI",
      "**Database:** PostgreSQL (SQLAlchemy + Alembic) or SQLite for small apps",
      "**Auth:** Session cookies",
      "**Deployment:** Docker + Uvicorn",
    ].join("\n"),
  },
];
