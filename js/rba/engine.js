import {
  RBA_CONFIG,
  DEFAULT_GRADE_SCALE,
  PERIOD_LABELS,
  SEVERITY_RANK,
} from './config.js';

const EPSILON = 1e-9;

function asNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value, digits = 10) {
  return Number(Number(value).toFixed(digits));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function formatPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}

function formatGrade(value) {
  return Number(value).toFixed(2);
}

function normalizeTitle(title) {
  return String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Grade scale                                                                */
/* -------------------------------------------------------------------------- */

export function normalizeScale(scale) {
  if (Array.isArray(scale) && scale.length > 0) {
    if (Array.isArray(scale[0])) {
      const pairs = scale
        .filter((pair) => Array.isArray(pair) && pair.length >= 2)
        .map((pair) => [Number(pair[0]), Number(pair[1])])
        .filter(([minimum, grade]) => Number.isFinite(minimum) && Number.isFinite(grade))
        .sort((a, b) => b[0] - a[0]);
      if (pairs.length > 0) return pairs;
    }

    // Older payloads only include the grade list. Map it onto the known minima.
    if (typeof scale[0] === 'number' && scale.length === DEFAULT_GRADE_SCALE.length) {
      return DEFAULT_GRADE_SCALE.map((pair, index) => [pair[0], Number(scale[index])]);
    }
  }

  return DEFAULT_GRADE_SCALE.map((pair) => pair.slice());
}

export function passingPercentage(scale) {
  const pair = normalizeScale(scale).find(
    ([, grade]) => Math.abs(grade - RBA_CONFIG.passingGrade) < EPSILON,
  );
  return pair ? pair[0] : RBA_CONFIG.fallbackPassingPercentage;
}

export function targetPercentage(scale, target) {
  const parsed = asNumber(target);
  if (parsed === null) return null;
  const pair = normalizeScale(scale).find(([, grade]) => Math.abs(grade - parsed) < EPSILON);
  return pair ? pair[0] : null;
}

export function percentageToGrade(percentage, scale) {
  const parsed = asNumber(percentage);
  if (parsed === null) return null;
  const rounded = round(parsed, 10);
  for (const [minimum, grade] of normalizeScale(scale)) {
    if (rounded >= minimum - EPSILON) return grade;
  }
  return 5.0;
}

/* -------------------------------------------------------------------------- */
/* Normalization                                                              */
/* -------------------------------------------------------------------------- */

function normalizeComponent(component = {}) {
  const weight = asNumber(component.weight);
  return {
    id: String(component.id ?? ''),
    databaseId: component.database_id ?? component.databaseId ?? null,
    period: component.period === 'finals' ? 'finals' : 'midterms',
    name: String(component.name ?? '').trim() || 'Category',
    weight: weight === null ? 0 : weight,
    isExam: Boolean(component.is_exam ?? component.isExam),
    assessments: Array.isArray(component.assessments) ? component.assessments : [],
  };
}

function normalizeRow(componentId, row) {
  const titleRaw = row.assessment_title ?? row.title ?? '';
  const scoreRaw = row.raw_score ?? row.score;
  const maxRaw = row.total_items ?? row.max;
  const scoreBlank = scoreRaw === '' || scoreRaw === null || scoreRaw === undefined;
  const maxBlank = maxRaw === '' || maxRaw === null || maxRaw === undefined;

  // A completely blank row is a placeholder, not a zero.
  if (scoreBlank && maxBlank) return null;

  const title = String(titleRaw ?? '').trim();
  if (scoreBlank || maxBlank) {
    return {
      valid: false,
      reason: 'incomplete',
      componentId: String(componentId ?? ''),
      title,
      score: null,
      max: null,
    };
  }

  const score = asNumber(scoreRaw);
  const max = asNumber(maxRaw);
  if (score === null || max === null || !Number.isInteger(max) || max < 1 || score < 0 || score > max) {
    return {
      valid: false,
      reason: 'score',
      componentId: String(componentId ?? ''),
      title,
      score,
      max,
    };
  }

  return {
    valid: true,
    componentId: String(componentId ?? ''),
    title: title || 'Untitled assessment',
    score,
    max,
  };
}

function flattenEntries(entries) {
  const rows = [];

  if (Array.isArray(entries)) {
    for (const row of entries) {
      if (!row || typeof row !== 'object') continue;
      const componentId = row.component_id ?? row.componentId ?? row.id ?? '';
      const normalized = normalizeRow(componentId, row);
      if (normalized) rows.push(normalized);
    }
    return rows;
  }

  if (entries && typeof entries === 'object') {
    for (const [componentId, list] of Object.entries(entries)) {
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        const normalized = normalizeRow(componentId, row);
        if (normalized) rows.push(normalized);
      }
    }
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Course statistics                                                          */
/* -------------------------------------------------------------------------- */

function summarizeComponents(components) {
  const periodWeights = { midterms: 0, finals: 0 };
  let weightsValid = components.length > 0;

  for (const component of components) {
    periodWeights[component.period] += component.weight;
    if (
      !Number.isFinite(component.weight) ||
      component.weight < 0 ||
      component.weight > 100
    ) {
      weightsValid = false;
    }
  }

  for (const period of Object.keys(PERIOD_LABELS)) {
    if (Math.abs(periodWeights[period] - 100) > EPSILON) weightsValid = false;
  }

  let coverage = 0;
  let earnedPoints = 0;
  let examWeight = 0;
  let examPoints = 0;
  let courseworkWeight = 0;
  let courseworkPoints = 0;

  for (const component of components) {
    if (component.max <= 0 || component.percentage === null) continue;
    const courseWeight = component.weight / 2;
    coverage += courseWeight;
    earnedPoints += component.percentage * courseWeight;
    if (component.isExam) {
      examWeight += courseWeight;
      examPoints += component.percentage * courseWeight;
    } else {
      courseworkWeight += courseWeight;
      courseworkPoints += component.percentage * courseWeight;
    }
  }

  const percentage = coverage > 0 ? round(earnedPoints / coverage, 10) : null;
  const scored = components.filter(
    (component) => component.max > 0 && component.percentage !== null,
  );
  const weakest = [...scored].sort((a, b) => a.percentage - b.percentage)[0] ?? null;

  return {
    components,
    weightsValid,
    periodWeights,
    scoredComponents: scored.length,
    coverage,
    earnedPoints,
    percentage,
    examAverage: examWeight > 0 ? round(examPoints / examWeight, 10) : null,
    courseworkAverage:
      courseworkWeight > 0 ? round(courseworkPoints / courseworkWeight, 10) : null,
    weakestComponent: weakest,
    missingComponents: components
      .filter((component) => component.max <= 0)
      .map((component) => component.name),
  };
}

function groupComponentsByName(components) {
  const groups = new Map();

  for (const component of components) {
    const key = normalizeTitle(component.name);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        name: String(component.name ?? '').trim() || 'Category',
        score: 0,
        max: 0,
        weight: 0,
        assessments: [],
        components: [],
      });
    }
    const group = groups.get(key);
    if (component.max > 0) {
      group.score += component.score;
      group.max += component.max;
    }
    group.weight += component.weight;
    group.assessments.push(...(component.assessments ?? []));
    group.components.push(component);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    percentage: group.max > 0 ? round((group.score / group.max) * 100, 10) : null,
  }));
}

export function buildCourseStats({ components = [], entries = [] } = {}) {
  const normalizedComponents = (Array.isArray(components) ? components : []).map(
    normalizeComponent,
  );

  let rows = flattenEntries(entries);

  // Dashboard payloads carry the saved rows inside componentResults.
  if (rows.length === 0) {
    const fromAssessments = [];
    for (const component of normalizedComponents) {
      for (const assessment of component.assessments) {
        fromAssessments.push({
          component_id: component.id,
          title: assessment.title ?? assessment.assessment_title,
          score: assessment.score ?? assessment.raw_score,
          max: assessment.max ?? assessment.total_items,
        });
      }
    }
    rows = flattenEntries(fromAssessments);
  }

  const knownIds = new Set(normalizedComponents.map((component) => component.id));
  const validRows = rows.filter((row) => row.valid && knownIds.has(row.componentId));
  const invalidRows = rows.filter((row) => !row.valid);
  const grouped = new Map();

  for (const row of validRows) {
    if (!grouped.has(row.componentId)) grouped.set(row.componentId, []);
    grouped.get(row.componentId).push(row);
  }

  const resultComponents = normalizedComponents.map((component) => {
    const list = grouped.get(component.id) ?? [];
    const score = list.reduce((sum, row) => sum + row.score, 0);
    const max = list.reduce((sum, row) => sum + row.max, 0);
    const percentage = max > 0 ? round((score / max) * 100, 10) : null;

    return {
      ...component,
      score,
      max,
      percentage,
      assessments: list.map((row) => ({
        title: row.title,
        score: row.score,
        max: row.max,
        percentage: round((row.score / row.max) * 100, 10),
      })),
    };
  });

  return {
    ...summarizeComponents(resultComponents),
    invalidRows: invalidRows.length,
    invalidReasons: [...new Set(invalidRows.map((row) => row.reason))],
  };
}

function statsFromComponentPercentages(templateComponents, studentComponents) {
  const byId = new Map(
    (studentComponents ?? []).map((component) => [String(component.id ?? ''), component]),
  );

  const components = templateComponents.map((templateComponent) => {
    const source = byId.get(String(templateComponent.id));
    const percentage = source ? asNumber(source.percentage) : null;
    const max = source ? asNumber(source.max) ?? 0 : 0;
    return {
      ...templateComponent,
      score: source ? asNumber(source.score) ?? 0 : 0,
      max: percentage !== null ? Math.max(max, 1) : 0,
      percentage,
      assessments: [],
    };
  });

  return summarizeComponents(components);
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

function finding(ruleId, severity, title, message, recommendation, extra = {}) {
  return {
    ruleId,
    severity,
    title,
    message,
    recommendation,
    priority: 50,
    ...extra,
  };
}

function statusFromFindings(findings) {
  if (findings.length === 0) return 'neutral';
  return findings.reduce(
    (worst, item) =>
      SEVERITY_RANK[item.severity] < SEVERITY_RANK[worst] ? item.severity : worst,
    'neutral',
  );
}

const STATUS_LABELS = {
  critical: 'Needs attention',
  warning: 'Watch',
  info: 'Note',
  positive: 'On track',
  neutral: 'Not enough data',
};

function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    return (a.priority ?? 50) - (b.priority ?? 50);
  });
}

function finalizeReport(scope, findings, summary, extra = {}) {
  const sorted = sortFindings(findings);
  const limit = extra.limit ?? RBA_CONFIG.maxFindings;
  const limited = sorted.slice(0, limit);
  return {
    scope,
    status: statusFromFindings(sorted),
    statusLabel: STATUS_LABELS[statusFromFindings(sorted)],
    summary,
    findings: limited,
    coverage: extra.coverage ?? null,
    sampleSize: extra.sampleSize ?? 0,
    ...extra,
  };
}

function insufficientCourse(code, stats) {
  const scoredText =
    stats.scoredComponents === 1 ? '1 scored category' : `${stats.scoredComponents} scored categories`;
  return finalizeReport(
    'student-course',
    [
      finding(
        'S-01',
        'neutral',
        'Not enough data yet',
        `${code}: only ${scoredText} covering ${Math.round(stats.coverage)}% of the course weight.`,
        `Add at least ${RBA_CONFIG.minScoredComponents} scored categories covering ${RBA_CONFIG.minCoverage}% of the course to unlock reliable diagnostics.`,
        { priority: 10 },
      ),
    ],
    `${code}: insufficient saved scores`,
    { coverage: stats.coverage, sampleSize: stats.scoredComponents },
  );
}

function evaluateStudentCourse({ courseCode, stats, scale, target, enrollmentId }) {
  const code = courseCode || 'Course';
  const passPercentage = passingPercentage(scale);
  const targetPct = targetPercentage(scale, target);

  if (stats.components.length === 0) {
    return finalizeReport(
      'student-course',
      [
        finding(
          'S-00',
          'neutral',
          'No grading categories yet',
          `${code} does not have any grading categories.`,
          'Ask your professor to finish the course template, then reload this page.',
          { priority: 10 },
        ),
      ],
      `${code}: no grading categories`,
      { coverage: 0, sampleSize: 0 },
    );
  }

  if (!stats.weightsValid) {
    return finalizeReport(
      'student-course',
      [
        finding(
          'S-00',
          'warning',
          'Grading weights need correction',
          'Midterms and Finals must each total 100%, with every category between 1% and 100%.',
          'Ask your professor to review the template weights. Diagnostics will resume once the weights are valid.',
          { priority: 5 },
        ),
      ],
      `${code}: grading weights are invalid`,
      { coverage: stats.coverage, sampleSize: stats.scoredComponents, grade: null },
    );
  }

  if (
    stats.scoredComponents < RBA_CONFIG.minScoredComponents ||
    stats.coverage < RBA_CONFIG.minCoverage ||
    stats.percentage === null
  ) {
    return insufficientCourse(code, stats);
  }

  const percentage = stats.percentage;
  const grade = percentageToGrade(percentage, scale);
  const findings = [];
  const scored = stats.components.filter(
    (component) => component.max > 0 && component.percentage !== null,
  );

  if (percentage < passPercentage && stats.coverage >= 50) {
    const weakest = stats.weakestComponent;
    findings.push(
      finding(
        'S-02',
        'critical',
        'Below passing',
        `${code} is at ${formatPercent(percentage)} (${formatGrade(grade)}), below the passing ${formatPercent(passPercentage)} (3.00).`,
        weakest
          ? `Start with ${weakest.name} (${formatPercent(weakest.percentage)}), then complete any missing coursework.`
          : 'Complete the remaining coursework and review your lowest-scoring category.',
        { priority: 10, percentage, grade },
      ),
    );
  } else if (percentage < RBA_CONFIG.nearPassUpper) {
    findings.push(
      finding(
        'S-03',
        'warning',
        'Close to passing',
        `${code} is at ${formatPercent(percentage)} (${formatGrade(grade)}), just above the passing line.`,
        'A small improvement in your weakest category would give you a safer margin.',
        { priority: 30, percentage, grade },
      ),
    );
  }

  const bottlenecks = groupComponentsByName(scored)
    .map((component) => ({
      component,
      gap: percentage - component.percentage,
    }))
    .filter(
      ({ component, gap }) =>
        component.percentage !== null &&
        component.percentage < passPercentage &&
        gap >= RBA_CONFIG.dragGap,
    )
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

  for (const { component, gap } of bottlenecks) {
    const severity =
      gap >= RBA_CONFIG.criticalGap ||
      component.percentage < RBA_CONFIG.criticalComponentPercentage
        ? 'critical'
        : 'warning';
    findings.push(
      finding(
        'S-04',
        severity,
        `Weak category: ${component.name}`,
        `Your ${component.name} average is ${formatPercent(component.percentage)}, ${gap.toFixed(1)} points below your ${formatPercent(percentage)} course standing.`,
        `Review your lowest ${component.name} assessments and practise the topics you missed.`,
        {
          priority: 20,
          component: component.name,
          value: component.percentage,
          gap,
        },
      ),
    );
  }

  if (
    stats.examAverage !== null &&
    stats.courseworkAverage !== null &&
    stats.examAverage >= RBA_CONFIG.strongPercentage &&
    stats.courseworkAverage < passPercentage &&
    stats.examAverage - stats.courseworkAverage >= RBA_CONFIG.dragGap
  ) {
    const weakestCoursework = scored
      .filter((component) => !component.isExam)
      .sort((a, b) => a.percentage - b.percentage)[0];
    findings.push(
      finding(
        'S-05',
        'warning',
        'Coursework is the bottleneck',
        `Your exam average is ${formatPercent(stats.examAverage)} while coursework averages ${formatPercent(stats.courseworkAverage)}. The coursework is pulling your course standing down.`,
        weakestCoursework
          ? `Prioritise ${weakestCoursework.name} practice; your exam performance is already strong.`
          : 'Prioritise quizzes and seatwork practice; your exam performance is already strong.',
        {
          priority: 15,
          examAverage: stats.examAverage,
          courseworkAverage: stats.courseworkAverage,
        },
      ),
    );
  }

  if (stats.missingComponents.length > 0) {
    const names = stats.missingComponents.slice(0, RBA_CONFIG.maxMissingNames);
    const extra = stats.missingComponents.length - names.length;
    findings.push(
      finding(
        'S-06',
        'info',
        'Some categories have no scores',
        `Add scores for ${names.join(', ')}${extra > 0 ? ` and ${extra} more` : ''} to complete the diagnosis.`,
        'Completely blank rows are ignored; recorded zeros count as scored work.',
        { priority: 60 },
      ),
    );
  }

  if (targetPct !== null && !findings.some((item) => item.ruleId === 'S-02')) {
    if (percentage + EPSILON >= targetPct) {
      findings.push(
        finding(
          'S-07',
          'positive',
          'Target on track',
          `Your ${formatPercent(percentage)} standing already meets your ${formatGrade(target)} target (${formatPercent(targetPct)}).`,
          'Keep your current study routine and protect the categories that are already strong.',
          { priority: 80, target },
        ),
      );
    } else {
      findings.push(
        finding(
          'S-07',
          'info',
          'Below your target',
          `Your ${formatPercent(percentage)} standing is ${(targetPct - percentage).toFixed(1)} points below your ${formatGrade(target)} target (${formatPercent(targetPct)}).`,
          stats.weakestComponent
            ? `Focus on ${stats.weakestComponent.name} first; it is your lowest category.`
            : 'Focus on your lowest-scoring category first.',
          { priority: 40, target },
        ),
      );
    }
  }

  if (findings.length === 0) {
    if (percentage >= RBA_CONFIG.strongPercentage && stats.coverage >= 75) {
      findings.push(
        finding(
          'S-08',
          'positive',
          'On track',
          `You are at ${formatPercent(percentage)} (${formatGrade(grade)}) across ${Math.round(stats.coverage)}% of the course weight.`,
          'No category is currently dragging your grade down. Keep submitting coursework on time.',
          { priority: 80 },
        ),
      );
    } else {
      findings.push(
        finding(
          'S-09',
          'positive',
          'No bottlenecks detected',
          `No category is currently below passing or pulling your ${formatPercent(percentage)} standing down.`,
          'Add the remaining scores when they become available to keep the diagnosis current.',
          { priority: 90 },
        ),
      );
    }
  }

  const summaryParts = [
    formatPercent(percentage),
    `${formatGrade(grade)} grade`,
    `${Math.round(stats.coverage)}% of course weight`,
  ];
  if (stats.coverage < 100) summaryParts.push('provisional');

  return finalizeReport(
    'student-course',
    findings,
    `${code}: ${summaryParts.join(' · ')}`,
    {
      coverage: stats.coverage,
      sampleSize: stats.scoredComponents,
      courseCode: code,
      enrollmentId,
      percentage,
      grade,
    },
  );
}

export function analyzeStudentCourse({
  courseCode = 'Course',
  components = [],
  entries = [],
  gradeScale,
  target = null,
  enrollmentId = null,
} = {}) {
  const scale = normalizeScale(gradeScale);
  const stats = buildCourseStats({ components, entries });
  return evaluateStudentCourse({
    courseCode,
    stats,
    scale,
    target,
    enrollmentId,
  });
}

export function analyzeStudentOverview({ courses = [], gradeScale } = {}) {
  const scale = normalizeScale(gradeScale);
  const courseReports = (Array.isArray(courses) ? courses : []).map((course) => {
    const components = course.componentResults ?? course.components ?? [];
    const stats = buildCourseStats({ components, entries: course.entries ?? [] });
    const report = evaluateStudentCourse({
      courseCode: course.code || course.title || 'Course',
      stats,
      scale,
      target: course.target ?? null,
      enrollmentId: course.enrollmentId ?? null,
    });
    return { ...report, courseCode: course.code || 'Course', enrollmentId: course.enrollmentId ?? null };
  });

  if (courseReports.length === 0) {
    return finalizeReport(
      'student-overview',
      [
        finding(
          'S-01',
          'neutral',
          'No enrolled courses yet',
          'Diagnostics need at least one enrolled course with saved scores.',
          'Enroll with your professor’s class code, then open the course and save your assessment scores.',
          { priority: 10 },
        ),
      ],
      'No enrolled courses yet',
      { limit: RBA_CONFIG.maxOverviewFindings, courses: [] },
    );
  }

  const attention = courseReports.filter((report) =>
    ['critical', 'warning'].includes(report.status),
  ).length;
  const onTrack = courseReports.filter((report) => report.status === 'positive').length;
  const insufficient = courseReports.filter((report) => report.status === 'neutral').length;

  const allFindings = courseReports.flatMap((report) =>
    report.findings
      .filter((item) => item.severity !== 'neutral')
      .map((item) => ({
        ...item,
        courseCode: report.courseCode,
        enrollmentId: report.enrollmentId,
        href:
          report.enrollmentId !== null
            ? `course_scores.html?enrollment_id=${report.enrollmentId}`
            : null,
      })),
  );

  const summary = `${attention} ${attention === 1 ? 'course needs' : 'courses need'} attention · ${onTrack} on track · ${insufficient} need more scores`;

  const report = finalizeReport(
    'student-overview',
    allFindings,
    summary,
    {
      limit: RBA_CONFIG.maxOverviewFindings,
      courses: courseReports.map((courseReport) => ({
        courseCode: courseReport.courseCode,
        enrollmentId: courseReport.enrollmentId,
        status: courseReport.status,
        summary: courseReport.summary,
        href:
          courseReport.enrollmentId !== null
            ? `course_scores.html?enrollment_id=${courseReport.enrollmentId}`
            : null,
      })),
      attention,
      onTrack,
      insufficient,
    },
  );

  if (report.findings.length === 0 && attention === 0) {
    const neutralReport = finalizeReport(
      'student-overview',
      [
        finding(
          'S-01',
          'neutral',
          'Not enough data yet',
          'Your enrolled courses do not have enough saved scores for a reliable diagnosis.',
          `Add at least ${RBA_CONFIG.minScoredComponents} scored categories covering ${RBA_CONFIG.minCoverage}% of a course to unlock recommendations.`,
          { priority: 10 },
        ),
      ],
      summary,
      { limit: RBA_CONFIG.maxOverviewFindings, courses: report.courses },
    );
    return neutralReport;
  }

  return report;
}

/* -------------------------------------------------------------------------- */
/* Professor cohort analysis                                                  */
/* -------------------------------------------------------------------------- */

function buildStudentCohortStats(templateComponents, student) {
  const entries = [];
  for (const component of student.components ?? []) {
    for (const assessment of component.assessments ?? []) {
      entries.push({
        component_id: component.id,
        title: assessment.title,
        score: assessment.score,
        max: assessment.max,
      });
    }
  }

  let stats = buildCourseStats({ components: templateComponents, entries });
  if (stats.scoredComponents === 0) {
    stats = statsFromComponentPercentages(templateComponents, student.components ?? []);
  }
  return stats;
}

function courseFinding(course, ruleId, severity, title, message, recommendation, extra = {}) {
  return finding(ruleId, severity, title, message, recommendation, {
    courseCode: course.code || 'Course',
    courseId: course.id,
    ...extra,
  });
}

export function analyzeCohort({ courses = [], gradeScale } = {}) {
  const scale = normalizeScale(gradeScale);
  const passPercentage = passingPercentage(scale);
  const findings = [];

  let sufficientCourses = 0;
  let insufficientCourses = 0;
  let scoredStudentsTotal = 0;
  let atRiskTotal = 0;
  let provisionalTotal = 0;
  let bestCoverage = 0;

  for (const course of Array.isArray(courses) ? courses : []) {
    const code = course.code || 'Course';
    const templateComponents = (course.components ?? []).map(normalizeComponent);
    const students = Array.isArray(course.students) ? course.students : [];
    const studentStats = [];

    for (const student of students) {
      const stats = buildStudentCohortStats(templateComponents, student);
      if (stats.scoredComponents === 0 || stats.percentage === null) continue;
      studentStats.push(stats);
    }

    if (studentStats.length === 0) {
      insufficientCourses += 1;
      continue;
    }

    scoredStudentsTotal += studentStats.length;

    if (studentStats.length < RBA_CONFIG.cohortMinStudents) {
      insufficientCourses += 1;
      continue;
    }

    const weightsValid = studentStats.every((stats) => stats.weightsValid);
    if (!weightsValid) {
      sufficientCourses += 1;
      findings.push(
        courseFinding(
          { ...course, code },
          'C-00',
          'warning',
          `${code} grading weights need correction`,
          'Midterms and Finals must each total 100%, with every category between 1% and 100%.',
          'Ask the professor to correct the template weights; cohort analysis for this class is paused.',
          { priority: 5 },
        ),
      );
      continue;
    }

    sufficientCourses += 1;
    const percentages = studentStats.map((stats) => stats.percentage);
    const mean = average(percentages);
    const grade = percentageToGrade(mean, scale);
    const atRisk = percentages.filter((value) => value < passPercentage).length;
    const riskShare = (atRisk / percentages.length) * 100;
    const provisional = studentStats.filter((stats) => stats.coverage < 100).length;
    const meanCoverage = average(studentStats.map((stats) => stats.coverage));
    bestCoverage = Math.max(bestCoverage, meanCoverage);
    atRiskTotal += atRisk;
    provisionalTotal += provisional;

    if (mean < passPercentage && meanCoverage >= RBA_CONFIG.minCoverage) {
      findings.push(
        courseFinding(
          { ...course, code },
          'C-02',
          'critical',
          `${code} cohort is below passing`,
          `The cohort average is ${formatPercent(mean)} (${formatGrade(grade)}), below the passing ${formatPercent(passPercentage)} (3.00).`,
          'Review the weakest categories below and consider a class-wide review session.',
          { priority: 10, value: mean, grade },
        ),
      );
    }

    const componentStats = [];
    for (const category of groupComponentsByName(templateComponents)) {
      const values = [];
      for (const stats of studentStats) {
        const match = groupComponentsByName(stats.components).find(
          (item) => item.key === category.key,
        );
        if (match && match.percentage !== null) values.push(match.percentage);
      }
      if (values.length < RBA_CONFIG.assessmentMinSamples) continue;

      const componentMean = average(values);
      const passCount = values.filter((value) => value >= passPercentage).length;
      const passRate = (passCount / values.length) * 100;
      componentStats.push({
        name: category.name,
        mean: componentMean,
        passCount,
        sampleSize: values.length,
        passRate,
      });

      if (componentMean < passPercentage) {
        const severity =
          componentMean < RBA_CONFIG.criticalComponentPercentage ||
          passRate < RBA_CONFIG.lowPassRateCritical
            ? 'critical'
            : 'warning';
        findings.push(
          courseFinding(
            { ...course, code },
            'C-03',
            severity,
            `${category.name} is a class-wide weak point`,
            `${passCount} of ${values.length} students are below passing in ${category.name} (mean ${formatPercent(componentMean)}).`,
            `Consider a review session or extra practice set for ${category.name}.`,
            {
              priority: 20,
              component: category.name,
              value: componentMean,
              passRate,
              sampleSize: values.length,
            },
          ),
        );
      }
    }

    const weakAssessments = [];
    for (const component of templateComponents) {
      const grouped = new Map();
      for (const stats of studentStats) {
        const match = stats.components.find((item) => item.id === component.id);
        if (!match) continue;
        const seen = new Map();
        for (const assessment of match.assessments) {
          const key = normalizeTitle(assessment.title);
          if (!key || seen.has(key)) continue;
          seen.set(key, assessment);
        }
        for (const [key, assessment] of seen) {
          if (!grouped.has(key)) {
            grouped.set(key, { title: assessment.title.trim(), values: [] });
          }
          grouped.get(key).values.push(assessment.percentage);
        }
      }

      for (const group of grouped.values()) {
        if (group.values.length < RBA_CONFIG.assessmentMinSamples) continue;
        const passCount = group.values.filter((value) => value >= passPercentage).length;
        const passRate = (passCount / group.values.length) * 100;
        if (passRate >= RBA_CONFIG.lowPassRateWarning) continue;

        const severity = passRate < RBA_CONFIG.lowPassRateCritical ? 'critical' : 'warning';
        const periodLabel = PERIOD_LABELS[component.period];
        weakAssessments.push({ title: group.title, component: component.name, passRate, passCount, sampleSize: group.values.length });
        findings.push(
          courseFinding(
            { ...course, code },
            'C-04',
            severity,
            `${group.title} (${periodLabel}) has a low pass rate`,
            `${group.title} (${periodLabel}) in ${component.name} has a ${Math.round(passRate)}% pass rate (${passCount}/${group.values.length} students).`,
            'Revisit the topic, share worked examples, or offer a practice/retake opportunity.',
            {
              priority: 25,
              component: component.name,
              period: component.period,
              assessment: group.title,
              value: passRate,
              passCount,
              sampleSize: group.values.length,
            },
          ),
        );
      }
    }

    if (riskShare >= RBA_CONFIG.atRiskShare && meanCoverage >= RBA_CONFIG.minCoverage) {
      findings.push(
        courseFinding(
          { ...course, code },
          'C-05',
          'warning',
          'Many students are below passing',
          `${atRisk} of ${percentages.length} students (${Math.round(riskShare)}%) are below passing in ${code}.`,
          'Use the category breakdown below to target the weakest topics for the whole class.',
          { priority: 30, value: riskShare, atRisk, sampleSize: percentages.length },
        ),
      );
    }

    const hasWeakness =
      componentStats.some((item) => item.mean < passPercentage) || weakAssessments.length > 0;
    if (
      mean >= RBA_CONFIG.strongPercentage &&
      meanCoverage >= 50 &&
      !hasWeakness &&
      atRisk === 0
    ) {
      findings.push(
        courseFinding(
          { ...course, code },
          'C-06',
          'positive',
          `${code} is on track`,
          `The cohort average is ${formatPercent(mean)} (${formatGrade(grade)}) with no class-wide weak categories.`,
          'Keep the current pacing; no intervention is suggested by the current scores.',
          { priority: 80, value: mean },
        ),
      );
    }
  }

  if (sufficientCourses > 0 && findings.length === 0) {
    if (bestCoverage < RBA_CONFIG.minCoverage) {
      findings.push(
        finding(
          'C-01',
          'neutral',
          'Not enough assessed weight yet',
          `The cohort has scores for only about ${Math.round(bestCoverage)}% of the course weight.`,
          `Collect scores covering at least ${RBA_CONFIG.minCoverage}% of a class before drawing cohort conclusions.`,
          { priority: 10 },
        ),
      );
    } else {
      findings.push(
        finding(
          'C-06',
          'positive',
          'No class-wide weak points detected',
          `No category or assessment is currently below passing across ${scoredStudentsTotal} scored students.`,
          'Continue monitoring saved scores; diagnostics refresh as new work is recorded.',
          { priority: 80 },
        ),
      );
    }
  }

  if (sufficientCourses === 0) {
    const message =
      insufficientCourses > 0
        ? `Only ${scoredStudentsTotal} scored ${scoredStudentsTotal === 1 ? 'student is' : 'students are'} available. Diagnostics need at least ${RBA_CONFIG.cohortMinStudents} scored students per class.`
        : 'No saved cohort scores are available yet.';
    return finalizeReport(
      'cohort',
      [
        finding(
          'C-01',
          'neutral',
          'Not enough cohort data',
          message,
          `Collect at least ${RBA_CONFIG.cohortMinStudents} scored students in a class to unlock anonymized cohort insights.`,
          { priority: 10 },
        ),
      ],
      'Insufficient cohort data',
      {
        limit: RBA_CONFIG.maxFindings,
        sampleSize: scoredStudentsTotal,
        courses: [],
      },
    );
  }

  const summaryParts = [
    `${sufficientCourses} ${sufficientCourses === 1 ? 'course' : 'courses'}`,
    `${scoredStudentsTotal} scored ${scoredStudentsTotal === 1 ? 'student' : 'students'}`,
    `${atRiskTotal} at risk`,
  ];
  if (provisionalTotal > 0) summaryParts.push(`${provisionalTotal} provisional`);
  if (insufficientCourses > 0) summaryParts.push(`${insufficientCourses} need more data`);

  return finalizeReport('cohort', findings, summaryParts.join(' · '), {
    limit: RBA_CONFIG.maxFindings,
    sampleSize: scoredStudentsTotal,
    coverage: bestCoverage,
    coursesWithData: sufficientCourses,
    insufficientCourses,
    atRiskTotal,
    provisionalTotal,
  });
}

/* -------------------------------------------------------------------------- */
/* Professor draft-weight preview                                             */
/* -------------------------------------------------------------------------- */

function flattenDraftComponents(draftComponents) {
  if (Array.isArray(draftComponents)) {
    return draftComponents.map((component, index) => ({
      databaseId: component.databaseId ?? component.database_id ?? component.id ?? null,
      period: component.period === 'finals' ? 'finals' : 'midterms',
      name: String(component.name ?? '').trim() || `Category ${index + 1}`,
      weight: asNumber(component.weight),
      isExam: component.is_exam === '1' || component.is_exam === true || component.isExam === true,
    }));
  }

  const result = [];
  for (const period of Object.keys(PERIOD_LABELS)) {
    for (const component of draftComponents?.[period] ?? []) {
      result.push({
        databaseId: component.databaseId ?? component.database_id ?? component.id ?? null,
        period,
        name: String(component.name ?? '').trim() || 'Category',
        weight: asNumber(component.weight),
        isExam:
          component.is_exam === '1' ||
          component.is_exam === true ||
          component.isExam === true,
      });
    }
  }
  return result;
}

export function previewDraftWeights({
  courses = [],
  draftComponents = [],
  templateId = 0,
  gradeScale,
} = {}) {
  const scale = normalizeScale(gradeScale);
  const passPercentage = passingPercentage(scale);
  const draft = flattenDraftComponents(draftComponents);

  const neutral = (title, message, recommendation) =>
    finalizeReport(
      'template-draft',
      [finding('D-01', 'neutral', title, message, recommendation, { priority: 10 })],
      message,
      { limit: 1 },
    );

  if (!Number.isFinite(Number(templateId)) || Number(templateId) <= 0) {
    return neutral(
      'Save the template first',
      'Cohort impact can be previewed after this template is published and students have saved scores.',
      'Publish the template, share the class code, and collect scores.',
    );
  }

  const course = (Array.isArray(courses) ? courses : []).find(
    (item) => String(item.id) === String(templateId),
  );
  const students = Array.isArray(course?.students) ? course.students : [];
  if (!course || students.length === 0) {
    return neutral(
      'No cohort scores yet',
      'This class does not have any students with saved scores yet.',
      'Share the class code and ask students to save their assessment scores.',
    );
  }

  const weightsValid =
    draft.length > 0 &&
    draft.every(
      (component) =>
        Number.isFinite(component.weight) &&
        component.weight >= 1 &&
        component.weight <= 100,
    ) &&
    Object.keys(PERIOD_LABELS).every(
      (period) =>
        draft
          .filter((component) => component.period === period)
          .reduce((sum, component) => sum + component.weight, 0) === 100,
    );

  if (!weightsValid) {
    return neutral(
      'Draft weights are incomplete',
      'Midterms and Finals must each total 100% before cohort impact can be previewed.',
      'Finish the weights, then review the preview before saving.',
    );
  }

  const savedComponents = course.components ?? [];
  const savedById = new Map(
    savedComponents.map((component) => [
      String(component.database_id ?? component.id),
      component,
    ]),
  );

  const findSavedComponent = (component) => {
    const byId = savedById.get(String(component.databaseId ?? ''));
    if (byId) return byId;
    return (
      savedComponents.find(
        (candidate) =>
          normalizeTitle(candidate.name) === normalizeTitle(component.name) &&
          candidate.period === component.period,
      ) ?? null
    );
  };

  const draftTemplateComponents = draft.map((component, index) => {
    const saved = findSavedComponent(component);
    return {
      id: saved?.id ?? `draft_${index}`,
      period: component.period,
      name: component.name,
      weight: component.weight,
      is_exam: component.isExam,
    };
  });

  const studentStats = [];
  for (const student of students) {
    const entries = [];
    for (const component of student.components ?? []) {
      for (const assessment of component.assessments ?? []) {
        entries.push({
          component_id: component.id,
          title: assessment.title,
          score: assessment.score,
          max: assessment.max,
        });
      }
    }
    const stats = buildCourseStats({ components: draftTemplateComponents, entries });
    if (stats.scoredComponents > 0 && stats.percentage !== null) {
      studentStats.push(stats);
    }
  }

  if (studentStats.length === 0) {
    return neutral(
      'No scored components to preview',
      'The draft weights do not match any components with saved scores.',
      'Keep the existing component IDs or collect scores for the new components.',
    );
  }

  const percentages = studentStats.map((stats) => stats.percentage);
  const mean = average(percentages);
  const grade = percentageToGrade(mean, scale);
  const atRisk = percentages.filter((value) => value < passPercentage).length;

  const componentMeans = new Map();
  for (const component of draftTemplateComponents) {
    const values = [];
    for (const stats of studentStats) {
      const match = stats.components.find((item) => item.id === component.id);
      if (match && match.percentage !== null) values.push(match.percentage);
    }
    if (values.length > 0) {
      componentMeans.set(component.id, {
        name: component.name,
        mean: average(values),
      });
    }
  }
  const weakest = [...componentMeans.values()].sort((a, b) => a.mean - b.mean)[0] ?? null;

  const summaryParts = [
    'Draft preview (unsaved weights)',
    `cohort average ${formatPercent(mean)}`,
    `${atRisk}/${percentages.length} at risk`,
  ];
  if (weakest) summaryParts.push(`weakest ${weakest.name} (${formatPercent(weakest.mean)})`);

  const severity = mean < passPercentage || atRisk > 0 ? 'warning' : 'positive';

  return finalizeReport(
    'template-draft',
    [
      finding(
        'D-03',
        severity,
        'Unsaved weight impact',
        summaryParts.join(' · '),
        atRisk > 0
          ? 'Review the weakest category before saving. Saving changes the weights students see.'
          : 'The draft weights keep the cohort on track. Saving will apply them to enrolled students.',
        {
          priority: 20,
          value: mean,
          atRisk,
          sampleSize: percentages.length,
          weakest: weakest?.name ?? null,
        },
      ),
    ],
    summaryParts.join(' · '),
    { limit: 1, coverage: null, sampleSize: percentages.length },
  );
}
