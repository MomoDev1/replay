'use dom';

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore, redo, undo } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { php } from '@codemirror/lang-php';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, StreamLanguage, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { go } from '@codemirror/legacy-modes/mode/go';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { useEffect, useRef, type Ref } from 'react';

type JSONValue = Parameters<DOMImperativeFactory[string]>[number];

export interface CodeEditorRef extends DOMImperativeFactory {
  // Arguments are JSON-marshalled across the WebView bridge, hence the JSONValue signatures.
  /** load(b64: string, filename: string, readOnly: boolean, line: number): replaces the document. */
  load: (...args: JSONValue[]) => void;
  /** save(): the editor answers through `onSave` with the document as base64. */
  save: () => void;
  /** markSaved(): the current document becomes the clean state (after a successful write). */
  markSaved: () => void;
  /** insert(text: string): types text at the cursor; `\t` indents. */
  insert: (...args: JSONValue[]) => void;
  /** command(name: 'undo' | 'redo' | 'search' | 'indent' | 'dedent' | 'left' | 'right' | 'up' | 'down') */
  command: (...args: JSONValue[]) => void;
  /** setWrap(on: boolean) */
  setWrap: (...args: JSONValue[]) => void;
  focus: () => void;
}

type Props = {
  ref: Ref<CodeEditorRef>;
  colors: { bg: string; surface: string; surface2: string; border: string; text: string; muted: string; dim: string; accent: string };
  fontSize?: number;
  onReady: () => Promise<void>;
  /** The document differs (or not) from its last saved state. */
  onDirty: (dirty: boolean) => Promise<void>;
  /** Answer to `save()`: the document, UTF-8 encoded then base64. */
  onSave: (b64: string) => Promise<void>;
  /** Cursor position, 1-based. */
  onCursor: (line: number, col: number) => Promise<void>;
  /** The file is not valid UTF-8 and was opened read-only. */
  onDecodeError: () => Promise<void>;
  dom?: DOMProps;
};

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesToB64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** French labels for CodeMirror's built-in UI (search panel, folding). */
const PHRASES = {
  Find: 'Rechercher',
  Replace: 'Remplacer',
  next: 'suivant',
  previous: 'précédent',
  all: 'tous',
  'match case': 'casse',
  regexp: 'regex',
  'by word': 'mot entier',
  replace: 'remplacer',
  'replace all': 'tout remplacer',
  close: 'fermer',
  'Go to line': 'Aller à la ligne',
  go: 'aller',
  'Fold line': 'Replier',
  'Unfold line': 'Déplier',
  'folded code': 'code replié',
  unfold: 'déplier',
};

const legacy = (mode: Parameters<typeof StreamLanguage.define>[0]) => StreamLanguage.define(mode);

/** Language support from the file name. */
function languageFor(filename: string): Extension {
  const name = filename.toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  if (name === 'dockerfile' || name.startsWith('dockerfile.') || ext === 'dockerfile') return legacy(dockerFile);
  if (name.startsWith('nginx') && ext === 'conf') return legacy(nginx);
  if (/^(\.?(bash|zsh)rc|\.?profile|\.bash_\w+)$/.test(name)) return legacy(shell);
  if (/^\.env(\..*)?$/.test(name)) return legacy(properties);
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    case 'json':
    case 'jsonc':
    case 'json5':
      return json();
    case 'py':
      return python();
    case 'md':
    case 'markdown':
      return markdown();
    case 'html':
    case 'htm':
    case 'vue':
    case 'svelte':
      return html();
    case 'css':
    case 'scss':
    case 'less':
      return css();
    case 'yml':
    case 'yaml':
      return yaml();
    case 'sql':
      return sql();
    case 'php':
      return php();
    case 'sh':
    case 'bash':
    case 'zsh':
      return legacy(shell);
    case 'go':
      return legacy(go);
    case 'rs':
      return legacy(rust);
    case 'rb':
      return legacy(ruby);
    case 'toml':
      return legacy(toml);
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'properties':
    case 'env':
      return legacy(properties);
    default:
      return [];
  }
}

export default function CodeEditor({ ref, colors, fontSize = 13, onReady, onDirty, onSave, onCursor, onDecodeError }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const saved = useRef<string>('');
  /** Text last handed to `onSave`; becomes `saved` once the write succeeds (keystrokes typed meanwhile stay dirty). */
  const sent = useRef<string>('');
  const dirty = useRef(false);
  const language = useRef(new Compartment());
  const readOnly = useRef(new Compartment());
  const wrap = useRef(new Compartment());
  // Keymaps are built once: call the latest callback, not the one from the first render.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  function emitSave(v: EditorView) {
    sent.current = v.state.doc.toString();
    onSaveRef.current(bytesToB64(new TextEncoder().encode(sent.current)));
  }

  function setDirty(next: boolean) {
    if (dirty.current === next) return;
    dirty.current = next;
    onDirty(next);
  }

  useDOMImperativeHandle(
    ref,
    (): CodeEditorRef => ({
      load(b64, filename, ro, line) {
        const v = view.current;
        if (!v) return;
        let text: string;
        let forceRo = false;
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(b64ToBytes(b64 as string));
        } catch {
          // Not UTF-8 (latin-1 config file…): show it, but never write it back re-encoded.
          text = new TextDecoder('latin1').decode(b64ToBytes(b64 as string));
          forceRo = true;
          onDecodeError();
        }
        saved.current = text;
        const target = Math.max(1, Math.min(Number(line) || 1, text.split('\n').length));
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: text },
          effects: [language.current.reconfigure(languageFor(filename as string)), readOnly.current.reconfigure(EditorState.readOnly.of(ro === true || forceRo))],
        });
        const pos = v.state.doc.line(target).from;
        v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
        setDirty(false);
      },
      save() {
        const v = view.current;
        if (v) emitSave(v);
      },
      markSaved() {
        const v = view.current;
        if (!v) return;
        saved.current = sent.current;
        setDirty(v.state.doc.toString() !== saved.current);
      },
      insert(text) {
        const v = view.current;
        if (!v || v.state.readOnly) return;
        if (text === '\t') {
          indentMore(v);
        } else {
          v.dispatch(v.state.replaceSelection(text as string), { scrollIntoView: true, userEvent: 'input' });
        }
        v.focus();
      },
      command(name) {
        const v = view.current;
        if (!v) return;
        const move = (by: (r: EditorSelection['main']) => EditorSelection['main']) => v.dispatch({ selection: EditorSelection.create(v.state.selection.ranges.map(by)), scrollIntoView: true });
        switch (name) {
          case 'undo':
            undo(v);
            break;
          case 'redo':
            redo(v);
            break;
          case 'search':
            openSearchPanel(v);
            break;
          case 'indent':
            indentMore(v);
            break;
          case 'dedent':
            indentLess(v);
            break;
          case 'left':
            move((r) => v.moveByChar(r, false));
            break;
          case 'right':
            move((r) => v.moveByChar(r, true));
            break;
          case 'up':
            move((r) => v.moveVertically(r, false));
            break;
          case 'down':
            move((r) => v.moveVertically(r, true));
            break;
        }
        if (name !== 'search') v.focus();
      },
      setWrap(on) {
        view.current?.dispatch({ effects: wrap.current.reconfigure(on === true ? EditorView.lineWrapping : []) });
      },
      focus() {
        view.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    const theme = EditorView.theme(
      {
        '&': { height: '100%', backgroundColor: colors.bg, color: colors.text, fontSize: `${fontSize}px` },
        '.cm-scroller': { fontFamily: 'ui-monospace, Menlo, "Roboto Mono", monospace', lineHeight: '1.5' },
        '.cm-content': { caretColor: colors.accent, paddingBottom: '40vh' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: colors.accent, borderLeftWidth: '2px' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: colors.accent + '44' },
        '.cm-gutters': { backgroundColor: colors.bg, color: colors.dim, border: 'none' },
        '.cm-activeLine': { backgroundColor: colors.surface + 'aa' },
        '.cm-activeLineGutter': { backgroundColor: colors.surface, color: colors.muted },
        '.cm-selectionMatch': { backgroundColor: colors.surface2 },
        '.cm-matchingBracket': { backgroundColor: colors.surface2, outline: `1px solid ${colors.border}` },
        '.cm-foldPlaceholder': { backgroundColor: colors.surface2, border: 'none', color: colors.muted },
        '.cm-panels': { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
        '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${colors.border}` },
        '.cm-panel.cm-search': { padding: '8px', fontSize: '14px' },
        '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '14px', borderRadius: '6px', padding: '4px 8px', margin: '2px' },
        '.cm-textfield': { backgroundColor: colors.surface2, color: colors.text, border: `1px solid ${colors.border}` },
        '.cm-button': { backgroundImage: 'none', backgroundColor: colors.surface2, color: colors.text, border: `1px solid ${colors.border}` },
        '.cm-searchMatch': { backgroundColor: '#F5A52455' },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#F5A524aa' },
        '.cm-tooltip': { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.text },
        '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: colors.accent + '55', color: colors.text },
      },
      { dark: true },
    );

    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: '',
        extensions: [
          EditorState.phrases.of(PHRASES),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          indentUnit.of('  '),
          syntaxHighlighting(oneDarkHighlightStyle),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ activateOnTyping: false }),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([
            { key: 'Mod-s', preventDefault: true, run: (ed) => (emitSave(ed), true) },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...completionKeymap,
            { key: 'Tab', run: indentMore, shift: indentLess },
          ]),
          theme,
          language.current.of([]),
          readOnly.current.of(EditorState.readOnly.of(false)),
          wrap.current.of([]),
          // Mobile keyboards: no autocorrect / autocapitalize inside code.
          EditorView.contentAttributes.of({ autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }),
          EditorView.updateListener.of((u) => {
            // Comparing lengths first keeps typing cheap on big files; the full compare only runs when they match.
            if (u.docChanged) setDirty(u.state.doc.length !== saved.current.length || u.state.doc.toString() !== saved.current);
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              onCursor(line.number, head - line.from + 1);
            }
          }),
        ],
      }),
    });
    view.current = v;
    onReady();

    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; callbacks are stable native actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: colors.bg }}>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
