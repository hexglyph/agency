export function normalizeLineEndings(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sanitizeList(input: string | undefined, delimiter = "|") {
  if (!input) {
    return [];
  }

  return input
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseNumber(input: string | undefined) {
  if (!input) {
    return 0;
  }

  const normalized = input.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

export function toSeniority(input: string | undefined) {
  const normalized = (input ?? "").trim().toLowerCase();
  switch (normalized) {
    case "junior":
      return "junior";
    case "senior":
      return "senior";
    default:
      return "pleno";
  }
}

export function toPriority(input: string | undefined): "alta" | "media" | "baixa" {
  const normalized = (input ?? "").trim().toLowerCase();
  if (normalized === "alta") {
    return "alta";
  }
  if (normalized === "baixa") {
    return "baixa";
  }
  return "media";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function toAvailabilityFraction(hours: number, base = 160) {
  if (base <= 0) {
    return 0;
  }
  return clamp(hours / base, 0, 1);
}

export function createProjectKey(sigla: string, titulo: string) {
  return `${sigla?.trim().toUpperCase() ?? ""}::${titulo?.trim().toUpperCase() ?? ""}`;
}
