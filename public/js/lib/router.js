/* router.js — tiny hash router + SPA bootstrap coordination. */

const Router = {
  routes: {},
  current: '',
  register(path, fn) { this.routes[path] = fn; },
  addDefault(fn) { this.defaultFn = fn; },
  parse() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, queryStr] = raw.split('?');
    const query = {};
    (queryStr || '').split('&').forEach((kv) => {
      if (!kv) return;
      const [k, v] = kv.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { path: normalize(path), query };
  },
  navigate(path) { location.hash = path; },
  match(path) {
    if (this.routes[path]) return this.routes[path];
    // support dynamic segments like /surveys/:id (not used much, but available)
    for (const key of Object.keys(this.routes)) {
      if (key.includes(':')) {
        const keys = key.split('/'); const vals = path.split('/');
        if (keys.length !== vals.length) continue;
        let match = true; const params = {};
        for (let i = 0; i < keys.length; i++) {
          if (keys[i].startsWith(':')) params[keys[i].slice(1)] = vals[i];
          else if (keys[i] !== vals[i]) { match = false; break; }
        }
        if (match) { this.routeParams = params; return this.routes[key]; }
      }
    }
    return null;
  },
  start() {
    window.addEventListener('hashchange', () => this.run());
    this.run();
  },
  run() {
    const { path, query } = this.parse();
    const handler = this.match(path);
    if (handler) {
      this.current = path;
      handler(path, query);
    } else if (this.defaultFn) {
      this.defaultFn(path, query);
    } else {
      document.getElementById('app').innerHTML = '<h1>Not found</h1>';
    }
  }
};

function normalize(p) { return p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p; }

window.Router = Router;
