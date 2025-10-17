import { Dashboard } from "./components/dashboard";

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
  formations: Array<{
    name: string;
    level?: string;
    institution?: string;
  }>;
  experiences: Array<{
    role: string;
    company?: string;
    current?: boolean;
  }>;
  languages: Array<{
    name: string;
    level?: string;
  }>;
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

type InsightResponse = {
  generatedAt: string;
  usingAzure: boolean;
  model?: string;
  latencyMs?: number;
  insights: InsightSuggestion[];
  error?: string;
  rawAzureResponse?: unknown;
};

type DashboardData = {
  resources: Resource[];
  projects: Project[];
  recommendations: Recommendation[];
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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const catalogFallback: CatalogOverview = {
  areas: [],
  directorates: [],
  jobs: [],
  managers: [],
  employees: [],
  meta: {
    source: "fallback",
    generatedAt: new Date().toISOString(),
    error: "Catalogo PRODAM nao carregado."
  }
};

async function fetchFromApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar ${path}: ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function loadDashboard(): Promise<DashboardData> {
  let resources: Resource[] = [];
  let projects: Project[] = [];
  let recommendations: Recommendation[] = [];
  let usingFallback = false;
  let datasetError: string | undefined;

  let insights: InsightResponse = {
    generatedAt: new Date().toISOString(),
    usingAzure: false,
    insights: [],
    error: "Insights ainda nao processados."
  };

  try {
    const [remoteResources, remoteProjects, remoteRecommendations] = await Promise.all([
      fetchFromApi<Resource[]>("/v1/resources"),
      fetchFromApi<Project[]>("/v1/projects"),
      fetchFromApi<Recommendation[]>("/v1/recommendations")
    ]);

    resources = remoteResources;
    projects = remoteProjects;
    recommendations = remoteRecommendations;
  } catch (error) {
    usingFallback = true;
    datasetError =
      error instanceof Error ? error.message : "Falha desconhecida ao acessar os dados de recursos/projetos.";
    console.error("[dashboard] Erro ao buscar dados principais:", error);
  }

  let catalog = catalogFallback;
  let catalogFallbackFlag = false;
  let catalogError: string | undefined;

  try {
    const remoteCatalog = await fetchFromApi<CatalogOverview>("/v1/catalog/overview");
    catalog = remoteCatalog;
    if (remoteCatalog.meta?.error) {
      catalogFallbackFlag = true;
      catalogError = remoteCatalog.meta.error;
    }
  } catch (error) {
    catalogFallbackFlag = true;
    catalogError = error instanceof Error ? error.message : "Falha desconhecida ao carregar catalogo PRODAM.";
    console.error("[dashboard] Erro ao carregar catalogo PRODAM:", error);
  }

  let insightsError: string | undefined;
  try {
    insights = await fetchFromApi<InsightResponse>("/v1/insights");
  } catch (error) {
    insightsError =
      error instanceof Error ? error.message : "Falha desconhecida ao gerar insights com Azure OpenAI.";
    insights = {
      generatedAt: new Date().toISOString(),
      usingAzure: false,
      insights: [],
      error: insightsError
    };
    console.error("[dashboard] Erro ao carregar insights:", error);
  }

  return {
    resources,
    projects,
    recommendations,
    catalog,
    insights,
    meta: {
      usingFallback,
      error: datasetError,
      catalogFallback: catalogFallbackFlag || Boolean(catalog.meta?.error),
      catalogError: catalogError ?? catalog.meta?.error,
      insightsError: insightsError ?? insights.error
    }
  };
}

export default async function Home() {
  const { resources, projects, recommendations, catalog, insights, meta } = await loadDashboard();

  return (
    <Dashboard
      data={{ resources, projects, recommendations }}
      catalog={catalog}
      insights={insights}
      meta={meta}
    />
  );
}
