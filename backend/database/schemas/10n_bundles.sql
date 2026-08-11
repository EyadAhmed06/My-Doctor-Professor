-- =====================================================
-- Current bundle access schema snapshot
-- Fresh installations apply this snapshot directly.
-- Legacy installations receive the same objects through TypeORM migrations.
-- =====================================================

CREATE TYPE bundle_status AS ENUM ('DRAFT','PUBLISHED','ARCHIVED');
CREATE TYPE bundle_access_mode AS ENUM ('MANUAL','CODE','PUBLIC','SUBSCRIPTION');
CREATE TYPE bundle_enrollment_status AS ENUM ('ACTIVE','EXPIRED','REVOKED');
CREATE TYPE bundle_enrollment_source AS ENUM ('MANUAL','CODE','PUBLIC','SUBSCRIPTION');
CREATE TYPE bundle_payment_status AS ENUM ('NOT_REQUIRED','PENDING','PAID','CANCELLED');

CREATE TABLE bundles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar(180) NOT NULL,
    slug varchar(180) NOT NULL,
    description text,
    academic_year integer NOT NULL CHECK (academic_year BETWEEN 1 AND 12),
    status bundle_status NOT NULL DEFAULT 'DRAFT',
    access_mode bundle_access_mode NOT NULL DEFAULT 'PUBLIC',
    is_free boolean NOT NULL DEFAULT true,
    price_amount numeric(10,2),
    price_currency varchar(3) NOT NULL DEFAULT 'EGP',
    enrollment_code_hash text,
    available_from timestamp,
    available_until timestamp,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_bundle_availability CHECK (
        available_until IS NULL
        OR available_from IS NULL
        OR available_until > available_from
    ),
    CONSTRAINT ck_bundle_price_positive CHECK (
        price_amount IS NULL OR price_amount > 0
    ),
    CONSTRAINT ck_bundle_price_currency CHECK (
        price_currency ~ '^[A-Z]{3}$'
    )
);
CREATE UNIQUE INDEX uq_bundles_slug ON bundles(slug);
CREATE INDEX idx_bundles_year_status ON bundles(academic_year, status);

CREATE TABLE bundle_courses (
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bundle_id, course_id)
);
CREATE INDEX idx_bundle_courses_course ON bundle_courses(course_id);

CREATE TABLE bundle_weeks (
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    week_id uuid NOT NULL REFERENCES weeks(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bundle_id, week_id)
);
CREATE INDEX idx_bundle_weeks_week ON bundle_weeks(week_id);

CREATE TABLE bundle_tests (
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    test_id uuid NOT NULL REFERENCES tests(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bundle_id, test_id)
);
CREATE INDEX idx_bundle_tests_test ON bundle_tests(test_id);

CREATE TABLE bundle_instructors (
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    instructor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bundle_id, instructor_id)
);
CREATE INDEX idx_bundle_instructors_user ON bundle_instructors(instructor_id);

CREATE TABLE bundle_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id uuid NOT NULL REFERENCES bundles(id) ON DELETE RESTRICT,
    student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status bundle_enrollment_status NOT NULL DEFAULT 'ACTIVE',
    source bundle_enrollment_source NOT NULL,
    payment_status bundle_payment_status NOT NULL DEFAULT 'NOT_REQUIRED',
    paid_at timestamp,
    payment_reference varchar(200),
    starts_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp,
    granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bundle_student UNIQUE (bundle_id, student_id),
    CONSTRAINT ck_bundle_enrollment_expiry CHECK (
        expires_at IS NULL OR expires_at > starts_at
    )
);
CREATE INDEX idx_bundle_enrollment_student_status
    ON bundle_enrollments(student_id, status);
CREATE INDEX idx_bundle_enrollment_payment_status
    ON bundle_enrollments(bundle_id, payment_status);
