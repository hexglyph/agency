'use client';

import { useCallback, useEffect, useMemo, useState } from "react";

type CatalogMeta = {
  source: string;
  generatedAt: string;
  error?: string;
};

type CatalogArea = {
  id: number;
  name: string;
  displayName: string;
  code?: string | null;
  slug: string;
};

type CatalogDirectorate = {
  id: number;
  name: string;
  displayName: string;
  code?: string | null;
  slug: string;
};

type CatalogJob = {
  id: number;
  name: string;
  displayName: string;
  family: string;
  level?: string | null;
  slug: string;
};

type CatalogManager = {
  id: number;
  name: string;
  displayName: string;
  initials: string;
  slug: string;
};

type CatalogEmployee = {
  id: number;
  name: string;
  displayName: string;
  initials: string;
  registration: string;
  isManager: boolean;
  role?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  manager?: string;
  formations?: Array<{ name: string; level?: string }>;
  experiences?: Array<{ role: string; company?: string; current?: boolean }>;
  languages?: Array<{ name: string; level?: string }>;
  sourceUrl?: string;
  scrapedAt?: string;
};

type CatalogOverview = {
  areas: CatalogArea[];
  directorates: CatalogDirectorate[];
  jobs: CatalogJob[];
  managers: CatalogManager[];
  employees: CatalogEmployee[];
  meta: CatalogMeta;
};

type ResourceSkill = {
  id: string;
  name: string;
  level?: string | null;
  source: "competencia" | "tecnologia" | "insight";
};

type Resource = {
  id: string;
  name: string;
  role?: string;
  manager?: string;
  macroArea?: string | null;
  coordination?: string | null;
  department?: string | null;
  availability?: number | null;
  availabilityHours?: number | null;
  seniority?: "junior" | "pleno" | "senior" | null;
  skills: ResourceSkill[];
  preferredTechs: string[];
  notes?: string;
};

type ProjectNeed = {
  skillId: string;
  label: string;
  priority: "alta" | "media" | "baixa";
};

type Project = {
  id: string;
  siglaSistema?: string;
  nomeSistema?: string;
  titulo?: string;
  macroArea?: string;
  categoriaTecnologica?: string;
  complexidade?: string;
  equipeIdeal?: string;
  observacaoIA?: string;
  coordination?: string;
  needs: ProjectNeed[];
};

type Recommendation = {
  projectId: string;
  projectName: string;
  macroArea?: string;
  resourceId: string;
  resourceName: string;
  matchedSkills: string[];
  coordinationFit: boolean;
  score: number;
  matchDetail: {
    skillCoverage: number;
    availabilityScore: number;
    coordinationScore: number;
  };
  notes: string;
};

type InsightSuggestion = {
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

type DisplaySkill = {
  id: string;
  name: string;
  level?: string | null;
  source: "competencia" | "tecnologia" | "insight" | "gap";
};

type InsightResponse = {
  generatedAt: string;
  usingAzure: boolean;
  model?: string;
  latencyMs?: number;
  insights: InsightSuggestion[];
  error?: string;
  rawAzureResponse?: unknown;
};

type DebugDiagnostics = {
  connected: boolean;
  model?: string;
  latencyMs?: number;
  sample?: string;
  error?: string;
};

type DebugResponse = {
  timestamp: string;
  diagnostics: DebugDiagnostics;
};

type EmployeeProfile = {
  employee: CatalogEmployee;
  resource?: Resource;
  insight?: InsightSuggestion;
  suggestions: Recommendation[];
  displaySkills: DisplaySkill[];
};

type EmployeeDetail = {
  type: "employee";
  employee: CatalogEmployee;
  resource?: Resource;
  insight?: InsightSuggestion;
  suggestions: Recommendation[];
  displaySkills: DisplaySkill[];
};

type ProjectDetail = {
  type: "project";
  project: Project;
  matches: Recommendation[];
  insightMatches: InsightSuggestion[];
};

type ManagerDetail = {
  type: "manager";
  manager: CatalogManager;
  team: CatalogEmployee[];
};

type DetailState = EmployeeDetail | ProjectDetail | ManagerDetail;

type DashboardProps = {
  data: {
    resources: Resource[];
    projects: Project[];
    recommendations: Recommendation[];
  };
  catalog: CatalogOverview;
  insights: InsightResponse;
  meta: {
    usingFallback: boolean;
    error?: string;
    catalogFallback: boolean;
    catalogError?: string;
    insightsError?: string;
  };
};

const SENIORITY_OPTIONS: Array<Resource["seniority"] | "all"> = ["all", "junior", "pleno", "senior"];
const SCORE_STEPS = [
  { label: "Todos", value: 0 },
  { label: ">= 60%", value: 0.6 },
  { label: ">= 70%", value: 0.7 },
  { label: ">= 80%", value: 0.8 },
  { label: ">= 90%", value: 0.9 }
];

function uniqueValues<T>(collection: T[], selector: (item: T) => string) {
  return Array.from(new Set(collection.map(selector).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" })
  );
}

function formatPercentage(value: number) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return `${Math.round(clamped * 100)}%`;
}

function formatHours(value: number) {
  return `${Math.round(value)}h`;
}

function formatScore(value: number) {
  return Math.round(value * 100).toString();
}

function truncate(input: string, length = 180) {
  if (!input) {
    return "";
  }
  return input.length > length ? `${input.slice(0, length)}…` : input;
}

function formatDateTime(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return input;
  }
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function priorityLabel(priority: Project["needs"][number]["priority"]) {
  const labels: Record<Project["needs"][number]["priority"], string> = {
    alta: "Alta",
    media: "Media",
    baixa: "Baixa"
  };
  return labels[priority] ?? priority;
}

function priorityClass(priority: Project["needs"][number]["priority"]) {
  switch (priority) {
    case "alta":
      return "tag tag-high";
    case "media":
      return "tag tag-medium";
    default:
      return "tag tag-low";
  }
}

function complexityClass(complexity: Project["complexidade"]) {
  const normalized = (complexity ?? "").toLowerCase();
  if (normalized === "alta") {
    return "tag tag-high";
  }
  if (normalized === "baixa") {
    return "tag tag-low";
  }
  return "tag tag-medium";
}

function seniorityLabel(level: Resource["seniority"]) {
  switch (level) {
    case "junior":
      return "Junior";
    case "senior":
      return "Senior";
    default:
      return "Pleno";
  }
}

function SummaryCard({
  title,
  value,
  hint
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="card">
      <span className="card-label">{title}</span>
      <strong className="card-value">{value}</strong>
      {hint ? <span className="card-hint">{hint}</span> : null}
    </article>
  );
}

export function Dashboard({ data, catalog, insights, meta }: DashboardProps) {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
  const { resources, projects, recommendations } = data;
  const [insightState, setInsightState] = useState(insights);
  useEffect(() => {
    setInsightState(insights);
  }, [insights]);
  const aiInsights = insightState.insights ?? [];
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  useEffect(() => {
    if (insightState.error && !analysisMessage) {
      setAnalysisMessage(insightState.error);
    }
  }, [insightState.error, analysisMessage]);
  const [azureStatus, setAzureStatus] = useState<{
    loading: boolean;
    data?: DebugResponse;
    error?: string;
  }>({
    loading: false
  });

  const refreshAzureStatus = useCallback(async () => {
    setAzureStatus((previous) => ({ ...previous, loading: true, error: undefined }));
    try {
      const response = await fetch(`${API_BASE_URL}/debug`, {
        method: "GET",
        cache: "no-store",
        mode: "cors",
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          text || `Falha ao diagnosticar Azure OpenAI (${response.status} ${response.statusText})`
        );
      }

      const payload = (await response.json()) as DebugResponse;
      setAzureStatus({
        loading: false,
        data: payload
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido ao consultar Azure OpenAI.";
      console.error("[dashboard] Erro ao diagnosticar Azure:", error);
      setAzureStatus((previous) => ({
        loading: false,
        data: previous.data,
        error: message
      }));
    }
  }, [API_BASE_URL]);

  const azureDiagnostics = azureStatus.data?.diagnostics;
  const azureCheckedAt = useMemo(
    () => (azureStatus.data ? formatDateTime(azureStatus.data.timestamp) : null),
    [azureStatus.data]
  );

  const employeeCount = catalog.employees.length;
  const managerCount = catalog.managers.length;
  const directorateCount = catalog.directorates.length;
  const areaCount = catalog.areas.length;
  const jobCount = catalog.jobs.length;

  const EMPLOYEE_PAGE_SIZE = 25;
  const [employeePage, setEmployeePage] = useState(1);
  const spotlightDirectorates = useMemo(
    () =>
      [...catalog.directorates]
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" }))
        .slice(0, 12),
    [catalog.directorates]
  );
  const spotlightAreas = useMemo(
    () =>
      [...catalog.areas]
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" }))
        .slice(0, 12),
    [catalog.areas]
  );
  const spotlightJobs = useMemo(
    () =>
      [...catalog.jobs]
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" }))
        .slice(0, 12),
    [catalog.jobs]
  );
  const catalogGeneratedAt = useMemo(() => formatDateTime(catalog.meta.generatedAt), [catalog.meta.generatedAt]);
  const insightsGeneratedAt = useMemo(() => formatDateTime(insightState.generatedAt), [insightState.generatedAt]);
  const effectiveInsightsError = insightState.error ?? meta.insightsError ?? null;
  const resourceByName = useMemo(
    () => new Map(resources.map((resource) => [resource.name.trim().toLowerCase(), resource])),
    [resources]
  );
  const insightByResourceId = useMemo(
    () => new Map(aiInsights.map((insight) => [insight.resourceId, insight])),
    [aiInsights]
  );
  const recommendationsByResourceId = useMemo(() => {
    const map = new Map<string, Recommendation[]>();
    recommendations.forEach((item) => {
      const key = item.resourceId;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [recommendations]);
  const managersByName = useMemo(
    () => new Map(catalog.managers.map((manager) => [manager.displayName.trim().toLowerCase(), manager])),
    [catalog.managers]
  );
  const employeeProfiles = useMemo<EmployeeProfile[]>(() => {
    return catalog.employees.map((employee) => {
      const resourceMatch = resourceByName.get(employee.displayName.trim().toLowerCase());
      const insight = insightByResourceId.get(String(employee.id));
      const suggestions = resourceMatch ? recommendationsByResourceId.get(resourceMatch.id) ?? [] : [];

      const normalizeLabel = (value: string) => value.trim().toLowerCase();
      const seen = new Set<string>();
      const displaySkills: DisplaySkill[] = [];
      const pushDisplaySkill = (
        name: string | undefined | null,
        source: DisplaySkill["source"],
        id: string,
        level?: string | null
      ) => {
        if (!name) {
          return;
        }
        const trimmed = name.trim();
        if (!trimmed) {
          return;
        }
        const key = normalizeLabel(trimmed);
        if (seen.has(key)) {
          return;
        }
        seen.add(key);
        displaySkills.push({
          id,
          name: trimmed,
          level: level ?? null,
          source
        });
      };

      resourceMatch?.skills?.forEach((skill) => {
        pushDisplaySkill(skill.name, skill.source, skill.id, skill.level);
      });

      const insightHighlights = (insight?.skillHighlights ?? []).filter(Boolean);
      insightHighlights.forEach((name, index) => {
        pushDisplaySkill(name, "insight", `insight-${employee.id}-${index}`);
      });

      const insightGaps = (insight?.skillGaps ?? []).filter(Boolean);
      insightGaps.forEach((name, index) => {
        pushDisplaySkill(name, "gap", `gap-${employee.id}-${index}`);
      });

      return {
        employee,
        resource: resourceMatch,
        insight,
        suggestions,
        displaySkills
      };
    });
  }, [catalog.employees, resourceByName, insightByResourceId, recommendationsByResourceId]);

  const profileByEmployeeId = useMemo(
    () => new Map(employeeProfiles.map((profile) => [String(profile.employee.id), profile])),
    [employeeProfiles]
  );

  const macroAreaOptions = useMemo(() => {
    const set = new Set<string>();
    employeeProfiles.forEach((profile) => {
      if (profile.resource?.macroArea) {
        set.add(profile.resource.macroArea.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
  }, [employeeProfiles]);

  const managerTeams = useMemo(() => {
    const map = new Map<number, CatalogEmployee[]>();
    catalog.employees.forEach((employee) => {
      const key = employee.manager?.trim().toLowerCase();
      if (!key) {
        return;
      }
      const manager = managersByName.get(key);
      if (!manager) {
        return;
      }
      const list = map.get(manager.id) ?? [];
      list.push(employee);
      map.set(manager.id, list);
    });
    return map;
  }, [catalog.employees, managersByName]);
  const managerList = useMemo(
    () =>
      catalog.managers
        .map((manager) => ({
          manager,
          teamSize: (managerTeams.get(manager.id) ?? []).length
        }))
        .sort((a, b) => b.teamSize - a.teamSize),
    [catalog.managers, managerTeams]
  );
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceMacroArea, setResourceMacroArea] = useState<string>("all");
  const [resourceSeniority, setResourceSeniority] = useState<(typeof SENIORITY_OPTIONS)[number]>("all");

  const filteredProfiles = useMemo(() => {
    const needle = resourceSearch.trim().toLowerCase();

    return employeeProfiles.filter((profile) => {
      const resource = profile.resource;
      const macroArea = resource?.macroArea?.trim();

      if (resourceMacroArea !== "all") {
        if (!macroArea || macroArea !== resourceMacroArea) {
          return false;
        }
      }

      if (resourceSeniority !== "all") {
        if (!resource || resource.seniority !== resourceSeniority) {
          return false;
        }
      }

      if (!needle) {
        return true;
      }

      const haystack = [
        profile.employee.displayName,
        profile.employee.role,
        profile.employee.manager?.trim(),
        macroArea,
        resource?.department,
        profile.displaySkills.map((skill) => skill.name).join(" "),
        resource?.preferredTechs?.join(" "),
        profile.employee.languages?.map((language) => `${language.name} ${language.level ?? ""}`).join(" "),
        profile.employee.formations?.map((formation) => `${formation.name} ${formation.level ?? ""}`).join(" "),
        profile.insight?.summary ?? "",
        profile.suggestions.map((suggestion) => suggestion.projectName || suggestion.projectId || "").join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [employeeProfiles, resourceMacroArea, resourceSeniority, resourceSearch]);

  const sortedProfiles = useMemo(
    () =>
      [...filteredProfiles].sort((a, b) =>
        a.employee.displayName.localeCompare(b.employee.displayName, "pt-BR", { sensitivity: "base" })
      ),
    [filteredProfiles]
  );

  const filteredCount = sortedProfiles.length;
  const employeeTotalPages = Math.max(1, Math.ceil(Math.max(filteredCount, 1) / EMPLOYEE_PAGE_SIZE));
  useEffect(() => {
    setEmployeePage((page) => Math.min(page, employeeTotalPages));
  }, [employeeTotalPages]);
  useEffect(() => {
    setEmployeePage(1);
  }, [resourceMacroArea, resourceSeniority, resourceSearch]);
  const employeeStartIndex = filteredCount ? (employeePage - 1) * EMPLOYEE_PAGE_SIZE + 1 : 0;
  const employeeEndIndex = filteredCount ? Math.min(employeeStartIndex + EMPLOYEE_PAGE_SIZE - 1, filteredCount) : 0;
  const employeeRangeLabel = filteredCount ? `${employeeStartIndex}–${employeeEndIndex}` : "0";
  const canPreviousEmployeePage = employeePage > 1;
  const canNextEmployeePage = employeePage < employeeTotalPages;
  const paginatedProfiles = useMemo(
    () =>
      sortedProfiles.slice(
        (employeePage - 1) * EMPLOYEE_PAGE_SIZE,
        employeePage * EMPLOYEE_PAGE_SIZE
      ),
    [sortedProfiles, employeePage]
  );
  const selectedCount = selectedEmployees.size;
  const allFilteredSelected =
    filteredProfiles.length > 0 &&
    filteredProfiles.every((profile) => selectedEmployees.has(String(profile.employee.id)));
  const allEmployeesSelected = employeeCount > 0 && selectedEmployees.size === employeeCount;

  useEffect(() => {
    const validIds = new Set(catalog.employees.map((employee) => String(employee.id)));
    setSelectedEmployees((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      if (!changed && next.size === prev.size) {
        return prev;
      }
      return next;
    });
  }, [catalog.employees]);

  const toggleEmployeeSelection = (id: string) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectFilteredEmployees = () => {
    if (!filteredProfiles.length) {
      return;
    }
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredProfiles.forEach((profile) => next.delete(String(profile.employee.id)));
      } else {
        filteredProfiles.forEach((profile) => next.add(String(profile.employee.id)));
      }
      return next;
    });
  };

  const selectAllEmployees = () => {
    setSelectedEmployees((prev) => {
      if (prev.size === employeeCount) {
        return new Set();
      }
      return new Set(catalog.employees.map((employee) => String(employee.id)));
    });
  };

  const reanalyzeEmployees = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids.map(String)));
    if (!uniqueIds.length) {
      return;
    }
    setIsAnalyzing(true);
    setAnalysisMessage(`Reprocessando ${uniqueIds.length} colaborador(es)...`);
    const successIds: string[] = [];
    const failureDetails: string[] = [];

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const employeeId = uniqueIds[index];
      setAnalysisMessage(
        `Reprocessando ${index + 1}/${uniqueIds.length} colaborador(es)... (ID ${employeeId})`
      );
      try {
        const response = await fetch(`${API_BASE_URL}/v1/insights`, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ resourceIds: [employeeId] })
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Falha HTTP ${response.status}`);
        }

        const data: InsightResponse = await response.json();

        setInsightState((previous) => {
          const insightMap = new Map(previous.insights.map((insight) => [insight.resourceId, insight]));
          data.insights.forEach((insight) => {
            insightMap.set(insight.resourceId, insight);
          });
          const nextError = data.error ?? (data.usingAzure ? null : previous.error ?? null);
          return {
            generatedAt: data.generatedAt ?? previous.generatedAt ?? new Date().toISOString(),
            usingAzure: data.usingAzure || previous.usingAzure,
            insights: Array.from(insightMap.values()),
            error: nextError,
            model: data.model ?? previous.model,
            latencyMs: data.latencyMs ?? previous.latencyMs,
            rawAzureResponse: data.rawAzureResponse ?? previous.rawAzureResponse
          };
        });

        successIds.push(employeeId);
        if (data.error) {
          failureDetails.push(`ID ${employeeId}: ${data.error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        failureDetails.push(`ID ${employeeId}: ${message}`);
      }
    }

    if (failureDetails.length) {
      setAnalysisMessage(
        `Reprocessamento concluído com avisos. Sucesso: ${successIds.length}. Falhas: ${failureDetails.length}. ${failureDetails[0]}`
      );
    } else {
      setAnalysisMessage(`Reprocessado com sucesso ${successIds.length} colaborador(es).`);
    }
    setIsAnalyzing(false);
  };

  const handleAnalyzeSelected = () => {
    if (!selectedCount || isAnalyzing) {
      return;
    }
    reanalyzeEmployees(Array.from(selectedEmployees));
  };

  const handleAnalyzeEmployee = (id: string) => {
    if (isAnalyzing) {
      return;
    }
    reanalyzeEmployees([id]);
  };

  const closeDetail = () => setDetail(null);
  const openEmployee = (profile: EmployeeProfile) => {
    setDetail({
      type: "employee",
      employee: profile.employee,
      resource: profile.resource,
      insight: profile.insight,
      suggestions: profile.suggestions,
      displaySkills: profile.displaySkills
    });
  };
  const openProject = (project: Project) => {
    const projectNameKey = (project.name ?? project.titulo ?? "").trim().toLowerCase();
    const matches = recommendations.filter(
      (item) =>
        item.projectId === project.id ||
        (projectNameKey && item.projectName?.trim().toLowerCase() === projectNameKey)
    );
    const insightMatches = aiInsights.filter((insight) =>
      insight.suggestedProjects.some(
        (suggested) =>
          (suggested.projectId && suggested.projectId === project.id) ||
          (projectNameKey && suggested.projectName.trim().toLowerCase() === projectNameKey)
      )
    );
    setDetail({
      type: "project",
      project,
      matches,
      insightMatches
    });
  };
  const openManager = (manager: CatalogManager) => {
    const team = [...(managerTeams.get(manager.id) ?? [])].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" })
    );
    setDetail({
      type: "manager",
      manager,
      team
    });
  };
  const managerDistribution = useMemo(() => {
    const tally = new Map<string, { name: string; count: number }>();
    catalog.employees
      .map((employee) => employee.manager?.trim())
      .filter((manager): manager is string => Boolean(manager))
      .forEach((manager) => {
        const key = manager.toLowerCase();
        const entry = tally.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          tally.set(key, { name: manager, count: 1 });
        }
      });

    return [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [catalog.employees]);

  const languageDistribution = useMemo(() => {
    const tally = new Map<string, number>();
    catalog.employees.forEach((employee) => {
      employee.languages?.forEach((language) => {
        const name = language.name?.trim();
        if (!name) {
          return;
        }
        const level = language.level?.trim();
        const key = [name, level].filter(Boolean).join(" – ") || name;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      });
    });
    return [...tally.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [catalog.employees]);

  const formationDistribution = useMemo(() => {
    const tally = new Map<string, number>();
    catalog.employees.forEach((employee) => {
      employee.formations?.forEach((formation) => {
        const level = formation.level?.trim();
        const label = level || formation.name?.trim();
        if (label) {
          tally.set(label, (tally.get(label) ?? 0) + 1);
        }
      });
    });
    return [...tally.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [catalog.employees]);

  const currentAssignments = useMemo(() => {
    const currentMap = new Map<number, { employee: CatalogEmployee; experience: NonNullable<CatalogEmployee["experiences"]>[number] }>();
    catalog.employees.forEach((employee) => {
      employee.experiences?.forEach((experience) => {
        if (experience.current) {
          currentMap.set(employee.id, { employee, experience });
        }
      });
    });
    return [...currentMap.values()].slice(0, 6);
  }, [catalog.employees]);

  const projectMacroAreas = useMemo(
    () => uniqueValues(projects, (project) => project.macroArea),
    [projects]
  );

  const [projectSearch, setProjectSearch] = useState("");
  const [projectMacroAreaFilter, setProjectMacroAreaFilter] = useState<string>("all");
  const [projectComplexity, setProjectComplexity] = useState<Project["complexidade"] | "all">("all");

  const filteredProjects = useMemo(() => {
    const needle = projectSearch.trim().toLowerCase();
    return projects.filter((project) => {
      if (projectMacroAreaFilter !== "all" && project.macroArea !== projectMacroAreaFilter) {
        return false;
      }
      if (projectComplexity !== "all" && project.complexidade !== projectComplexity) {
        return false;
      }
      if (!needle) {
        return true;
      }

      const haystack = [
        project.titulo,
        project.macroArea,
        project.categoriaTecnologica,
        project.observacaoIA,
        project.needs.map((need) => `${need.label} ${need.priority}`).join(" ")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [projects, projectMacroAreaFilter, projectComplexity, projectSearch]);

  const [recommendationSearch, setRecommendationSearch] = useState("");
  const [recommendationMacroArea, setRecommendationMacroArea] = useState<string>("all");
  const [onlyAligned, setOnlyAligned] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState(0);

  const filteredRecommendations = useMemo(() => {
    const needle = recommendationSearch.trim().toLowerCase();
    return recommendations.filter((suggestion) => {
      if (recommendationMacroArea !== "all" && suggestion.macroArea !== recommendationMacroArea) {
        return false;
      }
      if (onlyAligned && !suggestion.coordinationFit) {
          return false;
      }
      if (suggestion.score < scoreThreshold) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const haystack = [
        suggestion.projectName,
        suggestion.resourceName,
        suggestion.macroArea,
        suggestion.matchedSkills.join(" "),
        suggestion.notes
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [recommendations, recommendationMacroArea, onlyAligned, scoreThreshold, recommendationSearch]);

  const totalAvailabilityHours = useMemo(
    () =>
      filteredProfiles.reduce(
        (sum, profile) => sum + (profile.resource?.availabilityHours ?? 0),
        0
      ),
    [filteredProfiles]
  );

  const totalCapacityReference = useMemo(() => {
    const reference = filteredProfiles.length ? filteredProfiles.length * 160 : 160;
    return reference > 0 ? reference : 160;
  }, [filteredProfiles.length]);

  const macroAreaCount = useMemo(() => {
    const set = new Set<string>();
    filteredProfiles.forEach((profile) => {
      if (profile.resource?.macroArea) {
        set.add(profile.resource.macroArea.trim());
      }
    });
    return set.size;
  }, [filteredProfiles]);

  const summaryCards = useMemo(
    () => [
      {
        title: "Colaboradores PRODAM",
        value: String(employeeCount),
        hint: `Fonte: funcionarios.json (${catalog.meta.source})`
      },
      {
        title: "Gerentes catalogados",
        value: String(managerCount),
        hint: "Fonte: managers.json"
      },
      {
        title: "Diretorias mapeadas",
        value: String(directorateCount),
        hint: "Fonte: diretorias.json"
      },
      {
        title: "Areas operacionais",
        value: String(areaCount),
        hint: "Fonte: areas.json"
      },
      {
        title: "Projetos ativos",
        value: String(filteredProjects.length),
        hint: `Mostrando ${filteredProjects.length} de ${projects.length}`
      },
      {
        title: "Capacidade disponivel (colaboradores filtrados)",
        value: formatHours(totalAvailabilityHours),
        hint: `Equivalente a ${formatPercentage(totalAvailabilityHours / totalCapacityReference)} da jornada filtrada`
      },
      {
        title: "Sugestoes AI em aberto",
        value: String(filteredRecommendations.length),
        hint: meta.usingFallback
          ? "Sugestoes simuladas via dataset mock"
          : `Mostrando ${filteredRecommendations.length} de ${recommendations.length}`
      },
      {
        title: "Azure OpenAI",
        value: azureDiagnostics?.connected ? "Disponivel" : "Indisponivel",
        hint: azureStatus.error
          ? azureStatus.error
          : azureDiagnostics
          ? [
              azureDiagnostics.model ? `Modelo ${azureDiagnostics.model}` : "Modelo nd",
              typeof azureDiagnostics.latencyMs === "number"
                ? `Latencia ${Math.round(azureDiagnostics.latencyMs)} ms`
                : "Latencia nd",
              azureCheckedAt ? `Verificado ${azureCheckedAt}` : null
            ]
              .filter(Boolean)
              .join(" • ")
          : "Clique em &quot;Reexecutar diagnostico&quot; para validar a conexao com Azure."
      },
      {
        title: "Insights Azure OpenAI",
        value: String(aiInsights.length),
        hint: insightState.usingAzure
          ? `Gerado em ${insightsGeneratedAt}`
          : insightState.error ?? "Azure OpenAI nao configurado."
      }
    ],
    [
      employeeCount,
      catalog.meta.source,
      managerCount,
      directorateCount,
      areaCount,
      filteredProjects.length,
      projects.length,
      totalAvailabilityHours,
      totalCapacityReference,
      filteredRecommendations.length,
      recommendations.length,
      meta.usingFallback,
      aiInsights.length,
      insightState.usingAzure,
      insightsGeneratedAt,
      insightState.error,
      azureDiagnostics?.connected,
      azureDiagnostics?.model,
      azureDiagnostics?.latencyMs,
      azureStatus.error,
      azureCheckedAt
    ]
  );

  return (
    <>
      {detail ? (
        <div className="modal-backdrop" onClick={closeDetail}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={closeDetail}>
              Fechar
            </button>
            {detail.type === "employee" ? (
              <div className="detail-content">
                <h2>{detail.employee.displayName}</h2>
                <p className="muted">
                  Matrícula {detail.employee.registration} • ID {detail.employee.id}
                </p>
                <div className="detail-grid">
                  <section className="detail-section">
                    <h3>Informações gerais</h3>
                    <ul className="detail-list">
                      <li>
                        <strong>Cargo:</strong> {detail.employee.role ?? "Não informado"}
                      </li>
                      <li>
                    <strong>Gestor:</strong>{" "}
                    {detail.employee.manager ? detail.employee.manager.trim() : "Não informado"}
                      </li>
                      <li>
                        <strong>E-mail:</strong> {detail.employee.email ?? "Não informado"}
                      </li>
                      <li>
                        <strong>Telefone:</strong> {detail.employee.phone ?? "Não informado"}
                      </li>
                      <li>
                        <strong>Nascimento:</strong> {detail.employee.birthDate ?? "Não informado"}
                      </li>
                      {detail.employee.scrapedAt ? (
                        <li>
                          <strong>Atualizado em:</strong> {formatDateTime(detail.employee.scrapedAt)}
                        </li>
                      ) : null}
                    </ul>
                    {detail.employee.languages && detail.employee.languages.length ? (
                      <>
                        <h4>Idiomas</h4>
                        <ul className="detail-list">
                          {detail.employee.languages.map((language, index) => (
                            <li key={`${detail.employee.id}-language-${index}`}>
                              {language.name}
                              {language.level ? ` – ${language.level}` : ""}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    {detail.employee.formations && detail.employee.formations.length ? (
                      <>
                        <h4>Formação</h4>
                        <ul className="detail-list">
                          {detail.employee.formations.map((formation, index) => (
                            <li key={`${detail.employee.id}-formation-${index}`}>
                              {formation.level ? `${formation.level} – ` : ""}
                              {formation.name}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </section>
                  {detail.resource ? (
                    <section className="detail-section">
                      <h3>Disponibilidade e competências</h3>
                      <ul className="detail-list">
                        <li>
                          <strong>Coordenação:</strong> {detail.resource.coordination ?? "Não informado"}
                        </li>
                        <li>
                          <strong>Macroárea:</strong> {detail.resource.macroArea ?? "Não informado"}
                        </li>
                      <li>
                        <strong>Disponibilidade:</strong>{" "}
                        {formatPercentage(detail.resource.availability ?? 0)} (
                        {formatHours(detail.resource.availabilityHours ?? 0)})
                      </li>
                    </ul>
                      {detail.resource.notes ? <p className="muted">{detail.resource.notes}</p> : null}
                      {detail.resource.preferredTechs && detail.resource.preferredTechs.length ? (
                        <p className="muted">
                          Tecnologias-chave: {detail.resource.preferredTechs.slice(0, 6).join(", ")}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                  {detail.displaySkills.length ? (
                    <section className="detail-section">
                      <h3>Competências mapeadas</h3>
                      <ul className="pill-group">
                        {detail.displaySkills.slice(0, 20).map((skill, index) => (
                          <li className={`pill pill-${skill.source}`} key={`${detail.employee.id}-${skill.id}-${index}`}>
                            {skill.name}
                            {skill.source !== "insight" && skill.source !== "gap" && skill.level ? (
                              <span className="pill-badge">{skill.level}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {detail.displaySkills.some((skill) => skill.source === "gap") ? (
                        <p className="muted">
                          Aprimorar:{" "}
                          {detail.displaySkills
                            .filter((skill) => skill.source === "gap")
                            .map((skill) => skill.name)
                            .join(", ")}
                        </p>
                      ) : null}
                      {detail.displaySkills.some((skill) => skill.source === "insight") &&
                      !detail.displaySkills.some(
                        (skill) => skill.source === "competencia" || skill.source === "tecnologia"
                      ) ? (
                        <p className="muted">
                          Skills observadas pela IA:{" "}
                          {detail.displaySkills
                            .filter((skill) => skill.source === "insight")
                            .map((skill) => skill.name)
                            .join(", ")}
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                  {detail.employee.experiences && detail.employee.experiences.length ? (
                    <section className="detail-section">
                      <h3>Experiências</h3>
                      <ul className="detail-list">
                        {detail.employee.experiences.map((experience, index) => (
                          <li key={`${detail.employee.id}-experience-${index}`}>
                            <strong>{experience.role}</strong>
                            {experience.company ? ` • ${experience.company}` : ""}
                            <span className="muted">
                              {experience.start ?? "Início não informado"}{" "}
                              {experience.current ? " - Atual" : experience.end ? ` - ${experience.end}` : ""}
                            </span>
                            {experience.description ? <p className="muted">{experience.description}</p> : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {detail.suggestions.length ? (
                    <section className="detail-section">
                      <h3>Projetos recomendados (matching interno)</h3>
                      <ul className="detail-list">
                        {detail.suggestions.map((suggestion, index) => (
                          <li key={`${detail.employee.id}-suggestion-${index}`}>
                            <strong>{suggestion.projectName}</strong> – Score {formatScore(suggestion.score)}%
                            <span className="muted">
                              Skills alinhadas: {suggestion.matchedSkills.join(", ") || "Nenhuma"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  {detail.insight ? (
                    <section className="detail-section">
                      <h3>Insights da Azure OpenAI</h3>
                      <p className="muted">{detail.insight.summary}</p>
                      {detail.insight.suggestedProjects.length ? (
                        <>
                          <h4>Projetos sugeridos</h4>
                          <ul className="detail-list">
                            {detail.insight.suggestedProjects.map((project, index) => (
                              <li key={`${detail.employee.id}-insight-project-${index}`}>
                                <strong>{project.projectName}</strong>
                                <span className="muted">{project.rationale}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {detail.insight.developmentIdeas.length ? (
                        <>
                          <h4>Desenvolvimento recomendado</h4>
                          <ul className="detail-list">
                            {detail.insight.developmentIdeas.map((idea, index) => (
                              <li key={`${detail.employee.id}-idea-${index}`}>{idea}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              </div>
            ) : detail.type === "project" ? (
              <div className="detail-content">
                <h2>{detail.project.titulo ?? detail.project.name}</h2>
                <p className="muted">
                  Projeto ID {detail.project.id}
                  {detail.project.coordination ? ` • Coordenação ${detail.project.coordination}` : ""}
                </p>
                <div className="detail-grid">
                  <section className="detail-section">
                    <h3>Descrição</h3>
                    <ul className="detail-list">
                      <li>
                        <strong>Macroárea:</strong> {detail.project.macroArea ?? detail.project.coordination ?? "-"}
                      </li>
                      <li>
                        <strong>Complexidade:</strong> {detail.project.complexidade}
                      </li>
                      <li>
                        <strong>Equipe ideal:</strong> {detail.project.equipeIdeal ?? "Não informada"}
                      </li>
                    </ul>
                    {detail.project.needs.length ? (
                      <>
                        <h4>Perfis necessários</h4>
                        <ul className="pill-group">
                          {detail.project.needs.map((need, index) => (
                            <li className="pill" key={`${detail.project.id}-need-${index}`}>
                              {need.label}
                              <span className={priorityClass(need.priority)}>{priorityLabel(need.priority)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </section>
                  <section className="detail-section">
                    <h3>Matching interno</h3>
                    {detail.matches.length ? (
                      <ul className="detail-list">
                        {detail.matches.slice(0, 12).map((match, index) => (
                          <li key={`${detail.project.id}-match-${index}`}>
                            <strong>{match.resourceName}</strong> – Score {formatScore(match.score)}%
                            <span className="muted">
                              Skills cobertas: {match.matchedSkills.join(", ") || "Nenhuma"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Nenhum colaborador associado até o momento.</p>
                    )}
                  </section>
                  <section className="detail-section">
                    <h3>Insights Azure OpenAI</h3>
                    {detail.insightMatches.length ? (
                      <ul className="detail-list">
                        {detail.insightMatches.map((insight, index) => (
                          <li key={`${detail.project.id}-insight-${index}`}>
                            <strong>{insight.resourceName}</strong>
                            <span className="muted">{insight.summary}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">Nenhuma recomendação da IA para este projeto ainda.</p>
                    )}
                  </section>
                </div>
              </div>
            ) : (
              <div className="detail-content">
                <h2>{detail.manager.displayName}</h2>
                <p className="muted">
                  Gestor ID {detail.manager.id} • Iniciais {detail.manager.initials}
                </p>
                <div className="detail-section">
                  <h3>Equipe ({detail.team.length})</h3>
                  {detail.team.length ? (
                    <ul className="detail-list">
                      {detail.team.map((member) => {
                        const memberProfile = profileByEmployeeId.get(String(member.id));
                        return (
                          <li key={member.id}>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => memberProfile && openEmployee(memberProfile)}
                              disabled={!memberProfile}
                            >
                              {member.displayName}
                            </button>
                            {member.role ? <span className="muted"> • {member.role.trim()}</span> : null}
                            {!memberProfile ? (
                              <span className="muted"> • Perfil nao encontrado nos dados atuais</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="muted">Nenhum colaborador associado a este gestor nos dados atuais.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <main className="page">
        <header className="page-header">
          <div>
            <p className="context-badge">ProdAM Resource Intelligence</p>
            <h1>Gestao ativa de talentos e demandas</h1>
        </div>
        <p className="lead">
          Consolide dados de competencias, disponibilidade e necessidades de projetos para que a IA recomende alocacoes
          eficazes, reduzindo gargalos e acelerando entregas.
        </p>
      </header>

      {meta.error ? <div className="notice">{meta.error}</div> : null}

      <section className="summary-grid">
        {summaryCards.map((card) => (
          <SummaryCard key={card.title} title={card.title} value={card.value} hint={card.hint} />
        ))}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Diagnostico Azure OpenAI</h2>
          <span className="panel-subtitle">
            Monitore a disponibilidade e latencia do modelo utilizado para gerar os insights de alocacao.
          </span>
        </div>
        <div className="table-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={refreshAzureStatus}
            disabled={azureStatus.loading}
          >
            {azureStatus.loading ? "Verificando..." : "Reexecutar diagnostico"}
          </button>
          {azureCheckedAt ? <span className="panel-meta">Ultima verificacao: {azureCheckedAt}</span> : null}
        </div>
        {azureStatus.error ? <div className="notice notice-error">{azureStatus.error}</div> : null}
        {azureDiagnostics ? (
          <div className="diagnostic-card">
            <div className="diagnostic-metrics">
              <span className={azureDiagnostics.connected ? "badge badge-success" : "badge badge-error"}>
                {azureDiagnostics.connected ? "Conectado" : "Indisponivel"}
              </span>
              {azureDiagnostics.model ? <span className="badge">Modelo: {azureDiagnostics.model}</span> : null}
              {typeof azureDiagnostics.latencyMs === "number" ? (
                <span className="badge">Latencia: {Math.round(azureDiagnostics.latencyMs)} ms</span>
              ) : null}
            </div>
            {azureDiagnostics.sample ? (
              <p className="muted">
                <strong>Resposta exemplo:</strong> {truncate(azureDiagnostics.sample, 180)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            Clique em &quot;Reexecutar diagnostico&quot; para validar a conexao com Azure OpenAI.
          </div>
        )}
      </section>

      {meta.catalogFallback ? (
        <div className="notice">
          {meta.catalogError ??
            "Catalogo PRODAM nao carregado. Utilize os arquivos JSON atualizados para liberar os dados completos."}
        </div>
      ) : null}

      {effectiveInsightsError && !aiInsights.length ? <div className="notice">{effectiveInsightsError}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Colaboradores PRODAM</h2>
          <span className="panel-subtitle">
            Exibindo {filteredCount} de {employeeCount} registros. Use a busca estruturada para alimentar o motor de IA.
          </span>
        </div>
        <div className="panel-meta">
          Fonte: funcionarios.json | Snapshot: {catalogGeneratedAt} • Página {employeePage} de {employeeTotalPages} ({employeeRangeLabel} de {filteredCount}) • Macroareas ativas: {macroAreaCount}
        </div>
        <div className="table-actions">
          <button
            type="button"
            className="action-button"
            onClick={handleAnalyzeSelected}
            disabled={!selectedCount || isAnalyzing}
          >
            {isAnalyzing ? "Processando..." : `Analisar selecionados (${selectedCount})`}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={selectFilteredEmployees}
            disabled={!filteredCount}
          >
            {allFilteredSelected ? "Desmarcar filtrados" : "Selecionar filtrados"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={selectAllEmployees}
            disabled={!employeeCount}
          >
            {allEmployeesSelected ? "Limpar seleção total" : "Selecionar todos"}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedEmployees(new Set())}
            disabled={!selectedCount}
          >
            Limpar seleção
          </button>
        </div>
        {analysisMessage ? <p className="analysis-status">{analysisMessage}</p> : null}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Selecionar</th>
                <th>Matricula</th>
                <th>Colaborador</th>
                <th>Contato</th>
                <th>Perfil</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProfiles.length ? (
                paginatedProfiles.map((profile) => {
                  const { employee, resource, displaySkills } = profile;
                  const employeeId = String(employee.id);
                  const isSelected = selectedEmployees.has(employeeId);
                  const insightSkillHighlights = displaySkills.filter((skill) => skill.source === "insight");
                  const insightSkillGaps = displaySkills.filter((skill) => skill.source === "gap");
                  const baseSkillCount = displaySkills.filter(
                    (skill) => skill.source === "competencia" || skill.source === "tecnologia"
                  ).length;
                  const hasInsightHighlights = insightSkillHighlights.length > 0;
                  const hasInsightGaps = insightSkillGaps.length > 0;
                  return (
                    <tr key={employee.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="row-checkbox"
                          checked={isSelected}
                          onChange={() => toggleEmployeeSelection(employeeId)}
                        />
                      </td>
                      <td>
                        <strong>{employee.registration}</strong>
                        <span className="muted">ID interno: {employee.id}</span>
                      </td>
                      <td>
                        <strong>
                          <button type="button" className="link-button" onClick={() => openEmployee(profile)}>
                            {employee.displayName}
                          </button>
                        </strong>
                        {employee.role ? <span className="muted">Cargo: {employee.role}</span> : null}
                        {employee.manager ? <span className="muted">Gestor: {employee.manager.trim()}</span> : null}
                        <span className="muted">Iniciais: {employee.initials}</span>
                      </td>
                      <td>
                        {employee.email ? <span className="muted">{employee.email}</span> : <span className="muted">-</span>}
                        {employee.phone ? <span className="muted">{employee.phone}</span> : null}
                        {employee.birthDate ? <span className="muted">Nascimento: {employee.birthDate}</span> : null}
                      </td>
                      <td>
                        <span>{formatPercentage(resource?.availability ?? 0)}</span>
                        <span className="muted">
                          {resource
                            ? `${formatHours(resource.availabilityHours ?? 0)} disponiveis`
                            : "Disponibilidade nao registrada"}
                        </span>
                        <span className={employee.isManager ? "tag tag-high" : "tag tag-neutral"}>
                          {employee.isManager ? "Gerente" : "Equipe tecnica"}
                        </span>
                        {employee.languages && employee.languages.length ? (
                          <span className="muted">
                            Idiomas:{" "}
                            {employee.languages
                              .map((language) => [language.name, language.level].filter(Boolean).join(" - "))
                              .join(", ")}
                          </span>
                        ) : null}
                        {employee.formations && employee.formations.length ? (
                          <span className="muted">
                            Formacao:{" "}
                            {employee.formations
                              .slice(0, 2)
                              .map((formation) => formation.name)
                              .join(", ")}
                            {employee.formations.length > 2 ? " ..." : ""}
                          </span>
                        ) : null}
                        {profile.insight?.summary ? (
                          <span className="muted">Insight IA: {truncate(profile.insight.summary, 160)}</span>
                        ) : null}
                        {profile.suggestions.length ? (
                          <span className="muted">
                            Matching interno:{" "}
                            {profile.suggestions
                              .slice(0, 3)
                              .map((suggestion) => suggestion.projectName || suggestion.projectId)
                              .join(", ")}
                          </span>
                        ) : null}
                        {resource?.preferredTechs && resource.preferredTechs.length ? (
                          <p className="muted">Tecnologias-chave: {resource.preferredTechs.join(", ")}</p>
                        ) : null}
                        {hasInsightGaps ? (
                          <p className="muted">
                            Aprimorar: {insightSkillGaps.slice(0, 6).map((skill) => skill.name).join(", ")}
                          </p>
                        ) : null}
                        {hasInsightHighlights && baseSkillCount === 0 ? (
                          <p className="muted">
                            Skills observadas: {insightSkillHighlights.slice(0, 6).map((skill) => skill.name).join(", ")}
                          </p>
                        ) : null}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleAnalyzeEmployee(employeeId)}
                          disabled={isAnalyzing}
                        >
                          Reanalisar
                        </button>
                      </td>
                  </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      Nenhum colaborador encontrado. Ajuste os filtros ou atualize funcionarios.json.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <button
            type="button"
            className="pagination-button"
            disabled={!canPreviousEmployeePage}
            onClick={() => setEmployeePage((page) => Math.max(1, page - 1))}
          >
            ← Anterior
          </button>
          <span className="pagination-status">
            Página {employeePage} de {employeeTotalPages}
          </span>
          <button
            type="button"
            className="pagination-button"
            disabled={!canNextEmployeePage}
            onClick={() => setEmployeePage((page) => Math.min(employeeTotalPages, page + 1))}
          >
            Próxima →
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Gestores e equipes</h2>
          <span className="panel-subtitle">
            Clique para visualizar a equipe completa e identificar necessidades ou excesso de alocacao.
          </span>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Gestor</th>
                <th>Equipe</th>
              </tr>
            </thead>
            <tbody>
              {managerList.length ? (
                managerList.slice(0, 20).map(({ manager, teamSize }) => (
                  <tr key={manager.id}>
                    <td>
                      <button type="button" className="link-button" onClick={() => openManager(manager)}>
                        {manager.displayName}
                      </button>
                      <span className="muted">ID: {manager.id}</span>
                    </td>
                    <td>
                      <span className="muted">{teamSize} colaboradores cadastrados</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    <div className="empty-state">Nenhum gestor cadastrado nos dados atuais.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Estrutura organizacional PRODAM</h2>
          <span className="panel-subtitle">
            Diretorias, areas e funcoes catalogadas para enriquecer prompts e regras de alocacao.
          </span>
        </div>
        <div className="catalog-grid">
          <div className="catalog-column">
            <header className="catalog-column-header">
              <h3>Diretorias ({directorateCount})</h3>
            </header>
            <ul className="catalog-list">
              {spotlightDirectorates.length ? (
                spotlightDirectorates.map((item) => (
                  <li key={item.id}>
                    <strong>{item.displayName}</strong>
                    {item.code ? <span className="muted">Codigo: {item.code}</span> : null}
                  </li>
                ))
              ) : (
                <li className="catalog-empty">Atualize diretorias.json para alimentar esta visao.</li>
              )}
            </ul>
          </div>
          <div className="catalog-column">
            <header className="catalog-column-header">
              <h3>Areas ({areaCount})</h3>
            </header>
            <ul className="catalog-list">
              {spotlightAreas.length ? (
                spotlightAreas.map((item) => (
                  <li key={item.id}>
                    <strong>{item.displayName}</strong>
                    {item.code ? <span className="muted">Codigo: {item.code}</span> : null}
                  </li>
                ))
              ) : (
                <li className="catalog-empty">areas.json vazio. Inclua as areas para habilitar recomendações.</li>
              )}
            </ul>
          </div>
          <div className="catalog-column">
            <header className="catalog-column-header">
              <h3>Funcoes ({jobCount})</h3>
            </header>
            <ul className="catalog-list">
              {spotlightJobs.length ? (
                spotlightJobs.map((item) => (
                  <li key={item.id}>
                    <strong>{item.displayName}</strong>
                    <span className="muted">
                      Familia: {item.family}
                      {item.level ? ` • Nivel ${item.level}` : ""}
                    </span>
                  </li>
                ))
              ) : (
                <li className="catalog-empty">jobs.json vazio. Cadastre as funcoes para alimentar o motor.</li>
              )}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recomendacoes personalizadas (Azure OpenAI)</h2>
        <span className="panel-subtitle">
          Sugestoes de alocacao e desenvolvimento geradas automaticamente com base nos dados mais recentes do
          catalogo. Utilize como insumo para avaliacoes de gestores.
        </span>
      </div>
      <div className="panel-meta">
          {insightState.usingAzure
            ? `Ultima execucao: ${insightsGeneratedAt}`
            : "Azure OpenAI desabilitado. Configure as credenciais para habilitar as recomendacoes."}
      </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Resumo</th>
                <th>Projetos sugeridos</th>
                <th>Desenvolvimento</th>
              </tr>
            </thead>
            <tbody>
              {aiInsights.length ? (
                aiInsights.slice(0, 20).map((insight) => (
                  <tr key={insight.resourceId}>
                    <td>
                      <strong>{insight.resourceName}</strong>
                      <span className="muted">ID: {insight.resourceId}</span>
                    </td>
                    <td>
                      <p className="muted">{insight.summary}</p>
                    </td>
                    <td>
                      <ul className="bullet-list">
                        {insight.suggestedProjects.map((project, index) => (
                          <li key={`${insight.resourceId}-project-${index}`}>
                            <strong>{project.projectName}</strong>
                            <span className="muted">{project.rationale}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <ul className="bullet-list">
                        {insight.developmentIdeas.map((idea, index) => (
                          <li key={`${insight.resourceId}-idea-${index}`}>
                            <span className="muted">{idea}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      Nenhum insight gerado. Confirme a execucao do scraper, as credenciais Azure e tente novamente.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Insights organizacionais</h2>
          <span className="panel-subtitle">
            Distribuicoes calculadas com base nos dados enriquecidos do Umanni. Utilize para priorizar gaps de lingua,
            gestao e formacao.
          </span>
        </div>
        <div className="insight-grid">
          <article className="insight-card">
            <h3>Gestores com mais talentos</h3>
            <ul>
              {managerDistribution.length ? (
                managerDistribution.map((item) => (
                  <li key={item.name}>
                    <strong>{item.name}</strong>
                    <span className="muted">{item.count} pessoas catalogadas</span>
                  </li>
                ))
              ) : (
                <li className="catalog-empty">Nenhum gestor identificado nos dados recentes.</li>
              )}
            </ul>
          </article>
          <article className="insight-card">
            <h3>Idiomas declarados</h3>
            <ul>
              {languageDistribution.length ? (
                languageDistribution.map((item) => (
                  <li key={item.label}>
                    <strong>{item.label}</strong>
                    <span className="muted">{item.count} colaboradores</span>
                  </li>
                ))
              ) : (
                <li className="catalog-empty">Nenhum idioma informado nas fichas.</li>
              )}
            </ul>
          </article>
          <article className="insight-card">
            <h3>Niveis de formacao</h3>
            <ul>
              {formationDistribution.length ? (
                formationDistribution.map((item) => (
                  <li key={item.label}>
                    <strong>{item.label}</strong>
                    <span className="muted">{item.count} registros</span>
                  </li>
                ))
              ) : (
                <li className="catalog-empty">Atualize os dados de formacao para visualizar esta distribuicao.</li>
              )}
            </ul>
          </article>
          <article className="insight-card">
            <h3>Experiencias em andamento</h3>
            <ul>
              {currentAssignments.length ? (
                currentAssignments.map(({ employee, experience }) => (
                  <li key={employee.id}>
                    <strong>{employee.displayName}</strong>
                    <span className="muted">
                      {experience.role}
                      {experience.company ? ` • ${experience.company}` : ""}
                    </span>
                  </li>
                ))
              ) : (
                <li className="catalog-empty">Nenhuma experiencia marcada como atual foi encontrada.</li>
              )}
            </ul>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Profissionais e competencias</h2>
          <span className="panel-subtitle">
            Atualize dados periodicamente para manter as sugestoes precisas e priorizar as squads certas.
          </span>
        </div>

        <div className="filters">
          <div className="filters-row">
            <label className="filter-field">
              <span>Busca por nome, skill ou tecnologia</span>
              <input
                className="input-control"
                placeholder="Ex.: dados, mobilidade, devops"
                value={resourceSearch}
                onChange={(event) => setResourceSearch(event.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>Macroarea</span>
              <select
                className="input-control"
                value={resourceMacroArea}
                onChange={(event) => setResourceMacroArea(event.target.value)}
              >
                <option value="all">Todas</option>
                {macroAreaOptions.map((macroArea) => (
                  <option key={macroArea} value={macroArea}>
                    {macroArea}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Senioridade</span>
              <select
                className="input-control"
                value={resourceSeniority}
                onChange={(event) => setResourceSeniority(event.target.value as (typeof SENIORITY_OPTIONS)[number])}
              >
                {SENIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "Todas" : seniorityLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="panel-meta">
            Mostrando {filteredCount} de {employeeCount} profissionais catalogados • Macroareas ativas: {macroAreaCount}
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Macroarea</th>
                <th>Disponibilidade</th>
                <th>Competencias e tecnologias</th>
              </tr>
            </thead>
            <tbody>
              {sortedProfiles.length ? (
                sortedProfiles.map((profile) => {
                  return (
                <tr key={profile.employee.id}>
                  <td>
                    <strong>
                      <button type="button" className="link-button" onClick={() => openEmployee(profile)}>
                        {profile.employee.displayName}
                      </button>
                    </strong>
                    <span className="muted">
                      Senioridade:{" "}
                      {profile.resource ? seniorityLabel(profile.resource.seniority) : "Não informada"}
                    </span>
                    {profile.employee.manager ? (
                      <span className="muted">Gestor: {profile.employee.manager.trim()}</span>
                    ) : null}
                    {profile.insight?.summary ? (
                      <span className="muted">{truncate(profile.insight.summary, 160)}</span>
                    ) : null}
                  </td>
                  <td>
                    <span>{profile.resource?.macroArea?.trim() ?? "Macroárea não informada"}</span>
                    <span className="muted">
                      {profile.resource?.department?.trim() ?? "Departamento não informado"}
                    </span>
                  </td>
                  <td>
                    <span>{formatPercentage(profile.resource?.availability ?? 0)}</span>
                    <span className="muted">
                      {profile.resource
                        ? `${formatHours(profile.resource.availabilityHours ?? 0)} disponiveis`
                        : "Disponibilidade nao registrada"}
                    </span>
                  </td>
                  <td>
                    <ul className="pill-group">
                      {profile.displaySkills.length ? (
                        profile.displaySkills.slice(0, 12).map((skill, index) => (
                          <li className={`pill pill-${skill.source}`} key={`${profile.employee.id}-${skill.id}-${index}`}>
                            {skill.name}
                            {skill.source !== "insight" && skill.source !== "gap" && skill.level ? (
                              <span className="pill-badge">{skill.level}</span>
                            ) : null}
                          </li>
                        ))
                      ) : (
                        <li className="pill pill-empty">Sem skills mapeadas</li>
                      )}
                    </ul>
                    {profile.resource?.preferredTechs && profile.resource.preferredTechs.length ? (
                      <span className="muted">
                        Tecnologias-chave: {profile.resource.preferredTechs.slice(0, 8).join(", ")}
                      </span>
                    ) : null}
                    {profile.displaySkills.some((skill) => skill.source === "gap") ? (
                      <span className="muted">
                        Aprimorar:{" "}
                        {profile.displaySkills
                          .filter((skill) => skill.source === "gap")
                          .slice(0, 8)
                          .map((skill) => skill.name)
                          .join(", ")}
                      </span>
                    ) : null}
                    {profile.displaySkills.some((skill) => skill.source === "insight") &&
                    !profile.displaySkills.some(
                      (skill) => skill.source === "competencia" || skill.source === "tecnologia"
                    ) ? (
                      <span className="muted">
                        Skills observadas:{" "}
                        {profile.displaySkills
                          .filter((skill) => skill.source === "insight")
                          .slice(0, 8)
                          .map((skill) => skill.name)
                          .join(", ")}
                      </span>
                    ) : null}
                    {profile.insight?.suggestedProjects.length ? (
                      <span className="muted">
                        IA sugere:{" "}
                        {profile.insight.suggestedProjects
                          .slice(0, 3)
                          .map((project) => project.projectName || project.projectId || "Projeto não identificado")
                          .join(", ")}
                      </span>
                    ) : null}
                    {profile.suggestions.length ? (
                      <span className="muted">
                        Matching interno:{" "}
                        {profile.suggestions
                          .slice(0, 5)
                          .map((suggestion) => suggestion.projectName || suggestion.projectId)
                          .join(", ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      Nenhum perfil encontrado. Ajuste os filtros para visualizar competencias.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Demandas de projetos</h2>
          <span className="panel-subtitle">
            Identifique lacunas de competencias para planejar realocacoes e reforco de squads estrategicas.
          </span>
        </div>

        <div className="filters">
          <div className="filters-row">
            <label className="filter-field">
              <span>Busca por projeto ou necessidade</span>
              <input
                className="input-control"
                placeholder="Ex.: geoprocessamento, infraestrutura"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>Macroarea</span>
              <select
                className="input-control"
                value={projectMacroAreaFilter}
                onChange={(event) => setProjectMacroAreaFilter(event.target.value)}
              >
                <option value="all">Todas</option>
                {projectMacroAreas.map((macroArea) => (
                  <option key={macroArea} value={macroArea}>
                    {macroArea}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Complexidade</span>
              <select
                className="input-control"
                value={projectComplexity}
                onChange={(event) => setProjectComplexity(event.target.value as Project["complexidade"] | "all")}
              >
                <option value="all">Todas</option>
                <option value="Alta">Alta</option>
                <option value="Media">Media</option>
                <option value="Baixa">Baixa</option>
                <option value="Indefinida">Indefinida</option>
              </select>
            </label>
          </div>
          <div className="panel-meta">
            Mostrando {filteredProjects.length} de {projects.length} demandas mapeadas
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Macroarea</th>
                <th>Perfis necessarios</th>
                <th>Equipe ideal</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project, index) => (
                <tr key={`${project.id}-${index}`}>
                  <td>
                    <strong>
                      <button type="button" className="link-button" onClick={() => openProject(project)}>
                        {project.titulo}
                      </button>
                    </strong>
                    <span className="muted">{project.categoriaTecnologica}</span>
                  </td>
                  <td>
                    <span>{project.macroArea}</span>
                    <span className={complexityClass(project.complexidade)}>{project.complexidade}</span>
                  </td>
                  <td>
                    <ul className="pill-group">
                      {project.needs.map((need, index) => (
                        <li className="pill" key={`${project.id}-${need.skillId}-${index}`}>
                          {need.label}
                          <span className={priorityClass(need.priority)}>{priorityLabel(need.priority)}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <span>{project.equipeIdeal}</span>
                    {project.observacaoIA ? <span className="muted">{project.observacaoIA}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Recomendacoes da IA</h2>
          <span className="panel-subtitle">
            Valide as sugestoes, registre feedback e utilize como insumo para realocacao ou reforco pontual.
          </span>
        </div>

        <div className="filters">
          <div className="filters-row">
            <label className="filter-field">
              <span>Busca por projeto, profissional ou skill</span>
              <input
                className="input-control"
                placeholder="Ex.: mobilidade, dados, devops"
                value={recommendationSearch}
                onChange={(event) => setRecommendationSearch(event.target.value)}
              />
            </label>
            <label className="filter-field">
              <span>Macroarea</span>
              <select
                className="input-control"
                value={recommendationMacroArea}
                onChange={(event) => setRecommendationMacroArea(event.target.value)}
              >
                <option value="all">Todas</option>
                {projectMacroAreas.map((macroArea) => (
                  <option key={macroArea} value={macroArea}>
                    {macroArea}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span>Score minimo</span>
              <select
                className="input-control"
                value={String(scoreThreshold)}
                onChange={(event) => setScoreThreshold(Number.parseFloat(event.target.value))}
              >
                {SCORE_STEPS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={onlyAligned}
                onChange={(event) => setOnlyAligned(event.target.checked)}
              />
              <span>Somente macroareas alinhadas</span>
            </label>
          </div>
          <div className="panel-meta">
            Mostrando {filteredRecommendations.length} de {recommendations.length} sugestoes de alocacao
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Profissional</th>
                <th>Skills alinhadas</th>
                <th>Score geral</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecommendations.length ? (
                filteredRecommendations.map((suggestion) => (
                  <tr key={`${suggestion.projectId}-${suggestion.resourceId}`}>
                    <td>
                      <strong>{suggestion.projectName}</strong>
                      <span className="muted">{suggestion.macroArea}</span>
                    </td>
                    <td>
                      <strong>{suggestion.resourceName}</strong>
                      <span className="muted">
                        {suggestion.coordinationFit ? "Macroarea alinhada" : "Macroarea distinta"}
                      </span>
                    </td>
                    <td>
                      <ul className="pill-group">
                        {suggestion.matchedSkills.length ? (
                          suggestion.matchedSkills.map((skill) => (
                            <li className="pill" key={`${suggestion.resourceId}-${skill}`}>
                              {skill}
                            </li>
                          ))
                        ) : (
                          <li className="pill pill-empty">Nenhuma skill mapeada</li>
                        )}
                      </ul>
                    </td>
                    <td>{formatScore(suggestion.score)}%</td>
                    <td>
                      <div className="trend">
                        <span>Skills: {formatScore(suggestion.matchDetail.skillCoverage)}%</span>
                        <span>Disponibilidade: {formatScore(suggestion.matchDetail.availabilityScore)}%</span>
                        <span>Macroarea: {formatScore(suggestion.matchDetail.coordinationScore)}%</span>
                        {suggestion.notes ? <span className="muted">{suggestion.notes}</span> : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      Nenhuma sugestao pendente com os filtros atuais. Ajuste os criterios ou execute{" "}
                      <code>bun run dev:api</code> para gerar novas recomendacoes.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
    </>
  );
}
