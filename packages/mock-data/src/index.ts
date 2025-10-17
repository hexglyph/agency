import path from "node:path";

import { parseCsv } from "./csv-loader";
import { buildRecommendations } from "./core";
import {
  clamp,
  createProjectKey,
  parseNumber,
  sanitizeList,
  slugify,
  toAvailabilityFraction,
  toPriority,
  toSeniority
} from "./shared";
import { readTextFile } from "./utils";
import type { MockDataset, Project, Recommendation, Resource, Skill, SeniorityLevel } from "./types";

const PROJECTS_CSV_PATH = "ExportacaoDemanda.csv";
const RESOURCES_CSV_PATH = path.join("mock", "mock_funcionarios.csv");
const RECOMMENDATIONS_CSV_PATH = path.join("mock", "mock_afinidade_projetos.csv");

function uniqueSkills(skills: Skill[]) {
  const map = new Map<string, Skill>();
  skills.forEach((skill) => {
    if (!map.has(skill.id)) {
      map.set(skill.id, skill);
    }
  });
  return Array.from(map.values());
}

function buildResource(record: Record<string, string>): Resource {
  const seniority = toSeniority(record.NivelSenioridade);
  const availabilityHours = parseNumber(record.CargaDisponivelHoras);
  const availability = toAvailabilityFraction(availabilityHours);
  const macroArea = record.MacroAreaEspecialidade || "Outros";

  const competencies = sanitizeList(record.CompetenciasChave).map<Skill>((name) => ({
    id: slugify(name),
    name,
    level: seniority,
    source: "competencia"
  }));

  const technologies = sanitizeList(record.TecnologiasPreferenciais).map<Skill>((name) => ({
    id: slugify(name),
    name,
    level: seniority,
    source: "tecnologia"
  }));

  return {
    id: record.FuncionarioID,
    name: record.Nome,
    macroArea,
    coordination: macroArea,
    management: `Gestao ${macroArea}`,
    department: `Diretoria ${macroArea}`,
    seniority,
    availabilityHours,
    availability,
    skills: uniqueSkills([...competencies, ...technologies]),
    preferredTechs: sanitizeList(record.TecnologiasPreferenciais),
    notes: record.Observacao
  };
}

const PRIORITY_BY_COMPLEXITY: Record<string, "alta" | "media" | "baixa"> = {
  alta: "alta",
  media: "media",
  baixa: "baixa",
  indefinida: "media"
};

function buildProject(record: Record<string, string>): Project {
  const macroArea = record.MacroAreaNegocio || "Outros";
  const complexity = (record.ComplexidadeEstimativa || "Indefinida") as Project["complexidade"];
  const priorityKey = (complexity || "").toLowerCase();
  const priority = PRIORITY_BY_COMPLEXITY[priorityKey] ?? toPriority(complexity);

  const needs = sanitizeList(record.PerfisHumanosIndicados).map((label) => ({
    skillId: slugify(label),
    label,
    priority
  }));

  const coordination = record.Gerencia || record.Diretoria || macroArea;

  return {
    id: slugify(`${record.SiglaSistema || ""}-${record.TituloDemanda || record.NomeSistema || ""}`),
    siglaSistema: record.SiglaSistema,
    nomeSistema: record.NomeSistema,
    titulo: record.TituloDemanda || record.NomeSistema || record.SiglaSistema,
    macroArea,
    categoriaTecnologica: record.CategoriaTecnologica || "Tecnologia Corporativa",
    complexidade: complexity,
    equipeIdeal: record.EstimativaEquipeIdeal || "",
    observacaoIA: record.ObservacaoIA || "",
    coordination,
    needs
  };
}

function buildRecommendation(
  record: Record<string, string>,
  projectLookup: Map<string, Project>,
  resourceLookup: Map<string, Resource>
) {
  const projectKey = createProjectKey(record.SiglaSistema, record.TituloDemanda);
  const project = projectLookup.get(projectKey);
  if (!project) {
    return [];
  }

  const score = parseNumber(record.ScoreAfinidade);

  return sanitizeList(record.FuncionariosIndicadosIDs).flatMap((rawId) => {
    const resourceId = rawId.replace(/\s+/g, "");
    const resource = resourceLookup.get(resourceId);
    if (!resource) {
      return [];
    }

    const projectNeeds = new Map(project.needs.map((need) => [need.skillId, need]));
    const matchedNeeds = resource.skills
      .map((skill) => projectNeeds.get(skill.id))
      .filter((need): need is NonNullable<typeof need> => Boolean(need));

    const skillCoverage = project.needs.length ? matchedNeeds.length / project.needs.length : 0;
    const availabilityScore = clamp(resource.availability, 0, 1);
    const coordinationScore =
      resource.macroArea.trim().toLowerCase() === project.macroArea.trim().toLowerCase() ? 1 : 0;

    return {
      projectId: project.id,
      projectName: project.titulo,
      macroArea: project.macroArea,
      resourceId: resource.id,
      resourceName: resource.name,
      matchedSkills: matchedNeeds.map((need) => need.label),
      coordinationFit: coordinationScore === 1,
      score: score > 0 ? clamp(score, 0, 1) : clamp(
        skillCoverage * 0.5 + availabilityScore * 0.3 + coordinationScore * 0.2,
        0,
        1
      ),
      matchDetail: {
        skillCoverage,
        availabilityScore,
        coordinationScore
      },
      notes: record.ObservacaoIA || ""
    } satisfies Recommendation;
  });
}

export function loadMockData(): MockDataset {
  const projectRecords = parseCsv(readTextFile(PROJECTS_CSV_PATH, "latin1"), {
    delimiter: ";",
    skipPrefix: "SEP="
  }).filter((record) => !(record.SiglaSistema || "").toUpperCase().startsWith("PA"));

  const resourceRecords = parseCsv(readTextFile(RESOURCES_CSV_PATH), {
    delimiter: ","
  });

  const recommendationRecords = parseCsv(readTextFile(RECOMMENDATIONS_CSV_PATH), {
    delimiter: ","
  });

  const resources = resourceRecords.map(buildResource);
  const projects = projectRecords.map(buildProject);

  const resourceLookup = new Map(resources.map((resource) => [resource.id, resource]));
  const projectLookup = new Map(
    projectRecords.map((record, index) => {
      const project = projects[index];
      const key = createProjectKey(record.SiglaSistema, record.TituloDemanda);
      return [key, project] as const;
    })
  );

  const recommendations = recommendationRecords
    .flatMap((record) => buildRecommendation(record, projectLookup, resourceLookup))
    .sort((a, b) => b.score - a.score);

  return {
    resources,
    projects,
    recommendations: recommendations.length ? recommendations : buildRecommendations(resources, projects)
  };
}

export type { Resource, Project, Recommendation, SeniorityLevel } from "./types";
export type { MockDataset } from "./types";
export { buildRecommendations } from "./core";
