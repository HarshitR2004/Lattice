# Lattice frontend

The React workspace connects to the Lattice FastAPI backend for workflow storage and inspection execution. See the [project README](../README.md) for architecture, setup, Bolna configuration and API documentation.

```sh
npm ci
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000`. Run database migrations and start the backend before using the workspace. Set `VITE_API_BASE_URL` only when serving the API from a different origin.

Developer checks: `npm run typecheck`, `npm run test:sessions` and `npm run build`.

