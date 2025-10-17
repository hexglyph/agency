import { clamp } from "./shared";
import type { Project, Recommendation, Resource } from "./types";

export function buildRecommendations(resources: Resource[], projects: Project[]): Recommendation[] {
  const weights = {
    skillCoverage: 0.5,
    availability: 0.3,
    coordination: 0.2
  };

  return projects
    .flatMap((project) =>
      resources.map((resource) => {
        const projectNeeds = new Map(project.needs.map((need) => [need.skillId, need]));
        const matchedNeeds = resource.skills
          .map((skill) => projectNeeds.get(skill.id))
          .filter((need): need is NonNullable<typeof need> => Boolean(need));

        if (!matchedNeeds.length || resource.availability <= 0) {
          return undefined;
        }

        const skillCoverage = project.needs.length ? matchedNeeds.length / project.needs.length : 0;
        const availabilityScore = clamp(resource.availability, 0, 1);
        const coordinationScore =
          resource.macroArea.trim().toLowerCase() === project.macroArea.trim().toLowerCase() ? 1 : 0;

        const score =
          skillCoverage * weights.skillCoverage +
          availabilityScore * weights.availability +
          coordinationScore * weights.coordination;

        return {
          projectId: project.id,
          projectName: project.titulo,
          macroArea: project.macroArea,
          resourceId: resource.id,
          resourceName: resource.name,
          matchedSkills: matchedNeeds.map((need) => need.label),
          coordinationFit: coordinationScore === 1,
          score: clamp(score, 0, 1),
          matchDetail: {
            skillCoverage,
            availabilityScore,
            coordinationScore
          },
          notes: ""
        } satisfies Recommendation;
      })
    )
    .filter((item): item is Recommendation => Boolean(item))
    .sort((a, b) => b.score - a.score);
}
