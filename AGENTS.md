# Repository Guidelines

Este guia orienta contribuicoes para a plataforma de gestao de recursos PRODAM construida sobre Bun, Next.js e Elysia.

## Project Structure & Module Organization
- `apps/web` - Frontend Next.js (App Router) com dashboards e fluxos de aprovacao.
- `apps/api` - API Bun/Elysia com rotas REST, camada de dominio e docs Swagger.
- `packages/` - Espaco opcional para libs compartilhadas caso surjam (schemas, SDKs).
- `areas.json`, `diretorias.json`, `jobs.json`, `managers.json`, `funcionarios.json` - Catalogos PRODAM carregados pela API (rotas `/v1/catalog/*`); mantenha-os em UTF-8.
- `infra/`, `docs/` - Reserve para IaC, diagramas e especificacoes formais.

## Build, Test, and Development Commands
Use os scripts Bun centralizados:
```bash
bun install           # Instala dependencias de todos os workspaces
bun run dev:web       # Inicia Next.js em http://localhost:3000
bun run dev:api       # Inicia Elysia em http://localhost:3001
bun run lint          # Executa lint (Next + Biome)
bun run test          # Executa suites de testes (Bun test)
bun run scrape:umanni # Atualiza funcionarios.json via scraper (requer cookie Umanni)
```
Atualize pacotes e scripts sempre via workspace para manter lockfiles coerentes. Copie `apps/api/.env.example` para `.env.local` antes de subir a API e defina `NEXT_PUBLIC_API_BASE_URL` quando o frontend apontar para ambientes remotos.

## Coding Style & Naming Conventions
TypeScript 5+, React 18, Elysia 1.x. Formate com `prettier` no web e `biome` nos pacotes/backend. Tipagem estrita; evite `any`. Nomeie arquivos e pastas em kebab-case, componentes em PascalCase, utilitarios em camelCase. Centralize constantes globais em modulos dedicados por app (ex.: `apps/api/src/config/weights.ts`) e evite duplicar chaves de env; documente novas variaveis em `.env.example`.

## Testing Guidelines
Padrao: `bun test` para unidades, `playwright` (ou similar) para fluxos E2E, `supertest` para rotas da API. Mantenha cobertura minima de 80% por workspace. Nomeie testes como `<feature>.spec.ts` (unit) e `<feature>.e2e.ts` (integracao). Falsifique chamadas ao Azure OpenAI com fixtures deterministicas e capture feedback dos gestores para testar logica de recomendacao.

## Commit & Pull Request Guidelines
Adote Conventional Commits (`feat(api): criar endpoint de recomendacoes`). PRs devem incluir descricao objetiva, cenarios de teste executados, screenshots ou curls relevantes e links para tarefas/OKRs. Squash commits redundantes antes do merge; mantenha branches focadas. Configure revisores obrigatorios quando o PR impactar AI, seguranca ou integracoes legadas.

## Security & Configuration Tips
Segredos residem apenas em `.env.local`; sempre publique `.env.example` atualizado. Registre acesso ao Azure, Data Factory e bases internas com permissao minima. Revise outputs do modelo para evitar vazamento de PII e adicione camadas de sanitizacao nos prompts. Audite dependencias com `bun audit` e planeje rotacao imediata de chaves comprometidas.
- Para o scraper Umanni, nao versione cookies; defina `UMANNI_SESSION_COOKIE` via variaveis de ambiente ou secret managers e mantenha a concorrencia ajustada para evitar bloqueios.
