import { analyzeCohort, previewDraftWeights } from './engine.js';
import { renderReport, renderDraftPreview, renderError } from './render.js';

const cohortContainer = document.getElementById('cohortDiagnostics');
const draftContainer = document.getElementById('templateDraftDiagnostics');
let cohortTimer = null;
let draftTimer = null;
let latestCohort = null;
let latestDraft = null;

function renderCohort(detail) {
  try {
    const report = analyzeCohort({
      courses: detail?.courses ?? [],
      gradeScale: detail?.gradeScale ?? detail?.gradeScalePairs ?? [],
    });
    renderReport(cohortContainer, report);
  } catch (error) {
    console.error('Rule-based analysis failed on the professor dashboard.', error);
    renderError(cohortContainer);
  }
}

function renderDraft(detail) {
  try {
    const report = previewDraftWeights({
      courses: detail?.courses ?? [],
      draftComponents: detail?.draftComponents ?? [],
      templateId: detail?.templateId ?? 0,
      gradeScale: detail?.gradeScale ?? detail?.gradeScalePairs ?? [],
    });
    renderDraftPreview(draftContainer, report);
  } catch (error) {
    console.error('Rule-based draft preview failed.', error);
    renderError(draftContainer, 'Draft impact preview unavailable. Saving still works normally.');
  }
}

document.addEventListener('rba:context', (event) => {
  if (event.detail?.page !== 'professor-dashboard' || !cohortContainer) return;
  latestCohort = event.detail;
  window.clearTimeout(cohortTimer);
  cohortTimer = window.setTimeout(() => {
    if (latestCohort) renderCohort(latestCohort);
  }, 120);
});

document.addEventListener('rba:template-draft', (event) => {
  if (event.detail?.page !== 'professor-draft' || !draftContainer) return;
  latestDraft = event.detail;
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    if (latestDraft) renderDraft(latestDraft);
  }, 150);
});

window.addEventListener('DOMContentLoaded', () => {
  if (!cohortContainer) return;
  if (!latestCohort && window.__rbaProfessorContext) renderCohort(window.__rbaProfessorContext);
});
