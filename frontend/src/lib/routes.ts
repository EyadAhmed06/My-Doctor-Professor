export function slugifyRoutePart(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function courseRouteKey(course: { courseCode: string; courseName?: string }) {
  return slugifyRoutePart(course.courseCode || course.courseName || "course");
}

export function weekRouteKey(week: { weekNumber: number; title?: string | null }) {
  return `${week.weekNumber}-${slugifyRoutePart(week.title || `week-${week.weekNumber}`)}`;
}

export function lectureRouteKey(lecture: { lectureNumber: number; title: string }) {
  return `${lecture.lectureNumber}-${slugifyRoutePart(lecture.title)}`;
}

export function resourceRouteKey(resource: { resourceName: string }, index: number) {
  return `${index + 1}-${slugifyRoutePart(resource.resourceName)}`;
}
