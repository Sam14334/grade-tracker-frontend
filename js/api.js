(function () {
    const defaultBase = '../grade-tracker-backend/api';
    const base = String(window.APP_CONFIG?.apiBase || defaultBase).replace(/\/+$/, '');
    let csrfToken = null;

    function setCsrfToken(token) {
        csrfToken = token || null;
    }

    async function apiRequest(path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        const headers = Object.assign({ 'Accept': 'application/json' }, options.headers || {});
        let body = options.body;

        if (body !== undefined && body !== null && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        if (method !== 'GET' && csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const response = await fetch(`${base}${path}`, {
            method,
            credentials: 'include',
            cache: 'no-store',
            ...options,
            headers,
            body
        });

        let data = {};
        const text = await response.text();
        if (text) {
            try {
                data = JSON.parse(text);
            } catch {
                data = {};
            }
        }

        if (!response.ok || data.success === false) {
            const error = new Error(data.error || `Request failed (${response.status}).`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    async function fetchSession() {
        const data = await apiRequest('/auth/session');
        setCsrfToken(data.csrfToken);
        return data;
    }

    window.API = {
        get: (path, options = {}) => apiRequest(path, { ...options, method: 'GET' }),
        post: (path, body, options = {}) => apiRequest(path, { ...options, method: 'POST', body }),
        put: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PUT', body }),
        delete: (path, options = {}) => apiRequest(path, { ...options, method: 'DELETE' }),
        session: fetchSession,
        setCsrfToken
    };
})();
