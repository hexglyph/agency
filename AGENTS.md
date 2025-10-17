# Guia para Agentes

Este documento resume a aplicacao atual da plataforma de gestao de recursos PRODAM para acelerar o onboarding de agentes automatizados ou humanos.

## Visao Geral
- Monorepo em Bun que integra Next.js (frontend), Elysia (API) e bibliotecas internas para recomendacao de talentos e projetos.
- Dados primarios vêm de CSVs e JSONs da PRODAM, enriquecidos com heuristicas locais e, quando habilitado, com Azure OpenAI.
- O frontend consome a API em tempo real e apresenta dashboards de alocacao, catalogos institucionais e insights de carreira.

## Estrutura do Monorepo
- `apps/web` – Next.js App Router. Renderiza o dashboard principal, chama a API via `fetch` e aplica fallback local quando a API nao responde.
- `apps/api` – API Elysia/Bun. Expone rotas REST, gere insights, faz merge de catalogos PRODAM e armazena respostas do Azure.
- `packages/mock-data` – Biblioteca que carrega CSVs (`ExportacaoDemanda.csv`, `mock/mock_*`) e monta recursos, projetos e recomendacoes (com heuristica `buildRecommendations`).
- `packages/umanni-scraper` – Scraper CLI para enriquecer `funcionarios.json` com dados do Umanni. Requer cookie de sessao.
- `areas.json`, `diretorias.json`, `jobs.json`, `managers.json`, `funcionarios.json` – Catalogos PRODAM consumidos pela API (`/v1/catalog/overview`). UTF-8.
- `insights_store.json` – Cache local das ultimas recomendacoes de insights geradas pela API (com heuristica ou Azure).

## Fluxo de Dados e IA
- Mock dataset: `packages/mock-data` gera recursos e projetos a partir dos CSVs. A API usa o dataset pre-carregado, com fallback hardcoded (`createFallbackDataset`) se leitura falhar.
- Catalogo PRODAM: `apps/api/src/data/prodam.ts` agrupa os JSONs e normaliza nomes, niveis e gestores.
- Insights: `generateInsights` combina recursos catalogados com matchings do mock dataset. Se Azure estiver configurado, chama `/chat/completions`; senao, retorna heuristicas locais. Resultados sao salvos em `insights_store.json` para respostas subsequentes.
- Scraper Umanni (`bun run scrape:umanni`): atualiza `funcionarios.json` com formacoes, experiencias e linguas coletadas via HTML scraping autenticado.

## API (apps/api)
- Servidor Elysia com middlewares de CORS e Swagger (docs geradas em `/swagger`).
- Rotas principais:
  - `GET /health` – status, dataset carregado e configuracao do Azure.
  - `GET /v1/resources` / `GET /v1/projects` / `GET /v1/recommendations` – dados mockados ou fallback.
  - `POST /v1/ai/ping` – chama Azure OpenAI com prompt rapido para diagnostico.
  - `GET /v1/catalog/overview` – retorna catalogo PRODAM (areas, diretorias, cargos, gestores, funcionarios).
  - `GET /v1/insights` – gera ou carrega insights para todos os colaboradores.
  - `POST /v1/insights` – reprocessa insights filtrando por `resourceIds` no corpo.
  - `GET /debug` – verifica conectividade com Azure OpenAI.
- Configuracao: `apps/api/src/config/env.ts` usa Zod para validar envs e sinaliza se o Azure esta operacional (`runtimeEnv.azure.configured`).

## Frontend (apps/web)
- `app/page.tsx` carrega dados server-side (`loadDashboard`) via `fetch` contra a API. Quando algum endpoint falha, aplica fallback local com `packages/mock-data` e sinaliza estado em `meta`.
- `app/components/dashboard.tsx` (client component) concentra a UI: filtros de recomendacao, lista de insights, busca de colaboradores/projetos e painel de diagnostico do Azure (`/debug`).
- Estilos centralizados em `app/globals.css`. Nao ha design system externo; componentes sao autorais.

## Bibliotecas Compartilhadas
- `@agency/mock-data` exporta tipos, parser CSV, utilidades (slugify, normalizacao) e heuristicas de compatibilidade. Possui entrada `browser.ts` para uso no Next.js (sem `fs`).
- `@agency/umanni-scraper` e executado via Bun; carrega envs de `.env.local` ou `.env` (variavel `UMANNI_ENV_FILES`).

## Dados e Armazenamento
- CSVs e JSONs residem na raiz. Mantenha-os versionados em UTF-8 (exceto `ExportacaoDemanda.csv`, Latin-1).
- `insights_store.json` e gerenciado pela API. Nao edite manualmente; limpe-o se precisar forcar reprocessamento.
- Novos campos nos JSONs devem ser suportados em `data/prodam.ts` e refletidos no frontend.

## Scripts Bun
- `bun install` – instala todas as dependencias do monorepo.
- `bun run dev:web` – Next.js em `http://localhost:3000` (requer `NEXT_PUBLIC_API_BASE_URL` se apontar para API remota).
- `bun run dev:api` – API Elysia em `http://localhost:3001` (carrega dataset e valida envs).
- `bun run lint` – Lint combinado (Next + Biome).
- `bun run test` – Suite de testes Bun (ainda sem casos implementados).
- `bun run scrape:umanni` – Executa scraper com envs `UMANNI_SESSION_COOKIE`, `UMANNI_BASE_URL`, `SCRAPER_CONCURRENCY`, `INPUT_PATH`, `OUTPUT_PATH`.

## Variaveis de Ambiente
- API (`apps/api/.env.local`): `PORT`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_API_VERSION`.
- Frontend: `NEXT_PUBLIC_API_BASE_URL` aponta para a API em execucao.
- Scraper: defina `UMANNI_SESSION_COOKIE` (obrigatorio) e demais variaveis conforme necessidade.

## Testes e Qualidade
- Ainda nao ha suites formais. Utilize `bun run test` para futuras implementacoes e mantenha cobertura minima de 80% quando adicionar testes.
- Priorize tipagem estrita (TypeScript 5+), evite `any` e siga convencoes: arquivos em kebab-case, componentes em PascalCase.
- Use Conventional Commits nas contribuicoes (`feat(api): ...`, `fix(web): ...`). Atualize `.env.example` quando introduzir novas variaveis.
