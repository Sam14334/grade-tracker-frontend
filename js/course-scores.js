const periodLabels = { midterms: 'Midterms', finals: 'Finals' };

let scoreForm = null;
let scoresChanged = false;
let enrollmentId = 0;

document.addEventListener('DOMContentLoaded', bootstrapCourseScores);

async function bootstrapCourseScores() {
    try {
        const session = await API.session();
        if (!session.authenticated) {
            window.location.replace('index.html');
            return;
        }
        const professor = session.user.roleId === 2 || session.user.role.toLowerCase() === 'professor';
        if (professor) {
            window.location.replace('professor_dashboard.html');
            return;
        }
        API.setCsrfToken(session.csrfToken);

        enrollmentId = Number(new URLSearchParams(window.location.search).get('enrollment_id'));
        if (!Number.isInteger(enrollmentId) || enrollmentId < 1) {
            window.location.replace('student_dashboard.html#grades');
            return;
        }

        const data = await API.get(`/student/courses/${enrollmentId}`);
        API.setCsrfToken(data.csrfToken);

        window.courseGradeScale = data.gradeScale;
        window.courseTargetGrade = data.course.target;

        renderCourse(data);
        initScoreForm();
        if (data.components.length > 0) updateScorePreview();

        if (new URLSearchParams(window.location.search).get('saved')) {
            showCourseAlert('Scores saved. Your calculator now reflects these scores.', 'success');
        }
    } catch (error) {
        if (error.status === 401) {
            window.location.replace('index.html');
            return;
        }
        showCourseAlert(error.message, 'error');
        if (error.status === 404) {
            window.setTimeout(() => window.location.replace('student_dashboard.html#grades'), 1500);
        }
    }
}

function escapeScoreText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

function renderCourse(data) {
    document.title = `${data.course.code} Scores - Grade Tracker`;
    document.getElementById('courseCodeTitle').textContent = data.course.code;
    document.getElementById('courseSubtitle').innerHTML = `${escapeScoreText(data.course.title)} &middot; ${Number(data.course.units).toFixed(1)} units`;

    const container = document.getElementById('scoreComponents');
    container.innerHTML = '';

    if (data.components.length === 0) {
        container.innerHTML = '<p class="text-sm text-stone-600">This template has no components. Ask your professor to complete it.</p>';
        document.getElementById('saveScoresButton').disabled = true;
        return;
    }

    Object.entries(periodLabels).forEach(([period, label]) => {
        const periodHeading = document.createElement('h2');
        periodHeading.className = 'text-lg font-extrabold text-maroon-900 pt-3';
        periodHeading.innerHTML = `${label} <span class="text-xs font-medium text-stone-500">100% period weight · 50% of overall grade</span>`;
        container.appendChild(periodHeading);

        data.components.filter(component => component.period === period).forEach(component => {
            const componentId = component.id;
            const entries = data.entries[componentId] || [];
            const rows = entries.length > 0
                ? entries
                : [{ assessment_title: 'Entry 1', raw_score: '', total_items: '' }];

            const section = document.createElement('section');
            section.dataset.componentId = componentId;
            section.dataset.period = period;
            section.dataset.weight = String(component.weight);
            section.dataset.isExam = component.is_exam ? '1' : '0';
            section.dataset.nextIndex = String(rows.length);
            section.className = 'score-component bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4';

            const entriesHtml = rows.map((entry, index) => `
                <div class="score-entry grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_4rem] gap-3 items-end">
                    <label class="col-span-2 sm:col-span-1 text-xs font-semibold text-stone-600">Entry name
                        <input type="text" name="entries[${escapeScoreText(componentId)}][${index}][assessment_title]" maxlength="100" value="${escapeScoreText(entry.assessment_title)}" placeholder="Entry ${index + 1}"
                            class="entry-title mt-1 block w-full px-3 py-2.5 rounded-xl border border-stone-300 text-xs text-slate-800 outline-none focus:border-maroon-800">
                    </label>
                    <label class="text-xs font-semibold text-stone-600">Score
                        <input type="number" name="entries[${escapeScoreText(componentId)}][${index}][raw_score]" min="0" max="9999999.99" step="0.01" value="${escapeScoreText(entry.raw_score)}" placeholder="0"
                            class="entry-score mt-1 block w-full px-3 py-2.5 rounded-xl border border-stone-300 text-xs text-slate-800 outline-none focus:border-maroon-800">
                    </label>
                    <label class="text-xs font-semibold text-stone-600">Max score
                        <input type="number" name="entries[${escapeScoreText(componentId)}][${index}][total_items]" min="1" max="2147483647" step="1" value="${escapeScoreText(entry.total_items)}" placeholder="100"
                            class="entry-max mt-1 block w-full px-3 py-2.5 rounded-xl border border-stone-300 text-xs text-slate-800 outline-none focus:border-maroon-800">
                    </label>
                    <button type="button" title="Clear score and max score" class="remove-entry text-xs font-semibold text-rose-600 hover:underline py-2.5 sm:text-right">Remove</button>
                </div>`).join('');

            section.innerHTML = `
                <div class="flex items-center justify-between gap-3">
                    <h2 class="font-bold text-slate-900">${escapeScoreText(component.name)}</h2>
                    <span class="text-xs font-bold text-maroon-800 bg-maroon-50 border border-maroon-200 px-3 py-1 rounded-full">${Number(component.weight)}%</span>
                </div>
                <div class="score-entries space-y-3">${entriesHtml}</div>
                <div class="flex flex-wrap justify-between items-center gap-3 pt-1">
                    <button type="button" class="add-entry text-xs font-bold text-maroon-800 hover:underline">+ Add Entry</button>
                    <p class="component-summary text-xs text-stone-500"></p>
                </div>
            `;
            container.appendChild(section);
        });
    });

    const examSelect = document.getElementById('predictorExam');
    examSelect.innerHTML = '';
    if (data.examComponents.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No exams marked';
        examSelect.appendChild(option);
        examSelect.disabled = true;
        document.getElementById('predictorMax').disabled = true;
    } else {
        data.examComponents.forEach(component => {
            const option = document.createElement('option');
            option.value = component.id;
            option.textContent = `${periodLabels[component.period]} · ${component.name}`;
            examSelect.appendChild(option);
        });
    }

    document.getElementById('predictorTargetLabel').textContent = `Target grade: ${Number(data.course.target).toFixed(2)}`;
}

function initScoreForm() {
    scoreForm = document.getElementById('courseScoresForm');
    scoresChanged = false;

    scoreForm.addEventListener('input', markScoresChanged);
    scoreForm.addEventListener('click', event => {
        const add = event.target.closest('.add-entry');
        const remove = event.target.closest('.remove-entry');
        if (add) {
            const component = add.closest('.score-component');
            const index = Number(component.dataset.nextIndex);
            component.dataset.nextIndex = index + 1;
            const row = document.getElementById('scoreEntryTemplate').content.cloneNode(true);
            row.querySelectorAll('[data-field]').forEach(input => {
                input.name = `entries[${component.dataset.componentId}][${index}][${input.dataset.field}]`;
            });
            row.querySelector('.entry-title').value = `Entry ${index + 1}`;
            component.querySelector('.score-entries').appendChild(row);
            markScoresChanged();
        } else if (remove) {
            const row = remove.closest('.score-entry');
            row.querySelector('.entry-score').value = '';
            row.querySelector('.entry-max').value = '';
            markScoresChanged();
        }
    });

    scoreForm.addEventListener('submit', event => {
        event.preventDefault();
        updateScorePreview();
        if (!scoreForm.reportValidity()) return;
        saveScores();
    });

    document.getElementById('predictorExam').addEventListener('change', () => {
        document.getElementById('predictorMax').value = '';
        updateScorePreview();
    });
    document.getElementById('predictorMax').addEventListener('input', updateScorePreview);

    window.addEventListener('beforeunload', event => {
        if (!scoresChanged) return;
        event.preventDefault();
        event.returnValue = '';
    });
}

function markScoresChanged() {
    scoresChanged = true;
    document.getElementById('scoreSaveStatus').textContent = 'Unsaved changes';
    updateScorePreview();
}

function collectEntries() {
    const entries = {};
    document.querySelectorAll('.score-component').forEach(component => {
        const componentId = component.dataset.componentId;
        entries[componentId] = [];
        component.querySelectorAll('.score-entry').forEach(row => {
            entries[componentId].push({
                assessment_title: row.querySelector('.entry-title').value,
                raw_score: row.querySelector('.entry-score').value,
                total_items: row.querySelector('.entry-max').value
            });
        });
    });
    return entries;
}

async function saveScores() {
    const button = document.getElementById('saveScoresButton');
    const status = document.getElementById('scoreSaveStatus');
    button.disabled = true;
    status.textContent = 'Saving...';

    try {
        await API.put(`/student/courses/${enrollmentId}/scores`, { entries: collectEntries() });
        scoresChanged = false;
        window.location.href = `course_scores.html?enrollment_id=${enrollmentId}&saved=1`;
    } catch (error) {
        const errors = error.data?.errors;
        if (Array.isArray(errors) && errors.length > 0) {
            errors.forEach(message => showCourseAlert(message, 'error'));
        } else {
            showCourseAlert(error.message, 'error');
        }
        status.textContent = 'Unsaved changes';
        button.disabled = false;
    }
}

function showCourseAlert(message, type = 'error') {
    const container = document.getElementById('courseAlerts');
    if (!container) return;

    const alert = document.createElement('p');
    alert.setAttribute('role', type === 'error' ? 'alert' : 'status');
    alert.className = type === 'error'
        ? 'bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-sm'
        : 'bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm';
    alert.textContent = message;
    container.appendChild(alert);
}

function calculatePeriodPreview(components) {
    const weight = components.reduce((sum, component) => sum + component.weight, 0);
    if (!components.length || weight !== 100 || components.some(component => component.weight < 0 || component.weight > 100)) {
        return { status: 'Invalid weights', grade: null, percentage: null };
    }
    if (components.some(component => !component.valid)) return { status: 'Check entries', grade: null, percentage: null };
    if (components.some(component => !component.isExam && component.maximum === 0)) {
        return { status: 'Incomplete', grade: null, percentage: null };
    }
    const percentage = components.reduce((sum, component) => sum +
        (component.maximum > 0 ? component.earned / component.maximum * component.weight : 0), 0);
    if (components.some(component => component.isExam && component.maximum === 0)) {
        return { status: 'In Progress', grade: null, percentage };
    }
    const grade = window.courseGradeScale.find(([minimum]) => Number(percentage.toFixed(10)) >= minimum)[1];
    return { status: 'Complete', grade, percentage };
}

function updateScorePreview() {
    const totals = [];
    document.querySelectorAll('.score-component').forEach(component => {
        const weight = Number(component.dataset.weight);
        const isExam = component.dataset.isExam === '1';
        let earned = 0;
        let maximum = 0;
        let valid = true;
        const rows = component.querySelectorAll('.score-entry');
        rows.forEach(row => {
            const score = row.querySelector('.entry-score');
            const max = row.querySelector('.entry-max');
            score.setCustomValidity('');
            max.setCustomValidity('');
            const scoreBlank = score.value === '' && !score.validity.badInput;
            const maxBlank = max.value === '' && !max.validity.badInput;
            if (scoreBlank && maxBlank) return;
            if (scoreBlank) score.setCustomValidity('Enter a score, including 0 if nothing was earned.');
            if (maxBlank) max.setCustomValidity('Enter the maximum score.');
            if (!scoreBlank && !/^\d{1,7}(?:\.\d{1,2})?$/.test(score.value)) score.setCustomValidity('Use a score with up to two decimal places.');
            if (!maxBlank && !/^[1-9]\d*$/.test(max.value)) max.setCustomValidity('Use a positive whole-number maximum.');
            if (!maxBlank && Number(score.value) > Number(max.value)) score.setCustomValidity('Score cannot exceed the maximum.');
            if (!score.checkValidity() || !max.checkValidity()) {
                valid = false;
                return;
            }
            earned += Number(score.value);
            maximum += Number(max.value);
        });
        totals.push({ id: component.dataset.componentId, period: component.dataset.period,
            name: component.querySelector('h2').textContent, weight, earned, maximum, isExam, valid });
        component.querySelector('.component-summary').textContent = maximum > 0
            ? `${earned.toFixed(2)} / ${maximum} · ${(earned / maximum * 100).toFixed(2)}% · ${(earned / maximum * weight).toFixed(2)} weighted points`
            : isExam ? 'Awaiting exam score' : 'No scored entries yet';
    });

    const periods = {};
    Object.keys(periodLabels).forEach(period => {
        periods[period] = calculatePeriodPreview(totals.filter(component => component.period === period));
        const result = periods[period];
        document.getElementById(`periodGrade-${period}`).textContent = result.grade === null ? result.status : result.grade.toFixed(2);
        document.getElementById(`periodPercentage-${period}`).textContent = result.percentage === null ? ''
            : `${result.percentage.toFixed(2)}%${result.status === 'Complete' ? '' : ' earned so far'}`;
    });
    const results = Object.values(periods);
    const status = ['Invalid weights', 'Check entries', 'Incomplete', 'In Progress'].find(value => results.some(result => result.status === value)) ?? 'Complete';
    const percentage = results.every(result => result.percentage !== null)
        ? (periods.midterms.percentage + periods.finals.percentage) / 2 : null;
    const grade = status === 'Complete'
        ? window.courseGradeScale.find(([minimum]) => Number(percentage.toFixed(10)) >= minimum)[1] : null;
    document.getElementById('courseGradePreview').textContent = grade === null ? status : grade.toFixed(2);
    document.getElementById('coursePercentagePreview').textContent = percentage === null ? ''
        : `${percentage.toFixed(2)}% ${status === 'Complete' ? 'overall' : 'earned so far'}`;
    const notes = {
        'Invalid weights': 'Midterms and Finals must each total 100%. Ask your professor to correct the template.',
        'Check entries': 'Correct invalid score entries. Scores cannot exceed their maximum.',
        'Incomplete': 'Each non-exam component needs at least one scored entry. Partial scores can be saved.',
        'In Progress': 'Each period retains its full weights. Pending exams add no points yet; this course stays out of GWA until both periods are complete.',
        'Complete': 'Overall percentage = 50% Midterms + 50% Finals, converted once to the PUP scale. Save Scores to update your calculator and GWA.'
    };
    document.getElementById('courseCalculationNote').textContent = notes[status];
    updateExamPrediction(totals);
}

function updateExamPrediction(components) {
    const result = document.getElementById('examPredictionResult');
    const note = document.getElementById('examPredictionNote');
    const maxInput = document.getElementById('predictorMax');
    const select = document.getElementById('predictorExam');
    const targetLabel = document.getElementById('predictorTargetLabel');
    const exams = components.filter(component => component.isExam);
    const pending = exams.filter(component => component.maximum === 0);
    [...select.options].forEach(option => {
        const exam = exams.find(component => component.id === option.value);
        if (!exam) return;
        option.disabled = exam.maximum > 0;
        option.textContent = `${periodLabels[exam.period]} · ${exam.name}${exam.maximum > 0 ? ' — Scored' : ''}`;
    });
    let selected = exams.find(component => component.id === select.value);
    if (pending.length > 0 && (!selected || selected.maximum > 0)) {
        selected = pending[0];
        select.value = selected.id;
        maxInput.value = '';
    }
    select.disabled = exams.length === 0;
    maxInput.disabled = pending.length === 0;
    targetLabel.textContent = `Target grade: ${window.courseTargetGrade.toFixed(2)}`;
    note.textContent = 'Midterm predictions use Midterms only. Final predictions use completed Midterms and Finals. Predictions are not saved as scores.';
    if (!exams.length) {
        result.textContent = 'No exams are marked in this course template.';
        return;
    }
    if (!pending.length) {
        result.textContent = 'All exams are scored.';
        note.textContent = 'Actual exam scores are included. Clear both score and max score to make an exam pending again.';
        return;
    }
    if (!selected) {
        result.textContent = 'Select a pending examination.';
        return;
    }
    const isFinalExam = selected.period === 'finals';
    targetLabel.textContent = `${isFinalExam ? 'Overall course target' : 'Midterm target'}: ${window.courseTargetGrade.toFixed(2)}`;
    const periodComponents = components.filter(component => component.period === selected.period);
    const period = calculatePeriodPreview(periodComponents);
    if (period.status === 'Invalid weights' || period.status === 'Check entries') {
        result.textContent = `Correct the ${periodLabels[selected.period]} weights or score entries before predicting.`;
        return;
    }
    const midterms = isFinalExam
        ? calculatePeriodPreview(components.filter(component => component.period === 'midterms')) : null;
    if (isFinalExam && midterms.status !== 'Complete') {
        result.textContent = midterms.status === 'Invalid weights' || midterms.status === 'Check entries'
            ? 'Correct the Midterms weights or score entries before predicting the final exam.'
            : 'Complete all Midterm scores, including the exam, before predicting the final exam.';
        note.textContent = 'The final exam prediction needs the completed Midterm percentage to calculate the overall course target.';
        return;
    }
    const others = periodComponents.filter(component => component.id !== selected.id);
    const missing = others.filter(component => !component.isExam && component.maximum === 0);
    if (missing.length) {
        result.textContent = `Complete the ${periodLabels[selected.period]} non-exam coursework first.`;
        note.textContent = `Enter at least one scored entry for: ${missing.map(component => `${periodLabels[component.period]} · ${component.name}`).join(', ')}.`;
        return;
    }
    if (maxInput.value === '') {
        result.textContent = 'Enter the examination’s maximum score.';
        return;
    }
    if (!maxInput.checkValidity() || !/^[1-9]\d*$/.test(maxInput.value)) {
        result.textContent = 'Enter a positive whole-number exam maximum.';
        return;
    }
    const target = window.courseGradeScale.find(([, grade]) => grade === window.courseTargetGrade);
    if (!target || target[1] > 3 || selected.weight <= 0) {
        result.textContent = 'A passing target grade and a positive exam weight are required.';
        return;
    }
    const maximum = Number(maxInput.value);
    const otherPoints = others.reduce((sum, component) => sum +
        (component.maximum > 0 ? component.earned / component.maximum * component.weight : 0), 0);
    // Midterms target their own period; Finals target the 50/50 overall course grade.
    const requiredPeriodPercentage = isFinalExam ? (target[0] - midterms.percentage * 0.5) / 0.5 : target[0];
    const required = Math.max(0, Math.ceil(Number(((requiredPeriodPercentage - otherPoints) / selected.weight * maximum).toFixed(10))));
    if (required > maximum) result.textContent = isFinalExam ? 'Overall course target unreachable with this exam' : 'Target unreachable with this exam';
    else if (required === 0) result.textContent = isFinalExam ? 'Overall course target already secured' : 'Target already secured for this period';
    else result.textContent = `You need at least ${required} / ${maximum} on ${selected.name}.`;
    note.textContent = isFinalExam
        ? `Overall course target: ${window.courseTargetGrade.toFixed(2)} or better (${target[0]}%). Midterms: ${midterms.percentage.toFixed(2)}%. With 50% Midterms and 50% Finals, the Finals period needs ${requiredPeriodPercentage.toFixed(2)}%. Required exam score: ${required} / ${maximum}, rounded up.`
        : `Midterms target: ${window.courseTargetGrade.toFixed(2)} or better (${target[0]}%). Required score: ${required} / ${maximum}, rounded up. Only Midterm coursework is used.`;
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await API.post('/auth/logout', {});
    } catch {
        // The session may already be gone.
    }
    window.location.href = 'index.html';
});
