import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import RelaySsh from 'relay-ssh';

/**
 * A small shell that runs on the device itself, without SSH.
 *
 * iOS forbids apps from spawning processes, so the commands are implemented here over the app's
 * sandbox (its Documents folder is the home directory). On Android, command lines that are not
 * shell-state builtins (cd, exit…) are run by the system's /system/bin/sh when the native module
 * provides it.
 *
 * There is no PTY: this class does the line editing itself (cursor keys, history, Tab completion).
 */

type Result = { out: string; err: string; code: number };
type Cmd = (args: string[], stdin: string | null) => Result | Promise<Result>;

const ok = (out = ''): Result => ({ out, err: '', code: 0 });
const fail = (err: string, code = 1): Result => ({ out: '', err: err.endsWith('\n') ? err : err + '\n', code });

const nativeExec = Platform.OS === 'android' && typeof RelaySsh?.localExec === 'function';

// ---------------------------------------------------------------- paths

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
const uriToPath = (uri: string) => trimSlash(decodeURIComponent(uri.replace(/^file:\/\//, '')));
const pathToUri = (path: string) => 'file://' + encodeURI(path);

function normalize(path: string) {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

function info(path: string) {
  try {
    return Paths.info(pathToUri(path));
  } catch {
    return { exists: false, isDirectory: null };
  }
}

type Entry = { name: string; path: string; dir: boolean };

function list(path: string): Entry[] {
  return new Directory(pathToUri(path))
    .list()
    .map((e) => {
      const p = uriToPath(e.uri);
      return { name: baseName(p), path: p, dir: e instanceof Directory };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- utf-8 (Hermes has no TextDecoder)

export function utf8Decode(bin: string) {
  let s = '';
  for (let i = 0; i < bin.length; i++) {
    const c = bin.charCodeAt(i);
    if (c < 0x80) s += bin[i];
    else if (c >= 0xc0 && c < 0xe0) s += String.fromCharCode(((c & 0x1f) << 6) | (bin.charCodeAt(++i) & 0x3f));
    else if (c >= 0xe0 && c < 0xf0) s += String.fromCharCode(((c & 0x0f) << 12) | ((bin.charCodeAt(++i) & 0x3f) << 6) | (bin.charCodeAt(++i) & 0x3f));
    else if (c >= 0xf0) {
      const cp = ((c & 0x07) << 18) | ((bin.charCodeAt(++i) & 0x3f) << 12) | ((bin.charCodeAt(++i) & 0x3f) << 6) | (bin.charCodeAt(++i) & 0x3f);
      s += String.fromCodePoint(cp);
    }
  }
  return s;
}

// ---------------------------------------------------------------- parsing

type Word = { text: string; glob: boolean };
type Token = Word | { op: string };
const isOp = (t: Token): t is { op: string } => 'op' in t;

function tokenize(line: string, env: Record<string, string>, home: string): Token[] {
  const tokens: Token[] = [];
  let cur = '';
  let started = false;
  let glob = false;
  let i = 0;

  const push = () => {
    if (started) tokens.push({ text: cur, glob });
    cur = '';
    started = false;
    glob = false;
  };
  const variable = () => {
    // at '$'
    const m = /^\$(?:\{(\w+)\}|(\w+|\?))/.exec(line.slice(i));
    if (!m) {
      cur += '$';
      i++;
      return;
    }
    cur += env[m[1] ?? m[2]] ?? '';
    i += m[0].length;
  };

  while (i < line.length) {
    const c = line[i];
    if (c === ' ' || c === '\t') {
      push();
      i++;
    } else if (c === ';' || c === '|' || c === '&' || c === '>') {
      push();
      const two = line.slice(i, i + 2);
      const op = two === '&&' || two === '||' || two === '>>' ? two : c;
      tokens.push({ op });
      i += op.length;
    } else if (c === "'") {
      started = true;
      const end = line.indexOf("'", i + 1);
      if (end < 0) throw new Error('guillemet simple non fermé');
      cur += line.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      started = true;
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length && '"\\$'.includes(line[i + 1])) {
          cur += line[i + 1];
          i += 2;
        } else if (line[i] === '$') variable();
        else cur += line[i++];
      }
      if (i >= line.length) throw new Error('guillemet double non fermé');
      i++;
    } else if (c === '\\') {
      started = true;
      cur += line[i + 1] ?? '';
      i += 2;
    } else if (c === '$') {
      started = true;
      variable();
    } else if (c === '~' && !started && (line[i + 1] === undefined || line[i + 1] === '/' || line[i + 1] === ' ')) {
      started = true;
      cur += home;
      i++;
    } else {
      started = true;
      if (c === '*' || c === '?') glob = true;
      cur += c;
      i++;
    }
  }
  push();
  return tokens;
}

type Simple = { argv: Word[]; redirect?: { path: string; append: boolean } };
type Pipeline = Simple[];
type List = { pipeline: Pipeline; next: ';' | '&&' | '||' | null }[];

function parse(tokens: Token[]): List {
  const list: List = [];
  let pipeline: Pipeline = [];
  let simple: Simple = { argv: [] };

  const endSimple = () => {
    if (!simple.argv.length) throw new Error('erreur de syntaxe');
    pipeline.push(simple);
    simple = { argv: [] };
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!isOp(t)) {
      simple.argv.push(t);
      continue;
    }
    if (t.op === '>' || t.op === '>>') {
      const target = tokens[++i];
      if (!target || isOp(target)) throw new Error(`erreur de syntaxe près de « ${t.op} »`);
      simple.redirect = { path: target.text, append: t.op === '>>' };
    } else if (t.op === '|') {
      endSimple();
    } else if (t.op === '&') {
      throw new Error('les tâches en arrière-plan (&) ne sont pas prises en charge');
    } else {
      endSimple();
      list.push({ pipeline, next: t.op as ';' | '&&' | '||' });
      pipeline = [];
    }
  }
  if (simple.argv.length || simple.redirect) endSimple();
  if (pipeline.length) list.push({ pipeline, next: null });
  return list;
}

/** Joins pasted lines into one command line: `a\nb` runs as `a ; b`, continuation lines are kept together. */
function joinLines(text: string) {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((acc, l) => (!acc ? l : /(&&|\|\||\||\\)$/.test(acc) ? acc.replace(/\\$/, '') + ' ' + l : acc + ' ; ' + l), '');
}

function globToRegExp(pattern: string) {
  return new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}

// ---------------------------------------------------------------- shell

const PROMPT_COLOR = '\x1b[1;32m';
const DIR_COLOR = '\x1b[1;34m';
const RESET = '\x1b[0m';

export class LocalShell {
  readonly home: string;
  cwd: string;
  private cols = 80;
  private line = '';
  private cursor = 0;
  private history: string[] = [];
  private histIndex = -1;
  private draft = '';
  private esc = '';
  private pasting: string | null = null;
  private literalNext = false;
  private running = false;
  private generation = 0;
  private nativeToken: string | null = null;
  private env: Record<string, string>;
  private commands: Record<string, Cmd>;

  constructor(
    private write: (text: string) => void,
    private onExit: () => void,
  ) {
    this.home = uriToPath(Paths.document.uri);
    this.cwd = this.home;
    this.env = { HOME: this.home, USER: 'mobile', SHELL: 'hop', TERM: 'xterm-256color', '?': '0' };
    this.commands = this.builtins();
  }

  start() {
    const where = Platform.OS === 'ios' ? 'iPadOS / iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
    this.print(`\x1b[1mTerminal local\x1b[0m · ${where}\n`);
    this.print(
      nativeExec
        ? '\x1b[2mShell de l’appareil (/system/bin/sh). Tape « help » pour les commandes intégrées.\x1b[0m\n\n'
        : '\x1b[2mShell intégré dans le dossier de l’app (iOS n’autorise pas de shell système). Tape « help ».\x1b[0m\n\n',
    );
    this.prompt();
  }

  resize(cols: number) {
    if (cols > 0) this.cols = cols;
  }

  dispose() {
    this.generation++;
    if (this.nativeToken) RelaySsh?.localKill?.(this.nativeToken).catch(() => {});
  }

  // -------------------------------------------------------------- output

  /** Writes text with \n turned into \r\n (there is no tty to do it). */
  private print(text: string) {
    if (text) this.write(text.replace(/\r?\n/g, '\r\n'));
  }

  private display(path: string) {
    if (path === this.home) return '~';
    if (path.startsWith(this.home + '/')) return '~' + path.slice(this.home.length);
    return path;
  }

  private promptText() {
    return `${PROMPT_COLOR}local${RESET}:${DIR_COLOR}${this.display(this.cwd)}${RESET}$ `;
  }

  private promptLen() {
    return `local:${this.display(this.cwd)}$ `.length;
  }

  private prompt() {
    this.line = '';
    this.cursor = 0;
    this.histIndex = -1;
    // Bracketed paste: multi-line pastes arrive wrapped, so they are not run line by line.
    this.write('\x1b[?2004h' + this.promptText());
  }

  /** Redraws the input line after an edit, handling lines that wrap. */
  private render(prevCursor: number) {
    const plen = this.promptLen();
    const cols = this.cols;
    const up = Math.floor((plen + prevCursor) / cols);
    let s = (up ? `\x1b[${up}A` : '') + '\r\x1b[J' + this.promptText() + this.line;
    const end = plen + this.line.length;
    if (this.line.length && end % cols === 0) s += '\r\n';
    const target = plen + this.cursor;
    const rows = Math.floor(end / cols) - Math.floor(target / cols);
    if (rows > 0) s += `\x1b[${rows}A`;
    s += '\r';
    if (target % cols) s += `\x1b[${target % cols}C`;
    this.write(s);
  }

  private edit(line: string, cursor = line.length) {
    const prev = this.cursor;
    this.line = line;
    this.cursor = cursor;
    this.render(prev);
  }

  private insert(text: string) {
    // Typing at the end of a line that does not wrap: just echo (no redraw).
    const end = this.promptLen() + this.line.length + text.length;
    if (this.cursor === this.line.length && Math.floor(end / this.cols) === Math.floor((end - text.length) / this.cols) && end % this.cols) {
      this.line += text;
      this.cursor = this.line.length;
      return this.write(text);
    }
    this.edit(this.line.slice(0, this.cursor) + text + this.line.slice(this.cursor), this.cursor + text.length);
  }

  // -------------------------------------------------------------- input

  input(data: string) {
    for (const ch of data) {
      if (this.esc) {
        this.esc += ch;
        if (this.esc.length === 2 && ch !== '[' && ch !== 'O') {
          this.esc = '';
          continue;
        }
        if (this.esc.length > 2 && /[A-Za-z~]/.test(ch)) {
          const seq = this.esc;
          this.esc = '';
          this.escape(seq);
        }
        continue;
      }
      if (ch === '\x1b') {
        this.esc = ch;
        continue;
      }
      if (this.running) {
        if (ch === '\x03') this.interrupt();
        continue;
      }
      if (this.pasting !== null) {
        this.pasting += ch;
        continue;
      }
      if (this.literalNext) {
        // ^V + newline (pastes from a terminal without bracketed paste): the next line becomes another command.
        this.literalNext = false;
        if (ch !== '\r' && ch !== '\n') this.insert(ch);
        else if (this.line.trim()) this.insert(/(&&|\|\||\|)\s*$/.test(this.line.slice(0, this.cursor)) ? ' ' : ' ; ');
        continue;
      }
      this.key(ch);
    }
  }

  private escape(seq: string) {
    if (seq === '\x1b[200~') return void (this.pasting = '');
    if (seq === '\x1b[201~') {
      const text = this.pasting === null ? '' : joinLines(this.pasting);
      this.pasting = null;
      if (text && !this.running) this.insert(text);
      return;
    }
    if (this.running) return;
    switch (seq) {
      case '\x1b[D':
      case '\x1bOD':
        if (this.cursor > 0) this.edit(this.line, this.cursor - 1);
        break;
      case '\x1b[C':
      case '\x1bOC':
        if (this.cursor < this.line.length) this.edit(this.line, this.cursor + 1);
        break;
      case '\x1b[A':
      case '\x1bOA':
        this.historyMove(1);
        break;
      case '\x1b[B':
      case '\x1bOB':
        this.historyMove(-1);
        break;
      case '\x1b[H':
      case '\x1bOH':
      case '\x1b[1~':
        this.edit(this.line, 0);
        break;
      case '\x1b[F':
      case '\x1bOF':
      case '\x1b[4~':
        this.edit(this.line);
        break;
      case '\x1b[3~':
        if (this.cursor < this.line.length) this.edit(this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1), this.cursor);
        break;
    }
  }

  private key(ch: string) {
    switch (ch) {
      case '\r':
      case '\n':
        return this.submit();
      case '\x7f':
      case '\b':
        if (this.cursor > 0) this.edit(this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor), this.cursor - 1);
        return;
      case '\x03':
        this.write('^C\r\n');
        return this.prompt();
      case '\x04':
        if (!this.line) {
          this.write('\r\n');
          return this.exit();
        }
        return;
      case '\x0c':
        this.write('\x1b[H\x1b[2J');
        return this.edit(this.line, this.cursor);
      case '\x01':
        return this.edit(this.line, 0);
      case '\x05':
        return this.edit(this.line);
      case '\x15':
        return this.edit(this.line.slice(this.cursor), 0);
      case '\x0b':
        return this.edit(this.line.slice(0, this.cursor), this.cursor);
      case '\x17': {
        const before = this.line.slice(0, this.cursor).replace(/\S+\s*$/, '');
        return this.edit(before + this.line.slice(this.cursor), before.length);
      }
      case '\x16':
        this.literalNext = true;
        return;
      case '\t':
        return this.complete();
    }
    if (ch >= ' ') this.insert(ch);
  }

  private historyMove(dir: 1 | -1) {
    if (!this.history.length) return;
    if (this.histIndex === -1) {
      if (dir === -1) return;
      this.draft = this.line;
    }
    const next = this.histIndex + dir;
    if (next >= this.history.length) return;
    this.histIndex = next;
    this.edit(next === -1 ? this.draft : this.history[this.history.length - 1 - next]);
  }

  private complete() {
    const before = this.line.slice(0, this.cursor);
    const m = /(\S*)$/.exec(before)!;
    const word = m[1];
    const first = !before.slice(0, before.length - word.length).trim();
    let candidates: { name: string; dir: boolean }[] = [];
    let prefix = word;

    if (first && !word.includes('/')) {
      candidates = Object.keys(this.commands)
        .filter((c) => c.startsWith(word))
        .map((name) => ({ name, dir: false }));
    } else {
      const slash = word.lastIndexOf('/');
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
      prefix = word.slice(slash + 1);
      try {
        candidates = list(this.resolve(dirPart || '.')).filter((e) => e.name.startsWith(prefix) && (prefix.startsWith('.') || !e.name.startsWith('.')));
      } catch {
        candidates = [];
      }
    }
    if (!candidates.length) return;
    if (candidates.length === 1) {
      const c = candidates[0];
      return this.insert(c.name.slice(prefix.length) + (c.dir ? '/' : ' '));
    }
    let common = candidates[0].name;
    for (const c of candidates) while (!c.name.startsWith(common)) common = common.slice(0, -1);
    if (common.length > prefix.length) return this.insert(common.slice(prefix.length));
    this.write('\r\n');
    this.print(candidates.map((c) => (c.dir ? DIR_COLOR + c.name + '/' + RESET : c.name)).join('  ') + '\n');
    this.write(this.promptText() + this.line);
    const back = this.line.length - this.cursor;
    if (back) this.write(`\x1b[${back}D`);
  }

  private interrupt() {
    this.generation++;
    if (this.nativeToken) RelaySsh?.localKill?.(this.nativeToken).catch(() => {});
    this.nativeToken = null;
    this.running = false;
    this.write('^C\r\n');
    this.env['?'] = '130';
    this.prompt();
  }

  private exit() {
    this.write('\x1b[?2004l');
    this.print('Session locale terminée.\n');
    this.onExit();
  }

  private async submit() {
    this.edit(this.line);
    this.write('\x1b[?2004l\r\n');
    const line = this.line.trim();
    if (!line.trim()) return this.prompt();
    if (this.history[this.history.length - 1] !== line) this.history.push(line);
    if (this.history.length > 500) this.history.shift();

    const gen = ++this.generation;
    this.running = true;
    try {
      await this.run(line, gen);
    } catch (e) {
      if (gen === this.generation) {
        this.print(`hop: ${(e as Error).message}\n`);
        this.env['?'] = '2';
      }
    }
    if (gen !== this.generation) return; // interrupted: the prompt is already shown
    this.running = false;
    if (this.exited) return this.exit();
    this.prompt();
  }

  private exited = false;

  // -------------------------------------------------------------- execution

  private async run(line: string, gen: number) {
    const first = line.trim().split(/\s+/)[0];
    const stateful = ['cd', 'exit', 'clear', 'help', 'history', 'export', 'unset', 'pwd'];
    if (nativeExec && !stateful.includes(first)) return this.runNative(line, gen);

    const list = parse(tokenize(line, this.env, this.home));
    let code = 0;
    for (let i = 0; i < list.length; i++) {
      const prev = list[i - 1]?.next;
      if ((prev === '&&' && code !== 0) || (prev === '||' && code === 0)) continue;
      code = await this.runPipeline(list[i].pipeline, gen);
      if (gen !== this.generation || this.exited) return;
      this.env['?'] = String(code);
    }
  }

  private async runNative(line: string, gen: number) {
    const token = Math.random().toString(36).slice(2);
    this.nativeToken = token;
    try {
      const r = await RelaySsh!.localExec!(token, line, this.cwd, 10 * 60_000);
      if (gen !== this.generation) return;
      this.print(r.stdout);
      if (r.stderr) this.print(`\x1b[31m${r.stderr}${RESET}`);
      if ((r.stdout || r.stderr) && !(r.stdout + r.stderr).endsWith('\n')) this.print('\x1b[7m%\x1b[0m\n');
      this.env['?'] = String(r.exitCode);
    } finally {
      if (this.nativeToken === token) this.nativeToken = null;
    }
  }

  private expand(words: Word[]): string[] {
    const out: string[] = [];
    for (const w of words) {
      if (!w.glob) {
        out.push(w.text);
        continue;
      }
      const slash = w.text.lastIndexOf('/');
      const dirPart = slash >= 0 ? w.text.slice(0, slash + 1) : '';
      const re = globToRegExp(w.text.slice(slash + 1));
      let matches: string[] = [];
      try {
        matches = list(this.resolve(dirPart || '.'))
          .filter((e) => re.test(e.name) && !e.name.startsWith('.'))
          .map((e) => dirPart + e.name);
      } catch {
        // no such directory: keep the word as typed
      }
      out.push(...(matches.length ? matches : [w.text]));
    }
    return out;
  }

  private async runPipeline(pipeline: Pipeline, gen: number) {
    let stdin: string | null = null;
    let code = 0;
    for (let i = 0; i < pipeline.length; i++) {
      const { argv, redirect } = pipeline[i];
      const [name, ...args] = this.expand(argv);
      const cmd = name ? this.commands[name] : undefined;
      let r: Result;
      if (!name) r = ok();
      else if (!cmd) r = fail(`hop: ${name} : commande introuvable${nativeExec ? '' : ' (tape « help »)'}`, 127);
      else {
        try {
          r = await cmd(args, stdin);
        } catch (e) {
          r = fail(`${name}: ${(e as Error).message}`);
        }
      }
      if (gen !== this.generation) return 130;
      if (r.err) this.print(`\x1b[31m${r.err}${RESET}`);
      let out = r.out;
      if (redirect) {
        try {
          const f = new File(pathToUri(this.resolve(redirect.path)));
          const prev = redirect.append && f.exists ? f.textSync() : '';
          if (!f.exists) f.create();
          f.writeSync(prev + out);
        } catch (e) {
          this.print(`\x1b[31mhop: ${redirect.path}: ${(e as Error).message}${RESET}\n`);
          r.code = 1;
        }
        out = '';
      }
      if (i === pipeline.length - 1) this.print(out);
      stdin = out;
      code = r.code;
    }
    return code;
  }

  resolve(p: string) {
    if (p === '~' || p.startsWith('~/')) p = this.home + p.slice(1);
    return normalize(p.startsWith('/') ? p : this.cwd + '/' + p);
  }

  private read(path: string, stdin: string | null) {
    if (path === '-' || !path) {
      if (stdin === null) throw new Error('aucune entrée');
      return stdin;
    }
    const abs = this.resolve(path);
    const i = info(abs);
    if (!i.exists) throw new Error(`${path} : aucun fichier ou dossier de ce nom`);
    if (i.isDirectory) throw new Error(`${path} : est un dossier`);
    return new File(pathToUri(abs)).textSync();
  }

  /** Splits `-abc` style flags from operands. */
  private flags(args: string[], known: string) {
    const set = new Set<string>();
    const rest: string[] = [];
    let n: number | null = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-n' && known.includes('n') && /^\d+$/.test(args[i + 1] ?? '')) {
        n = Number(args[++i]);
      } else if (/^-\d+$/.test(a) && known.includes('n')) {
        n = Number(a.slice(1));
      } else if (a.startsWith('-') && a.length > 1 && !rest.length) {
        for (const f of a.slice(1)) {
          if (!known.includes(f)) throw new Error(`option invalide -- '${f}'`);
          set.add(f);
        }
      } else rest.push(a);
    }
    return { has: (f: string) => set.has(f), rest, n };
  }

  private builtins(): Record<string, Cmd> {
    const forEachFile = (files: string[], stdin: string | null, fn: (text: string, name: string) => string) => {
      if (!files.length) return ok(fn(this.read('-', stdin), ''));
      let out = '';
      let err = '';
      for (const f of files) {
        try {
          out += fn(this.read(f, stdin), f);
        } catch (e) {
          err += `${(e as Error).message}\n`;
        }
      }
      return { out, err, code: err ? 1 : 0 };
    };
    const lines = (t: string) => {
      const l = t.split('\n');
      if (l[l.length - 1] === '') l.pop();
      return l;
    };
    const join = (l: string[]) => (l.length ? l.join('\n') + '\n' : '');
    const size = (n: number) => (n < 1024 ? `${n}` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)}K` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)}M` : `${(n / 1024 ** 3).toFixed(1)}G`);

    const copy = (src: string, dst: string, recursive: boolean, move: boolean) => {
      const from = this.resolve(src);
      const fi = info(from);
      if (!fi.exists) throw new Error(`${src} : aucun fichier ou dossier de ce nom`);
      let to = this.resolve(dst);
      if (info(to).isDirectory) to = to + '/' + baseName(from);
      if (fi.isDirectory) {
        if (!recursive && !move) throw new Error(`-r non spécifié ; ${src} omis`);
        const d = new Directory(pathToUri(from));
        const target = new Directory(pathToUri(to));
        if (move) d.moveSync(target);
        else d.copySync(target);
      } else {
        const f = new File(pathToUri(from));
        const target = new File(pathToUri(to));
        if (target.exists) target.delete();
        if (move) f.moveSync(target);
        else f.copySync(target);
      }
    };

    const cmds: Record<string, Cmd> = {
      help: () =>
        ok(
          [
            '\x1b[1mCommandes intégrées\x1b[0m',
            '  fichiers   ls [-la] · cd · pwd · cat · head/tail [-n N] · wc [-l] · stat · tree',
            '             mkdir [-p] · touch · rm [-rf] · rmdir · cp [-r] · mv · find [dir] [-name motif]',
            '  texte      echo · grep [-inv] · sort [-r] · uniq · > et >> (redirection) · | (tube)',
            '  shell      history · export · env · clear · exit · date · whoami · uname · df',
            '  enchaîner  ; && ||   · Tab complète · ↑/↓ historique · ^C annule · ^L efface',
            nativeExec ? '\nLes autres commandes sont lancées par /system/bin/sh (sans PTY : pas de vim, top…).' : '\nLe dossier personnel (~) est le dossier Documents de Hop sur cet appareil.',
            '',
          ].join('\n'),
        ),
      clear: () => {
        this.write('\x1b[H\x1b[2J\x1b[3J');
        return ok();
      },
      exit: () => {
        this.exited = true;
        return ok();
      },
      pwd: () => ok(this.cwd + '\n'),
      cd: ([dir]) => {
        const target = this.resolve(dir === '-' ? (this.env.OLDPWD ?? this.cwd) : (dir ?? this.home));
        const i = info(target);
        if (!i.exists) return fail(`cd: ${dir} : aucun fichier ou dossier de ce nom`);
        if (!i.isDirectory) return fail(`cd: ${dir} : n’est pas un dossier`);
        this.env.OLDPWD = this.cwd;
        this.cwd = target;
        this.env.PWD = target;
        return ok();
      },
      ls: (args) => {
        const { has, rest } = this.flags(args, 'la1h');
        const targets = rest.length ? rest : ['.'];
        let out = '';
        let err = '';
        for (const t of targets) {
          const abs = this.resolve(t);
          const i = info(abs);
          if (!i.exists) {
            err += `ls: ${t} : aucun fichier ou dossier de ce nom\n`;
            continue;
          }
          const entries = i.isDirectory ? list(abs).filter((e) => has('a') || !e.name.startsWith('.')) : [{ name: t, path: abs, dir: false }];
          if (targets.length > 1 && i.isDirectory) out += `${t}:\n`;
          if (has('l')) {
            for (const e of entries) {
              let sz = 0;
              let mtime: number | null = null;
              try {
                if (e.dir) {
                  const d = new Directory(pathToUri(e.path));
                  sz = d.size ?? 0;
                  mtime = d.info().modificationTime ?? null;
                } else {
                  const f = new File(pathToUri(e.path));
                  sz = f.size;
                  mtime = f.modificationTime;
                }
              } catch {
                // unreadable entry: show it without details
              }
              const date = mtime ? new Date(mtime > 1e12 ? mtime : mtime * 1000).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
              out += `${e.dir ? 'd' : '-'}  ${size(sz).padStart(7)}  ${date.padEnd(16)}  ${e.dir ? DIR_COLOR + e.name + '/' + RESET : e.name}\n`;
            }
          } else if (entries.length) {
            const names = entries.map((e) => (e.dir ? e.name + '/' : e.name));
            if (has('1')) out += join(entries.map((e, k) => (e.dir ? DIR_COLOR + names[k] + RESET : names[k])));
            else {
              const width = Math.max(...names.map((n) => n.length)) + 2;
              const per = Math.max(1, Math.floor(this.cols / width));
              let row = '';
              entries.forEach((e, k) => {
                const cell = names[k].padEnd(width);
                row += e.dir ? DIR_COLOR + cell + RESET : cell;
                if ((k + 1) % per === 0 || k === entries.length - 1) {
                  out += row.trimEnd() + '\n';
                  row = '';
                }
              });
            }
          }
        }
        return { out, err, code: err ? 1 : 0 };
      },
      cat: (args, stdin) => forEachFile(args, stdin, (t) => t),
      echo: (args) => {
        const n = args[0] === '-n';
        return ok((n ? args.slice(1) : args).join(' ') + (n ? '' : '\n'));
      },
      mkdir: (args) => {
        const { has, rest } = this.flags(args, 'p');
        if (!rest.length) return fail('mkdir: opérande manquant');
        let err = '';
        for (const d of rest) {
          const abs = this.resolve(d);
          if (info(abs).exists) {
            if (!has('p')) err += `mkdir: impossible de créer « ${d} » : le fichier existe\n`;
            continue;
          }
          try {
            new Directory(pathToUri(abs)).create({ intermediates: has('p') });
          } catch (e) {
            err += `mkdir: ${d} : ${(e as Error).message}\n`;
          }
        }
        return { out: '', err, code: err ? 1 : 0 };
      },
      touch: (args) => {
        if (!args.length) return fail('touch: opérande manquant');
        for (const f of args) {
          const file = new File(pathToUri(this.resolve(f)));
          if (!file.exists) file.create();
        }
        return ok();
      },
      rm: (args) => {
        const { has, rest } = this.flags(args, 'rfR');
        if (!rest.length) return has('f') ? ok() : fail('rm: opérande manquant');
        let err = '';
        for (const p of rest) {
          const abs = this.resolve(p);
          const i = info(abs);
          if (abs === '/' || abs === this.home) {
            err += `rm: refus de supprimer « ${p} »\n`;
          } else if (!i.exists) {
            if (!has('f')) err += `rm: ${p} : aucun fichier ou dossier de ce nom\n`;
          } else if (i.isDirectory) {
            if (has('r') || has('R')) new Directory(pathToUri(abs)).delete();
            else err += `rm: ${p} : est un dossier\n`;
          } else new File(pathToUri(abs)).delete();
        }
        return { out: '', err, code: err ? 1 : 0 };
      },
      rmdir: (args) => {
        let err = '';
        for (const p of args) {
          const abs = this.resolve(p);
          if (!info(abs).isDirectory) err += `rmdir: ${p} : n’est pas un dossier\n`;
          else if (list(abs).length) err += `rmdir: ${p} : le dossier n’est pas vide\n`;
          else new Directory(pathToUri(abs)).delete();
        }
        return { out: '', err, code: err ? 1 : 0 };
      },
      cp: (args) => {
        const { has, rest } = this.flags(args, 'rR');
        if (rest.length < 2) return fail('cp: opérande manquant');
        const dst = rest.pop()!;
        for (const src of rest) copy(src, dst, has('r') || has('R'), false);
        return ok();
      },
      mv: (args) => {
        if (args.length < 2) return fail('mv: opérande manquant');
        const dst = args.pop()!;
        for (const src of args) copy(src, dst, true, true);
        return ok();
      },
      head: (args, stdin) => {
        const { rest, n } = this.flags(args, 'n');
        return forEachFile(rest, stdin, (t) => join(lines(t).slice(0, n ?? 10)));
      },
      tail: (args, stdin) => {
        const { rest, n } = this.flags(args, 'n');
        return forEachFile(rest, stdin, (t) => join(lines(t).slice(-(n ?? 10))));
      },
      wc: (args, stdin) => {
        const { has, rest } = this.flags(args, 'lwc');
        const all = !has('l') && !has('w') && !has('c');
        return forEachFile(rest, stdin, (t, name) => {
          const cols: string[] = [];
          if (all || has('l')) cols.push(String(lines(t).length).padStart(7));
          if (all || has('w')) cols.push(String(t.split(/\s+/).filter(Boolean).length).padStart(7));
          if (all || has('c')) cols.push(String(t.length).padStart(7));
          return cols.join(' ') + (name ? ` ${name}` : '') + '\n';
        });
      },
      grep: (args, stdin) => {
        const { has, rest } = this.flags(args, 'invcr');
        const [pattern, ...files] = rest;
        if (pattern === undefined) return fail('grep: motif manquant');
        let re: RegExp;
        try {
          re = new RegExp(pattern, has('i') ? 'i' : '');
        } catch {
          return fail(`grep: motif invalide : ${pattern}`, 2);
        }
        let found = false;
        const r = forEachFile(files, stdin, (t, name) => {
          const matched = lines(t)
            .map((l, k) => [l, k + 1] as const)
            .filter(([l]) => re.test(l) !== has('v'));
          if (matched.length) found = true;
          if (has('c')) return (files.length > 1 ? `${name}:` : '') + matched.length + '\n';
          return join(
            matched.map(([l, k]) => {
              const hl = has('v') ? l : l.replace(new RegExp(re.source, re.flags + 'g'), (m) => `\x1b[1;31m${m}${RESET}`);
              return (files.length > 1 ? `\x1b[35m${name}${RESET}:` : '') + (has('n') ? `\x1b[32m${k}${RESET}:` : '') + hl;
            }),
          );
        });
        return { ...r, code: r.err ? 2 : found ? 0 : 1 };
      },
      sort: (args, stdin) => {
        const { has, rest } = this.flags(args, 'rnu');
        return forEachFile(rest, stdin, (t) => {
          let l = lines(t).sort((a, b) => (has('n') ? parseFloat(a) - parseFloat(b) : a.localeCompare(b)));
          if (has('r')) l = l.reverse();
          if (has('u')) l = l.filter((x, i) => x !== l[i - 1]);
          return join(l);
        });
      },
      uniq: (args, stdin) => forEachFile(args, stdin, (t) => join(lines(t).filter((x, i, l) => x !== l[i - 1]))),
      find: (args) => {
        const nameAt = args.indexOf('-name');
        const pattern = nameAt >= 0 ? globToRegExp(args[nameAt + 1] ?? '*') : null;
        const roots = args.filter((a, i) => !a.startsWith('-') && (nameAt < 0 || i !== nameAt + 1));
        let out = '';
        let count = 0;
        const walk = (abs: string, shown: string) => {
          if (count > 5000) return;
          for (const e of list(abs)) {
            const p = `${shown}/${e.name}`;
            if (!pattern || pattern.test(e.name)) {
              out += p + '\n';
              count++;
            }
            if (e.dir) walk(e.path, p);
          }
        };
        for (const r of roots.length ? roots : ['.']) {
          const abs = this.resolve(r);
          if (!info(abs).isDirectory) return fail(`find: ${r} : aucun dossier de ce nom`);
          if (!pattern) out += r + '\n';
          walk(abs, r.replace(/\/$/, ''));
        }
        return ok(out);
      },
      tree: ([dir]) => {
        const root = this.resolve(dir ?? '.');
        if (!info(root).isDirectory) return fail(`tree: ${dir} : n’est pas un dossier`);
        let out = `${DIR_COLOR}${dir === undefined ? '.' : this.display(root)}${RESET}\n`;
        let dirs = 0;
        let files = 0;
        const walk = (abs: string, indent: string) => {
          const entries = list(abs).filter((e) => !e.name.startsWith('.'));
          entries.forEach((e, k) => {
            const last = k === entries.length - 1;
            out += `${indent}${last ? '└── ' : '├── '}${e.dir ? DIR_COLOR + e.name + RESET : e.name}\n`;
            if (e.dir) {
              dirs++;
              if (dirs + files < 2000) walk(e.path, indent + (last ? '    ' : '│   '));
            } else files++;
          });
        };
        walk(root, '');
        return ok(`${out}\n${dirs} dossier${dirs > 1 ? 's' : ''}, ${files} fichier${files > 1 ? 's' : ''}\n`);
      },
      stat: (args) => {
        let out = '';
        for (const p of args) {
          const abs = this.resolve(p);
          const i = info(abs);
          if (!i.exists) return fail(`stat: ${p} : aucun fichier ou dossier de ce nom`);
          const meta = i.isDirectory ? new Directory(pathToUri(abs)).info() : new File(pathToUri(abs)).info();
          const fmt = (t?: number | null) => (t ? new Date(t > 1e12 ? t : t * 1000).toLocaleString('fr-FR') : '?');
          out += `  Fichier : ${abs}\n   Type : ${i.isDirectory ? 'dossier' : 'fichier'}\n Taille : ${meta.size ?? 0} octets\n Modifié : ${fmt(meta.modificationTime)}\n  Créé : ${fmt(meta.creationTime)}\n`;
        }
        return ok(out);
      },
      history: () => ok(this.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join('\n') + '\n'),
      export: (args) => {
        for (const a of args) {
          const eq = a.indexOf('=');
          if (eq > 0) this.env[a.slice(0, eq)] = a.slice(eq + 1);
        }
        return ok();
      },
      unset: (args) => {
        for (const a of args) delete this.env[a];
        return ok();
      },
      env: () =>
        ok(
          Object.entries(this.env)
            .filter(([k]) => k !== '?')
            .map(([k, v]) => `${k}=${v}`)
            .join('\n') + '\n',
        ),
      date: () => ok(new Date().toString() + '\n'),
      whoami: () => ok(this.env.USER + '\n'),
      uname: (args) => ok((args.includes('-a') ? `${Platform.OS} hop ${String(Platform.Version)}` : Platform.OS) + '\n'),
      df: () => ok(`Disponible : ${size(Paths.availableDiskSpace)}  ·  Total : ${size(Paths.totalDiskSpace)}\n`),
      true: () => ok(),
      false: () => ({ out: '', err: '', code: 1 }),
    };
    return cmds;
  }
}
