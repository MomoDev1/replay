'use dom';

import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { Terminal } from '@xterm/xterm';
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { useEffect, useRef, type Ref } from 'react';

type JSONValue = Parameters<DOMImperativeFactory[string]>[number];

export interface XTermRef extends DOMImperativeFactory {
  // Arguments are JSON-marshalled across the WebView bridge, hence the JSONValue signatures.
  /** write(b64: string): writes base64-encoded output from the server. */
  write: (...args: JSONValue[]) => void;
  /** setCtrl(on: boolean): when on, the next letter typed is sent as Ctrl+letter. */
  setCtrl: (...args: JSONValue[]) => void;
  /** paste(text: string): types text at the prompt like a clipboard paste (bracketed if the shell asked for it), without Enter. */
  paste: (...args: JSONValue[]) => void;
  focus: () => void;
  clear: () => void;
  /** setSelectMode(on: boolean): in selection mode one-finger drags select text instead of scrolling. */
  setSelectMode: (...args: JSONValue[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  /** find(query: string, backwards: boolean, caseSensitive: boolean): highlights matches and jumps to the next/previous one. */
  find: (...args: JSONValue[]) => void;
  clearSearch: () => void;
}

type Props = {
  ref: Ref<XTermRef>;
  background: string;
  foreground: string;
  cursor: string;
  /** Selection highlight and handle colour (#RRGGBB). */
  accent: string;
  /** Search match highlight colour (#RRGGBB). */
  match: string;
  fontSize?: number;
  onReady: () => Promise<void>;
  /** base64-encoded keystrokes */
  onInput: (b64: string) => Promise<void>;
  onResize: (cols: number, rows: number) => Promise<void>;
  onCtrlConsumed: () => Promise<void>;
  /** Selection mode was entered from the terminal itself (long press). */
  onSelectModeChange: (on: boolean) => Promise<void>;
  /** Currently selected text ('' when nothing is selected). */
  onSelection: (text: string) => Promise<void>;
  /** index is 0-based, -1 when the active match is unknown (too many results). */
  onSearchResults: (index: number, count: number) => Promise<void>;
  dom?: DOMProps;
};

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const encoder = new TextEncoder();

/** Characters that end a word for tap-to-select (paths, URLs and flags stay in one piece). */
const SEPARATORS = ' \t()[]{}<>\'"`,;|';
const LONG_PRESS_MS = 450;
const TAP_SLOP = 10;
/** How close (px) a touch must start to a handle to drag that end of the selection. */
const HANDLE_HIT = 24;
const HANDLE_SIZE = 16;

type Cell = { col: number; row: number };

/** Mixes two #RRGGBB colours: decorations reject alpha, so dim matches are pre-blended with the background. */
const mix = (a: string, b: string, t: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('');

const handleStyle = { display: 'none', position: 'absolute', width: HANDLE_SIZE, height: HANDLE_SIZE, pointerEvents: 'none', zIndex: 10 } as const;

export default function XTerm({ ref, background, foreground, cursor, accent, match, fontSize = 12, onReady, onInput, onResize, onCtrlConsumed, onSelectModeChange, onSelection, onSearchResults }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const startHandle = useRef<HTMLDivElement>(null);
  const endHandle = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const search = useRef<SearchAddon | null>(null);
  const ctrl = useRef(false);
  const selecting = useRef(false);
  const lastQuery = useRef('');

  useDOMImperativeHandle(
    ref,
    (): XTermRef => ({
      write(b64) {
        term.current?.write(b64ToBytes(b64 as string));
      },
      setCtrl(on) {
        ctrl.current = on === true;
        term.current?.focus();
      },
      paste(text) {
        const t = term.current;
        if (!t) return;
        // A latched Ctrl must not turn a one-character paste into a control code.
        ctrl.current = false;
        const str = text as string;
        if (!t.modes.bracketedPasteMode && t.buffer.active.type === 'normal' && /[\r\n]/.test(str)) {
          // Shell without bracketed paste (bash < 5.1, sh): a newline would submit the line. ^V before it
          // (readline quoted-insert / tty lnext) inserts it literally, so nothing runs until Enter.
          onInput(bytesToB64(encoder.encode(str.replace(/\r\n|\r|\n/g, '\x16\n'))));
        } else {
          t.paste(str);
        }
        t.focus();
      },
      focus() {
        term.current?.focus();
      },
      clear() {
        term.current?.reset();
      },
      setSelectMode(on) {
        selecting.current = on === true;
        if (!selecting.current) term.current?.clearSelection();
      },
      selectAll() {
        term.current?.selectAll();
      },
      clearSelection() {
        term.current?.clearSelection();
      },
      find(query, backwards, caseSensitive) {
        const q = query as string;
        const addon = search.current;
        if (!addon) return;
        if (!q) {
          addon.clearDecorations();
          term.current?.clearSelection();
          lastQuery.current = '';
          onSearchResults(-1, 0);
          return;
        }
        // Typing refines the current match in place; Enter/arrows move on to the next one.
        const opts: ISearchOptions = {
          caseSensitive: caseSensitive === true,
          incremental: q !== lastQuery.current && !backwards,
          decorations: {
            matchBackground: mix(match, background, 0.35),
            matchOverviewRuler: match,
            activeMatchBackground: match,
            activeMatchColorOverviewRuler: accent,
          },
        };
        lastQuery.current = q;
        const found = backwards ? addon.findPrevious(q, opts) : addon.findNext(q, opts);
        if (!found) onSearchResults(-1, 0);
      },
      clearSearch() {
        search.current?.clearDecorations();
        term.current?.clearSelection();
        lastQuery.current = '';
      },
    }),
    [],
  );

  useEffect(() => {
    const t = new Terminal({
      fontSize,
      fontFamily: 'ui-monospace, Menlo, "Roboto Mono", monospace',
      theme: { background, foreground, cursor, selectionBackground: accent + '66', selectionInactiveBackground: accent + '66' },
      cursorBlink: true,
      scrollback: 5000,
      // The search addon highlights matches with decorations, still a proposed API.
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const finder = new SearchAddon({ highlightLimit: 1000 });
    t.loadAddon(fit);
    t.loadAddon(finder);
    t.open(host.current!);
    term.current = t;
    search.current = finder;

    t.onData((data) => {
      if (ctrl.current && data.length === 1 && /[a-z@[\\\]^_]/i.test(data)) {
        ctrl.current = false;
        onCtrlConsumed();
        data = String.fromCharCode(data.toUpperCase().charCodeAt(0) & 0x1f);
      }
      onInput(bytesToB64(encoder.encode(data)));
    });
    t.onResize(({ cols, rows }) => onResize(cols, rows));
    finder.onDidChangeResults(({ resultIndex, resultCount }) => onSearchResults(resultIndex, resultCount));

    const el = host.current!;
    const screen = () => el.querySelector('.xterm-screen') as HTMLElement | null;
    const metrics = () => {
      const r = (screen() ?? el).getBoundingClientRect();
      return { r, w: r.width / t.cols, h: r.height / t.rows };
    };
    const lineHeight = () => metrics().h || el.clientHeight / t.rows;

    /** Buffer cell under a viewport point, clamped to the visible screen. */
    const cellAt = (x: number, y: number): Cell => {
      const { r, w, h } = metrics();
      const col = Math.min(t.cols - 1, Math.max(0, Math.floor((x - r.left) / w)));
      const vr = Math.min(t.rows - 1, Math.max(0, Math.floor((y - r.top) / h)));
      return { col, row: vr + t.buffer.active.viewportY };
    };
    const before = (a: Cell, b: Cell) => a.row < b.row || (a.row === b.row && a.col <= b.col);
    const selectRange = (a: Cell, b: Cell) => {
      const [s, e] = before(a, b) ? [a, b] : [b, a];
      t.select(s.col, s.row, (e.row - s.row) * t.cols + e.col - s.col + 1);
    };
    const isWordCell = (row: number, col: number) => {
      const cell = t.buffer.active.getLine(row)?.getCell(col);
      if (!cell) return false;
      if (cell.getWidth() === 0) return true; // second half of a wide character
      const ch = cell.getChars();
      return ch !== '' && !SEPARATORS.includes(ch);
    };
    const selectWord = ({ col, row }: Cell) => {
      if (!isWordCell(row, col)) return t.select(col, row, 1);
      let s = col;
      let e = col;
      while (s > 0 && isWordCell(row, s - 1)) s--;
      while (e < t.cols - 1 && isWordCell(row, e + 1)) e++;
      t.select(s, row, e - s + 1);
    };
    /** Selection ends as cells: start is inclusive, end is the last selected cell. */
    const selectionEnds = (): { start: Cell; end: Cell } | null => {
      const p = t.getSelectionPosition();
      if (!p) return null;
      let end: Cell = { col: p.end.x - 1, row: p.end.y };
      if (end.col < 0) end = { col: t.cols - 1, row: end.row - 1 };
      return { start: { col: p.start.x, row: p.start.y }, end };
    };
    /** Handle anchor points in viewport coordinates: under the left edge of the first cell, under the right edge of the last. */
    const handlePoints = () => {
      const ends = selectionEnds();
      if (!ends) return null;
      const { r, w, h } = metrics();
      const top = t.buffer.active.viewportY;
      return {
        start: { x: r.left + ends.start.col * w, y: r.top + (ends.start.row - top + 1) * h, visible: ends.start.row >= top && ends.start.row < top + t.rows },
        end: { x: r.left + (ends.end.col + 1) * w, y: r.top + (ends.end.row - top + 1) * h, visible: ends.end.row >= top && ends.end.row < top + t.rows },
      };
    };
    let handlesShown = false;
    const placeHandles = () => {
      if (!selecting.current && !handlesShown) return;
      const pts = selecting.current ? handlePoints() : null;
      handlesShown = !!pts;
      const outer = el.parentElement!.getBoundingClientRect();
      for (const [node, pt, isStart] of [
        [startHandle.current, pts?.start, true],
        [endHandle.current, pts?.end, false],
      ] as const) {
        if (!node) continue;
        if (!pt?.visible) {
          node.style.display = 'none';
          continue;
        }
        node.style.display = 'block';
        // The square corner of the teardrop touches the selection edge.
        node.style.left = `${pt.x - outer.left - (isStart ? HANDLE_SIZE : 0)}px`;
        node.style.top = `${pt.y - outer.top}px`;
      }
    };

    let selTimer: ReturnType<typeof setTimeout> | null = null;
    t.onSelectionChange(() => {
      placeHandles();
      // Selections can be the whole scrollback: send the text once the finger settles, not on every move.
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(() => onSelection(t.getSelection()), 120);
    });
    t.onScroll(placeHandles);
    t.onRender(placeHandles);

    // xterm.js has no touch support. One finger: swipe scrolls (or sends wheel events / arrows to full-screen apps),
    // long press selects a word and enters selection mode. In selection mode one finger selects
    // (drag a handle to adjust an end, tap a word, double tap a line) and two fingers scroll.
    type Mode = 'idle' | 'scroll' | 'scroll2' | 'select';
    let mode: Mode = 'idle';
    let lastY = 0;
    let acc = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let anchor: Cell | null = null;
    let tapCell: Cell | null = null;
    let lastTap = { at: 0, row: -1 };
    let longPress: ReturnType<typeof setTimeout> | null = null;
    let longPressed = false;
    let edgeTimer: ReturnType<typeof setInterval> | null = null;
    let finger = { x: 0, y: 0 };

    // xterm.js exposes the mouse tracking mode but not its encoding: watch for SGR (?1006) ourselves.
    let sgrMouse = false;
    const has1006 = (params: (number | number[])[]) => params.some((p) => p === 1006);
    const sgrOn = t.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) => {
      if (has1006(params)) sgrMouse = true;
      return false;
    });
    const sgrOff = t.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
      if (has1006(params)) sgrMouse = false;
      return false;
    });

    const scrollBy = (dy: number) => {
      acc += dy;
      const lh = lineHeight();
      const lines = Math.trunc(acc / lh);
      if (lines === 0) return;
      acc -= lines * lh;
      if (t.modes.mouseTrackingMode !== 'none' && !selecting.current) {
        // The app (Claude Code, vim, less, htop…) handles the mouse itself: send wheel events, as a real
        // trackpad would. Arrows would move through its history or cursor instead of scrolling.
        // Swiping up (dy > 0) reveals what is below, like a wheel scrolled down.
        const { r, w, h } = metrics();
        const col = Math.min(t.cols, Math.max(1, Math.floor((finger.x - r.left) / w) + 1));
        const row = Math.min(t.rows, Math.max(1, Math.floor((finger.y - r.top) / h) + 1));
        const btn = lines > 0 ? 65 : 64;
        const seq = sgrMouse ? `\x1b[<${btn};${col};${row}M` : `\x1b[M${String.fromCharCode(32 + btn, 32 + Math.min(col, 223), 32 + Math.min(row, 223))}`;
        onInput(bytesToB64(encoder.encode(seq.repeat(Math.abs(lines)))));
      } else if (t.buffer.active.type === 'alternate' && !selecting.current) {
        const app = t.modes.applicationCursorKeysMode;
        const seq = lines > 0 ? (app ? '\x1bOB' : '\x1b[B') : app ? '\x1bOA' : '\x1b[A';
        onInput(bytesToB64(encoder.encode(seq.repeat(Math.abs(lines)))));
      } else {
        t.scrollLines(lines);
      }
    };
    const cancelLongPress = () => {
      if (longPress) clearTimeout(longPress);
      longPress = null;
    };
    const stopEdgeScroll = () => {
      if (edgeTimer) clearInterval(edgeTimer);
      edgeTimer = null;
    };
    /** While a selection drag sits at the top/bottom edge, keep scrolling and extending it. */
    const edgeScroll = () => {
      const { r, h } = metrics();
      const dir = finger.y < r.top + h ? -1 : finger.y > r.bottom - h ? 1 : 0;
      if (dir === 0) return stopEdgeScroll();
      if (edgeTimer) return;
      edgeTimer = setInterval(() => {
        const { r: rr, h: hh } = metrics();
        const d = finger.y < rr.top + hh ? -1 : finger.y > rr.bottom - hh ? 1 : 0;
        if (d === 0 || mode !== 'select' || !anchor) return stopEdgeScroll();
        t.scrollLines(d);
        selectRange(anchor, cellAt(finger.x, finger.y));
      }, 70);
    };
    const avgY = (e: TouchEvent) => (e.touches[0].clientY + e.touches[1].clientY) / 2;

    const onTouchStart = (e: TouchEvent) => {
      cancelLongPress();
      stopEdgeScroll();
      acc = 0;
      moved = false;
      if (e.touches.length === 2) {
        // Second finger: scroll, whatever the first finger was doing.
        mode = 'scroll2';
        lastY = avgY(e);
        if (selecting.current) e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) {
        mode = 'idle';
        return;
      }
      const { clientX: x, clientY: y } = e.touches[0];
      startX = x;
      startY = y;
      lastY = y;
      finger = { x, y };
      if (selecting.current) {
        // No synthetic mouse events: they would focus xterm (keyboard) and start its own selection.
        e.preventDefault();
        e.stopPropagation();
        mode = 'select';
        const pts = handlePoints();
        const ends = selectionEnds();
        // Handles hang below the text: only grab one from the bottom of its row down, so tapping the next word still works.
        const { h } = metrics();
        const near = (p?: { x: number; y: number; visible: boolean }) => !!p?.visible && Math.abs(p.x - x) < HANDLE_HIT && y > p.y - h / 4 && y < p.y + HANDLE_SIZE + HANDLE_HIT / 2;
        // Check the end first: on a one-cell selection both handles overlap and extending forward is the common case.
        if (ends && near(pts?.end)) {
          anchor = ends.start;
          tapCell = null;
        } else if (ends && near(pts?.start)) {
          anchor = ends.end;
          tapCell = null;
        } else {
          anchor = cellAt(x, y);
          tapCell = anchor;
        }
        return;
      }
      mode = 'scroll';
      longPressed = false;
      longPress = setTimeout(() => {
        longPress = null;
        if (moved || mode !== 'scroll') return;
        longPressed = true;
        selecting.current = true;
        selectWord(cellAt(startX, startY));
        onSelectModeChange(true);
      }, LONG_PRESS_MS);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (mode === 'idle') return;
      e.preventDefault();
      if (mode === 'scroll2') {
        if (e.touches.length < 2) return;
        const y = avgY(e);
        scrollBy(lastY - y);
        lastY = y;
        return;
      }
      if (e.touches.length !== 1) return;
      const { clientX: x, clientY: y } = e.touches[0];
      finger = { x, y };
      if (!moved && Math.hypot(x - startX, y - startY) > TAP_SLOP) {
        moved = true;
        cancelLongPress();
      }
      if (mode === 'select') {
        e.stopPropagation();
        if (!moved || !anchor) return;
        tapCell = null;
        selectRange(anchor, cellAt(x, y));
        edgeScroll();
        return;
      }
      scrollBy(lastY - y);
      lastY = y;
    };
    const onTouchEnd = (e: TouchEvent) => {
      cancelLongPress();
      stopEdgeScroll();
      if (longPressed || mode === 'select') {
        // Keep the tap from reaching xterm as a click (it would raise the keyboard).
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
      if (mode === 'select' && tapCell && !moved) {
        const now = Date.now();
        if (now - lastTap.at < 350 && lastTap.row === tapCell.row) {
          t.selectLines(tapCell.row, tapCell.row);
          lastTap = { at: 0, row: -1 };
        } else {
          selectWord(tapCell);
          lastTap = { at: now, row: tapCell.row };
        }
      }
      if (e.touches.length === 0) {
        mode = 'idle';
        longPressed = false;
      }
    };
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    el.addEventListener('touchend', onTouchEnd, { passive: false, capture: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: false, capture: true });
    // The WebView's own long-press menu / text selection would fight ours.
    el.addEventListener('contextmenu', noMenu);

    const ro = new ResizeObserver(() => {
      fit.fit();
      placeHandles();
    });
    ro.observe(el);
    fit.fit();
    onResize(t.cols, t.rows);
    onReady();

    return () => {
      ro.disconnect();
      sgrOn.dispose();
      sgrOff.dispose();
      cancelLongPress();
      stopEdgeScroll();
      if (selTimer) clearTimeout(selTimer);
      el.removeEventListener('touchstart', onTouchStart, { capture: true });
      el.removeEventListener('touchmove', onTouchMove, { capture: true });
      el.removeEventListener('touchend', onTouchEnd, { capture: true });
      el.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      el.removeEventListener('contextmenu', noMenu);
      t.dispose();
      term.current = null;
      search.current = null;
    };
    // The terminal is created once; callbacks are stable native actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, padding: 8, background, boxSizing: 'border-box', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
      {/* Teardrops pointing at the selection edges, like the system text-selection handles. */}
      <div ref={startHandle} style={{ ...handleStyle, background: accent, borderRadius: '50% 0 50% 50%' }} />
      <div ref={endHandle} style={{ ...handleStyle, background: accent, borderRadius: '0 50% 50% 50%' }} />
    </div>
  );
}
