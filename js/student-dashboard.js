const periodLabels = { midterms: 'Midterms', finals: 'Finals' };

let dashboardData = null;
let studentGradesData = [];
let targetGwaGoal = null;
let gwaGoalStorageKey = '';

document.addEventListener("DOMContentLoaded", bootstrapStudentDashboard);

async function bootstrapStudentDashboard() {
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

        const data = await API.get('/student/dashboard');
        API.setCsrfToken(data.csrfToken);
        dashboardData = data;
        window.studentDashboardData = {
            userId: data.user.userId,
            csrfToken: data.csrfToken,
            targetGrades: data.targetGrades,
            gradeScale: data.gradeScale,
            enrolledCourses: data.courses
        };

        initStudentDashboard(data);
    } catch (error) {
        if (error.status === 401) {
            window.location.replace('index.html');
            return;
        }
        showStudentAlert(error.message, 'error');
    }
}

function initStudentDashboard(data) {
    const displayName = data.user.fullName || data.user.email;
    document.getElementById('userInitial').textContent = displayName.charAt(0).toUpperCase();
    document.getElementById('userNameDisplay').textContent = displayName;
    document.getElementById('welcomeName').textContent = displayName;
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    gwaGoalStorageKey = `targetGwaGoal:${data.user.userId}`;
    try {
        const savedGoal = localStorage.getItem(gwaGoalStorageKey);
        const parsedGoal = savedGoal === null || savedGoal.trim() === '' ? NaN : Number(savedGoal);
        if (Number.isFinite(parsedGoal) && parsedGoal >= 1 && parsedGoal <= 5) targetGwaGoal = parsedGoal;
    } catch {
        // The dashboard still works when browser storage is disabled.
    }

    studentGradesData = data.courses.map(course => ({
        id: course.templateId,
        enrollmentId: course.enrollmentId,
        subject: course.code,
        title: course.title,
        grade: course.grade ?? null,
        percentage: course.percentage ?? null,
        gradeStatus: course.gradeStatus ?? 'Incomplete',
        target: course.target,
        units: course.units
    }));

    const goalInput = document.getElementById('thresholdSettingInput');
    if (targetGwaGoal !== null) goalInput.value = targetGwaGoal.toFixed(2);
    document.getElementById('gwaGoalForm').addEventListener('submit', event => {
        event.preventDefault();
        saveSettings();
    });

    document.getElementById('enrollForm').addEventListener('submit', submitEnrollment);
    document.getElementById('logoutBtn').addEventListener('click', logoutStudent);

    renderEnrolledTemplates();
    renderGradesTable();
    recalculateGradesAndStats(false);
    scheduleTrendChart();

    const params = new URLSearchParams(window.location.search);
    let tabHint = '';
    if (params.get('error')) {
        showStudentAlert(params.get('error'), 'error');
        tabHint = 'templates';
    } else if (params.get('enrolled') === 'success') {
        showStudentAlert("Class enrolled successfully. Your professor's grading template is shown below.", 'success');
        tabHint = 'templates';
    } else if (params.get('target') === 'saved') {
        showStudentAlert('Target grade saved. The exam predictor will use this target.', 'success');
        tabHint = 'grades';
    } else if (params.get('target') === 'error') {
        showStudentAlert('Could not save the target grade. Please try again.', 'error');
        tabHint = 'grades';
    } else if (params.get('unenrolled') === 'success') {
        showStudentAlert('Course removed from your enrollments.', 'success');
        tabHint = 'grades';
    } else if (params.get('unenrolled') === 'error') {
        showStudentAlert('Could not remove the course. Please try again.', 'error');
        tabHint = 'grades';
    }

    if (['#templates', '#grades', '#dashboard'].includes(window.location.hash)) {
        switchTab(window.location.hash.slice(1));
    } else if (tabHint) {
        switchTab(tabHint);
    }

    if (tabHint) {
        window.history.replaceState({}, document.title, window.location.pathname + '#' + tabHint);
    }
}

function showStudentAlert(message, type = 'error') {
    const container = document.getElementById('studentAlerts');
    if (!container) return;

    const alert = document.createElement('p');
    alert.setAttribute('role', type === 'error' ? 'alert' : 'status');
    alert.className = type === 'error'
        ? 'bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-sm'
        : 'bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm';
    alert.textContent = message;
    container.appendChild(alert);
}

function renderEnrolledTemplates() {
    const container = document.getElementById('enrolledTemplatesList');
    container.innerHTML = '';

    if (!dashboardData || dashboardData.courses.length === 0) {
        container.innerHTML = '<p class="text-xs text-stone-400 italic">No enrolled templates found.</p>';
        return;
    }

    dashboardData.courses.forEach(course => {
        const card = document.createElement('div');
        card.className = 'bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3';

        const componentsHtml = Object.entries(periodLabels).map(([period, label]) => `
            <p class="font-bold text-maroon-900 pt-2">${label} · 100%</p>
            ${course.components.filter(component => component.period === period).map(component => `
                <div class="flex justify-between text-stone-600">
                    <span>${escapeGradeText(component.name)}:</span>
                    <span class="font-bold text-slate-800">${Number(component.weight)}%</span>
                </div>`).join('')}
        `).join('');

        card.innerHTML = `
            <div class="flex items-start justify-between">
                <div>
                    <span class="text-[10px] font-bold text-maroon-800 bg-maroon-50 px-2 py-0.5 rounded-full border border-maroon-200">ACTIVE SYNC</span>
                    <h4 class="font-extrabold text-slate-900 text-base mt-1">${escapeGradeText(course.code)}</h4>
                    <p class="text-xs text-stone-500 font-medium">${escapeGradeText(course.title)}</p>
                    <p class="text-xs text-stone-500 font-medium">${Number(course.units).toFixed(1)} units</p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] uppercase font-bold text-stone-400 block">Class Code</span>
                    <span class="font-mono font-black text-maroon-900 text-sm bg-stone-100 px-2.5 py-1 rounded-lg border border-stone-200 inline-block mt-0.5">${escapeGradeText(course.classCode)}</span>
                </div>
            </div>
            <div class="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-xs space-y-1.5">
                ${componentsHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

function switchTab(tabId) {
    ['dashboard', 'grades', 'templates'].forEach(id => {
        const el = document.getElementById(`tab-content-${id}`);
        if (el) el.classList.add('hidden');

        const btn = document.getElementById(`nav-${id}`);
        if (btn) {
            btn.className = "w-full text-left px-4 py-3 rounded-xl font-medium text-xs text-stone-700 hover:bg-stone-200/60 transition flex items-center space-x-3 cursor-pointer";
        }
    });

    const tab = document.getElementById(`tab-content-${tabId}`);
    if (!tab) return;
    tab.classList.remove('hidden');

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.className = "w-full text-left px-4 py-3 rounded-xl font-bold text-xs flex items-center space-x-3 bg-maroon-100 text-maroon-900 border border-maroon-200 cursor-pointer";
    }

    if (tabId === 'dashboard') {
        renderStudentTrendChart();
    }
}

function scheduleTrendChart() {
    const load = () => {
        if (!window.google?.charts) return;
        google.charts.load('current', { 'packages': ['corechart'] });
        google.charts.setOnLoadCallback(() => renderStudentTrendChart());
    };

    if (window.google?.charts) {
        load();
    } else {
        window.addEventListener('load', load, { once: true });
    }
}

function recalculateGradesAndStats(showAlert = true) {
    const inputs = document.querySelectorAll('.grade-input');
    let totalWeightedGrades = 0;
    let totalUnits = 0;
    let gradedUnits = 0;
    let hasGradeBelow250 = false;

    for (const input of document.querySelectorAll('.grade-input, .target-grade-input')) {
        if (!input.checkValidity()) {
            input.reportValidity();
            return;
        }
    }

    inputs.forEach(input => {
        const item = studentGradesData.find(g => g.id === Number(input.getAttribute('data-id')));
        if (item) item.grade = input.value === '' ? null : Number(input.value);
    });

    document.querySelectorAll('.target-grade-input').forEach(input => {
        const item = studentGradesData.find(g => g.id === Number(input.getAttribute('data-id')));
        if (item) item.target = Number(input.value);
    });

    studentGradesData.forEach(item => {
        totalUnits += item.units;
        if (item.grade === null) return;
        if (item.grade > 2.50) hasGradeBelow250 = true;
        totalWeightedGrades += item.grade * item.units;
        gradedUnits += item.units;
    });

    const calculatedGWA = gradedUnits > 0 ? (totalWeightedGrades / gradedUnits).toFixed(2) : '--';

    document.getElementById('calcGwaVal').innerText = calculatedGWA;
    document.getElementById('totalUnitsDisplay').innerText = totalUnits.toFixed(1);

    const diagBox = document.getElementById('ruleDiagnosticBox');
    const diagText = document.getElementById('ruleDiagnosticText');
    const badge = document.getElementById('bannerTargetBadge');

    badge.innerText = targetGwaGoal === null ? 'No GWA target set' : `Target Goal: GWA ≤ ${targetGwaGoal.toFixed(2)}`;

    if (gradedUnits === 0 || gradedUnits < totalUnits) {
        diagBox.className = "bg-stone-50 border-l-4 border-stone-400 p-4 rounded-2xl flex items-start space-x-3 shadow-sm";
        diagText.textContent = gradedUnits === 0
            ? 'Open an enrolled course and save its component scores to calculate your GWA.'
            : `Current Estimated GWA: ${calculatedGWA}. Complete the remaining courses to check your target qualification.`;
    } else if (targetGwaGoal === null) {
        diagBox.className = "bg-stone-50 border-l-4 border-stone-400 p-4 rounded-2xl flex items-start space-x-3 shadow-sm";
        diagText.textContent = `Current Estimated GWA: ${calculatedGWA}. Set your GWA target to check your qualification.`;
    } else if (parseFloat(calculatedGWA) <= targetGwaGoal && !hasGradeBelow250) {
        diagBox.className = "bg-amber-50 border-l-4 border-amber-500 p-4 rounded-2xl flex items-start space-x-3 shadow-sm transition-all duration-300";
        diagText.innerHTML = `Current Estimated GWA: <strong class="text-maroon-900">${calculatedGWA}</strong> (Qualifies for Target Goal GWA ≤ <strong>${targetGwaGoal.toFixed(2)}</strong>). All grades are 2.50 or better.`;
    } else if (parseFloat(calculatedGWA) <= targetGwaGoal && hasGradeBelow250) {
        diagBox.className = "bg-orange-50 border-l-4 border-orange-500 p-4 rounded-2xl flex items-start space-x-3 shadow-sm transition-all duration-300";
        diagText.innerHTML = `Current Estimated GWA: <strong class="text-orange-900">${calculatedGWA}</strong> (Meets target GWA but has grades worse than 2.50).`;
    } else {
        diagBox.className = "bg-rose-50 border-l-4 border-rose-500 p-4 rounded-2xl flex items-start space-x-3 shadow-sm transition-all duration-300";
        diagText.innerHTML = `Current Estimated GWA: <strong class="text-rose-900">${calculatedGWA}</strong> (Needs improvement to achieve Target Goal GWA ≤ <strong>${targetGwaGoal.toFixed(2)}</strong>).`;
    }

    renderGradesTable();
    renderStudentTrendChart();

    if (showAlert) {
        alert(`Statistics successfully updated! Calculated GWA: ${calculatedGWA}`);
        switchTab('dashboard');
    }
}

function saveSettings() {
    const selectElement = document.getElementById('thresholdSettingInput');
    if (!selectElement) return;

    if (!selectElement.reportValidity()) return;
    const selectedVal = Number(selectElement.value);
    if (!Number.isFinite(selectedVal) || selectedVal < 1 || selectedVal > 5) return;

    targetGwaGoal = selectedVal;
    let stored = false;
    try {
        localStorage.setItem(gwaGoalStorageKey, selectedVal.toString());
        stored = true;
    } catch {
        // Retain the selected goal for this page even without browser storage.
    }

    recalculateGradesAndStats(false);

    const statusMsg = document.getElementById('saveStatusMsg');
    if (statusMsg) {
        statusMsg.textContent = stored ? 'Saved on this browser.' : 'Applied for this page; browser storage is unavailable.';
        statusMsg.classList.remove('hidden');
        setTimeout(() => {
            statusMsg.classList.add('hidden');
        }, 3000);
    }
}

function escapeGradeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function renderGradesTable() {
    const tbody = document.getElementById('gradeInputTableBody');
    tbody.innerHTML = '';

    if (studentGradesData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-3 text-stone-500">No courses yet. Enroll using your professor\'s class code in Professor Templates.</td></tr>';
        return;
    }

    studentGradesData.forEach(item => {
        const tr = document.createElement('tr');
        const courseUrl = `course_scores.html?enrollment_id=${item.enrollmentId}`;
        if (item.enrollmentId > 0) {
            tr.className = 'hover:bg-maroon-50/50 cursor-pointer transition';
            tr.addEventListener('click', event => {
                if (!event.target.closest('a, button, input, select')) window.location.href = courseUrl;
            });
        }
        tr.innerHTML = `
            <td class="p-3 font-bold text-maroon-900">${item.enrollmentId > 0
                ? `<a href="${courseUrl}" class="underline underline-offset-4 decoration-maroon-200 hover:decoration-maroon-900">${escapeGradeText(item.subject)}</a>`
                : escapeGradeText(item.subject)}</td>
            <td class="p-3 font-medium">${escapeGradeText(item.title)}</td>
            <td class="p-3 font-bold">${item.units.toFixed(1)}</td>
            <td class="p-3">
                ${item.enrollmentId > 0 ? `
                <span class="font-bold text-maroon-900">${item.grade === null ? escapeGradeText(item.gradeStatus) : item.grade.toFixed(2)}</span>
                ${item.percentage === null ? '' : `<span class="block text-[10px] text-stone-500 mt-1">${item.percentage.toFixed(2)}%</span>`}
                ` : `<input type="number" step="0.25" min="1.00" max="5.00" value="${item.grade === null ? '' : item.grade.toFixed(2)}" placeholder="Enter grade"
                       class="grade-input w-28 px-3 py-1.5 rounded-lg border border-stone-300 font-bold text-xs focus:border-maroon-800 outline-none"
                       data-id="${item.id}" data-units="${item.units}">`}
            </td>
            <td class="p-3">
                <select name="target_grade" required aria-label="Target grade for ${escapeGradeText(item.subject)}"
                    class="target-grade-input w-28 px-3 py-1.5 rounded-lg border border-stone-300 font-bold text-xs focus:border-maroon-800 outline-none"
                    data-id="${item.id}" ${item.enrollmentId > 0 ? `data-enrollment-id="${item.enrollmentId}"` : ''}>
                    ${window.studentDashboardData.targetGrades.map(grade =>
                        `<option value="${grade.toFixed(2)}" ${grade === item.target ? 'selected' : ''}>${grade.toFixed(2)}</option>`).join('')}
                </select>
            </td>
            <td class="p-3">
                <span class="${item.grade === null ? 'text-stone-500' : item.grade <= 2.50 ? 'text-emerald-700' : 'text-rose-700'} font-bold text-[11px]">
                    <i class="fa-solid ${item.grade === null ? 'fa-minus' : item.grade <= 2.50 ? 'fa-check-circle' : 'fa-triangle-exclamation'} mr-1"></i>
                    ${item.grade === null ? escapeGradeText(item.gradeStatus ?? 'Not entered') : item.grade <= 2.50 ? 'PL Valid (≤ 2.50)' : 'PL Ineligible (> 2.50)'}
                </span>
            </td>
            <td class="p-3 text-center">
                <button type="button" aria-label="Remove ${escapeGradeText(item.subject)}" onclick="removeSubjectRow(${item.id})" class="text-rose-500 hover:text-rose-700 transition cursor-pointer">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);

        const targetSelect = tr.querySelector('.target-grade-input');
        if (targetSelect) {
            targetSelect.addEventListener('change', () => handleTargetChange(item.id, targetSelect));
        }
    });
}

async function handleTargetChange(itemId, select) {
    const item = studentGradesData.find(course => course.id === itemId);
    if (!item) return;

    const previousTarget = item.target;
    const nextTarget = Number(select.value);
    item.target = nextTarget;

    if (item.enrollmentId <= 0) {
        recalculateGradesAndStats(false);
        renderStudentTrendChart();
        return;
    }

    try {
        await API.put(`/enrollments/${item.enrollmentId}/target`, { targetGrade: nextTarget });
        const course = dashboardData.courses.find(candidate => candidate.enrollmentId === item.enrollmentId);
        if (course) course.target = nextTarget;
        renderStudentTrendChart();
        showStudentAlert('Target grade saved. The exam predictor will use this target.', 'success');
    } catch (error) {
        item.target = previousTarget;
        select.value = Number(previousTarget).toFixed(2);
        showStudentAlert(error.message, 'error');
    }
}

async function submitEnrollment(event) {
    event.preventDefault();
    const input = document.getElementById('templateCodeInput');
    const classCode = input.value.trim();
    if (!classCode) {
        showStudentAlert('Please enter a class code.', 'error');
        return;
    }

    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
        const data = await API.post('/enrollments', { classCode });
        window.location.href = data.redirect || 'student_dashboard.html?enrolled=success#templates';
    } catch (error) {
        showStudentAlert(error.message, 'error');
        button.disabled = false;
    }
}

async function logoutStudent() {
    try {
        await API.post('/auth/logout', {});
    } catch {
        // The session may already be gone.
    }
    window.location.href = 'index.html';
}

function renderStudentTrendChart() {
    if (!window.google?.visualization) return;
    const chartElement = document.getElementById('student_trend_chart');
    if (!chartElement) return;

    const data = new google.visualization.DataTable();
    data.addColumn('string', 'Subject');
    data.addColumn('number', 'Current Grade');
    data.addColumn('number', 'Target Grade');

    studentGradesData.forEach(item => {
        data.addRow([item.subject, item.grade, item.target]);
    });

    const options = {
        colors: ['#4a0415', '#3b82f6'],
        vAxis: {
            title: 'PUP Grade Scale (1.00 - 5.00)',
            direction: -1,
            ticks: window.studentDashboardData.gradeScale
        },
        legend: { position: 'bottom' },
        chartArea: { width: '80%', height: '70%' }
    };

    const chart = new google.visualization.ColumnChart(chartElement);
    chart.draw(data, options);
}

window.addSubjectRow = function () {
    const subjCode = prompt("Enter Course Code:")?.trim();
    if (!subjCode) return;
    const title = prompt("Enter Course Title:")?.trim();
    if (!title) return;
    const unitsInput = prompt("Enter Unit Value:");
    if (unitsInput === null) return;
    const units = Number(unitsInput);
    if (!Number.isFinite(units) || units <= 0 || units > 99.9 || Math.round(units * 10) / 10 !== units) {
        alert('Enter a positive unit value up to 99.9, with at most one decimal place.');
        return;
    }

    studentGradesData.push({
        id: Date.now(), subject: subjCode.toUpperCase(), title, grade: null,
        gradeStatus: 'Not entered', target: window.studentDashboardData.targetGrades[0], units
    });
    recalculateGradesAndStats(false);
};

window.removeSubjectRow = async function (id) {
    const course = studentGradesData.find(item => item.id === id);
    if (!course) return;

    if (course.enrollmentId > 0) {
        if (!confirm("Unenroll from this course? It will also be removed from your enrolled professor templates.")) return;

        try {
            await API.delete(`/enrollments/${course.enrollmentId}`);
            studentGradesData = studentGradesData.filter(item => item.id !== id);
            dashboardData.courses = dashboardData.courses.filter(item => item.enrollmentId !== course.enrollmentId);
            window.studentDashboardData.enrolledCourses = dashboardData.courses;
            renderEnrolledTemplates();
            recalculateGradesAndStats(false);
            showStudentAlert('Course removed from your enrollments.', 'success');
        } catch (error) {
            showStudentAlert(error.message, 'error');
        }
        return;
    }

    if (!confirm("Remove this manually added course from your tracker?")) return;
    studentGradesData = studentGradesData.filter(item => item.id !== id);
    recalculateGradesAndStats(false);
};
