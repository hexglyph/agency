import fs from "node:fs";
import path from "node:path";

import { CheerioAPI, load } from "cheerio";

function loadEnvFromFile(filePath: string) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    return;
  }

  const content = fs.readFileSync(resolved, "utf-8");
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .forEach((line) => {
      const [key, ...rest] = line.split("=");
      if (!key) {
        return;
      }
      const value = rest.join("=").trim();
      if (!process.env[key]) {
        process.env[key] = value.replace(/^['"]|['"]$/g, "");
      }
    });
}

const envCandidates = (process.env.UMANNI_ENV_FILES ?? ".env.local,.env").split(",");
for (const candidate of envCandidates) {
  if (candidate.trim()) {
    loadEnvFromFile(candidate.trim());
  }
}

const BASE_URL = process.env.UMANNI_BASE_URL ?? "https://desempenhoprodam.umanni.com.br/umanni_hr";
const SESSION_COOKIE = process.env.UMANNI_SESSION_COOKIE;
const CONCURRENCY = Number.parseInt(process.env.SCRAPER_CONCURRENCY ?? "3", 10);
function resolvePathFromRepo(target: string) {
  const attempts = [
    path.resolve(process.cwd(), target),
    path.resolve(process.cwd(), "..", target),
    path.resolve(process.cwd(), "..", "..", target),
    path.resolve(process.cwd(), "..", "..", "..", target)
  ];

  for (const attempt of attempts) {
    if (fs.existsSync(path.dirname(attempt)) && (fs.existsSync(attempt) || !attempt.endsWith(".json"))) {
      return attempt;
    }
  }

  return path.resolve(process.cwd(), target);
}

const OUTPUT_PATH = process.env.OUTPUT_PATH ?? resolvePathFromRepo("funcionarios.json");
const INPUT_PATH = process.env.INPUT_PATH ?? resolvePathFromRepo("funcionarios.json");

if (!SESSION_COOKIE) {
  console.error("A variavel de ambiente UMANNI_SESSION_COOKIE nao foi definida.");
  console.error("Informe o valor do cookie de sessao apos autenticar no Umanni (ex.: _umanni_hr_session=...).");
  console.error("Dica: crie um arquivo .env.local com a linha UMANNI_SESSION_COOKIE=_umanni_hr_session=valor e execute novamente.");
  process.exit(1);
}

type LegacyEmployeeTuple = [number, string, string];

type EnrichedEmployee = {
  id: number;
  name: string;
  displayName: string;
  registration: string;
  initials: string;
  role?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  manager?: string;
  formations: Formation[];
  experiences: Experience[];
  languages: Language[];
  sourceUrl: string;
  scrapedAt: string;
};

type Formation = {
  name: string;
  level?: string;
  institution?: string;
  start?: string;
  end?: string;
  status?: string;
};

type Experience = {
  role: string;
  company?: string;
  start?: string;
  end?: string;
  current: boolean;
  description?: string;
  achievements: string[];
  contractType?: string;
};

type Language = {
  name: string;
  level?: string;
};

type ScrapeResult = {
  success: boolean;
  employee: EnrichedEmployee | null;
  error?: string;
};

function resolveDataset(): Array<LegacyEmployeeTuple | EnrichedEmployee> {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Arquivo de entrada nao encontrado em ${INPUT_PATH}`);
  }

  console.log(`Lendo colaboradores de ${INPUT_PATH}`);

  const content = fs.readFileSync(INPUT_PATH, "utf-8");
  const dataset = JSON.parse(content) as Array<LegacyEmployeeTuple | EnrichedEmployee>;

  return dataset;
}

function toInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

function normalizeWhitespace(input: string | undefined | null) {
  return input ? input.replace(/\s+/g, " ").trim() : undefined;
}

function parseAcademic($: CheerioAPI): Formation[] {
  const items: Formation[] = [];
  $("#academic_achievments .achievements-list li").each((_, element) => {
    const nameRaw = $(element).find(".modular-box-label").text();
    const detailsRaw = $(element).find("p").first().text();
    if (!nameRaw.trim()) {
      return;
    }

    const nameLine = normalizeWhitespace(nameRaw) ?? "";
    let name = nameLine;
    let level: string | undefined;

    const levelMatch = nameLine.match(/\(([^)]+)\)\s*$/);
    if (levelMatch) {
      level = levelMatch[1];
      name = nameLine.replace(/\s*\([^)]+\)\s*$/, "").trim();
    }

    const detailsLine = normalizeWhitespace(detailsRaw);
    let institution: string | undefined;
    let start: string | undefined;
    let end: string | undefined;
    let status: string | undefined;

    if (detailsLine) {
      const parts = detailsLine.split(",");
      if (parts.length >= 1) {
        institution = parts[0]?.trim();
      }
      const dateSegment = parts.slice(1).join(",").trim();
      const dateMatch = dateSegment.match(/(\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{4}|Atual)/i);
      if (dateMatch) {
        start = dateMatch[1];
        if (dateMatch[2].toLowerCase() !== "atual") {
          end = dateMatch[2];
        }
      }
      const statusMatch = dateSegment.match(/\(([^)]+)\)\s*$/);
      if (statusMatch) {
        status = statusMatch[1];
      }
    }

    items.push({
      name,
      level,
      institution,
      start,
      end,
      status
    });
  });
  return items;
}

function parseExperiences($: CheerioAPI): Experience[] {
  const experiences: Experience[] = [];
  $("#job_achievments .achievements-list li").each((_, element) => {
    const nameRaw = $(element).find(".modular-box-label").text();
    const timelineRaw = $(element).find("p").first().text();
    const descriptionRaw = $(element).find("p.description").text();

    if (!nameRaw.trim()) {
      return;
    }

    const roleLine = normalizeWhitespace(nameRaw) ?? "";
    let role = roleLine;
    let contractType: string | undefined;
    const contractMatch = roleLine.match(/\(([^)]+)\)\s*$/);
    if (contractMatch) {
      contractType = contractMatch[1];
      role = roleLine.replace(/\s*\([^)]+\)\s*$/, "").trim();
    }

    const timelineLine = normalizeWhitespace(timelineRaw) ?? "";
    const timelineMatch = timelineLine.match(/([^,]+),\s*([^-]+)(?:-\s*(.+))?/);
    let company: string | undefined;
    let start: string | undefined;
    let end: string | undefined;
    let current = false;
    if (timelineMatch) {
      company = timelineMatch[1]?.trim();
      start = timelineMatch[2]?.trim();
      end = timelineMatch[3]?.trim();
      if (!end || /atual/i.test(end)) {
        current = true;
        end = undefined;
      }
    }

    const achievements = $(element)
      .find("p i.fa.fa-trophy")
      .map((__, icon) => {
        const text = $(icon).parent().text();
        return normalizeWhitespace(text);
      })
      .get()
      .filter((text): text is string => Boolean(text));

    experiences.push({
      role,
      company,
      start,
      end,
      current,
      description: normalizeWhitespace(descriptionRaw),
      achievements,
      contractType
    });
  });
  return experiences;
}

function parseLanguages($: CheerioAPI): Language[] {
  const languages: Language[] = [];
  $("#language_achievments .achievements-list li").each((_, element) => {
    const name = normalizeWhitespace($(element).find(".modular-box-label").text());
    const level = normalizeWhitespace($(element).find("p").text());
    if (name) {
      languages.push({
        name,
        level
      });
    }
  });
  return languages;
}

function parseProfile(html: string, userId: number, registration: string): EnrichedEmployee {
  const $ = load(html);

  const name = normalizeWhitespace($("#me-info .user-name a#profile-url").text()) ?? "";
  const role = normalizeWhitespace($("#me-info .user-name p").first().text());
  const email = normalizeWhitespace($("#me-info .info .fa-envelope").parent().text());
  const phone = normalizeWhitespace($("#me-info .info .fa-phone").parent().text());

  const birthDate = normalizeWhitespace(
    $("#profile_details #all-fields li")
      .filter((_, element) => $(element).find(".modular-box-label").text().includes("Data de nascimento"))
      .find("p")
      .text()
  );

  const manager = normalizeWhitespace(
    $("#profile_details #all-fields li")
      .filter((_, element) => $(element).find(".modular-box-label").text().includes("Gestor"))
      .find("p")
      .text()
  );

  return {
    id: userId,
    registration,
    name,
    displayName: name,
    initials: toInitials(name),
    role,
    email,
    phone,
    birthDate,
    manager,
    formations: parseAcademic($),
    experiences: parseExperiences($),
    languages: parseLanguages($),
    sourceUrl: `${BASE_URL.replace(/\/$/, "")}/users/${userId}`,
    scrapedAt: new Date().toISOString()
  };
}

async function fetchProfileHtml(userId: number): Promise<string> {
  const response = await fetch(`${BASE_URL.replace(/\/$/, "")}/users/${userId}`, {
    headers: {
      Cookie: SESSION_COOKIE,
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "ProdAM Resource Intelligence Scraper/1.0"
    }
  });

  if (response.status === 404) {
    throw new Error("Perfil nao encontrado (404)");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const html = await response.text();

  if (!html.includes("id='me-info'") && !html.includes('id="me-info"')) {
    throw new Error("Resposta nao parece conter o perfil (verifique cookie de sessao)");
  }

  return html;
}

async function scrapeEmployee(entry: LegacyEmployeeTuple | EnrichedEmployee): Promise<ScrapeResult> {
  const id = Array.isArray(entry) ? entry[0] : entry.id;
  const registration = Array.isArray(entry) ? entry[2].trim() : entry.registration;

  try {
    const html = await fetchProfileHtml(id);
    const enriched = parseProfile(html, id, registration);
    return { success: true, employee: enriched };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return { success: false, employee: null, error: message };
  }
}

async function run() {
  const dataset = resolveDataset();
  const enrichedMap = new Map<number, EnrichedEmployee>();

  const existingEnriched = dataset.filter(
    (entry): entry is EnrichedEmployee => !Array.isArray(entry) && typeof entry === "object" && "registration" in entry
  );
  for (const item of existingEnriched) {
    enrichedMap.set(item.id, item);
  }

  const queue = dataset.map((entry) => async () => {
    const result = await scrapeEmployee(entry);
    const id = Array.isArray(entry) ? entry[0] : entry.id;

    if (result.success && result.employee) {
      enrichedMap.set(id, result.employee);
      console.log(`✓ Atualizado: ${id} (${result.employee.displayName})`);
    } else {
      console.warn(`⚠ Falha ao atualizar ${id}: ${result.error}`);
    }
  });

  const concurrency = Math.max(1, CONCURRENCY);
  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = queue.slice(i, i + concurrency);
    await Promise.all(batch.map((fn) => fn()));
  }

  const output = Array.from(enrichedMap.values()).sort((a, b) => a.id - b.id);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log(`Total de colaboradores atualizados: ${output.length}`);
  console.log(`Arquivo salvo em: ${OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error("Erro fatal no scraper:", error);
  process.exit(1);
});
