export type SeniorityLevel = "junior" | "pleno" | "senior";

export type SkillSource = "competencia" | "tecnologia";

export type Skill = {
  id: string;
  name: string;
  level: SeniorityLevel;
  source: SkillSource;
};

export type Resource = {
  id: string;
  name: string;
  macroArea: string;
  coordination: string;
  management: string;
  department: string;
  seniority: SeniorityLevel;
  availabilityHours: number;
  availability: number;
  skills: Skill[];
  preferredTechs: string[];
  notes?: string;
};

export type ProjectNeed = {
  skillId: string;
  label: string;
  priority: "alta" | "media" | "baixa";
};

export type Project = {
  id: string;
  siglaSistema: string;
  nomeSistema: string;
  titulo: string;
  macroArea: string;
  categoriaTecnologica: string;
  complexidade: "Alta" | "Media" | "Baixa" | "Indefinida";
  equipeIdeal: string;
  observacaoIA: string;
  coordination: string;
  needs: ProjectNeed[];
};

export type Recommendation = {
  projectId: string;
  projectName: string;
  macroArea: string;
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

export type MockDataset = {
  resources: Resource[];
  projects: Project[];
  recommendations: Recommendation[];
};
