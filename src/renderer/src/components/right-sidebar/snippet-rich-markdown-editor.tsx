/**
 * Minimal rich-markdown editor for the snippet dialog.
 * Adopts the same Tiptap stack as LinearIssueMarkdownDescriptionEditor
 * but without the Linear-specific toolbar styles or save-hint UI.
 */
import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import { createRichMarkdownExtensions } from '@/components/editor/rich-markdown-extensions'
import { encodeRawMarkdownHtmlForRichEditor } from '@/components/editor/raw-markdown-html'
import {
  createRichMarkdownEditorCodec
} from '@/components/editor/rich-markdown-source-transport'
import { useRichMarkdownSpellcheckAttribute } from '@/components/editor/rich-markdown-spellcheck'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { LinearIssueMarkdownToolbar } from '@/components/LinearIssueMarkdownToolbar'

type SnippetRichMarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

export function SnippetRichMarkdownEditor({
  value,
  onChange,
  disabled
}: SnippetRichMarkdownEditorProps): React.JSX.Element {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const lastValueRef = useRef(value)
  const editorRef = useRef<Editor | null>(null)
  const richMarkdownSpellcheckEnabled = useAppStore(
    (s) => s.settings?.richMarkdownSpellcheckEnabled ?? true
  )

  // Why: recreate codec when language changes to get fresh tokenizers.
  const codec = useMemo(() => {
    void language
    return createRichMarkdownEditorCodec()
  }, [language])

  const extensions = useMemo(() => {
    void language
    return [
      ...createRichMarkdownExtensions({ codec }),
      Placeholder.configure({
        placeholder: translate(
          'auto.components.right.sidebar.SnippetRichMarkdownEditor.placeholder',
          'Write Markdown…'
        )
      })
    ]
  }, [codec, language])

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: encodeRawMarkdownHtmlForRichEditor(value, codec),
      contentType: 'markdown',
      editable: !disabled,
      editorProps: {
        attributes: {
          class: 'rich-markdown-editor',
          spellcheck: richMarkdownSpellcheckEnabled ? 'true' : 'false',
          'aria-label': 'Snippet content'
        }
      },
      onFocus: () => { window.api.ui.setMarkdownEditorFocused(true) },
      onBlur: ({ editor: e }) => {
        window.api.ui.setMarkdownEditorFocused(false)
        const next = e.getMarkdown()
        lastValueRef.current = next
        onChange(next)
      },
      onUpdate: ({ editor: e }) => {
        const next = e.getMarkdown()
        lastValueRef.current = next
        onChange(next)
      }
    },
    [codec, language]
  )

  useRichMarkdownSpellcheckAttribute(editor, richMarkdownSpellcheckEnabled)

  useEffect(() => { editorRef.current = editor }, [editor])
  useEffect(() => { editor?.setEditable(!disabled) }, [disabled, editor])

  // Sync external value changes (e.g. load from API)
  useEffect(() => {
    if (!editor || value === lastValueRef.current) { return }
    const current = editor.getMarkdown()
    if (current === value) { lastValueRef.current = value; return }
    editor.commands.setContent(encodeRawMarkdownHtmlForRichEditor(value, codec), {
      contentType: 'markdown',
      emitUpdate: false
    })
    lastValueRef.current = value
  }, [codec, editor, value])

  return (
    <div className="linear-issue-markdown-editor linear-issue-markdown-editor-drawer flex min-h-0 flex-1 flex-col overflow-hidden">
      <LinearIssueMarkdownToolbar editor={editor} disabled={disabled} />
      <div className="linear-issue-markdown-scroll flex-1 overflow-y-auto scrollbar-sleek">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
