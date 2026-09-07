import { useMemo } from "react";
import type { MutableRefObject } from "react";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  DiffSourceToggleWrapper,
  InsertFrontmatter,
  ListsToggle,
  MDXEditor,
  UndoRedo,
  codeBlockPlugin,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import type { ThemeName } from "./theme";

const plugins = [
  headingsPlugin(),
  listsPlugin(),
  quotePlugin(),
  thematicBreakPlugin(),
  linkPlugin(),
  linkDialogPlugin(),
  tablePlugin(),
  frontmatterPlugin(),
  codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
  markdownShortcutPlugin(),
  diffSourcePlugin({ viewMode: "rich-text" }),
  toolbarPlugin({
    toolbarContents: () => (
      <DiffSourceToggleWrapper>
        <UndoRedo />
        <BlockTypeSelect />
        <BoldItalicUnderlineToggles />
        <ListsToggle />
        <CreateLink />
        <InsertFrontmatter />
      </DiffSourceToggleWrapper>
    ),
  }),
];

export function PersonalMdxPane({
  markdown,
  theme,
  editorRef,
  onChange,
  onParseError,
}: {
  markdown: string;
  theme: ThemeName;
  editorRef: MutableRefObject<{ getMarkdown: () => string } | null>;
  onChange: (markdown: string) => void;
  onParseError: (message: string) => void;
}) {
  const className = useMemo(
    () => (theme === "dark" ? "gn-mdx dark-theme" : "gn-mdx"),
    [theme],
  );
  return (
    <MDXEditor
      ref={editorRef as MutableRefObject<MDXEditorMethods | null>}
      markdown={markdown}
      className={className}
      contentEditableClassName="gn-mdx-content"
      plugins={plugins}
      autoFocus
      onChange={(value) => onChange(value)}
      onError={(payload) => onParseError(payload.error || "Не удалось разобрать Markdown")}
    />
  );
}
