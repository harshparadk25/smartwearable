// Relative path — Vite proxies /api to the backend, so no hostname needed
const API_URL = import.meta.env.VITE_API_URL || '';

const getStoredToken = () => localStorage.getItem('ehms_token');

const setStoredToken = (token) => {
  if (token) {
    localStorage.setItem('ehms_token', token);
  } else {
    localStorage.removeItem('ehms_token');
  }
};

const apiRequest = async (path, options = {}) => {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const { method = 'GET', body, token, headers = {} } = options;

  const requestHeaders = { ...headers };
  if (body !== undefined && !requestHeaders['Content-Type']) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const authToken = token ?? getStoredToken();
  if (authToken) {
    requestHeaders.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && data.message ? data.message : 'Request failed';
    throw new Error(message);
  }

  return data;
};

export { apiRequest, getStoredToken, setStoredToken };
