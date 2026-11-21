import { analyzeStudentCourse } from './engine.js';
import { renderReport, renderError } from './render.js';

const container = document.getElementById('courseDiagnostics');
let renderTimer = null;
let latestDetail = null;

function render(detail) {
  try {
    const report = analyzeStudentCourse({
      courseCode: detail?.courseCode ?? 'Course',
      components: detail?.components ?? [],
      entries: detail?.entries ?? [],
      gradeScale: detail?.gradeScale ?? [],
      target: detail?.target ?? null,
      enrollmentId: detail?.enrollmentId ?? null,
    });
    renderReport(container, report);
  } catch (error) {
    console.error('Rule-based analysis failed on the course score page.', error);
    renderError(container);
  }
}

function schedule(detail) {
  latestDetail = detail;
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    if (latestDetail) render(latestDetail);
  }, 120);
}

document.addEventListener('rba:context', (event) => {
  if (event.detail?.page !== 'course-scores' || !container) return;
  schedule(event.detail);
});

window.addEventListener('DOMContentLoaded', () => {
  if (latestDetail || !container) return;
  if (typeof window.getRbaScoreSnapshot === 'function') {
    schedule(window.getRbaScoreSnapshot());
  }
});
