const periodLabels = { midterms: 'Midterms', finals: 'Finals' };
const nextComponentIndex = { midterms: 0, finals: 0 };

let enrolledTemplates = [];
let standingCourses = [];
let activeStandingFilter = 'all';
let refreshingStandings = false;
let editingTemplateId = 0;
let standingDialogPreviousOverflow = null;
let initialTemplate = null;
let initialLockedComponents = {};

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
    initialTemplate = editData?.template ?? null;
    initialLockedComponents = editData?.lockedComponents ?? {};
    renderTemplateForm(editData?.template ?? null, editData?.lockedComponents ?? {});
    renderTemplatesList();
    initializeClassStanding();
    initializeStandingDialogScrollLock();
    showProfessorFlash();

    document.getElementById('logoutBtn').addEventListener('click', logoutProfessor);
    setInterval(refreshStandings, 15000);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshStandings();
    });
}

function initializeStandingDialogScrollLock() {
    const dialog = document.getElementById('standingDialog');
    dialog.addEventListener('close', () => setStandingDialogScrollLock(false));
}

function setStandingDialogScrollLock(locked) {
    if (locked) {
        if (standingDialogPreviousOverflow !== null) return;
        standingDialogPreviousOverflow = {
            html: document.documentElement.style.overflow,
            body: document.body.style.overflow
        };
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        return;
    }

    if (standingDialogPreviousOverflow === null) return;
    document.documentElement.style.overflow = standingDialogPreviousOverflow.html;
    document.body.style.overflow = standingDialogPreviousOverflow.body;
    standingDialogPreviousOverflow = null;
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
    } else if (params.get('template') === 'success') {
        const code = params.get('code') ? ` Class Sync Code: ${params.get('code')}` : '';
        showProfessorAlert(`Syllabus template published and saved to database!${code} Share this code with your students.`, 'success');
    } else if (params.get('template') === 'updated') {
        showProfessorAlert('Template updated. Enrolled students will see the changes when they reload their dashboard.', 'success');
    }

    const hashTab = window.location.hash.slice(1);
    if (hashTab === 'standing' || hashTab === 'templates') {
        tabHint = hashTab;
    } else if (params.has('error') || params.has('template') || params.has('edit')) {
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
    window.history.replaceState({}, document.title, `${window.location.pathname}#${tab}`);
    ['standing', 'templates'].forEach(name => {
        document.getElementById(`mobile-${name}`).className = `flex-1 rounded-xl px-3 py-2 text-xs font-bold ${name === tab ? 'bg-maroon-900 text-white' : 'bg-stone-200 text-stone-700'}`;
    });
    const standingNav = document.getElementById('nav-standing');
    const templatesNav = document.getElementById('nav-templates');
    standingNav.className = showStanding
        ? 'w-full text-left px-3 py-2.5 rounded-lg font-bold text-[11px] flex items-center space-x-3 bg-[#eee8dc] text-maroon-900 border border-[#e5ddcf]'
        : 'w-full text-left px-3 py-2.5 rounded-lg font-medium text-[11px] text-stone-600 hover:bg-stone-200/60 transition flex items-center space-x-3';
    templatesNav.className = showStanding
        ? 'w-full text-left px-3 py-2.5 rounded-lg font-medium text-[11px] text-stone-600 hover:bg-stone-200/60 transition flex items-center space-x-3'
        : 'w-full text-left px-3 py-2.5 rounded-lg font-bold text-[11px] flex items-center space-x-3 bg-[#eee8dc] text-maroon-900 border border-[#e5ddcf]';
    if (showStanding) refreshStandings();
}

function renderTemplateForm(template, lockedComponents) {
    editingTemplateId = template ? Number(template.id) : 0;

    document.getElementById('templateIdInput').value = String(editingTemplateId);
    document.getElementById('templateEditorTitle').textContent = template
        ? `Editing ${template.code} · ${template.title}`
        : 'Create a new course template';
    document.getElementById('courseCodeInput').value = template ? template.code : '';
    document.getElementById('courseTitleInput').value = template ? template.title : '';
    document.getElementById('courseUnitInput').value = template ? Number(template.units).toFixed(1) : '';

    document.getElementById('publishTemplateButtonText').textContent = template
        ? 'Save Changes'
        : 'Save & Generate Code';

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
    const activeTemplate = template || enrolledTemplates[0] || null;
    renderActiveClassCode(activeTemplate);
}

function resetTemplateForm() {
    const templateToRestore = editingTemplateId > 0 ? initialTemplate : null;
    renderTemplateForm(templateToRestore, templateToRestore ? initialLockedComponents : {});
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
    const totals = {};
    Object.keys(periodLabels).forEach(period => {
        const inputs = document.querySelectorAll(`#componentContainer-${period} .comp-weight`);
        const total = [...inputs].reduce((sum, input) => sum + (Number(input.value) || 0), 0);
        const badge = document.getElementById(`weightTotalBadge-${period}`);
        const periodValid = total === 100;
        totals[period] = total;
        badge.textContent = `${total}% / 100%`;
        badge.className = `rounded-full px-2 py-1 text-[8px] font-bold ${periodValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`;
        badge.setAttribute('aria-label', `${periodLabels[period]} weights total ${total} percent${periodValid ? ', valid' : ', must total 100 percent'}`);
        if (!periodValid) valid = false;
    });

    const progress = document.getElementById('overallWeightProgress');
    const status = document.getElementById('overallWeightStatus');
    const completePeriods = Object.values(totals).filter(total => total === 100).length;
    const progressPercent = (Math.min(100, totals.midterms) + Math.min(100, totals.finals)) / 2;
    progress.style.width = `${progressPercent}%`;
    status.textContent = valid
        ? '100% / 100% (Valid)'
        : `${completePeriods} / 2 periods complete`;
    status.className = `font-bold ${valid ? 'text-emerald-700' : 'text-rose-700'}`;
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
    document.getElementById('publishTemplateButtonText').textContent = editingTemplateId !== 0 ? 'Saving...' : 'Publishing...';
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
        const savedTemplateId = editingTemplateId || Number(data.templateId);
        const wasEditing = editingTemplateId > 0;

        if (!Number.isInteger(savedTemplateId) || savedTemplateId <= 0) {
            throw new Error('The template was saved, but its identifier was missing from the response.');
        }

        button.disabled = false;
        try {
            const [templatesData, standingsData, detailData] = await Promise.all([
                API.get('/templates'),
                API.get('/professor/standings'),
                API.get(`/templates/${savedTemplateId}`)
            ]);
            if (!Array.isArray(templatesData.templates) || !Array.isArray(standingsData.courses) || !detailData.template) {
                throw new Error('The saved template refresh returned an invalid response.');
            }

            enrolledTemplates = templatesData.templates;
            standingCourses = standingsData.courses;
            const savedTemplate = enrolledTemplates.find(template => Number(template.id) === savedTemplateId);
            if (!savedTemplate) throw new Error('The saved template could not be found in the refreshed template list.');

            if (wasEditing) {
                initialTemplate = detailData.template;
                initialLockedComponents = detailData.lockedComponents || {};
                renderTemplateForm(detailData.template, initialLockedComponents);
            } else {
                initialTemplate = null;
                initialLockedComponents = {};
                renderTemplateForm(null, {});
            }
            renderTemplatesList();
            renderActiveClassCode(savedTemplate);
            renderClassStanding();

            const generatedCode = savedTemplate.classCode || data.classCode;
            window.history.replaceState({}, document.title, `${window.location.pathname}#templates`);
            showProfessorAlert(
                wasEditing
                    ? `${savedTemplate.code} was updated successfully. Students will see the changes when they reload their dashboard.`
                    : `Template published successfully. Class Sync Code: ${generatedCode}. Share this code with your students.`,
                'success'
            );
        } catch (refreshError) {
            showProfessorAlert(
                `Template saved successfully, but the dashboard could not refresh its latest data: ${refreshError.message}`,
                'error'
            );
            document.getElementById('publishTemplateButtonText').textContent =
                wasEditing ? 'Save Changes' : 'Save & Generate Code';
        }
    } catch (error) {
        showProfessorAlert(error.message, 'error');
        button.disabled = false;
        document.getElementById('publishTemplateButtonText').textContent = editingTemplateId > 0 ? 'Save Changes' : 'Save & Generate Code';
    }
}

function renderTemplatesList() {
    const container = document.getElementById('publishedTemplatesList');
    container.innerHTML = '';
    document.getElementById('templateCountBadge').textContent =
        `${enrolledTemplates.length} ${enrolledTemplates.length === 1 ? 'template' : 'templates'}`;

    if (enrolledTemplates.length === 0) {
        container.innerHTML = '<p class="rounded-lg border border-dashed border-stone-300 bg-white p-3 text-[8px] italic text-stone-400">No published course templates yet.</p>';
        renderActiveClassCode(null);
        return;
    }

    enrolledTemplates.forEach(tpl => {
        const card = document.createElement('div');
        const enrollmentCount = standingCourses.find(course => String(course.id) === String(tpl.id))?.students.length ?? 0;
        card.className = 'rounded-lg border border-stone-200 bg-white p-3 shadow-sm';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <p class="truncate text-[9px] font-extrabold text-slate-800">${escapeHtml(tpl.code)} · ${escapeHtml(tpl.title)}</p>
                    <p class="mt-1 text-[8px] text-stone-500">${Number(tpl.units).toFixed(1)} units · ${enrollmentCount} enrolled</p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                    <button type="button" onclick="selectTemplateCode(${Number(tpl.id)})" class="rounded-md border border-stone-200 px-2 py-1 text-[7px] font-bold text-stone-600 hover:bg-stone-50">View Code</button>
                    <a href="professor_dashboard.html?edit=${Number(tpl.id)}#templates" class="rounded-md bg-maroon-50 px-2 py-1 text-[7px] font-bold text-maroon-900 hover:bg-maroon-100">Edit</a>
                    <button type="button" onclick="removeTemplate(${Number(tpl.id)})" aria-label="Delete ${escapeHtml(tpl.code)} template" class="flex h-6 w-6 items-center justify-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
            <div class="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
                <span class="text-[7px] font-bold uppercase tracking-wide text-stone-400">Class code</span>
                <span class="font-mono text-[8px] font-extrabold tracking-wider text-maroon-900">${escapeHtml(tpl.classCode)}</span>
            </div>
        `;
        container.appendChild(card);
    });

    const activeTemplate = enrolledTemplates.find(template => Number(template.id) === editingTemplateId) || enrolledTemplates[0];
    renderActiveClassCode(activeTemplate);
}

function renderActiveClassCode(template) {
    const courseLabel = document.getElementById('classCodeCourseLabel');
    const codeDisplay = document.getElementById('classCodeDisplay');
    const copyButton = document.getElementById('copyClassCodeButton');
    const enrollmentCount = document.getElementById('classCodeEnrollmentCount');
    const syncStatus = document.getElementById('classCodeSyncStatus');
    document.getElementById('classCodeCopyStatus').textContent = '';

    if (!template) {
        courseLabel.textContent = 'New class template';
        codeDisplay.textContent = '—';
        codeDisplay.dataset.code = '';
        copyButton.disabled = true;
        enrollmentCount.textContent = '—';
        syncStatus.textContent = 'Not published';
        syncStatus.className = 'rounded-full bg-stone-100 px-2 py-1 font-bold text-stone-500';
        return;
    }

    const course = standingCourses.find(item => String(item.id) === String(template.id));
    courseLabel.textContent = `${template.code} Class Code`;
    codeDisplay.textContent = template.classCode || '—';
    codeDisplay.dataset.code = template.classCode || '';
    copyButton.disabled = !template.classCode;
    enrollmentCount.textContent = String(course?.students.length ?? 0);
    syncStatus.textContent = template.classCode ? 'Published' : 'Not published';
    syncStatus.className = template.classCode
        ? 'rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-700'
        : 'rounded-full bg-stone-100 px-2 py-1 font-bold text-stone-500';
}

function selectTemplateCode(templateId) {
    const template = enrolledTemplates.find(item => Number(item.id) === templateId);
    if (template) renderActiveClassCode(template);
}

async function copyActiveClassCode() {
    const code = document.getElementById('classCodeDisplay').dataset.code;
    const status = document.getElementById('classCodeCopyStatus');
    if (!code) {
        status.textContent = 'No class code is available yet.';
        return;
    }
    if (!navigator.clipboard?.writeText) {
        status.textContent = 'Clipboard access is unavailable in this browser.';
        return;
    }
    try {
        await navigator.clipboard.writeText(code);
        status.textContent = 'Class code copied.';
    } catch (error) {
        status.textContent = 'Could not copy the class code. Please copy it manually.';
    }
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
                    ? 'standing-filter px-3 py-1.5 rounded-full bg-maroon-900 text-white text-[11px] font-bold'
                    : 'standing-filter px-3 py-1.5 rounded-full bg-stone-100 text-stone-700 text-[11px] font-bold';
            });
            renderClassStanding();
        });
    });
    renderClassStanding();
    document.getElementById('standingRefreshStatus').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
}

function updateCourseOptions() {
    const courseFilter = document.getElementById('courseFilter');
    const selected = courseFilter.value;
    courseFilter.innerHTML = '<option value="all">All Enrolled Sections (Overall Standing)</option>';
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

    renderDistribution(gradedRows, average);
    renderStandingTable(courses, rows, allRows);
}

function renderDistribution(rows, average) {
    const chart = document.getElementById('distributionChart');
    const summary = document.getElementById('distributionSummary');
    const bins = [
        { min: 0, max: 65, label: '<65%' },
        { min: 65, max: 70, label: '65–69%' },
        { min: 70, max: 75, label: '70–74%' },
        { min: 75, max: 80, label: '75–79%' },
        { min: 80, max: 85, label: '80–84%' },
        { min: 85, max: 90, label: '85–89%' },
        { min: 90, max: 95, label: '90–94%' },
        { min: 95, max: 101, label: '95–100%' }
    ];
    const counts = bins.map(bin => rows.filter(row => row.percentage >= bin.min && row.percentage < bin.max).length);
    const width = 760;
    const left = 28;
    const right = 12;
    const top = 26;
    const baseline = 184;
    const plotWidth = width - left - right;
    const plotHeight = baseline - top;
    const binWidth = plotWidth / bins.length;
    const maxCount = Math.max(1, ...counts);
    const averageX = average === null ? null : left + (Math.max(0, Math.min(100, average)) / 100) * plotWidth;
    const variance = rows.length
        ? rows.reduce((total, row) => total + Math.pow(row.percentage - average, 2), 0) / rows.length
        : 0;
    const deviation = Math.sqrt(variance) || 1;
    const curvePoints = rows.length
        ? Array.from({ length: 101 }, (_, index) => {
            const grade = index;
            const x = left + (grade / 100) * plotWidth;
            const normalized = Math.exp(-0.5 * Math.pow((grade - average) / deviation, 2));
            const y = baseline - normalized * plotHeight * 0.88;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ')
        : '';
    const bars = bins.map((bin, index) => {
        const height = counts[index] ? counts[index] / maxCount * plotHeight * 0.72 : 0;
        const x = left + index * binWidth + binWidth * 0.1;
        const y = baseline - height;
        const fill = index < 3 ? '#f5e3e7' : index < 6 ? '#dff3e8' : '#fff0c7';
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(binWidth * 0.8).toFixed(1)}" height="${height.toFixed(1)}" rx="4" fill="${fill}"/>
            ${counts[index] ? `<text x="${(x + binWidth * 0.4).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" fill="#78716c" font-size="11">${counts[index]}</text>` : ''}
            <text x="${(left + index * binWidth + binWidth / 2).toFixed(1)}" y="205" text-anchor="middle" fill="#57534e" font-size="10">${bin.label}</text>`;
    }).join('');
    const gridLines = [0, Math.ceil(maxCount / 2), maxCount].filter((value, index, values) => values.indexOf(value) === index).map(value => {
        const y = baseline - value / maxCount * plotHeight * 0.72;
        return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" stroke="#f1efeb" stroke-width="1"/>`;
    }).join('');

    chart.innerHTML = `${gridLines}${bars}
        ${averageX === null ? '' : `<line x1="${averageX.toFixed(1)}" y1="${top}" x2="${averageX.toFixed(1)}" y2="${baseline}" stroke="#c58b32" stroke-width="1" stroke-dasharray="3 3"/>
            <rect x="${Math.max(left, Math.min(width - 112, averageX - 40)).toFixed(1)}" y="3" width="80" height="17" rx="5" fill="#4a0415"/>
            <text x="${Math.max(left + 40, Math.min(width - 72, averageX)).toFixed(1)}" y="14.5" text-anchor="middle" fill="white" font-size="10" font-weight="700">Mean ${formatPercentage(average)}</text>`}
        ${curvePoints ? `<polyline points="${curvePoints}" fill="none" stroke="#6b0820" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
        <line x1="${left}" y1="${baseline}" x2="${width - right}" y2="${baseline}" stroke="#e7e5e4" stroke-width="1"/>`;
    summary.textContent = rows.length
        ? `Mean standing: ${formatPercentage(average)} · ${rows.length} evaluated ${rows.length === 1 ? 'student' : 'students'}`
        : 'No evaluated standings available.';
}

function renderStandingTable(courses, rows, allRows) {
    const tableHead = document.getElementById('standingTableHead');
    const tableBody = document.getElementById('standingTableBody');
    const showCourse = document.getElementById('courseFilter').value === 'all';
    const components = courses.length === 1 ? courses[0].components : [];
    tableHead.innerHTML = `<tr class="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-600 border-b border-stone-200">
        <th class="p-3">Rank</th><th class="p-3">Student</th>${showCourse ? '<th class="p-3">Course</th>' : ''}
        <th class="p-3">Overall Grade</th>${components.map(component => `<th class="p-3">${periodLabels[component.period]} · ${escapeHtml(component.name)} (${component.weight}%)</th>`).join('')}
        <th class="p-3">Status / Coverage</th><th class="p-3 text-right">Action</th></tr>`;
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
            return `<td class="p-3 text-stone-700">${formatPercentage(item?.percentage ?? null)}</td>`;
        }).join('');
        const current = formatPercentage(row.percentage);
        const progressText = `${row.gradedWeight}% course weight covered`;
        return `<tr class="hover:bg-stone-50/80">
            <td class="p-3 font-bold text-stone-600">${rankByEnrollment.has(row.enrollmentId) ? `#${rankByEnrollment.get(row.enrollmentId)}` : '—'}</td>
            <td class="p-3"><p class="font-bold text-slate-800">${escapeHtml(row.student)}</p><p class="mt-1 text-[11px] text-stone-600">${escapeHtml(row.email)}</p></td>
            ${showCourse ? `<td class="p-3 font-semibold text-stone-700">${escapeHtml(row.course.code)}</td>` : ''}
            <td class="p-3"><span class="font-black text-slate-900">${current}</span>${row.percentage !== null ? `<div class="mt-1.5 h-1.5 w-20 rounded-full bg-stone-100"><div class="h-1.5 rounded-full ${row.percentage < 75 ? 'bg-rose-500' : 'bg-maroon-900'}" style="width:${Math.max(0, Math.min(100, row.percentage))}%"></div></div>` : ''}</td>
            ${componentCells}
            <td class="p-3"><span class="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${status.style}">${status.label}</span><p class="mt-1 text-[11px] text-stone-600">${progressText}</p></td>
            <td class="p-3 text-right"><button type="button" data-enrollment-id="${row.enrollmentId}" class="standing-detail-button rounded-md border border-stone-300 px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-stone-100">View Breakdown</button></td>
        </tr>`;
    }).join('');
    tableBody.querySelectorAll('.standing-detail-button').forEach(button => {
        button.addEventListener('click', () => showStandingDetails(Number(button.dataset.enrollmentId)));
    });
    document.getElementById('standingEmptyState').classList.toggle('hidden', rows.length > 0);
}

function showStandingDetails(enrollmentId) {
    const course = standingCourses.find(item =>
        item.students.some(student => String(student.enrollmentId) === String(enrollmentId))
    );
    const student = course?.students.find(item => String(item.enrollmentId) === String(enrollmentId));
    const dialog = document.getElementById('standingDialog');
    if (!course || !student) { dialog.close(); return; }
    const rankedStudents = [...course.students]
        .filter(item => item.percentage !== null)
        .sort((a, b) => b.percentage - a.percentage);
    const rank = student.percentage === null
        ? null
        : rankedStudents.filter(item => item.percentage > student.percentage).length + 1;
    const topPercent = rank === null || rankedStudents.length === 0
        ? null
        : Math.max(1, Math.ceil(rank / rankedStudents.length * 100));
    const overall = student.percentage === null ? null : Math.max(0, Math.min(100, Number(student.percentage)));
    const scoreStatus = standingStatus(student);

    document.getElementById('standingDialogInitials').textContent = student.student
        .trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
    document.getElementById('standingDialogCourse').textContent = `${course.code} · ${course.title}`;
    document.getElementById('standingDialogStudent').textContent = student.student;
    document.getElementById('standingDialogEmail').textContent = student.email;
    document.getElementById('standingDialogRankBadge').textContent = rank === null
        ? 'Not ranked'
        : `Rank #${rank} · Top ${topPercent}%`;
    const benchmark = rankedStudents[0];
    document.getElementById('standingDialogBenchmark').textContent = benchmark
        ? `${formatPercentage(benchmark.percentage)} · ${benchmark.student}`
        : 'No evaluated standings';
    document.getElementById('standingDialogOverall').textContent = formatPercentage(overall);
    const overallRing = document.getElementById('standingDialogOverallRing');
    overallRing.style.background = overall === null
        ? 'conic-gradient(#e7e5e4 0%, #e7e5e4 100%)'
        : `conic-gradient(#6b0820 ${overall}%, #e7e5e4 ${overall}% 100%)`;
    overallRing.setAttribute('aria-label', overall === null
        ? 'No overall standing available'
        : `Overall standing ${formatPercentage(overall)}`);
    const standingSummary = student.percentage === null
        ? student.status === 'Invalid weights' ? 'The grading weights need correction.' : 'No scores have been entered.'
        : `${student.status === 'Complete' ? 'Current' : 'Provisional'} weighted score from saved assessments.`;
    document.getElementById('standingDialogSummary').textContent = standingSummary;
    document.getElementById('standingDialogRank').textContent = rank === null ? 'Unranked' : `#${rank} in ${course.code}`;
    document.getElementById('standingDialogEnrollment').textContent = `${rankedStudents.length} / ${course.students.length} ranked`;
    document.getElementById('standingDialogCoverage').textContent = `${Number(student.gradedWeight).toFixed(1)}%`;
    const statusElement = document.getElementById('standingDialogStatus');
    statusElement.textContent = scoreStatus.label;
    statusElement.className = `mt-1 text-xs font-extrabold ${
        scoreStatus.style.includes('rose') ? 'text-rose-700'
            : scoreStatus.style.includes('emerald') ? 'text-emerald-700'
                : scoreStatus.style.includes('blue') ? 'text-blue-700'
                    : scoreStatus.style.includes('amber') ? 'text-amber-800'
                        : 'text-stone-600'
    }`;
    document.getElementById('standingDialogBreakdown').innerHTML = student.components.map(component => {
        const percentage = component.percentage === null
            ? null
            : Math.max(0, Math.min(100, Number(component.percentage)));
        const effectiveWeight = Number(component.weight) / 2;
        const assessments = component.assessments.length
            ? component.assessments.map(assessment => `<li class="flex justify-between gap-2 py-1 text-[11px] text-stone-600"><span class="truncate">${escapeHtml(assessment.title)}</span><span class="shrink-0 font-semibold">${Number(assessment.score)} / ${Number(assessment.max)}</span></li>`).join('')
            : '<li class="py-1 text-[11px] italic text-stone-500">No scores entered</li>';
        return `<article class="rounded-lg border border-stone-100 bg-[#fbfaf8] p-3">
            <div class="flex items-center justify-between gap-2">
                <h4 class="line-clamp-2 text-xs font-extrabold text-slate-800">${escapeHtml(component.name)}</h4>
                <strong class="shrink-0 text-base font-black text-slate-900">${formatPercentage(percentage)}</strong>
            </div>
            <p class="mt-1 text-[11px] text-stone-600">${periodLabels[component.period]} · ${effectiveWeight}% course weight</p>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" role="img" aria-label="${escapeHtml(component.name)}: ${formatPercentage(percentage)}">
                <div class="h-full rounded-full ${percentage === null ? 'bg-stone-400' : percentage >= 90 ? 'bg-emerald-600' : percentage >= 75 ? 'bg-blue-600' : 'bg-amber-600'}" style="width:${percentage ?? 0}%"></div>
            </div>
            <p class="mt-1 text-[11px] font-semibold ${percentage === null ? 'text-stone-500' : 'text-emerald-700'}">${percentage === null ? 'Pending scores' : `${Number(component.score)} / ${Number(component.max)} points`}</p>
            <details class="mt-2 border-t border-stone-200 pt-2 text-left">
                <summary class="cursor-pointer text-[11px] font-bold text-stone-600">Assessment scores</summary>
                <ul class="mt-1">${assessments}</ul>
            </details>
        </article>`;
    }).join('') || '<p class="col-span-full text-center text-[9px] text-stone-500">This course has no grading components.</p>';
    dialog.dataset.enrollmentId = String(enrollmentId);
    if (!dialog.open) {
        setStandingDialogScrollLock(true);
        dialog.showModal();
    }
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
