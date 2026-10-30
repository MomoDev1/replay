import type { Env } from '@/theme';

export type ServerStatus = 'online' | 'warning' | 'offline';

export interface Server {
  id: string;
  name: string;
  user: string;
  host: string;
  port: number;
  env: Env;
  status: ServerStatus;
  statusLabel: string;
  lastSeen: string;
}

export const servers: Server[] = [
  { id: 'api-prod-01', name: 'api-prod-01', user: 'deploy', host: '51.15.82.10', port: 22, env: 'prod', status: 'online', statusLabel: 'En ligne', lastSeen: 'Connecté il y a 12 min' },
  { id: 'api-prod-02', name: 'api-prod-02', user: 'deploy', host: '51.15.82.11', port: 22, env: 'prod', status: 'online', statusLabel: 'En ligne', lastSeen: 'Il y a 2 jours' },
  { id: 'worker-queue', name: 'worker-queue', user: 'ops', host: '10.0.4.22', port: 2222, env: 'prod', status: 'warning', statusLabel: 'Charge élevée · load 7.8', lastSeen: 'Hier, 23:14' },
  { id: 'staging-eu', name: 'staging-eu', user: 'deploy', host: 'staging.relay.dev', port: 22, env: 'staging', status: 'online', statusLabel: 'En ligne', lastSeen: 'Hier, 18:02' },
  { id: 'dev-sandbox', name: 'dev-sandbox', user: 'julien', host: '192.168.1.40', port: 22, env: 'dev', status: 'offline', statusLabel: 'Hors ligne', lastSeen: 'Il y a 5 jours' },
];

export const sshKeys = [
  { name: 'id_ed25519', desc: 'ED25519 · Secure Enclave · cet iPhone', fp: 'SHA256:Xk9f…q2Q', servers: 4, enclave: true },
  { name: 'deploy_rsa', desc: 'RSA 4096 · importée le 12/09/2026', fp: 'SHA256:7bLm…Zt8', servers: 2 },
  { name: 'relay-ci', desc: 'ED25519 · partagée avec l’équipe', fp: 'SHA256:pA3c…9Wd', servers: 1 },
];

export interface Snippet {
  id: string;
  title: string;
  cmd: string;
  vars: string[];
  meta: string;
  fav?: boolean;
}

export const snippets: Snippet[] = [
  { id: 'restart', title: 'Redémarrer un service', cmd: 'sudo systemctl restart {service}', vars: ['service'], meta: '1 variable · utilisé hier', fav: true },
  { id: 'logs', title: 'Logs d’un service', cmd: 'journalctl -u {service} -n {lignes} -f', vars: ['service', 'lignes'], meta: '2 variables', fav: true },
  { id: 'cache', title: 'Vider le cache', cmd: 'php artisan cache:clear && php artisan config:cache', vars: [], meta: 'Aucune variable', fav: true },
  { id: 'ps', title: 'État des conteneurs', cmd: 'docker compose ps', vars: [], meta: 'Aucune variable', fav: true },
  { id: 'purge', title: 'Purger une file', cmd: 'redis-cli -n {db} DEL queue:{file}', vars: ['db', 'file'], meta: '2 variables · confirmation' },
  { id: 'nginx', title: 'Recharger Nginx', cmd: 'sudo nginx -t && sudo systemctl reload nginx', vars: [], meta: 'Aucune variable', fav: true },
];

export const terminalLines: { t: string; c?: 'prompt' | 'green' | 'orange' | 'muted' }[] = [
  { t: 'deploy@api-prod-01 /var/www/api$ systemctl status api', c: 'prompt' },
  { t: '● api.service — Relay API', c: 'green' },
  { t: '   Active: active (running) since 08:12 UTC' },
  { t: ' Main PID: 18342 (node)  Mem: 412.8M' },
  { t: 'deploy@api-prod-01 /var/www/api$ git log --oneline -3', c: 'prompt' },
  { t: 'a41f9c2 (HEAD -> main) fix: TTL cache Redis', c: 'orange' },
  { t: '9c1e7b0 feat: export CSV factures', c: 'orange' },
  { t: '3b77d14 chore: bump deps', c: 'orange' },
];

export const gitChanges = [
  { s: 'M', path: 'src/config/cache.ts', add: 3, del: 1 },
  { s: 'M', path: 'package.json', add: 1, del: 1 },
  { s: '?', path: '.env.local' },
];

export const commits = [
  { sha: 'a41f9c2', msg: 'fix: TTL du cache Redis', author: 'Julien M. · il y a 2 h', head: true },
  { sha: '9c1e7b0', msg: 'feat: export CSV des factures', author: 'Sarah K. · hier' },
  { sha: '3b77d14', msg: 'chore: bump deps', author: 'Bot · lun.' },
];

export const branches = {
  local: [
    { name: 'main', meta: 'Actuelle · a41f9c2 · il y a 2 h' },
    { name: 'release/2.14', meta: 'd7e03b8 · il y a 40 min' },
    { name: 'hotfix/stripe-timeout', meta: 'e82a1f5 · lun.' },
  ],
  remote: [
    { name: 'origin/feat/csv-export', meta: 'Sarah K. · hier' },
    { name: 'origin/feat/sso', meta: 'Malik B. · il y a 3 j' },
    { name: 'origin/chore/node-22', meta: 'Bot · il y a 5 j' },
  ],
};

export const diff: { o?: number; n?: number; t: string; k?: '+' | '-' }[] = [
  { o: 12, n: 12, t: 'import { Redis } from "ioredis";' },
  { o: 13, n: 13, t: '' },
  { o: 14, n: 14, t: 'export const cache = {' },
  { o: 15, n: 15, t: '  prefix: "relay:",' },
  { o: 16, t: '  ttl: 60,', k: '-' },
  { n: 16, t: '  ttl: Number(env.CACHE_TTL ?? 300),', k: '+' },
  { n: 17, t: '  staleWhileRevalidate: 30,', k: '+' },
  { n: 18, t: '  maxKeys: 50_000,', k: '+' },
  { o: 17, n: 19, t: '  client: new Redis(env.REDIS_URL),' },
  { o: 18, n: 20, t: '};' },
  { o: 19, n: 21, t: '' },
  { o: 20, n: 22, t: 'export function key(...parts) {' },
  { o: 21, n: 23, t: '  return cache.prefix + parts.join(":");' },
  { o: 22, n: 24, t: '}' },
];

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
