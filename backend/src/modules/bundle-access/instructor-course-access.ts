// SQL fragments use only internal column expressions and bound user parameters.
export function buildInstructorCourseAccessSql(courseId: string, instructorId: string): string {
  return `(EXISTS (
    SELECT 1 FROM course_instructors assignment
    WHERE assignment.course_id = ${courseId}
      AND assignment.instructor_id = ${instructorId}
  ) OR EXISTS (
    SELECT 1 FROM bundle_courses instructor_course
    JOIN bundle_instructors instructor_bundle ON instructor_bundle.bundle_id = instructor_course.bundle_id
    WHERE instructor_course.course_id = ${courseId}
      AND instructor_bundle.instructor_id = ${instructorId}
  ))`;
}
