import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { Elysia, t } from "elysia";

import { loadProdAmCatalog } from "./data/prodam";
import { loadStoredInsights } from "./data/insights-store";
import { debugAzureConnection, generateInsights, runAzureOpenAiPing } from "./services/azure-openai";
import { runtimeEnv } from "./config/env";
import { buildDataset, type Dataset } from "./data/dataset";

process.on("unhandledRejection", (reason) => {
  console.error("[api] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[api] Uncaught exception:", error);
});

let dataset: Dataset = await buildDataset();

async function refreshDataset() {
  dataset = await buildDataset();
}

const app = new Elysia()
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "Authorization"]
    })
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "ProdAM Resource API",
          version: "0.0.1"
        }
      }
    })
  )
  .onError(({ code, error, request }) => {
    if (code === "NOT_FOUND") {
      return new Response("Not Found", { status: 404 });
    }
    console.error("[api] Request error", {
      code,
      method: request?.method,
      url: request?.url,
      message: error?.message,
      stack: error?.stack,
      cause: (error as Error & { cause?: unknown })?.cause
    });
    throw error;
  })
  .get("/favicon.ico", () => new Response(null, { status: 204 }))
  .get("/health", () => ({
    status: "ok",
    azure: {
      configured: runtimeEnv.azure.configured,
      endpoint: runtimeEnv.azure.endpoint
    }
  }))
  .get("/v1/resources", () => dataset.resources)
  .get("/v1/projects", () => dataset.projects)
  .get("/v1/recommendations", () => dataset.recommendations)
  .post(
    "/v1/ai/ping",
    async ({ body }) => {
      const prompt = body.prompt?.trim() || "Retorne 'OK'.";
      const result = await runAzureOpenAiPing(prompt);
      return {
        generatedAt: new Date().toISOString(),
        prompt,
        result
      };
    },
    {
      body: t.Object({
        prompt: t.Optional(t.String())
      })
    }
  )
  .get("/v1/catalog/overview", () => loadProdAmCatalog())
  .get("/v1/insights", async () => {
    const catalog = loadProdAmCatalog();
    const stored = await loadStoredInsights();
    if (stored.length) {
      const storedMap = new Map(stored.map((record) => [record.resourceId, record]));
      const hasAllEmployees = catalog.employees.every((employee) =>
        storedMap.has(String(employee.id))
      );
      const latest = stored.reduce((acc, record) =>
        new Date(record.generatedAt).getTime() > new Date(acc.generatedAt).getTime() ? record : acc
      );
      return {
        generatedAt: latest.generatedAt,
        usingAzure: stored.some((record) => record.usingAzure),
        model: latest.model,
        latencyMs: latest.latencyMs,
        insights: stored.map(
          ({
            resourceId,
            resourceName,
            summary,
            suggestedProjects,
            developmentIdeas,
            skillHighlights,
            skillGaps
          }) => ({
            resourceId,
            resourceName,
            summary,
            suggestedProjects,
            developmentIdeas,
            skillHighlights,
            skillGaps
          })
        ),
        rawAzureResponse: latest.rawAzureResponse,
        error: hasAllEmployees
          ? undefined
          : `Insights parciais: ${stored.length} de ${catalog.employees.length} colaboradores analisados.`
      };
    }

    const resourceLookup = new Map(dataset.resources.map((resource) => [resource.id, resource]));
    const mergedResources = catalog.employees.map((employee) => {
      const resourceMatch = resourceLookup.get(String(employee.id));
      return {
        id: String(employee.id),
        name: employee.displayName,
        role: employee.role,
        manager: employee.manager,
        coordination: resourceMatch?.coordination ?? employee.manager ?? null,
        macroArea: resourceMatch?.macroArea ?? null,
        availability: resourceMatch?.availability ?? null,
        skills: resourceMatch?.skills?.map((skill) => ({ name: skill.name, level: skill.level })) ?? [],
        preferredTechs: resourceMatch?.preferredTechs ?? [],
        languages: employee.languages?.map((language) => ({
          name: language.name,
          level: language.level
        })),
        formations: employee.formations?.map((formation) => ({
          name: formation.name,
          level: formation.level
        }))
      };
    });

    const result = await generateInsights({
      resources: mergedResources,
      projects: dataset.projects.map((project) => ({
        id: project.id,
        name: project.titulo || project.nomeSistema || project.siglaSistema || project.id,
        macroArea: project.macroArea,
        coordination: project.coordination,
        needs: project.needs.map((need) => ({
          label: need.label,
          skillId: need.skillId
        }))
      })),
      recommendations: dataset.recommendations.map((recommendation) => ({
        resourceId: recommendation.resourceId,
        projectId: recommendation.projectId,
        projectName: recommendation.projectName,
        score: recommendation.score,
        matchedSkills: recommendation.matchedSkills
      }))
    });

    await refreshDataset();
    return result;
  })
  .post("/v1/insights", async ({ body }) => {
    const ids =
      Array.isArray(body?.resourceIds) && body.resourceIds.length
        ? new Set(body.resourceIds.map((id: unknown) => String(id)))
        : null;

    const catalog = loadProdAmCatalog();
    const selectedEmployees = ids
      ? catalog.employees.filter((employee) => ids.has(String(employee.id)))
      : catalog.employees;

    if (!selectedEmployees.length) {
      return {
        generatedAt: new Date().toISOString(),
        usingAzure: false,
        insights: [],
        error: "Nenhum colaborador selecionado para reprocessar."
      };
    }

    const resourceLookup = new Map(dataset.resources.map((resource) => [resource.id, resource]));
    const mergedResources = selectedEmployees.map((employee) => {
      const resourceMatch = resourceLookup.get(String(employee.id));
      return {
        id: String(employee.id),
        name: employee.displayName,
        role: employee.role,
        manager: employee.manager,
        coordination: resourceMatch?.coordination ?? employee.manager ?? null,
        macroArea: resourceMatch?.macroArea ?? null,
        availability: resourceMatch?.availability ?? null,
        skills: resourceMatch?.skills?.map((skill) => ({ name: skill.name, level: skill.level })) ?? [],
        preferredTechs: resourceMatch?.preferredTechs ?? [],
        languages: employee.languages?.map((language) => ({
          name: language.name,
          level: language.level
        })),
        formations: employee.formations?.map((formation) => ({
          name: formation.name,
          level: formation.level
        }))
      };
    });

    const selectedResourceIds = new Set(mergedResources.map((resource) => resource.id));

    const result = await generateInsights({
      resources: mergedResources,
      projects: dataset.projects.map((project) => ({
        id: project.id,
        name: project.titulo || project.nomeSistema || project.siglaSistema || project.id,
        macroArea: project.macroArea,
        coordination: project.coordination,
        needs: project.needs.map((need) => ({
          label: need.label,
          skillId: need.skillId
        }))
      })),
      recommendations: dataset.recommendations
        .filter((recommendation) => selectedResourceIds.has(recommendation.resourceId))
        .map((recommendation) => ({
          resourceId: recommendation.resourceId,
          projectId: recommendation.projectId,
          projectName: recommendation.projectName,
          score: recommendation.score,
          matchedSkills: recommendation.matchedSkills
        }))
    });

    await refreshDataset();
    return result;
  })
  .get("/debug", async () => {
    const diagnostics = await debugAzureConnection();
    return {
      timestamp: new Date().toISOString(),
      diagnostics
    };
  });

app.listen(runtimeEnv.PORT, () => {
  console.log(`API listening on http://localhost:${runtimeEnv.PORT}`);
  if (!runtimeEnv.azure.configured) {
    console.warn("Azure OpenAI credentials not fully configured. Set them in apps/api/.env.local");
  }
});
