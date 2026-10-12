import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  mergeFields,
  parseFieldBar,
  type FieldDefinition,
} from './lib/fieldCatalogue'
import { validateSrl } from './lib/validateSrl'

const DRAFT_KEY = 'srl-writer:draft:v1'
const CATALOGUE_KEY = 'srl-writer:catalogue:v1'

const INSERTS = [
  { label: 'Field', syntax: '<<FIELD.ENTITY.DICT>>' },
  { label: 'Condition', syntax: '{{SEL:(FIELD.ENTITY="VALUE"):Text}{Alternative}}' },
  { label: 'List', syntax: '[[ENTITY.DICT:SEL:(FIELD.ENTITY="VALUE"): <<FIELD.ENTITY>>\n]]' },
  { label: 'SLP', syntax: '<<@SLP_CODE>>' },
  { label: 'Temporary', syntax: '<<#NAME=value>>' },
  { label: 'Prompt', syntax: '<<\'Prompt text\'"Default value">>' },
] as const

function loadDraft() {
  return localStorage.getItem(DRAFT_KEY) ?? ''
}

function loadCatalogue(): FieldDefinition[] {
  try {
    return JSON.parse(localStorage.getItem(CATALOGUE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function App() {
  const [draft, setDraft] = useState(loadDraft)
  const [fields, setFields] = useState<FieldDefinition[]>(loadCatalogue)
  const [fieldQuery, setFieldQuery] = useState('')
  const [importMessage, setImportMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const deferredDraft = useDeferredValue(draft)
  const deferredQuery = useDeferredValue(fieldQuery.trim().toUpperCase())

  const diagnostics = useMemo(
    () => validateSrl(deferredDraft, fields),
    [deferredDraft, fields],
  )

  const visibleFields = useMemo(() => {
    if (!deferredQuery) return fields.slice(0, 12)
    return fields
      .filter((item) =>
        `${item.field} ${item.entity} ${item.dictionary} ${item.shortName} ${item.fullName}`
          .toUpperCase()
          .includes(deferredQuery),
      )
      .slice(0, 30)
  }, [deferredQuery, fields])

  const entityCount = useMemo(
    () => new Set(fields.map((field) => `${field.dictionary}.${field.entity}`)).size,
    [fields],
  )

  function updateDraft(value: string) {
    setDraft(value)
    localStorage.setItem(DRAFT_KEY, value)
  }

  function insertSyntax(syntax: string) {
    const editor = editorRef.current
    if (!editor) return
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const spacing = start > 0 && draft[start - 1] !== '\n' ? '\n' : ''
    const next = `${draft.slice(0, start)}${spacing}${syntax}${draft.slice(end)}`
    updateDraft(next)
    requestAnimationFrame(() => {
      const cursor = start + spacing.length + syntax.length
      editor.focus()
      editor.setSelectionRange(cursor, cursor)
    })
  }

  function insertField(field: FieldDefinition) {
    insertSyntax(`<<${field.field}.${field.entity}.${field.dictionary}>>`)
  }

  async function importBars(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])]
    if (selected.length === 0) return

    try {
      const results = await Promise.all(
        selected.map(async (file) => parseFieldBar(await file.text())),
      )
      const incoming = results.flatMap((result) => result.fields)
      const rejected = results.reduce((sum, result) => sum + result.rejectedRows, 0)
      const merged = mergeFields(fields, incoming)
      setFields(merged)
      localStorage.setItem(CATALOGUE_KEY, JSON.stringify(merged))
      setImportMessage(
        `${incoming.length.toLocaleString()} fields imported from ${selected.length} file${selected.length === 1 ? '' : 's'}${rejected ? `; ${rejected} rows skipped` : ''}.`,
      )
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : 'The BAR files could not be read.',
      )
    } finally {
      event.target.value = ''
    }
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft.replace(/\r?\n/g, '\r\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function downloadDraft() {
    const content = draft.replace(/\r?\n/g, '\r\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'srl-letter-text.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function clearCatalogue() {
    setFields([])
    localStorage.removeItem(CATALOGUE_KEY)
    setImportMessage('Field catalogue cleared from this browser.')
  }

  const errorCount = diagnostics.filter((item) => item.level === 'error').length
  const warningCount = diagnostics.filter((item) => item.level === 'warning').length

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">&lt;&lt;</span>
          <div>
            <h1>SRL Writer</h1>
            <p>Compose with structure. Verify in TEST.</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="scope-badge">Static checks only</span>
          <input
            ref={fileRef}
            className="visually-hidden"
            type="file"
            accept=".bar,.txt"
            multiple
            onChange={importBars}
          />
          <button className="button secondary" onClick={() => fileRef.current?.click()}>
            Import FLD BAR
          </button>
        </div>
      </header>

      <main className="workbench">
        <aside className="tool-rail" aria-label="Syntax inserts">
          <div className="panel-heading">
            <span className="eyebrow">Build</span>
            <h2>Syntax blocks</h2>
          </div>
          <div className="insert-list">
            {INSERTS.map((item) => (
              <button key={item.label} onClick={() => insertSyntax(item.syntax)}>
                <span>{item.label}</span>
                <code>{item.syntax.slice(0, 16)}{item.syntax.length > 16 ? '…' : ''}</code>
              </button>
            ))}
          </div>
          <div className="processing-order">
            <span className="eyebrow">Processing order</span>
            <ol>
              <li><strong>Lists</strong><span>[[ ]]</span></li>
              <li><strong>Conditions</strong><span>{'{{ }}'}</span></li>
              <li><strong>Variables</strong><span>&lt;&lt; &gt;&gt;</span></li>
            </ol>
          </div>
        </aside>

        <section className="editor-panel">
          <div className="editor-toolbar">
            <div>
              <span className="eyebrow">Letter text</span>
              <span className="save-state">Saved locally</span>
            </div>
            <div className="editor-actions">
              <button className="text-button" onClick={copyDraft} disabled={!draft}>
                {copied ? 'Copied' : 'Copy CRLF'}
              </button>
              <button className="button primary" onClick={downloadDraft} disabled={!draft}>
                Download
              </button>
            </div>
          </div>
          <div className="editor-wrap">
            <div className="syntax-rail" aria-hidden="true">
              <span>&lt;&lt;</span><span>[[</span><span>{'{{'}</span>
            </div>
            <textarea
              ref={editorRef}
              value={draft}
              onChange={(event) => updateDraft(event.target.value)}
              spellCheck={false}
              aria-label="SRL letter text"
              placeholder={'Begin with free text or insert a syntax block…\n\nExample: <<STU_NAME.STU.SRS>>'}
            />
          </div>
          <footer className="editor-footer">
            <span>{draft.length.toLocaleString()} characters</span>
            <span>{draft.split(/\r?\n/).length} lines</span>
            <span>Output: UTF-8 · CRLF</span>
          </footer>
        </section>

        <aside className="inspection-rail">
          <section className="diagnostics-card">
            <div className="panel-heading split-heading">
              <div>
                <span className="eyebrow">Inspect</span>
                <h2>Diagnostics</h2>
              </div>
              <div className="diagnostic-counts" aria-label="Diagnostic counts">
                <span className={errorCount ? 'has-error' : ''}>{errorCount} errors</span>
                <span className={warningCount ? 'has-warning' : ''}>{warningCount} warnings</span>
              </div>
            </div>
            <div className="diagnostic-list" aria-live="polite">
              {diagnostics.map((item, index) => (
                <article className={`diagnostic ${item.level}`} key={`${item.message}-${index}`}>
                  <span className="diagnostic-dot" aria-hidden="true" />
                  <div><strong>{item.message}</strong><p>{item.detail}</p></div>
                </article>
              ))}
            </div>
          </section>

          <section className="catalogue-card">
            <div className="panel-heading split-heading">
              <div>
                <span className="eyebrow">Reference</span>
                <h2>Field catalogue</h2>
              </div>
              {fields.length > 0 ? (
                <button className="text-button quiet" onClick={clearCatalogue}>Clear</button>
              ) : null}
            </div>
            <div className="catalogue-stats">
              <strong>{fields.length.toLocaleString()}</strong> fields
              <span>{entityCount} dictionary/entity groups</span>
            </div>
            {importMessage ? <p className="import-message">{importMessage}</p> : null}
            <label className="search-box">
              <span className="visually-hidden">Search fields</span>
              <input
                value={fieldQuery}
                onChange={(event) => setFieldQuery(event.target.value)}
                placeholder="Search field, entity or name"
                disabled={fields.length === 0}
              />
            </label>
            {fields.length === 0 ? (
              <div className="empty-catalogue">
                <span className="empty-glyph">FLD</span>
                <p>Import one or more FLD BAR exports. Files stay in this browser.</p>
              </div>
            ) : (
              <div className="field-results">
                {visibleFields.map((field) => (
                  <button
                    key={`${field.dictionary}.${field.entity}.${field.field}`}
                    onClick={() => insertField(field)}
                    title={field.tooltip || field.fullName}
                  >
                    <code>{field.field}</code>
                    <span>{field.shortName}</span>
                    <small>{field.dictionary}.{field.entity} · {field.type}{field.length}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App

