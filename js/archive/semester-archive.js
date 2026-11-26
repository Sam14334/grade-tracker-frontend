const archiveContent = document.getElementById('archive-content');
const archiveRole = document.body.dataset.archiveRole;
const account = document.getElementById('archive-account');
const logout = document.getElementById('archive-logout');
const sessionStatus = document.getElementById('archive-session-status');

async function loadArchiveSession() {
    sessionStatus.textContent = 'Checking your session…';

    try {
        const session = await window.API.session();
        if (session.authenticated === false) {
            window.location.replace('index.html');
            return;
        }

        const user = session.user;
        if (session.authenticated !== true || !user) throw new Error('Invalid session response.');
        const isProfessor = user.roleId === 2 || user.role?.toLowerCase() === 'professor';
        const role = isProfessor ? 'professor' : 'student';
        if (archiveRole !== role) {
            window.location.replace(role + '_semester_archive.html');
            return;
        }

        const displayName = user.fullName || user.email || (isProfessor ? 'Professor' : 'Student');
        document.getElementById('archive-user-name').textContent = displayName;
        document.getElementById('archive-user-initial').textContent = displayName.charAt(0).toUpperCase();
        document.getElementById('archive-user-role').textContent = isProfessor ? 'Professor' : 'Student';
        account.hidden = false;
        archiveContent.hidden = false;
        sessionStatus.textContent = '';
    } catch (error) {
        if (error.status === 401) {
            window.location.replace('index.html');
            return;
        }
        sessionStatus.textContent = 'Could not check your session. Reload this page to try again.';
    }
}

logout.addEventListener('click', async () => {
    logout.disabled = true;
    sessionStatus.textContent = '';

    try {
        await window.API.post('/auth/logout', {});
        window.location.replace('index.html');
    } catch (error) {
        if (error.status === 401) {
            window.location.replace('index.html');
            return;
        }
        sessionStatus.textContent = 'Could not log out. Please try again.';
        logout.disabled = false;
    }
});

loadArchiveSession();
