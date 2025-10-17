import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { buildRecommendations, loadMockData, type MockDataset, type Project, type Resource } from "@agency/mock-data";
import { Elysia, t } from "elysia";

import { loadProdAmCatalog } from "./data/prodam";
import { loadStoredInsights } from "./data/insights-store";
import { debugAzureConnection, generateInsights, runAzureOpenAiPing } from "./services/azure-openai";
import { runtimeEnv } from "./config/env";

process.on("unhandledRejection", (reason) => {
  console.error("[api] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[api] Uncaught exception:", error);
});

function createFallbackDataset(): MockDataset {
  const fallbackResources: Resource[] = [
    {
      id: "f-001",
      name: "Ana Souza",
      macroArea: "Inovacao Digital",
      coordination: "Inovacao Digital",
      management: "Solucoes",
      department: "Diretoria Tecnologia",
      seniority: "senior",
      availabilityHours: 64,
      availability: 0.4,
      skills: [
        { id: "ia-aplicada", name: "IA aplicada", level: "senior", source: "competencia" },
        { id: "engenharia-de-dados", name: "Engenharia de dados", level: "senior", source: "competencia" }
      ],
      preferredTechs: ["IA aplicada", "Engenharia de dados"]
    },
    {
      id: "f-002",
      name: "Bruno Lima",
      macroArea: "Infraestrutura",
      coordination: "Infraestrutura",
      management: "Operacoes",
      department: "Diretoria Tecnologia",
      seniority: "pleno",
      availabilityHours: 32,
      availability: 0.2,
      skills: [
        { id: "azure-cloud", name: "Azure cloud", level: "pleno", source: "competencia" },
        { id: "devops", name: "DevOps", level: "pleno", source: "competencia" }
      ],
      preferredTechs: ["Azure", "DevOps"]
    },
    {
      id: "f-003",
      name: "Carla Nunes",
      macroArea: "Atendimento",
      coordination: "Atendimento",
      management: "Clientes",
      department: "Diretoria Servicos",
      seniority: "pleno",
      availabilityHours: 96,
      availability: 0.6,
      skills: [{ id: "devops", name: "DevOps", level: "pleno", source: "competencia" }],
      preferredTechs: ["DevOps", "Service Desk"]
    }
  ];

  const fallbackProjects: Project[] = [
    {
      id: "p-analytics",
      siglaSistema: "ANALYTICS",
      nomeSistema: "Analytics Prefeitura",
      titulo: "Analytics Prefeitura",
      macroArea: "Solucoes Digitais",
      categoriaTecnologica: "Data & Analytics",
      complexidade: "Media",
      equipeIdeal: "1 PO | 2 Eng Dados | 1 Cientista de Dados",
      observacaoIA: "Mock gerado automaticamente.",
      coordination: "Solucoes Digitais",
      needs: [
        { skillId: "engenharia-de-dados", label: "Engenharia de dados", priority: "alta" },
        { skillId: "ia-aplicada", label: "IA aplicada", priority: "media" }
      ]
    },
    {
      id: "p-modernizacao",
      siglaSistema: "MOD-DATACENTER",
      nomeSistema: "Modernizacao Data Center",
      titulo: "Modernizacao Data Center",
      macroArea: "Infraestrutura",
      categoriaTecnologica: "Cloud & DevOps",
      complexidade: "Alta",
      equipeIdeal: "1 Arquiteto Cloud | 2 DevOps | 1 SRE",
      observacaoIA: "Mock gerado automaticamente.",
      coordination: "Infraestrutura",
      needs: [
        { skillId: "azure-cloud", label: "Azure cloud", priority: "alta" },
        { skillId: "devops", label: "DevOps", priority: "media" }
      ]
    }
  ];

  return {
    resources: fallbackResources,
    projects: fallbackProjects,
    recommendations: buildRecommendations(fallbackResources, fallbackProjects)
  };
}

function loadDataset(): MockDataset {
  try {
    return loadMockData();
  } catch (error) {
    console.error("[api] Falha ao carregar dataset mock:", error);
    return createFallbackDataset();
  }
}

const dataset = loadDataset();
const resources = dataset.resources;
const projects = dataset.projects;
const recommendations =
  dataset.recommendations.length > 0 ? dataset.recommendations : buildRecommendations(resources, projects);
const resourcesByName = new Map(
  resources.map((resource) => [resource.name.trim().toLowerCase(), resource])
);

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
  .get("/v1/resources", () => resources)
  .get("/v1/projects", () => projects)
  .get("/v1/recommendations", () => recommendations)
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
      if (hasAllEmployees) {
        const latest = stored.reduce((acc, record) =>
          new Date(record.generatedAt).getTime() > new Date(acc.generatedAt).getTime() ? record : acc
        );
        return {
          generatedAt: latest.generatedAt,
          usingAzure: stored.some((record) => record.usingAzure),
          model: latest.model,
          latencyMs: latest.latencyMs,
          insights: stored.map(
            ({ resourceId, resourceName, summary, suggestedProjects, developmentIdeas }) => ({
              resourceId,
              resourceName,
              summary,
              suggestedProjects,
              developmentIdeas
            })
          ),
          rawAzureResponse: latest.rawAzureResponse
        };
      }
    }

    const resourceIdToEmployeeId = new Map<string, string>();
    const mergedResources = catalog.employees.map((employee) => {
      const match = resourcesByName.get(employee.displayName.trim().toLowerCase());
      if (match) {
        resourceIdToEmployeeId.set(match.id, String(employee.id));
      }
      return {
        id: String(employee.id),
        name: employee.displayName,
        role: employee.role,
        manager: employee.manager,
        coordination: match?.coordination,
        macroArea: match?.macroArea,
        availability: match?.availability,
        skills: match?.skills?.map((skill) => ({ name: skill.name })),
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

    return generateInsights({
      resources: mergedResources,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        macroArea: project.macroArea,
        coordination: project.coordination,
        needs: project.needs.map((need) => ({
          label: need.label,
          skillId: need.skillId
        }))
      })),
      recommendations: recommendations
        .map((recommendation) => {
          const employeeId = resourceIdToEmployeeId.get(recommendation.resourceId);
          if (!employeeId) {
            return null;
          }
          return {
            resourceId: employeeId,
            projectId: recommendation.projectId,
            projectName: recommendation.projectName,
            score: recommendation.score,
            matchedSkills: recommendation.matchedSkills
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    });
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

    const resourceIdToEmployeeId = new Map<string, string>();
    const mergedResources = selectedEmployees.map((employee) => {
      const match = resourcesByName.get(employee.displayName.trim().toLowerCase());
      if (match) {
        resourceIdToEmployeeId.set(match.id, String(employee.id));
      }
      return {
        id: String(employee.id),
        name: employee.displayName,
        role: employee.role,
        manager: employee.manager,
        coordination: match?.coordination,
        macroArea: match?.macroArea,
        availability: match?.availability,
        skills: match?.skills?.map((skill) => ({ name: skill.name })),
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

    const employeeIdSet = new Set(mergedResources.map((resource) => resource.id));

    return generateInsights({
      resources: mergedResources,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        macroArea: project.macroArea,
        coordination: project.coordination,
        needs: project.needs.map((need) => ({
          label: need.label,
          skillId: need.skillId
        }))
      })),
      recommendations: recommendations
        .map((recommendation) => {
          const employeeId = resourceIdToEmployeeId.get(recommendation.resourceId);
          if (!employeeId || !employeeIdSet.has(employeeId)) {
            return null;
          }
          return {
            resourceId: employeeId,
            projectId: recommendation.projectId,
            projectName: recommendation.projectName,
            score: recommendation.score,
            matchedSkills: recommendation.matchedSkills
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    });
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
