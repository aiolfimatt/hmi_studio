import axios from 'axios'

const TOKEN_KEY = 'hmi_token'

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const client = axios.create({
  baseURL: '/api'
})

// Request interceptor — attach Bearer token
client.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — handle 401
client.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.location.href = '/edit'
    }
    return Promise.reject(err)
  }
)

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const auth = {
  login: (username, password) =>
    client.post('/auth/login', { username, password }).then(r => r.data),

  me: () =>
    client.get('/auth/me').then(r => r.data),

  changePassword: (oldPassword, newPassword) =>
    client.post('/auth/change-password', { old_password: oldPassword, new_password: newPassword }).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
export const pages = {
  list: () =>
    client.get('/pages').then(r => r.data),

  get: name =>
    client.get(`/pages/${name}`).then(r => r.data),

  // Runtime home page name (public, no auth required)
  getHome: () =>
    client.get('/pages/meta/home').then(r => r.data),

  create: data =>
    client.post('/pages', data).then(r => r.data),

  update: (name, data) =>
    client.put(`/pages/${name}`, data).then(r => r.data),

  rename: (name, newName) =>
    client.put(`/pages/${name}`, { name: newName }).then(r => r.data),

  deletePage: name =>
    client.delete(`/pages/${name}`).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const users = {
  list: () =>
    client.get('/users').then(r => r.data),

  create: data =>
    client.post('/users', data).then(r => r.data),

  update: (id, data) =>
    client.put(`/users/${id}`, data).then(r => r.data),

  unlock: id =>
    client.post(`/users/${id}/unlock`).then(r => r.data),

  deleteUser: id =>
    client.delete(`/users/${id}`).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Groups (named access groups + inheritance hierarchy + capabilities)
// ---------------------------------------------------------------------------
export const groups = {
  list: () =>
    client.get('/groups').then(r => r.data),

  // Public id→name map (no auth) — used by the runtime to name a required group.
  names: () =>
    client.get('/groups/names').then(r => r.data),

  create: data =>
    client.post('/groups', data).then(r => r.data),

  update: (id, data) =>
    client.put(`/groups/${id}`, data).then(r => r.data),

  remove: id =>
    client.delete(`/groups/${id}`).then(r => r.data)
}

// ---------------------------------------------------------------------------
// PLC
// ---------------------------------------------------------------------------
export const plc = {
  read: (tags) =>
    client.post('/plc/read', { tags }).then(r => r.data),

  write: (tag, value) =>
    client.post('/plc/write', { tag, value }).then(r => r.data),

  // Browse an ADS (Beckhoff) machine's symbol table for the widget editor.
  // Returns { symbols: [{ name, type, comment, size }], count, cached }.
  symbols: (machineId, refresh = false) =>
    client.get(`/plc/${machineId}/symbols`, { params: refresh ? { refresh: 1 } : {} })
      .then(r => r.data),

  // Detect the scalar fields of an ADS array-of-struct symbol (grid struct source).
  // Returns { fields: [{ field, dataType }], count }.
  structFields: (machineId, symbol) =>
    client.get(`/plc/${machineId}/struct-fields`, { params: { symbol } }).then(r => r.data),
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------
export const alarms = {
  listDefinitions: () =>
    client.get('/alarms/definitions').then(r => r.data),

  createDefinition: data =>
    client.post('/alarms/definitions', data).then(r => r.data),

  updateDefinition: (id, data) =>
    client.put(`/alarms/definitions/${id}`, data).then(r => r.data),

  deleteDefinition: id =>
    client.delete(`/alarms/definitions/${id}`).then(r => r.data),

  // Shared text lists for composite alarms (motor list, cause list, …).
  listLists: () =>
    client.get('/alarms/lists').then(r => r.data),
  createList: data =>
    client.post('/alarms/lists', data).then(r => r.data),
  updateList: (id, data) =>
    client.put(`/alarms/lists/${id}`, data).then(r => r.data),
  deleteList: id =>
    client.delete(`/alarms/lists/${id}`).then(r => r.data),

  listHistory: (params = {}) =>
    client.get('/alarms/history', { params }).then(r => r.data),

  listActive: () =>
    client.get('/alarms/active').then(r => r.data),

  // Public, unauthenticated active-alarm read for the runtime HMI (no session).
  listActivePublic: () =>
    client.get('/alarms/public/active').then(r => r.data),

  acknowledge: id =>
    client.put(`/alarms/history/${id}/acknowledge`).then(r => r.data),

  resolve: id =>
    client.put(`/alarms/history/${id}/resolve`).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Trace (local audit log)
// ---------------------------------------------------------------------------
export const trace = {
  list: (params = {}) =>
    client.get('/trace', { params }).then(r => r.data),
}

// ---------------------------------------------------------------------------
// System (simulation switch)
// ---------------------------------------------------------------------------
export const system = {
  getSim: () =>
    client.get('/system/sim').then(r => r.data),

  setSim: (enabled) =>
    client.post('/system/sim', { enabled }).then(r => r.data),

  getConfig: () =>
    client.get('/system/config').then(r => r.data),

  // App + project-format version + program version tag
  // ({ app, projectFormat, programVersion }).
  version: () =>
    client.get('/system/version').then(r => r.data),
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------
export const recipes = {
  list: () =>
    client.get('/recipes').then(r => r.data),

  get: id =>
    client.get(`/recipes/${id}`).then(r => r.data),

  create: data =>
    client.post('/recipes', data).then(r => r.data),

  update: (id, data) =>
    client.put(`/recipes/${id}`, data).then(r => r.data),

  deleteRecipe: id =>
    client.delete(`/recipes/${id}`).then(r => r.data)
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
export const assets = {
  list: () =>
    client.get('/assets').then(r => r.data),

  upload: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post('/assets/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  delete: (name) =>
    client.delete(`/assets/${encodeURIComponent(name)}`).then(r => r.data),
}

// ---------------------------------------------------------------------------
// Transfer — portable page bundles (pages + referenced image assets)
// ---------------------------------------------------------------------------
export const transfer = {
  // names omitted/empty = export all pages
  export: (names) =>
    client.post('/transfer/export', { names: names || [] }).then(r => r.data),

  import: (bundle, opts = {}) =>
    client.post('/transfer/import', { bundle, ...opts }).then(r => r.data),
}

// ---------------------------------------------------------------------------
// Text I/O — CSV export/import of all translatable text (widget texts + alarm
// translations) in a single file.
// ---------------------------------------------------------------------------
export const textio = {
  // Export returns raw CSV text (responseType text so axios doesn't try to
  // JSON-parse it).
  exportTexts: () =>
    client.get('/textio/texts', { responseType: 'text' }).then(r => r.data),

  // Import takes the edited CSV text and returns a { ... , warnings } report.
  importTexts: (csv) =>
    client.post('/textio/texts', { csv }).then(r => r.data),
}

// ---------------------------------------------------------------------------
// Project — the whole HMI config (pages + assets + alarms + recipes + settings)
// as a portable .hmiproj bundle: New / Open / Save / Save As.
// ---------------------------------------------------------------------------
export const project = {
  // Current runtime info ({ exists, savedAt, counts }).
  info: () => client.get('/project/info').then(r => r.data),

  // Persist the live config to the server's runtime mirror.
  save: (name) => client.post('/project/save', name ? { name } : {}).then(r => r.data),

  // Download the runtime as a .hmiproj file blob (client "Save to file").
  download: (name) =>
    client.get('/project/download', { params: name ? { name } : {}, responseType: 'blob' }).then(r => r.data),

  // Replace the runtime from an uploaded .hmiproj (destructive — level 3).
  load: (bundle) => client.post('/project/load', { bundle }).then(r => r.data),

  // Blank the runtime (destructive — level 3).
  newProject: () => client.post('/project/new').then(r => r.data),

  // Set the free-text program version tag shown at runtime ('' clears it).
  setVersion: (version) => client.post('/project/version', { version }).then(r => r.data),
}

// ---------------------------------------------------------------------------
// Widget library — reusable saved widgets / groups, inserted as copies onto pages
// ---------------------------------------------------------------------------
export const library = {
  list: () =>
    client.get('/library').then(r => r.data),

  // data: { name, category, widgets: [<widget>…] }
  create: data =>
    client.post('/library', data).then(r => r.data),

  update: (id, data) =>
    client.put(`/library/${id}`, data).then(r => r.data),

  remove: id =>
    client.delete(`/library/${id}`).then(r => r.data),
}

// ---------------------------------------------------------------------------
// Sidebar — shared global navigation sidebar config (buttons + style)
// ---------------------------------------------------------------------------
export const sidebar = {
  get: () => client.get('/sidebar').then(r => r.data),
  save: (config) => client.put('/sidebar', config).then(r => r.data),
}

export default client
