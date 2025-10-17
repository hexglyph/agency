import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadProdAmCatalog, type CatalogEmployee } from "./prodam";
import { loadStoredInsights, type StoredInsightRecord } from "./insights-store";

const PROJECTS_CSV_PATH = "ExportacaoDemanda.csv";

function resolveFromRoot(relativePath: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../../..");
  return path.resolve(repoRoot, relativePath);
}

function readTextFile(relativePath: string, encoding: BufferEncoding = "utf-8") {
  const absolute = resolveFromRoot(relativePath);
  return fs.readFileSync(absolute, { encoding });
}

type CsvParseOptions = {
  delimiter?: string;
  skipPrefix?: string;
};

function parseCsv(content: string, options: CsvParseOptions = {}) {
  const delimiter = options.delimiter ?? ",";
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (options.skipPrefix && lines[0]?.startsWith(options.skipPrefix)) {
    lines.shift();
  }

  if (!lines.length) {
    return [];
  }

  const headerLine = lines.shift();
  if (!headerLine) {
    return [];
  }
  const headers = headerLine.split(delimiter).map((header) => header.trim());

  return lines.map((line) => {
    const values: string[] = [];
    let current = "";
    let insideQuotes = false;

    for (let index = 0; index < line.length; index++) {
      const char = line[index];

      if (char === "\"") {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (char === delimiter && !insideQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current.trim());

    const record: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      record[header] = values[index] ?? "";
    }
    return record;
  });
}

function sanitizeList(raw: string | undefined | null) {
  if (!raw) {
    return [];
  }
  return raw
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLabel(input: string | undefined | null) {
  return (input ?? "").trim().toLowerCase();
}

export type ResourceSkill = {
  id: string;
  name: string;
  level?: string | null;
  source: "competencia" | "tecnologia" | "insight";
};

export type ResourceProfile = {
  id: string;
  name: string;
  role?: string;
  manager?: string;
  macroArea?: string | null;
  coordination?: string | null;
  department?: string | null;
  availability?: number | null;
  availabilityHours?: number | null;
  skills: ResourceSkill[];
  preferredTechs: string[];
  notes?: string;
};

export type ProjectNeed = {
  skillId: string;
  label: string;
  priority: "alta" | "media" | "baixa";
};

export type ProjectProfile = {
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

export type RecommendationProfile = {
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

export type Dataset = {
  resources: ResourceProfile[];
  projects: ProjectProfile[];
  recommendations: RecommendationProfile[];
};

function loadProjects(): ProjectProfile[] {
  const content = readTextFile(PROJECTS_CSV_PATH, "latin1");
  const records = parseCsv(content, { delimiter: ";", skipPrefix: "SEP=" });

  return records
    .filter((record) => !(record.SiglaSistema || "").toUpperCase().startsWith("PA"))
    .map<ProjectProfile>((record) => ({
      id: slugify(`${record.SiglaSistema || ""}-${record.TituloDemanda || record.NomeSistema || ""}`),
      siglaSistema: record.SiglaSistema || undefined,
      nomeSistema: record.NomeSistema || undefined,
      titulo: record.TituloDemanda || record.NomeSistema || record.SiglaSistema || undefined,
      macroArea: record.MacroAreaNegocio || undefined,
      categoriaTecnologica: record.CategoriaTecnologica || undefined,
      complexidade: record.ComplexidadeEstimativa || undefined,
      equipeIdeal: record.EstimativaEquipeIdeal || undefined,
      observacaoIA: record.ObservacaoIA || undefined,
      coordination: record.Gerencia || record.Diretoria || record.MacroAreaNegocio || undefined,
      needs: sanitizeList(record.PerfisHumanosIndicados).map((label) => ({
        skillId: slugify(label),
        label,
        priority: (record.ComplexidadeEstimativa || "").toLowerCase() === "alta"
          ? "alta"
          : (record.ComplexidadeEstimativa || "").toLowerCase() === "baixa"
          ? "baixa"
          : "media"
      }))
    }));
}

function buildResourceProfiles(employees: CatalogEmployee[], insights: StoredInsightRecord[]): ResourceProfile[] {
  const insightMap = new Map(insights.map((record) => [record.resourceId, record]));

  return employees.map<ResourceProfile>((employee) => {
    const resourceId = String(employee.id);
    const insight = insightMap.get(resourceId);
    const highlightSkills = (insight?.skillHighlights ?? []).filter((entry): entry is string => Boolean(entry));

    const skills: ResourceSkill[] = highlightSkills.map((name) => ({
      id: slugify(name),
      name,
      level: null,
      source: "insight"
    }));

    return {
      id: resourceId,
      name: employee.displayName,
      role: employee.role,
      manager: employee.manager,
      macroArea: null,
      coordination: employee.manager ?? null,
      department: employee.role ?? null,
      availability: null,
      availabilityHours: null,
      skills,
      preferredTechs: [],
      notes: insight?.summary
    };
  });
}

function buildRecommendations(resources: ResourceProfile[], projects: ProjectProfile[]): RecommendationProfile[] {
  const recommendations: RecommendationProfile[] = [];

  for (const project of projects) {
    if (!project.needs.length) {
      continue;
    }
    const normalizedNeeds = project.needs.map((need) => ({
      label: need.label,
      normalized: normalizeLabel(need.label)
    }));

    for (const resource of resources) {
      if (!resource.skills.length) {
        continue;
      }

      const matchedSkills = resource.skills.filter((skill) => {
        const normalized = normalizeLabel(skill.name);
        return normalizedNeeds.some((need) => need.normalized === normalized);
      });

      if (!matchedSkills.length) {
        continue;
      }

      const skillCoverage = normalizedNeeds.length ? matchedSkills.length / normalizedNeeds.length : 0;
      const availabilityScore =
        typeof resource.availability === "number" && Number.isFinite(resource.availability)
          ? Math.max(0, Math.min(1, resource.availability))
          : 0;
      const coordinationScore =
        resource.macroArea &&
        project.macroArea &&
        normalizeLabel(resource.macroArea) === normalizeLabel(project.macroArea)
          ? 1
          : 0;

      const score = Math.max(
        Math.min(skillCoverage * 0.7 + availabilityScore * 0.2 + coordinationScore * 0.1, 1),
        0
      );

      recommendations.push({
        projectId: project.id,
        projectName: project.titulo || project.nomeSistema || project.siglaSistema || project.id,
        macroArea: project.macroArea,
        resourceId: resource.id,
        resourceName: resource.name,
        matchedSkills: matchedSkills.map((skill) => skill.name),
        coordinationFit: coordinationScore === 1,
        score,
        matchDetail: {
          skillCoverage,
          availabilityScore,
          coordinationScore
        },
        notes: project.observacaoIA ?? ""
      });
    }
  }

  return recommendations.sort((a, b) => b.score - a.score);
}

export async function buildDataset(): Promise<Dataset> {
  const catalog = loadProdAmCatalog();
  const insights = await loadStoredInsights();
  const projects = loadProjects();
  const resources = buildResourceProfiles(catalog.employees, insights);
  const recommendations = buildRecommendations(resources, projects);

  return {
    resources,
    projects,
    recommendations
  };
}
