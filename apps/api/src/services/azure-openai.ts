import { runtimeEnv } from "../config/env";
import { upsertStoredInsights } from "../data/insights-store";

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type AzureChatChoice = {
  index: number;
  message?: {
    role: string;
    content?: string | Array<{ type?: string; text?: string }>;
  };
  finish_reason?: string;
};

type AzureChatResponse = {
  id: string;
  model?: string;
  choices?: AzureChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type AzureChatResult = {
  id: string;
  completion: string;
  usage?: AzureChatResponse["usage"];
  latencyMs: number;
  model?: string;
};

const DEFAULT_MODEL = "gpt-5-mini";

function extractContent(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (!content) {
    return "";
  }
  if (typeof content === "string") {
    return content.trim();
  }
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
}

export async function runAzureChat(
  messages: ChatMsg[],
  opts?: {
    maxCompletionTokens?: number;
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  }
): Promise<AzureChatResult> {
  if (!runtimeEnv.azure.configured) {
    throw new Error("Azure OpenAI nao configurado. Defina endpoint, deployment e api key.");
  }

  const endpoint = (runtimeEnv.azure.endpoint ?? "").replace(/\/+$/, "");
  const url = `${endpoint}/openai/deployments/${runtimeEnv.azure.deployment}/chat/completions?api-version=${runtimeEnv.azure.apiVersion}`;

  const body = {
    messages,
    reasoning_effort: opts?.reasoningEffort ?? "medium"
  };

  console.debug("[api] Azure OpenAI request", {
    url,
    body: JSON.stringify(body, null, 2)
  });

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": runtimeEnv.azure.apiKey ?? ""
    },
    body: JSON.stringify(body)
  });
  const latencyMs = Date.now() - startedAt;

  console.log(`[api] Azure OpenAI response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Azure OpenAI retornou ${response.status} ${response.statusText}. Corpo: ${text}`,
      { cause: { status: response.status, statusText: response.statusText, body: text } }
    );
  }

  const json = (await response.json()) as AzureChatResponse;
  console.debug("[api] Azure raw response JSON:", JSON.stringify(json, null, 2));
  const completion = extractContent(json.choices?.[0]?.message?.content);

  if (!completion) {
    console.debug("[api] Azure choice payload sem content:", JSON.stringify(json.choices?.[0], null, 2));
  }

  return {
    id: json.id ?? "",
    completion,
    usage: json.usage,
    latencyMs,
    model: json.model ?? DEFAULT_MODEL
  };
}

export async function runAzureOpenAiPing(prompt: string) {
  return runAzureChat(
    [
      { role: "system", content: "Voce e um diagnostico rapido. Resuma em ate 15 palavras." },
      { role: "user", content: prompt }
    ],
    { maxCompletionTokens: 64, reasoningEffort: "medium" }
  );
}

type InsightResource = {
  id: string;
  name: string;
  role?: string;
  coordination?: string;
  macroArea?: string;
  availability?: number;
  skills?: Array<{ name: string; level?: string }>;
  preferredTechs?: string[];
};

type InsightProject = {
  id: string;
  name: string;
  macroArea?: string;
  coordination?: string;
  needs: Array<{ label: string; skillId: string }>;
};

type InsightRecommendation = {
  resourceId: string;
  projectId: string;
  projectName: string;
  score: number;
  matchedSkills: string[];
};

type InsightPayload = {
  resources: InsightResource[];
  projects: InsightProject[];
  recommendations: InsightRecommendation[];
};

export type InsightSuggestion = {
  resourceId: string;
  resourceName: string;
  summary: string;
  suggestedProjects: Array<{
    projectId?: string;
    projectName: string;
    rationale: string;
  }>;
  developmentIdeas: string[];
  skillHighlights?: string[];
  skillGaps?: string[];
};

type CandidateMatch = {
  recommendation: InsightRecommendation;
  missingSkills: string[];
};

type CandidateProfile = {
  resource: InsightResource;
  matches: CandidateMatch[];
  averageScore: number;
};

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function formatResources(resources: InsightResource[]) {
  return resources
    .slice(0, 10)
    .map((resource) => {
      const skills = resource.skills?.map((skill) => skill.name).join(", ") ?? "sem skills";
      const availability =
        typeof resource.availability === "number" ? `${Math.round(resource.availability * 100)}%` : "nd";
      return `- ${resource.name} (${resource.macroArea ?? "sem macroarea"}) disp. ${availability} | ${skills}`;
    })
    .join("\n");
}

function formatProjects(projects: InsightProject[]) {
  return projects
    .slice(0, 10)
    .map((project) => {
      const needs = project.needs.map((need) => `${need.label} (${need.skillId})`).join(", ");
      return `- ${project.name} (${project.coordination ?? "coord desconhecida"}) -> ${needs}`;
    })
    .join("\n");
}

function computeCandidateProfiles(payload: InsightPayload): CandidateProfile[] {
  const resourceLookup = new Map(payload.resources.map((resource) => [resource.id, resource]));
  const projectLookup = new Map(payload.projects.map((project) => [project.id, project]));
  const projectNameLookup = new Map(payload.projects.map((project) => [normalizeLabel(project.name ?? ""), project]));

  const grouped = new Map<string, InsightRecommendation[]>();
  for (const recommendation of payload.recommendations) {
    const list = grouped.get(recommendation.resourceId) ?? [];
    list.push(recommendation);
    grouped.set(recommendation.resourceId, list);
  }

  const profiles: CandidateProfile[] = [];

  for (const [resourceId, resource] of resourceLookup) {
    const recommendations = grouped.get(resourceId) ?? [];
    const sorted = [...recommendations].sort((a, b) => b.score - a.score).slice(0, 3);

    let matches: CandidateMatch[];
    if (sorted.length) {
      matches = sorted.map((recommendation) => {
        const project =
          projectLookup.get(recommendation.projectId) ??
          projectNameLookup.get(normalizeLabel(recommendation.projectName ?? ""));

        const missingSkills = (project?.needs ?? [])
          .map((need) => need.label)
          .filter(
            (label) =>
              !recommendation.matchedSkills.some(
                (skill) => normalizeLabel(skill) === normalizeLabel(label)
              )
          );

        return {
          recommendation,
          missingSkills
        };
      });
    } else {
      matches = [];
    }

    const averageScore =
      matches.length && sorted.length
        ? sorted.reduce((sum, entry) => sum + entry.score, 0) / sorted.length
        : 0;

    profiles.push({
      resource,
      matches,
      averageScore
    });
  }

  return profiles.sort((a, b) => b.averageScore - a.averageScore).slice(0, 5);
}

function buildHeuristicSuggestion(profile: CandidateProfile): InsightSuggestion {
  const { resource, matches, averageScore } = profile;

  const addUnique = (target: string[], value: string | undefined | null) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const normalized = normalizeLabel(trimmed);
    if (target.some((entry) => normalizeLabel(entry) === normalized)) {
      return;
    }
    target.push(trimmed);
  };

  const projectsList = matches
    .map(({ recommendation }) => recommendation.projectName || recommendation.projectId || "Projeto sem nome")
    .filter(Boolean);
  const topSummary =
    projectsList.length > 0
      ? projectsList
          .map((projectName, index) => `${projectName} (${Math.round(matches[index].recommendation.score * 100)}%)`)
          .join(", ")
      : "avaliar alocacao inicial (sem correspondencias mapeadas)";

  const availabilityPercent =
    typeof resource.availability === "number" ? `${Math.round(resource.availability * 100)}%` : "disponibilidade nao mapeada";

  const summarySegments = [
    `Priorizar ${resource.name} (${resource.macroArea ?? "macroarea indefinida"})`,
    `foco em ${topSummary}`,
    `Disponibilidade ${availabilityPercent}`,
    `Score medio ${Math.round(averageScore * 100)}%`
  ];

  const summary = `${summarySegments.filter(Boolean).join(". ")}.`;

  const suggestedProjects = matches.map(({ recommendation, missingSkills }) => ({
    projectId: recommendation.projectId,
    projectName: recommendation.projectName,
    rationale: [
      `Score ${Math.round(recommendation.score * 100)}%`,
      recommendation.matchedSkills.length ? `Skills cobertas: ${recommendation.matchedSkills.join(", ")}` : "Sem skill mapeada",
      missingSkills.length ? `Aprimorar: ${missingSkills.join(", ")}` : null
    ]
      .filter(Boolean)
      .join(" • ")
  }));

  const skillHighlights: string[] = [];
  for (const skill of resource.skills ?? []) {
    addUnique(skillHighlights, skill.name);
  }
  for (const tech of resource.preferredTechs ?? []) {
    addUnique(skillHighlights, tech);
  }
  for (const match of matches) {
    for (const skill of match.recommendation.matchedSkills) {
      addUnique(skillHighlights, skill);
    }
  }

  const skillGaps: string[] = [];
  for (const match of matches) {
    for (const skill of match.missingSkills) {
      if (!skill) {
        continue;
      }
      const normalized = normalizeLabel(skill);
      if (!normalized) {
        continue;
      }
      const alreadyCovered = skillHighlights.some((entry) => normalizeLabel(entry) === normalized);
      const alreadyListed = skillGaps.some((entry) => normalizeLabel(entry) === normalized);
      if (!alreadyCovered && !alreadyListed) {
        addUnique(skillGaps, skill);
      }
    }
  }

  const developmentIdeas =
    skillGaps.length > 0
      ? [`Planejar desenvolvimento em ${skillGaps.join(", ")}.`]
      : ["Mapear competencias complementares e alinhar proxima alocacao com gestor responsavel."];

  return {
    resourceId: resource.id,
    resourceName: resource.name,
    summary,
    suggestedProjects,
    developmentIdeas,
    skillHighlights,
    skillGaps
  };
}

function buildAzureContext(profiles: CandidateProfile[]) {
  return profiles.map((profile) => ({
    resourceId: profile.resource.id,
    resourceName: profile.resource.name,
    macroArea: profile.resource.macroArea,
    coordination: profile.resource.coordination,
    availability: profile.resource.availability,
    matches: profile.matches.map(({ recommendation, missingSkills }) => ({
      projectId: recommendation.projectId,
      projectName: recommendation.projectName,
      score: Math.round(recommendation.score * 100),
      matchedSkills: recommendation.matchedSkills,
      missingSkills
    }))
  }));
}

function toStrictJson(raw: string) {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function parseInsights(raw: string) {
  const cleaned = toStrictJson(raw);
  if (!cleaned) {
    return null;
  }
  try {
    const obj = JSON.parse(cleaned);
    if (Array.isArray(obj)) {
      return obj;
    }
    if (obj && typeof obj === "object" && Array.isArray((obj as { insights?: unknown }).insights)) {
      return (obj as { insights: unknown[] }).insights;
    }
    return null;
  } catch {
    return null;
  }
}

function mergeAzureWithHeuristics(heuristics: InsightSuggestion[], azure: unknown[]): InsightSuggestion[] {
  const heuristicMap = new Map(heuristics.map((item) => [item.resourceId, item]));
  const merged = new Map<string, InsightSuggestion>();

  for (const entry of azure) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as {
      resourceId?: string | number;
      resourceName?: string;
      summary?: string;
      suggestedProjects?: Array<{ projectId?: string; projectName?: string; rationale?: string }>;
      developmentIdeas?: Array<string>;
    };

    const resourceId = raw.resourceId !== undefined ? String(raw.resourceId) : undefined;
    if (!resourceId) {
      continue;
    }

    const base = heuristicMap.get(resourceId);
    if (!base) {
      continue;
    }

    const suggestedProjects =
      Array.isArray(raw.suggestedProjects) && raw.suggestedProjects.length
        ? raw.suggestedProjects.map((project, index) => ({
            projectId: project.projectId ?? base.suggestedProjects[index]?.projectId,
            projectName: project.projectName ?? base.suggestedProjects[index]?.projectName ?? `Projeto ${index + 1}`,
            rationale:
              project.rationale ??
              base.suggestedProjects[index]?.rationale ??
              "Racional nao fornecido pelo modelo."
          }))
        : base.suggestedProjects;

    const developmentIdeas =
      Array.isArray(raw.developmentIdeas) && raw.developmentIdeas.length
        ? raw.developmentIdeas.map((idea) => String(idea))
        : base.developmentIdeas;

    const skillHighlights =
      Array.isArray((raw as { skillHighlights?: unknown[] }).skillHighlights) &&
      (raw as { skillHighlights?: unknown[] }).skillHighlights?.length
        ? ((raw as { skillHighlights?: unknown[] }).skillHighlights as unknown[])
            .map((entry) => String(entry))
            .filter(Boolean)
        : base.skillHighlights;

    const skillGaps =
      Array.isArray((raw as { skillGaps?: unknown[] }).skillGaps) &&
      (raw as { skillGaps?: unknown[] }).skillGaps?.length
        ? ((raw as { skillGaps?: unknown[] }).skillGaps as unknown[])
            .map((entry) => String(entry))
            .filter(Boolean)
        : base.skillGaps;

    merged.set(resourceId, {
      resourceId,
      resourceName: raw.resourceName ?? base.resourceName,
      summary: raw.summary ?? base.summary,
      suggestedProjects,
      developmentIdeas,
      skillHighlights,
      skillGaps
    });
  }

  return heuristics.map((item) => merged.get(item.resourceId) ?? item);
}

export async function generateInsights(payload: InsightPayload) {
  const profiles = computeCandidateProfiles(payload);
  const heuristics = profiles.map((profile) => buildHeuristicSuggestion(profile));
  const generatedAt = new Date().toISOString();

  const persist = async (
    insights: InsightSuggestion[],
    meta: {
      usingAzure: boolean;
      model?: string;
      latencyMs?: number;
      rawAzureResponse?: unknown;
    }
  ) => {
    if (!insights.length) {
      return;
    }
    await upsertStoredInsights(
      insights.map((insight) => ({
        ...insight,
        generatedAt,
        usingAzure: meta.usingAzure,
        model: meta.model,
        latencyMs: meta.latencyMs,
        rawAzureResponse: meta.rawAzureResponse
      }))
    );
  };

  if (!runtimeEnv.azure.configured) {
    await persist(heuristics, { usingAzure: false });
    return {
      generatedAt,
      usingAzure: false,
      insights: heuristics,
      error: "Azure OpenAI nao configurado. Retornando heuristicas locais."
    };
  }

  if (!profiles.length) {
    await persist([], { usingAzure: true });
    return {
      generatedAt,
      usingAzure: true,
      insights: [],
      error: "Nenhum candidato elegivel para gerar insights."
    };
  }

  const systemPrompt = [
    "Voce e um analista de alocacao de talentos da PRODAM.",
    'Responda EXCLUSIVAMENTE com JSON valido, sem markdown, sem texto fora do JSON.',
    'Formato: {"insights":[{"resourceId":"string","resourceName":"string","summary":"frase objetiva","suggestedProjects":[{"projectId":"string opcional","projectName":"string","rationale":"texto curto"}],"developmentIdeas":["texto curto"]}]}'
  ].join(" ");

  const userPrompt = JSON.stringify({
    generatedAt: new Date().toISOString(),
    context: {
      resources: formatResources(payload.resources),
      projects: formatProjects(payload.projects),
      topMatches: buildAzureContext(profiles)
    }
  });

  try {
    const result = await runAzureChat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      { maxCompletionTokens: 1200, temperature: 0.1, reasoningEffort: "medium" }
    );

    console.log("[api] Azure completion (raw):", result.completion);

    const parsed = parseInsights(result.completion);
    const insights = parsed ? mergeAzureWithHeuristics(heuristics, parsed) : heuristics;

    await persist(insights, {
      usingAzure: Boolean(parsed),
      model: result.model ?? DEFAULT_MODEL,
      latencyMs: result.latencyMs,
      rawAzureResponse: result.completion
    });

    return {
      generatedAt,
      usingAzure: Boolean(parsed),
      model: result.model ?? DEFAULT_MODEL,
      latencyMs: result.latencyMs,
      insights,
      error: parsed ? undefined : "Resposta do Azure em formato inesperado. Utilizando heuristicas.",
      rawAzureResponse: parsed ? undefined : result.completion
    };
  } catch (error) {
    console.error("[api] Falha ao gerar insights no Azure:", error);
    await persist(heuristics, {
      usingAzure: false,
      rawAzureResponse:
        error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined
    });
    return {
      generatedAt,
      usingAzure: false,
      insights: heuristics,
      error: error instanceof Error ? error.message : "Erro desconhecido ao chamar Azure OpenAI",
      rawAzureResponse:
        error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined
    };
  }
}

export async function debugAzureConnection() {
  if (!runtimeEnv.azure.configured) {
    return {
      connected: false,
      error: "Azure OpenAI nao configurado"
    };
  }

  try {
    const result = await runAzureChat(
      [
        { role: "system", content: "Voce responde apenas OK se entender." },
        { role: "user", content: "Confirme recebimento desta mensagem respondendo apenas OK." }
      ],
      { maxCompletionTokens: 32, reasoningEffort: "minimal" }
    );

    return {
      connected: true,
      model: result.model ?? DEFAULT_MODEL,
      latencyMs: result.latencyMs,
      sample: result.completion
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
      details: error
    };
  }
}
