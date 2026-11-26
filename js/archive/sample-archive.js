import { sampleSemesters } from './sample-records.js';

const isStudent = document.body.dataset.archiveRole === 'student';
const metrics = document.getElementById('archive-summary');
const records = document.getElementById('archive-records');
const percent = value => value.toFixed(1) + '%';

const archiveView = isStudent ? {
    records: term => term.subjects,
    totalsLabels: ['Completed Units', 'Term GWA'],
    headings: ['Course', 'Units', 'Midterms', 'Finals', 'Final %', 'Grade'],
    values: row => [row.units.toFixed(1), percent(row.midterms), percent(row.finals),
        percent((row.midterms + row.finals) / 2), row.grade.toFixed(2)],
    totals(rows) {
        const units = rows.reduce((total, row) => total + row.units, 0);
        const weightedGrades = rows.reduce((total, row) => total + row.grade * row.units, 0);
        return [units.toFixed(1), (weightedGrades / units).toFixed(2)];
    },
} : {
    records: term => term.sections,
    totalsLabels: ['Archived Sections', 'Term Pass Rate'],
    headings: ['Course', 'Section', 'Enrolled', 'Passed', 'Class Average', 'Pass Rate'],
    values: row => [row.name, row.enrolled, row.passed, percent(row.average), percent(row.passed / row.enrolled * 100)],
    totals(rows) {
        const enrolled = rows.reduce((total, row) => total + row.enrolled, 0);
        const passed = rows.reduce((total, row) => total + row.passed, 0);
        return [rows.length, percent(passed / enrolled * 100)];
    },
};

const summary = [sampleSemesters.length, ...archiveView.totals(sampleSemesters.flatMap(archiveView.records))];
metrics.querySelectorAll('dd').forEach((value, index) => {
    value.textContent = summary[index];
});

const cardStyle = isStudent ? 'rounded-3xl' : 'rounded-xl';
const actionStyle = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold';
const neutralAction = actionStyle + ' bg-stone-100 text-stone-700 hover:bg-stone-200';
const viewAction = actionStyle + ' bg-maroon-50 text-maroon-900 hover:bg-maroon-100';
const recordLabel = isStudent ? 'course' : 'section';

function renderRecordTable(term, showActions = false) {
    const headings = showActions ? [...archiveView.headings, 'Actions'] : archiveView.headings;
    return `
        <div class="overflow-x-auto border-t border-stone-200" tabindex="0" role="region" aria-label="${term.title} records">
            <table class="w-full text-left text-xs text-slate-800">
                <thead class="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600">
                    <tr>
                        ${headings.map(heading => `<th scope="col" class="whitespace-nowrap px-4 py-3">${heading}</th>`).join('')}
                    </tr>
                </thead>
                <tbody class="divide-y divide-stone-100">
                    ${archiveView.records(term).map((row, index) => `
                        <tr>
                            <th scope="row" class="min-w-[13rem] px-4 py-3 font-semibold">
                                <span class="mr-1 inline-block text-maroon-900">${row.code}</span>
                                ${row.title}
                            </th>
                            ${archiveView.values(row).map(value => `<td class="whitespace-nowrap px-4 py-3 tabular-nums">${value}</td>`).join('')}
                            ${showActions ? `
                                <td class="px-4 py-3">
                                    <div class="flex items-center gap-1.5">
                                        <button type="button" data-archive-action="view-record" data-record-index="${index}" class="${viewAction}" aria-label="View ${row.code}${row.name ? ' ' + row.name : ''} details">
                                            <i class="fa-solid fa-chart-line" aria-hidden="true"></i> View
                                        </button>
                                        <button type="button" data-archive-action="restore-record" data-record-index="${index}" class="${neutralAction}" aria-label="Restore ${row.code}${row.name ? ' ' + row.name : ''}">
                                            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restore
                                        </button>
                                    </div>
                                </td>` : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
}

records.innerHTML = sampleSemesters.map((term, index) => `
    <article class="overflow-hidden border border-stone-200 bg-white shadow-sm ${cardStyle}" data-term-index="${index}">
        <div class="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
                <h2>
                    <button type="button" data-archive-action="toggle" aria-expanded="${index === 0}" aria-controls="archive-term-${index}" class="group inline-flex items-center gap-2 text-left font-bold text-slate-900 hover:text-maroon-900">
                        ${term.title}
                        <i class="fa-solid fa-chevron-down text-xs text-maroon-800 group-aria-expanded:rotate-180" aria-hidden="true"></i>
                    </button>
                </h2>
                <p class="mt-0.5 text-xs text-stone-500">Archived ${term.archived}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" data-archive-action="view-term" class="${viewAction}">
                    <i class="fa-regular fa-folder-open" aria-hidden="true"></i> View Semester
                </button>
                <button type="button" data-archive-action="restore-term" class="${neutralAction}">
                    <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restore Semester
                </button>
            </div>
        </div>
        <div id="archive-term-${index}" ${index === 0 ? '' : 'hidden'}>
            ${renderRecordTable(term, true)}
        </div>
    </article>
`).join('');

records.insertAdjacentHTML('beforeend', `
    <dialog id="archive-dialog" aria-labelledby="archive-dialog-title" aria-describedby="archive-dialog-note" class="w-[calc(100%_-_2rem)] max-w-4xl max-h-[90vh] overflow-y-auto overscroll-contain rounded-2xl border border-stone-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/50">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4">
            <div>
                <h2 id="archive-dialog-title" class="text-base font-bold text-slate-900"></h2>
                <p id="archive-dialog-note" class="mt-1 text-xs text-stone-500"></p>
            </div>
            <form method="dialog">
                <button type="submit" autofocus class="${neutralAction}">Close</button>
            </form>
        </div>
        <div id="archive-dialog-content"></div>
    </dialog>
`);

const dialog = document.getElementById('archive-dialog');
const dialogTitle = document.getElementById('archive-dialog-title');
const dialogNote = document.getElementById('archive-dialog-note');
const dialogContent = document.getElementById('archive-dialog-content');

function renderFacts(labels, values) {
    return `<dl class="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
        ${labels.map((label, index) => `
            <div class="rounded-lg bg-stone-50 p-3">
                <dt class="text-xs font-medium text-stone-600">${label}</dt>
                <dd class="mt-1 text-sm font-bold text-maroon-900">${values[index]}</dd>
            </div>
        `).join('')}
    </dl>`;
}

function openArchiveDialog(title, note, content = '') {
    dialogTitle.textContent = title;
    dialogNote.textContent = note;
    dialogContent.innerHTML = content;
    dialog.showModal();
}

records.addEventListener('click', event => {
    const button = event.target.closest('button[data-archive-action]');
    if (!button) return;

    const termCard = button.closest('[data-term-index]');
    const term = sampleSemesters[Number(termCard.dataset.termIndex)];
    const action = button.dataset.archiveAction;

    if (action === 'toggle') {
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', String(!panel.hidden));
        return;
    }

    if (action === 'view-term') {
        const totals = archiveView.totals(archiveView.records(term));
        openArchiveDialog(term.title, 'Archived ' + term.archived + ' · Sample records',
            renderFacts(archiveView.totalsLabels, totals) + renderRecordTable(term));
        return;
    }

    if (action === 'restore-term') {
        openArchiveDialog('Restore Semester', term.title, `
            <p class="p-5 text-sm text-stone-600">This is a sample semester. Restoring is unavailable in this preview.</p>
        `);
        return;
    }

    const row = archiveView.records(term)[Number(button.dataset.recordIndex)];
    const title = row.code + ' · ' + row.title + (row.name ? ' · ' + row.name : '');
    if (action === 'view-record') {
        openArchiveDialog(title, term.title + ' · Sample record',
            renderFacts(archiveView.headings.slice(1), archiveView.values(row)));
        return;
    }

    openArchiveDialog('Restore ' + recordLabel, title, `
        <p class="p-5 text-sm text-stone-600">This is a sample record. Restoring is unavailable in this preview.</p>
    `);
});
