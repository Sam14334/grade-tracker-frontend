import { analyzeStudentOverview } from './engine.js';
import { renderReport, renderError } from './render.js';

const container = document.getElementById('studentDiagnostics');
let renderTimer = null;
let latestDetail = null;

function render(detail) {
  try {
    const report = analyzeStudentOverview({
      courses: detail?.courses ?? [],
      gradeScale: detail?.gradeScale ?? detail?.gradeScalePairs ?? [],
    });
    renderReport(container, report);
  } catch (error) {
    console.error('Rule-based analysis failed on the student dashboard.', error);
    renderError(container);
  }
}

function schedule(detail) {
  latestDetail = detail;
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    if (latestDetail) render(latestDetail);
  }, 100);
}

document.addEventListener('rba:context', (event) => {
  if (event.detail?.page !== 'student-dashboard' || !container) return;
  schedule(event.detail);
});

// If the page dispatched the context before this module finished loading, the
// classic script leaves a copy on window as a fallback.
window.addEventListener('DOMContentLoaded', () => {
  if (latestDetail || !container) return;
  if (window.__rbaStudentContext) render(window.__rbaStudentContext);
});
