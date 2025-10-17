import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveFromRoot(relativePath: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../../..");
  return path.resolve(repoRoot, relativePath);
}

function readJson<T>(relativePath: string): T {
  const absolutePath = resolveFromRoot(relativePath);
  const content = fs.readFileSync(absolutePath, "utf-8");
  return JSON.parse(content) as T;
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(input: string) {
  const words = input
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const lowerArticles = new Set(["da", "de", "do", "das", "dos", "e"]);

  return words
    .map((word, index) => {
      if (index !== 0 && lowerArticles.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function extractCode(raw: string) {
  const match = raw.match(/#(\d+)#/);
  return match ? match[1] : null;
}

function cleanLabel(raw: string) {
  return raw.replace(/\s*-\s*#\d+#\s*$/, "").trim();
}

function initialsFromName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

type RawTuple = [number, string];
type RawEmployee = [number, string, string];
type EnrichedEmployee = {
  id: number;
  name: string;
  displayName?: string;
  initials?: string;
  registration: string;
  isManager?: boolean;
  role?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  manager?: string;
  formations?: Array<{
    name: string;
    level?: string;
    institution?: string;
    start?: string;
    end?: string;
    status?: string;
  }>;
  experiences?: Array<{
    role: string;
    company?: string;
    start?: string;
    end?: string;
    current?: boolean;
    description?: string;
    achievements?: string[];
    contractType?: string;
  }>;
  languages?: Array<{
    name: string;
    level?: string;
  }>;
  sourceUrl?: string;
  scrapedAt?: string;
};

export type CatalogArea = {
  id: number;
  name: string;
  displayName: string;
  code?: string | null;
  slug: string;
};

export type CatalogDirectorate = {
  id: number;
  name: string;
  displayName: string;
  code?: string | null;
  slug: string;
};

export type CatalogJob = {
  id: number;
  name: string;
  displayName: string;
  family: string;
  level?: string | null;
  slug: string;
};

export type CatalogManager = {
  id: number;
  name: string;
  displayName: string;
  initials: string;
  slug: string;
};

export type CatalogEmployee = {
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
  formations: EnrichedEmployee["formations"];
  experiences: EnrichedEmployee["experiences"];
  languages: EnrichedEmployee["languages"];
  sourceUrl?: string;
  scrapedAt?: string;
};

export type CatalogOverview = {
  areas: CatalogArea[];
  directorates: CatalogDirectorate[];
  jobs: CatalogJob[];
  managers: CatalogManager[];
  employees: CatalogEmployee[];
  meta: {
    source: string;
    generatedAt: string;
    error?: string;
  };
};

function parseAreas(entries: RawTuple[]): CatalogArea[] {
  return entries.map(([id, raw]) => {
    const name = raw.trim();
    const code = extractCode(name);
    const displayName = toTitleCase(cleanLabel(name));
    return {
      id,
      name,
      displayName,
      code,
      slug: slugify(displayName || `area-${id}`)
    };
  });
}

function parseDirectorates(entries: Array<{ id: number; name: string }>): CatalogDirectorate[] {
  return entries.map((entry) => {
    const name = entry.name.trim();
    const code = extractCode(name);
    const displayName = toTitleCase(cleanLabel(name));
    return {
      id: entry.id,
      name,
      displayName,
      code,
      slug: slugify(displayName || `diretoria-${entry.id}`)
    };
  });
}

function parseJobs(entries: RawTuple[]): CatalogJob[] {
  return entries.map(([id, raw]) => {
    const name = raw.trim();
    const parts = name.split(" - ").map((segment) => segment.trim()).filter(Boolean);
    let level: string | null = null;
    if (parts.length > 1 && /^[IVX]+$/i.test(parts[parts.length - 1])) {
      level = parts.pop() ?? null;
    }
    const displayName = toTitleCase(parts.join(" - "));
    const family = parts[0] ?? displayName;
    return {
      id,
      name,
      displayName,
      family: toTitleCase(family),
      level,
      slug: slugify(`${id}-${displayName}`)
    };
  });
}

function parseManagers(entries: Array<{ id: number; name: string }>): CatalogManager[] {
  return entries.map((entry) => {
    const trimmed = entry.name.trim();
    const displayName = toTitleCase(trimmed);
    return {
      id: entry.id,
      name: trimmed,
      displayName,
      initials: initialsFromName(trimmed),
      slug: slugify(`${entry.id}-${displayName}`)
    };
  });
}

function isEnrichedEmployee(entry: RawEmployee | EnrichedEmployee): entry is EnrichedEmployee {
  return !Array.isArray(entry) && typeof entry === "object" && "registration" in entry;
}

function parseEmployees(entries: Array<RawEmployee | EnrichedEmployee>, managerIds: Set<number>): CatalogEmployee[] {
  return entries.map((entry) => {
    if (isEnrichedEmployee(entry)) {
      const trimmed = entry.name.trim();
      const displayName = entry.displayName ?? toTitleCase(trimmed);
      return {
        id: entry.id,
        name: trimmed,
        displayName,
        initials: entry.initials ?? initialsFromName(trimmed),
        registration: entry.registration.trim(),
        isManager: entry.isManager ?? managerIds.has(entry.id),
        role: entry.role,
        email: entry.email,
        phone: entry.phone,
        birthDate: entry.birthDate,
        manager: entry.manager,
        formations: entry.formations ?? [],
        experiences: entry.experiences ?? [],
        languages: entry.languages ?? [],
        sourceUrl: entry.sourceUrl,
        scrapedAt: entry.scrapedAt
      };
    }

    const [id, rawName, registration] = entry;
    const trimmed = rawName.trim();
    const displayName = toTitleCase(trimmed);
    return {
      id,
      name: trimmed,
      displayName,
      initials: initialsFromName(trimmed),
      registration: registration.trim(),
      isManager: managerIds.has(id),
      formations: [],
      experiences: [],
      languages: []
    };
  });
}

export function loadProdAmCatalog(): CatalogOverview {
  try {
    const areas = parseAreas(readJson<RawTuple[]>("areas.json"));
    const directorates = parseDirectorates(readJson<Array<{ id: number; name: string }>>("diretorias.json"));
    const jobs = parseJobs(readJson<RawTuple[]>("jobs.json"));
    const managersList = parseManagers(readJson<Array<{ id: number; name: string }>>("managers.json"));
    const managerIds = new Set(managersList.map((manager) => manager.id));
    const employees = parseEmployees(
      readJson<Array<RawEmployee | EnrichedEmployee>>("funcionarios.json"),
      managerIds
    );

    return {
      areas,
      directorates,
      jobs,
      managers: managersList,
      employees,
      meta: {
        source: "produtorio-json",
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao carregar catalogo PRODAM";
    console.error("[catalog] Erro ao carregar dados JSON:", message);
    return {
      areas: [],
      directorates: [],
      jobs: [],
      managers: [],
      employees: [],
      meta: {
        source: "produtorio-json",
        generatedAt: new Date().toISOString(),
        error: message
      }
    };
  }
}
