const periodLabels = { midterms: 'Midterms', finals: 'Finals' };
const nextComponentIndex = { midterms: 0, finals: 0 };

let enrolledTemplates = [];
let standingCourses = [];
let activeStandingFilter = 'all';
let refreshingStandings = false;
let editingTemplateId = 0;

document.addEventListener("DOMContentLoaded", bootstrapProfessorDashboard);

async function bootstrapProfessorDashboard() {
    try {
        const session = await API.session();
        if (!session.authenticated) {
            window.location.replace('index.html');
            return;
        }
        const professor = session.user.roleId === 2 || session.user.role.toLowerCase() === 'professor';
        if (!professor) {
            window.location.replace('student_dashboard.html');
            return;
        }
        API.setCsrfToken(session.csrfToken);

        const displayName = session.user.fullName || session.user.email;
        document.getElementById('userInitial').textContent = displayName.charAt(0).toUpperCase();
        document.getElementById('userNameDisplay').textContent = displayName;
        const dateText = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('standingDate').textContent = dateText;
        document.getElementById('templatesDate').textContent = dateText;

        const params = new URLSearchParams(window.location.search);
        editingTemplateId = Number(params.get('edit')) || 0;

        const templatesData = await API.get('/templates');
        enrolledTemplates = templatesData.templates || [];

        const standingsData = await API.get('/professor/standings');
        standingCourses = standingsData.courses || [];

        let editData = null;
        if (editingTemplateId > 0) {
            editData = await API.get(`/templates/${editingTemplateId}`);
        }

        initProfessorDashboard(editData);
    } catch (error) {
        if (error.status === 401) {
            window.location.replace('index.html');
            return;
        }
        if (error.status === 404 && editingTemplateId > 0) {
            showProfessorAlert(error.message, 'error');
            window.setTimeout(() => window.location.replace('professor_dashboard.html#templates'), 1500);
            return;
        }
        showProfessorAlert(error.message, 'error');
    }
}

function initProfessorDashboard(editData) {
    renderTemplateForm(editData?.template ?? null, editData?.lockedComponents ?? {});
    renderTemplatesList();
    initializeClassStanding();
    showProfessorFlash();

    document.getElementById('logoutBtn').addEventListener('click', logoutProfessor);
    setInterval(refreshStandings, 15000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshStandings();
    });
}

function showProfessorAlert(message, type = 'error') {
    const container = document.getElementById('professorAlerts');
    if (!container) return;

    const alert = document.createElement('p');
    alert.setAttribute('role', type === 'error' ? 'alert' : 'status');
    alert.className = type === 'error'
        ? 'bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-sm'
        : 'bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm';
    alert.textContent = message;
    container.appendChild(alert);
}

function showProfessorFlash() {
    const params = new URLSearchParams(window.location.search);
    let tabHint = '';

    if (params.get('error')) {
        showProfessorAlert(params.get('error'), 'error');
        tabHint = 'templates';
    } else if (params.get('template') === 'success') {
        const code = params.get('code') ? ` Class Sync Code: ${params.get('code')}` : '';
        showProfessorAlert(`Syllabus template published and saved to database!${code} Share this code with your students.`, 'success');
        tabHint = 'templates';
    } else if (params.get('template') === 'updated') {
        showProfessorAlert('Template updated. Enrolled students will see the changes when they reload their dashboard.', 'success');
        tabHint = 'templates';
    } else if (params.get('edit')) {
        tabHint = 'templates';
    } else if (window.location.hash === '#templates') {
        tabHint = 'templates';
    }

    if (tabHint) switchProfessorTab(tabHint);

    if (params.toString()) {
        window.history.replaceState({}, document.title, window.location.pathname + (tabHint ? '#' + tabHint : ''));
    }
}

function switchProfessorTab(tab) {
    const showStanding = tab === 'standing';
    document.getElementById('standingSection').classList.toggle('hidden', !showStanding);
    document.getElementById('templatesSection').classList.toggle('hidden', showStanding);
    ['standing', 'templates'].forEach(name => {
        document.getElementById(`mobile-${name}`).className = `flex-1 rounded-xl px-3 py-2 text-xs font-bold ${name === tab ? 'bg-maroon-900 text-white' : 'bg-stone-200 text-stone-700'}`;
    });
    document.getElementById('nav-standing').className = showStanding
        ? 'w-full text-left px-4 py-3 rounded-xl font-bold text-xs flex items-center space-x-3 bg-maroon-100 text-maroon-900 border border-maroon-200'
        : 'w-full text-left px-4 py-3 rounded-xl font-medium text-xs text-stone-700 hover:bg-stone-200/60 transition flex items-center space-x-3';
    document.getElementById('nav-templates').className = showStanding
        ? 'w-full text-left px-4 py-3 rounded-xl font-medium text-xs text-stone-700 hover:bg-stone-200/60 transition flex items-center space-x-3'
        : 'w-full text-left px-4 py-3 rounded-xl font-bold text-xs flex items-center space-x-3 bg-maroon-100 text-maroon-900 border border-maroon-200';
    if (showStanding) refreshStandings();
}

function renderTemplateForm(template, lockedComponents) {
    editingTemplateId = template ? Number(template.id) : 0;

    document.getElementById('templateIdInput').value = String(editingTemplateId);
    document.getElementById('templateEditorTitle').textContent = template ? 'Edit Course Template' : 'Create Course Template';
    document.getElementById('courseCodeInput').value = template ? template.code : '';
    document.getElementById('courseTitleInput').value = template ? template.title : '';
    document.getElementById('courseUnitInput').value = template ? Number(template.units).toFixed(1) : '';

    const publishButton = document.querySelector('button[name="btnPublishTemplate"]');
    publishButton.textContent = template ? 'Save Changes' : 'Publish Syllabus & Generate Class Code';

    const note = document.getElementById('editingTemplateNote');
    const cancelLink = document.getElementById('cancelEditingLink');
    if (template) {
        note.textContent = `Editing ${template.code}. Changes apply to all enrolled students. Existing scores stay attached; components with saved scores cannot be removed.`;
        note.classList.remove('hidden');
        cancelLink.classList.remove('hidden');
    } else {
        note.textContent = '';
        note.classList.add('hidden');
        cancelLink.classList.add('hidden');
    }

    Object.keys(periodLabels).forEach(period => {
        const container = document.getElementById(`componentContainer-${period}`);
        container.innerHTML = '';
        nextComponentIndex[period] = 0;

        const components = template
            ? template.components.filter(component => component.period === period)
            : [];

        if (components.length === 0) {
            appendComponentRow(period);
        } else {
            components.forEach(component => {
                const locked = Array.isArray(lockedComponents[period]) &&
                    lockedComponents[period].includes(Number(component.database_id));
                appendComponentRow(period, component, locked);
            });
        }
    });

    calculateTotalWeight();
}

function appendComponentRow(period, component = null, locked = false) {
    const container = document.getElementById(`componentContainer-${period}`);
    const index = nextComponentIndex[period]++;
    const row = document.getElementById('componentRowTemplate').content.firstElementChild.cloneNode(true);

    const idInput = row.querySelector('.comp-id');
    idInput.name = `components[${period}][${index}][id]`;
    idInput.value = component ? String(component.database_id) : '';

    const nameInput = row.querySelector('.comp-name');
    nameInput.name = `components[${period}][${index}][name]`;
    nameInput.value = component ? component.name : '';

    const examInput = row.querySelector('.comp-exam');
    examInput.name = `components[${period}][${index}][is_exam]`;
    examInput.checked = Boolean(component?.is_exam);

    const weightInput = row.querySelector('.comp-weight');
    weightInput.name = `components[${period}][${index}][weight]`;
    weightInput.value = component ? String(component.weight) : '';

    const removeButton = row.querySelector('.remove-component');
    if (locked) {
        removeButton.disabled = true;
        removeButton.title = 'This component has saved scores.';
    }

    container.appendChild(row);
    calculateTotalWeight();
}

function addComponentRow(period) {
    appendComponentRow(period);
}

function limitExam(input) {
    if (!input.checked) return;
    input.closest('.period-components').querySelectorAll('.comp-exam').forEach(other => {
        if (other !== input) other.checked = false;
    });
}

function removeRow(button) {
    button.closest('.component-row').remove();
    calculateTotalWeight();
}

function calculateTotalWeight() {
    let valid = true;
    Object.keys(periodLabels).forEach(period => {
        const inputs = document.querySelectorAll(`#componentContainer-${period} .comp-weight`);
        const total = [...inputs].reduce((sum, input) => sum + (Number(input.value) || 0), 0);
        const badge = document.getElementById(`weightTotalBadge-${period}`);
        badge.textContent = `Total Weight: ${total}%`;
        badge.className = `text-xs font-bold ${total === 100 ? 'text-emerald-700' : 'text-rose-700'}`;
        if (total !== 100) valid = false;
    });
    return valid;
}

function validatePublishForm(event) {
    event.preventDefault();

    if (!calculateTotalWeight()) {
        alert('Midterms and Finals must each total 100%.');
        return false;
    }
    for (const section of document.querySelectorAll('.period-components')) {
        if (section.querySelectorAll('.comp-exam:checked').length > 1) {
            alert('Each period can have at most one checked exam.');
            return false;
        }
    }

    const button = document.querySelector('button[name="btnPublishTemplate"]');
    button.disabled = true;
    button.textContent = editingTemplateId !== 0 ? 'Saving...' : 'Publishing...';
    submitTemplateForm(button);
    return false;
}

async function submitTemplateForm(button) {
    const components = { midterms: [], finals: [] };

    document.querySelectorAll('.period-components').forEach(section => {
        const period = section.dataset.period;
        section.querySelectorAll('.component-row').forEach(row => {
            components[period].push({
                id: row.querySelector('.comp-id').value,
                name: row.querySelector('.comp-name').value,
                weight: row.querySelector('.comp-weight').value,
                is_exam: row.querySelector('.comp-exam').checked ? '1' : '0'
            });
        });
    });

    const payload = {
        courseCode: document.getElementById('courseCodeInput').value,
        courseTitle: document.getElementById('courseTitleInput').value,
        courseUnit: document.getElementById('courseUnitInput').value,
        components
    };

    try {
        const data = editingTemplateId > 0
            ? await API.put(`/templates/${editingTemplateId}`, payload)
            : await API.post('/templates', payload);

        if (editingTemplateId > 0) {
            window.location.href = 'professor_dashboard.html?template=updated#templates';
        } else {
            window.location.href = 'professor_dashboard.html?template=success&code=' +
                encodeURIComponent(data.classCode || '') + '#templates';
        }
    } catch (error) {
        showProfessorAlert(error.message, 'error');
        button.disabled = false;
        button.textContent = editingTemplateId > 0 ? 'Save Changes' : 'Publish Syllabus & Generate Class Code';
    }
}

function renderTemplatesList() {
    const container = document.getElementById('publishedTemplatesList');
    container.innerHTML = '';

    if (enrolledTemplates.length === 0) {
        container.innerHTML = '<p class="text-xs text-stone-400 italic">No published class templates found.</p>';
        return;
    }

    enrolledTemplates.forEach(tpl => {
        const card = document.createElement('div');
        card.className = "bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3";

        const componentsHtml = Object.entries(periodLabels).map(([period, label]) => `
            <div class="pt-2"><p class="font-bold text-maroon-900 mb-1">${label} · 100%</p>
            ${tpl.components.filter(c => c.period === period).map(c => `
                <div class="flex justify-between text-stone-600"><span>${escapeHtml(c.name)}${c.is_exam ? ' · Exam' : ''}</span><span class="font-bold">${c.weight}%</span></div>`).join('')}</div>`).join('');

        card.innerHTML = `
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <span class="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">PUBLISHED SYLLABUS</span>
                    <h4 class="font-extrabold text-slate-900 text-base mt-1">${escapeHtml(tpl.code)}</h4>
                    <p class="text-xs text-stone-500 font-medium">${escapeHtml(tpl.title)}</p>
                    <p class="text-xs text-stone-500 font-medium">${Number(tpl.units).toFixed(1)} units</p>
                </div>
                <div class="text-right flex flex-wrap items-center gap-2">
                    <div>
                        <span class="text-[10px] uppercase font-bold text-stone-400 block">Class Sync Code</span>
                        <span class="font-mono font-black text-maroon-900 text-sm bg-stone-100 px-2.5 py-1 rounded-lg border border-stone-200 inline-block mt-0.5">${escapeHtml(tpl.classCode)}</span>
                    </div>
                    <a href="professor_dashboard.html?edit=${tpl.id}#templates" class="inline-flex items-center gap-1 rounded-lg bg-maroon-50 px-2.5 py-1.5 text-xs font-bold text-maroon-900 hover:bg-maroon-100"><i class="fa-solid fa-pen-to-square"></i> Edit</a>
                    <button type="button" onclick="removeTemplate(${tpl.id})" aria-label="Delete template" class="text-stone-400 hover:text-rose-600 transition text-sm">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>

            <div class="bg-stone-50 p-3 rounded-2xl border border-stone-200 text-xs space-y-1.5">
                ${componentsHtml}
            </div>
        `;
        container.appendChild(card);
    });
}

async function removeTemplate(id) {
    if (!confirm("Remove this published syllabus from database?")) return;

    try {
        await API.delete(`/templates/${id}`);
        window.location.href = 'professor_dashboard.html#templates';
    } catch (error) {
        showProfessorAlert(error.message, 'error');
    }
}

function initializeClassStanding() {
    const courseFilter = document.getElementById('courseFilter');
    updateCourseOptions();
    courseFilter.addEventListener('change', renderClassStanding);
    document.getElementById('rankSort').addEventListener('change', renderClassStanding);
    document.getElementById('studentSearch').addEventListener('input', renderClassStanding);
    document.querySelectorAll('.standing-filter').forEach(button => {
        button.addEventListener('click', () => {
            activeStandingFilter = button.dataset.standingFilter;
            document.querySelectorAll('.standing-filter').forEach(filterButton => {
                filterButton.className = filterButton === button
                    ? 'standing-filter px-3 py-2 rounded-full bg-maroon-900 text-white text-[11px] font-bold'
                    : 'standing-filter px-3 py-2 rounded-full bg-stone-100 text-stone-700 text-[11px] font-bold';
            });
            renderClassStanding();
        });
    });
    renderCourseSummaries();
    renderClassStanding();
    document.getElementById('standingRefreshStatus').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

function updateCourseOptions() {
    const courseFilter = document.getElementById('courseFilter');
    const selected = courseFilter.value;
    courseFilter.innerHTML = '<option value="all">All Courses (Ranked Within Each Course)</option>';
    standingCourses.forEach(course => {
        const option = document.createElement('option');
        option.value = String(course.id);
        option.textContent = `${course.code} — ${course.title}`;
        courseFilter.appendChild(option);
    });
    if (standingCourses.some(course => String(course.id) === selected)) courseFilter.value = selected;
}

async function refreshStandings() {
    if (refreshingStandings || document.hidden || document.getElementById('standingSection').classList.contains('hidden')) return;
    refreshingStandings = true;

    const status = document.getElementById('standingRefreshStatus');
    try {
        const data = await API.get('/professor/standings');
        if (!Array.isArray(data.courses)) throw new Error('Invalid standings response.');

        standingCourses = data.courses;
        updateCourseOptions();
        renderCourseSummaries();
        renderClassStanding();

        const dialog = document.getElementById('standingDialog');
        if (dialog.open) showStandingDetails(Number(dialog.dataset.enrollmentId));

        status.textContent = `Last updated: ${new Date(data.updatedAt).toLocaleTimeString()}`;
    } catch (error) {
        if (error.status === 401) {
            window.location.replace('index.html');
            return;
        }
        status.textContent = 'Could not refresh. Showing previous data; retrying automatically.';
    } finally {
        refreshingStandings = false;
    }
}

function selectedCourses() {
    const selectedId = document.getElementById('courseFilter').value;
    return selectedId === 'all' ? standingCourses : standingCourses.filter(course => String(course.id) === selectedId);
}

function getVisibleStandings() {
    const courses = selectedCourses();
    const search = document.getElementById('studentSearch').value.trim().toLocaleLowerCase();
    const rows = courses.flatMap(course => course.students.map(student => ({ ...student, course })));
    return rows.filter(row => {
        const matchesFilter = activeStandingFilter === 'all' ||
            (activeStandingFilter === 'top' && row.percentage !== null && row.percentage >= 90) ||
            (activeStandingFilter === 'risk' && row.percentage !== null && row.percentage < 75);
        const matchesSearch = !search ||
            row.student.toLocaleLowerCase().includes(search) ||
            row.email.toLocaleLowerCase().includes(search) ||
            row.course.code.toLocaleLowerCase().includes(search) ||
            row.course.title.toLocaleLowerCase().includes(search);
        return matchesFilter && matchesSearch;
    });
}

function formatPercentage(value) {
    return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;
}

function standingStatus(row) {
    if (row.percentage === null) return { label: row.status, style: 'bg-stone-100 text-stone-600' };
    if (row.percentage < 75) return { label: row.status === 'Complete' ? 'At Risk' : 'At Risk · Provisional', style: 'bg-rose-100 text-rose-700' };
    if (row.status !== 'Complete') return { label: 'Provisional', style: 'bg-amber-100 text-amber-800' };
    if (row.percentage >= 90) return { label: 'Outstanding', style: 'bg-emerald-100 text-emerald-700' };
    return { label: 'Good Standing', style: 'bg-blue-100 text-blue-700' };
}

function renderCourseSummaries() {
    const container = document.getElementById('courseSummaryList');
    if (standingCourses.length === 0) {
        container.innerHTML = '<p class="text-xs text-stone-500 italic">No course templates yet. Create a template to start collecting class standings.</p>';
        return;
    }
    container.innerHTML = standingCourses.map(course => {
        const graded = course.students.filter(student => student.percentage !== null);
        const average = graded.length
            ? graded.reduce((total, student) => total + student.percentage, 0) / graded.length
            : null;
        const riskCount = graded.filter(student => student.percentage < 75).length;
        return `<article class="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div class="flex items-start justify-between gap-3">
                <div><p class="font-extrabold text-slate-800">${escapeHtml(course.code)}</p><p class="text-xs text-stone-500 mt-0.5">${escapeHtml(course.title)}</p></div>
                <span class="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-stone-600 border border-stone-200">${course.students.length} enrolled</span>
            </div>
            <div class="mt-3 flex items-center justify-between text-xs"><span class="text-stone-500">Average current standing</span><strong class="text-slate-800">${formatPercentage(average)}</strong></div>
            <div class="mt-1 flex items-center justify-between text-xs"><span class="text-stone-500">At risk</span><strong class="${riskCount ? 'text-rose-700' : 'text-emerald-700'}">${riskCount} students</strong></div>
        </article>`;
    }).join('');
}

function renderClassStanding() {
    const courses = selectedCourses();
    const rows = getVisibleStandings();
    const allRows = courses.flatMap(course => course.students.map(student => ({ ...student, course })));
    const gradedRows = allRows.filter(row => row.percentage !== null);
    const rankedRows = [...gradedRows].sort((a, b) => b.percentage - a.percentage);
    const top = rankedRows[0];
    const average = gradedRows.length
        ? gradedRows.reduce((total, row) => total + row.percentage, 0) / gradedRows.length
        : null;
    const atRisk = gradedRows.filter(row => row.percentage < 75).length;
    document.getElementById('topPerformerValue').textContent = top ? formatPercentage(top.percentage) : '—';
    document.getElementById('topPerformerName').textContent = top
        ? `${top.student} · ${top.course.code}`
        : 'No graded students';
    document.getElementById('classAverageValue').textContent = formatPercentage(average);
    document.getElementById('enrolledCountValue').textContent = String(allRows.length);
    document.getElementById('courseCountNote').textContent = `Across ${courses.length} ${courses.length === 1 ? 'course' : 'courses'}`;
    document.getElementById('atRiskValue').textContent = `${atRisk} ${atRisk === 1 ? 'Student' : 'Students'}`;
    document.getElementById('courseScopeLabel').textContent = courses.length === 1
        ? `${courses[0].code} · ${courses[0].title}`
        : 'Across all your active classes';

    renderStandingTable(courses, rows, allRows);
}

function renderStandingTable(courses, rows, allRows) {
    const tableHead = document.getElementById('standingTableHead');
    const tableBody = document.getElementById('standingTableBody');
    const showCourse = document.getElementById('courseFilter').value === 'all';
    const components = courses.length === 1 ? courses[0].components : [];
    tableHead.innerHTML = `<tr class="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500 border-b border-stone-200">
        <th class="p-3">Course Rank</th><th class="p-3">Student</th>${showCourse ? '<th class="p-3">Course</th>' : ''}
        <th class="p-3">Current Standing</th>${components.map(component => `<th class="p-3">${periodLabels[component.period]} · ${escapeHtml(component.name)} (${component.weight}%)</th>`).join('')}
        <th class="p-3">Coverage / Status</th><th class="p-3 text-right">Action</th></tr>`;
    const sort = document.getElementById('rankSort').value;
    const rankByEnrollment = new Map();
    courses.forEach(course => {
        const ranked = allRows.filter(row => row.course.id === course.id && row.percentage !== null)
            .sort((a, b) => b.percentage - a.percentage);
        let rank = 0;
        let previousScore = null;
        ranked.forEach((row, index) => {
            if (row.percentage !== previousScore) rank = index + 1;
            rankByEnrollment.set(row.enrollmentId, rank);
            previousScore = row.percentage;
        });
    });
    rows.sort((a, b) => {
        if (sort === 'name') return a.student.localeCompare(b.student);
        if (a.percentage === null) return b.percentage === null ? a.student.localeCompare(b.student) : 1;
        if (b.percentage === null) return -1;
        return sort === 'asc' ? a.percentage - b.percentage : b.percentage - a.percentage;
    });
    tableBody.innerHTML = rows.map(row => {
        const status = standingStatus(row);
        const componentCells = components.map(component => {
            const item = row.components.find(result => result.id === component.id);
            return `<td class="p-3 text-stone-600">${formatPercentage(item?.percentage ?? null)}</td>`;
        }).join('');
        const current = formatPercentage(row.percentage);
        const progressText = `${row.gradedWeight}% course weight covered`;
        return `<tr class="hover:bg-stone-50/80">
            <td class="p-3 font-bold text-stone-500">${rankByEnrollment.has(row.enrollmentId) ? `#${rankByEnrollment.get(row.enrollmentId)}` : '—'}</td>
            <td class="p-3"><p class="font-bold text-slate-800">${escapeHtml(row.student)}</p><p class="text-[10px] text-stone-400 mt-0.5">${escapeHtml(row.email)}</p></td>
            ${showCourse ? `<td class="p-3 font-semibold text-stone-600">${escapeHtml(row.course.code)}</td>` : ''}
            <td class="p-3"><span class="font-black text-slate-900">${current}</span>${row.percentage !== null ? `<div class="mt-1 h-1.5 w-20 rounded-full bg-stone-100"><div class="h-1.5 rounded-full ${row.percentage < 75 ? 'bg-rose-500' : 'bg-maroon-900'}" style="width:${Math.max(0, Math.min(100, row.percentage))}%"></div></div>` : ''}</td>
            ${componentCells}
            <td class="p-3"><span class="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${status.style}">${status.label}</span><p class="text-[10px] text-stone-400 mt-1">${progressText}</p></td>
            <td class="p-3 text-right"><button type="button" data-enrollment-id="${row.enrollmentId}" class="standing-detail-button rounded-lg border border-stone-300 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-stone-100">View Breakdown</button></td>
        </tr>`;
    }).join('');
    tableBody.querySelectorAll('.standing-detail-button').forEach(button => {
        button.addEventListener('click', () => showStandingDetails(Number(button.dataset.enrollmentId)));
    });
    document.getElementById('standingEmptyState').classList.toggle('hidden', rows.length > 0);
}

function showStandingDetails(enrollmentId) {
    const course = standingCourses.find(item => item.students.some(student => student.enrollmentId === enrollmentId));
    const student = course?.students.find(item => item.enrollmentId === enrollmentId);
    const dialog = document.getElementById('standingDialog');
    if (!course || !student) { dialog.close(); return; }
    document.getElementById('standingDialogCourse').textContent = `${course.code} · ${course.title}`;
    document.getElementById('standingDialogStudent').textContent = student.student;
    document.getElementById('standingDialogEmail').textContent = student.email;
    const standingSummary = student.percentage === null
        ? student.status === 'Invalid weights' ? 'The grading weights need correction.' : 'No scores have been entered.'
        : `${student.status === 'Complete' ? 'Current' : 'Provisional'} standing: ${formatPercentage(student.percentage)} · ${student.gradedWeight}% course weight covered${student.grade === null ? '' : ` · Final PUP grade: ${Number(student.grade).toFixed(2)}`}`;
    document.getElementById('standingDialogSummary').textContent = standingSummary;
    document.getElementById('standingDialogBreakdown').innerHTML = student.components.map(component => {
        const assessments = component.assessments.length
            ? component.assessments.map(assessment => `<li class="flex justify-between gap-3 py-1 text-[11px] text-stone-500"><span>${escapeHtml(assessment.title)}</span><span>${Number(assessment.score)} / ${Number(assessment.max)}</span></li>`).join('')
            : '<li class="py-1 text-[11px] italic text-stone-400">No scores entered</li>';
        return `<section class="rounded-xl border border-stone-200 p-3">
            <div class="flex items-center justify-between gap-3"><h3 class="text-xs font-bold text-slate-800">${periodLabels[component.period]} · ${escapeHtml(component.name)} <span class="font-medium text-stone-400">(${component.weight}%)</span></h3><span class="text-xs font-black text-slate-800">${formatPercentage(component.percentage)}</span></div>
            <ul class="mt-2 border-t border-stone-100 pt-2">${assessments}</ul>
        </section>`;
    }).join('') || '<p class="text-xs text-stone-500">This course has no grading components.</p>';
    dialog.dataset.enrollmentId = String(enrollmentId);
    if (!dialog.open) dialog.showModal();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
}

async function logoutProfessor() {
    try {
        await API.post('/auth/logout', {});
    } catch {
        // The session may already be gone.
    }
    window.location.href = 'index.html';
}
