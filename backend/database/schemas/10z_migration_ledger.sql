-- =====================================================
-- Fresh-install migration baseline
--
-- Current schema snapshots already contain every object produced by the
-- historical migrations below. Recording them prevents TypeORM from trying to
-- replay legacy DDL on top of a current-schema installation.
-- =====================================================

CREATE TABLE IF NOT EXISTS migrations (
    id serial PRIMARY KEY,
    timestamp bigint NOT NULL,
    name varchar NOT NULL
);

INSERT INTO migrations (timestamp, name)
SELECT entry.timestamp, entry.name
FROM (
    VALUES
        (1760000000000::bigint, 'HardenAssessmentWorkflow1760000000000'),
        (1770000000000::bigint, 'HardenFlashcardWorkflow1770000000000'),
        (1780000000000::bigint, 'HardenProgressWorkflow1780000000000'),
        (1790000000000::bigint, 'HardenNotificationWorkflow1790000000000'),
        (1800000000000::bigint, 'EnforceAppendOnlyAudit1800000000000'),
        (1810000000000::bigint, 'AddCourseInstructorOwnership1810000000000'),
        (1820000000000::bigint, 'AddResourceStorageMetadata1820000000000'),
        (1830000000000::bigint, 'ReconcileDatabaseContract1830000000000'),
        (1840000000000::bigint, 'RevokeLegacyRefreshSessions1840000000000'),
        (1845000000000::bigint, 'AddStudentWorkspace1845000000000'),
        (1850000000000::bigint, 'AddBundleAccessLayer1850000000000'),
        (1860000000000::bigint, 'AddNotebookAnalyticsScheduler1860000000000'),
        (1870000000000::bigint, 'AddExternalAuthIdentities1870000000000'),
        (1950000000000::bigint, 'AddBundlePricingPayments1950000000000'),
        (1960000000000::bigint, 'AddBundleSubscriptionPlans1960000000000'),
        (1970000000000::bigint, 'AddGlobalSubscriptionPlans1970000000000'),
        (1980000000000::bigint, 'AddPlanPurchasePayments1980000000000'),
        (1985000000000::bigint, 'AddEssayCases1985000000000'),
        (1990000000000::bigint, 'AddMcqOptionExplanations1990000000000'),
        (2000000000000::bigint, 'AddAnswerConfidence2000000000000'),
        (2010000000000::bigint, 'AddQuestionFlagTypes2010000000000'),
        (2020000000000::bigint, 'HardenAssessmentIdempotency2020000000000'),
        (2030000000000::bigint, 'EnforcePublishedMcqShape2030000000000'),
        (2040000000000::bigint, 'AddStudentAchievements2040000000000')
) AS entry(timestamp, name)
WHERE NOT EXISTS (
    SELECT 1 FROM migrations current WHERE current.name = entry.name
);