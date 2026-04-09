# Neufin

AI-powered financial analysis platform — multi-agent swarm, portfolio DNA scoring, and advisor workflow tools.

## Repository Structure

| Directory | Description |
|-----------|-------------|
| `neufin-backend` | FastAPI backend — REST API, LangGraph swarm orchestration, Supabase integration |
| `neufin-web` | Next.js 14 web app — investor & advisor dashboards, swarm terminal, research hub |
| `neufin-mobile` | React Native / Expo mobile app — portfolio sync, swarm alerts, DNA scores |
| `neufin-agent` | *(deprecated)* Stale copy of the standalone agent; active agent lives at [stealthg0dd/neufin-agent](https://github.com/stealthg0dd/neufin-agent) |

## Lines of Code

Counts exclude `node_modules`, `.next`, `dist`, `__pycache__`, and lock files.

### By language

| Language | Lines |
|----------|------:|
| Python | 21,310 |
| TypeScript React (`.tsx`) | 28,133 |
| TypeScript (`.ts`) | 4,073 |
| JavaScript (`.js`) | 194 |
| CSS | 392 |
| HTML | 1,036 |
| **Total (source)** | **~55,138** |

### By project area

| Area | Lines |
|------|------:|
| `neufin-backend` | 16,789 |
| `neufin-web` | 27,650 |
| `neufin-mobile` | 4,750 |
| `neufin-agent` | 4,392 |
| **Total** | **~53,581** |

> The small difference between the two totals comes from config and tooling files (`.js`, `.ts`) that live outside the four main project directories.

## Docs

- [Changelog](CHANGELOG.md)
- [Audit report](AUDIT_REPORT.md)
- [Monitoring](MONITORING.md)
- [Web architecture & routes](neufin-web/docs/)
- [Deployment](neufin-web/DEPLOYMENT.md)
- [Security](neufin-web/SECURITY.md)
