'use dom';

import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
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
  focus: () => void;
  clear: () => void;
}

type Props = {
  ref: Ref<XTermRef>;
  background: string;
  foreground: string;
  cursor: string;
  fontSize?: number;
  onReady: () => Promise<void>;
  /** base64-encoded keystrokes */
  onInput: (b64: string) => Promise<void>;
  onResize: (cols: number, rows: number) => Promise<void>;
  onCtrlConsumed: () => Promise<void>;
  dom?: DOMProps;
};

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
const encoder = new TextEncoder();

export default function XTerm({ ref, background, foreground, cursor, fontSize = 12, onReady, onInput, onResize, onCtrlConsumed }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const ctrl = useRef(false);

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
      focus() {
        term.current?.focus();
      },
      clear() {
        term.current?.reset();
      },
    }),
    [],
  );

  useEffect(() => {
    const t = new Terminal({
      fontSize,
      fontFamily: 'ui-monospace, Menlo, "Roboto Mono", monospace',
      theme: { background, foreground, cursor },
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    t.loadAddon(fit);
    t.open(host.current!);
    term.current = t;

    t.onData((data) => {
      if (ctrl.current && data.length === 1 && /[a-z@[\\\]^_]/i.test(data)) {
        ctrl.current = false;
        onCtrlConsumed();
        data = String.fromCharCode(data.toUpperCase().charCodeAt(0) & 0x1f);
      }
      onInput(bytesToB64(encoder.encode(data)));
    });
    t.onResize(({ cols, rows }) => onResize(cols, rows));

    // xterm.js has no touch scrolling: translate vertical swipes into scrollback moves,
    // or arrow keys when a full-screen app (less, vim, htop) owns the alternate buffer.
    const el = host.current!;
    let lastY: number | null = null;
    let acc = 0;
    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches.length === 1 ? e.touches[0].clientY : null;
      acc = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (lastY === null || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      acc += lastY - y;
      lastY = y;
      e.preventDefault();
      const lineHeight = el.clientHeight / t.rows;
      const lines = Math.trunc(acc / lineHeight);
      if (lines === 0) return;
      acc -= lines * lineHeight;
      if (t.buffer.active.type === 'alternate') {
        const app = t.modes.applicationCursorKeysMode;
        const seq = lines > 0 ? (app ? '\x1bOB' : '\x1b[B') : app ? '\x1bOA' : '\x1b[A';
        onInput(bytesToB64(encoder.encode(seq.repeat(Math.abs(lines)))));
      } else {
        t.scrollLines(lines);
      }
    };
    const onTouchEnd = () => {
      lastY = null;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    el.addEventListener('touchend', onTouchEnd, { capture: true });

    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(el);
    fit.fit();
    onResize(t.cols, t.rows);
    onReady();

    return () => {
      ro.disconnect();
      el.removeEventListener('touchstart', onTouchStart, { capture: true });
      el.removeEventListener('touchmove', onTouchMove, { capture: true });
      el.removeEventListener('touchend', onTouchEnd, { capture: true });
      t.dispose();
      term.current = null;
    };
    // The terminal is created once; callbacks are stable native actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, padding: 8, background, boxSizing: 'border-box' }}>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
