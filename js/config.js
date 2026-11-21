// Base URL of the JSON API.
// In production the frontend proxies "/api" to Render (see vercel.json), which
// keeps the session cookie first-party. Under XAMPP both repositories are
// siblings in the web root, so the page must call the backend directly.
window.APP_CONFIG = {
  apiBase: ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)
    ? '../grade-tracker-backend/api'
    : '/api',
};
