# Agency Platform

Aplicacao monorepo com Bun para gerir recursos humanos e tecnicos da PRODAM usando AI.

## Estrutura
- `apps/web` - Frontend Next.js (App Router) com dashboards e workflows de alocacao.
- `apps/api` - Backend Elysia + Bun expondo API REST e docs Swagger.
- `packages/` - Espaco reservado para bibliotecas compartilhadas (ex.: schemas, SDKs).

## Comandos Principais
Instale dependencias (frontend e backend) com:

```bash
bun install
```

Rodar desenvolvimento:

```bash
bun run dev:web   # Next.js em http://localhost:3000
bun run dev:api   # API Elysia em http://localhost:3001
```

Outros:

```bash
bun run lint      # Lint apps web/api
bun run test      # Testes (quando existirem)
```

## Variaveis de ambiente
- Copie `apps/api/.env.example` para `apps/api/.env.local` e preencha as credenciais do Azure OpenAI.
- `NEXT_PUBLIC_API_BASE_URL` - URL base da API Elysia consumida pelo frontend (padrao `http://localhost:3001`).
- `PORT` - Porta da API (defina antes de `bun run dev:api` se precisar alterar o padrao).

## Dados base
- `areas.json`, `diretorias.json`, `jobs.json`, `managers.json`, `funcionarios.json` - Catalogos exportados da PRODAM carregados pela API em `/v1/catalog/overview`. Mantenha-os atualizados para alimentar as recomendacoes e o dashboard.
- Scraper Umanni (`bun run scrape:umanni`):
  - `UMANNI_SESSION_COOKIE` - Cookie de sessao autenticado (ex.: `_umanni_hr_session=...`).
  - `UMANNI_BASE_URL` - Opcional, base do Umanni (padrao `https://desempenhoprodam.umanni.com.br/umanni_hr`).
  - `SCRAPER_CONCURRENCY` - Opcional, requests paralelos (padrao 3).
  - `INPUT_PATH`/`OUTPUT_PATH` - Opcional, caminhos para leitura/escrita do `funcionarios.json`.

## Proximos Passos
- Conectar fontes reais de funcionarios, organograma e projetos.
- Implementar camada de recomendacoes com Azure OpenAI (gpt-5).
- Criar pacotes compartilhados (schemas Zod, cliente API, prompts).
- Automatizar pipelines CI/CD e configuracoes de infraestrutura.
