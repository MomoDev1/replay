export const pipeline = [
  { name: 'Pull', cmd: 'git pull origin main', time: '2,1 s', state: 'done' },
  { name: 'Dépendances', cmd: 'npm ci --omit=dev', time: '18,4 s', state: 'done' },
  { name: 'Build', cmd: 'npm run build', time: 'en cours', state: 'running', logs: ['> api@2.14.0 build', '> tsc -p . && vite build', 'vite v6.2.0 building for production…', '✓ 1 204 modules transformed.'] },
  { name: 'Migrations', cmd: 'npm run migrate', state: 'pending' },
  { name: 'Redémarrage', cmd: 'pm2 reload api --update-env', state: 'pending' },
  { name: 'Vérification', cmd: 'curl -f https://api.relay.dev/health', state: 'pending' },
] as const;

export const deployHistory = [
  { v: 'v2.13.4', sha: '9c1e7b0', msg: 'feat: export CSV des factures', meta: 'Hier 17:58 · 1 min 38 s · Sarah K.', ok: true },
  { v: 'v2.13.4', sha: '4f0a2c9', msg: 'feat: export CSV (migration dupliquée)', meta: 'Hier 17:41 · échec à l’étape 4', ok: false },
  { v: 'v2.13.3', sha: '1d2e3f4', msg: 'fix: webhooks Stripe', meta: 'Lun. 10:12 · 1 min 22 s · Julien M.', ok: true },
];

export const logs: { time: string; lvl: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'; msg: string }[] = [
  { time: '14:30:48', lvl: 'INFO', msg: 'GET /v1/customers/412 200 22ms' },
  { time: '14:30:49', lvl: 'WARN', msg: 'slow query invoices.list 812ms' },
  { time: '14:30:50', lvl: 'ERROR', msg: 'ECONNRESET upstream mailer:587' },
  { time: '14:30:52', lvl: 'ERROR', msg: 'Stripe webhook signature mismatch evt_1Q8x' },
  { time: '14:30:54', lvl: 'INFO', msg: 'GET /v1/invoices 200 41ms' },
  { time: '14:30:56', lvl: 'WARN', msg: 'redis latency 140ms (>100)' },
  { time: '14:30:58', lvl: 'DEBUG', msg: 'cache hit relay:user:8812' },
  { time: '14:31:00', lvl: 'INFO', msg: 'PATCH /v1/invoices/9921 200 64ms' },
  { time: '14:31:02', lvl: 'INFO', msg: 'GET /health 200 3ms' },
  { time: '14:31:04', lvl: 'DEBUG', msg: 'queue depth=12' },
  { time: '14:31:06', lvl: 'INFO', msg: 'job csv-export#4410 done 2.3s' },
];
