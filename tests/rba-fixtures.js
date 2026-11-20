export const GRADE_SCALE = [
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
];

export function sampleComponents() {
  return [
    { id: 'midterms_1', database_id: 1, period: 'midterms', name: 'Quizzes', weight: 30, is_exam: false },
    { id: 'midterms_2', database_id: 2, period: 'midterms', name: 'Exam', weight: 70, is_exam: true },
    { id: 'finals_3', database_id: 3, period: 'finals', name: 'Quizzes', weight: 40, is_exam: false },
    { id: 'finals_4', database_id: 4, period: 'finals', name: 'Exam', weight: 60, is_exam: true },
  ];
}

export function sampleEntries() {
  return {
    midterms_1: [
      { assessment_title: 'Quiz 1', raw_score: '60', total_items: '100' },
      { assessment_title: 'Quiz 2', raw_score: '76', total_items: '100' },
    ],
    midterms_2: [{ assessment_title: 'Midterm Exam', raw_score: '88', total_items: '100' }],
    finals_3: [{ assessment_title: 'Quiz 3', raw_score: '68', total_items: '100' }],
    finals_4: [{ assessment_title: 'Final Exam', raw_score: '88', total_items: '100' }],
  };
}

export function toComponentResults(components, entries) {
  return components.map((component) => {
    const rows = entries[component.id] ?? [];
    const score = rows.reduce((sum, row) => sum + Number(row.raw_score), 0);
    const max = rows.reduce((sum, row) => sum + Number(row.total_items), 0);
    return {
      ...component,
      score,
      max,
      percentage: max > 0 ? (score / max) * 100 : null,
      assessments: rows.map((row) => ({
        title: row.assessment_title,
        score: Number(row.raw_score),
        max: Number(row.total_items),
      })),
    };
  });
}

export function dashboardCourse(overrides = {}) {
  const components = overrides.components ?? sampleComponents();
  const entries = overrides.entries ?? sampleEntries();
  return {
    id: 1,
    templateId: 1,
    enrollmentId: 11,
    code: 'CS-301',
    title: 'Data Structures',
    units: 3,
    classCode: 'CS301-SEC123456',
    components,
    componentResults: toComponentResults(components, entries),
    gradedWeight: 100,
    grade: 2.5,
    percentage: 81,
    gradeStatus: 'Complete',
    target: 2.0,
    ...overrides,
  };
}

export function cohortCourse({ studentCount = 10, weakCount = 6 } = {}) {
  const components = sampleComponents();
  const students = Array.from({ length: studentCount }, (_, index) => {
    const weak = index < weakCount;
    const quiz = weak ? 40 : 80;
    const exam = 80;
    const rows = [
      { id: 'midterms_1', title: 'Quiz 1', score: quiz, max: 100 },
      { id: 'midterms_2', title: 'Midterm Exam', score: exam, max: 100 },
      { id: 'finals_3', title: 'Quiz 3', score: quiz, max: 100 },
      { id: 'finals_4', title: 'Final Exam', score: exam, max: 100 },
    ];
    return {
      enrollmentId: index + 1,
      student: `Student ${index + 1}`,
      email: `student${index + 1}@example.com`,
      percentage: quiz * 0.5 + exam * 0.5,
      components: rows.map((row, rowIndex) => ({
        id: row.id,
        period: rowIndex < 2 ? 'midterms' : 'finals',
        name: components[rowIndex].name,
        weight: components[rowIndex].weight,
        score: row.score,
        max: row.max,
        percentage: row.score / row.max * 100,
        assessments: [{ title: row.title, score: row.score, max: row.max }],
      })),
    };
  });

  return {
    id: 1,
    code: 'CS-301',
    title: 'Data Structures',
    components,
    students,
  };
}

export function draftComponents() {
  return {
    midterms: [
      { id: '1', name: 'Quizzes', weight: '50', is_exam: '0' },
      { id: '2', name: 'Exam', weight: '50', is_exam: '1' },
    ],
    finals: [
      { id: '3', name: 'Quizzes', weight: '50', is_exam: '0' },
      { id: '4', name: 'Exam', weight: '50', is_exam: '1' },
    ],
  };
}
