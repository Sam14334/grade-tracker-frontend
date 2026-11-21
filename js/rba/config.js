// Rule-based analysis thresholds. These are deliberately kept in one place so
// the rules can be tuned without touching the analysis engine or the UI.
export const RBA_CONFIG = Object.freeze({
  // PUP passing grade (3.00) and its percentage equivalent. The percentage is
  // resolved from the grade scale returned by the API, with 75 as a fallback.
  passingGrade: 3.0,
  fallbackPassingPercentage: 75,

  // A course standing just above passing (3.00/2.75 boundary) is "near pass".
  nearPassUpper: 78,

  // Strong performance / exam-vs-coursework comparison.
  strongPercentage: 85,
  dragGap: 10,

  // Bottleneck severity.
  criticalGap: 20,
  criticalComponentPercentage: 65,

  // Insufficient-data guards.
  minScoredComponents: 2,
  minCoverage: 25,

  // Cohort privacy / reliability guards.
  cohortMinStudents: 3,
  assessmentMinSamples: 3,

  // Cohort intervention thresholds.
  lowPassRateWarning: 75,
  lowPassRateCritical: 50,
  atRiskShare: 30,

  // Banner limits.
  maxFindings: 3,
  maxOverviewFindings: 4,
  maxMissingNames: 3,
});

// Mirrors pupGradeScale() in grade-tracker-backend/src/support/grade_calculator.php.
// Used only when a page payload does not include the full scale (for example a
// cached response from an older backend).
export const DEFAULT_GRADE_SCALE = Object.freeze([
  [97, 1.0],
  [94, 1.25],
  [91, 1.5],
  [88, 1.75],
  [85, 2.0],
  [82, 2.25],
  [79, 2.5],
  [76, 2.75],
  [75, 3.0],
  [0, 5.0],
]);

export const PERIOD_LABELS = Object.freeze({
  midterms: 'Midterms',
  finals: 'Finals',
});

export const SEVERITY_RANK = Object.freeze({
  critical: 0,
  warning: 1,
  info: 2,
  positive: 3,
  neutral: 4,
});
