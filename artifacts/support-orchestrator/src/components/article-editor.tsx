import { useEffect, useRef, useState, type ReactNode } from "react";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import {
  getGetArticleAssetUrlQueryKey,
  useGetArticleAssetUrl,
  useUploadArticleAsset,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ArticleImage = Image.extend({
  addAttributes() {
    return {
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-asset-id"),
        renderHTML: (attributes) =>
          attributes.assetId ? { "data-asset-id": attributes.assetId } : {},
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("alt"),
        renderHTML: (attributes) => (attributes.alt ? { alt: attributes.alt } : {}),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageView);
  },
});

function ArticleImageView({ node }: ReactNodeViewProps) {
  const assetId = typeof node.attrs.assetId === "string" ? node.attrs.assetId : "";
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "Article image";
  const { data } = useGetArticleAssetUrl(assetId, {
    query: {
      enabled: Boolean(assetId),
      queryKey: getGetArticleAssetUrlQueryKey(assetId),
    },
  });
  return (
    <NodeViewWrapper className="my-3">
      {data?.url ? (
        <img src={data.url} alt={alt} className="max-h-80 rounded-md border border-border" />
      ) : (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
          {alt}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export function ArticleEditor({
  articleId,
  value,
  editable,
  onChange,
  className,
}: {
  articleId: string;
  value: string;
  editable: boolean;
  onChange: (html: string) => void;
  className?: string;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const uploadAsset = useUploadArticleAsset();
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] }),
      ArticleImage,
      Placeholder.configure({ placeholder: "Write the knowledge this assistant should use…" }),
    ],
    content: value,
    editable,
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[20.8rem] px-3 py-3 focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
    // Reset only when a different article is opened. Feeding each keystroke back moves the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, articleId]);

  if (!editor) return null;

  const applyLink = () => {
    const href = linkUrl.trim();
    if (!href) {
      editor.chain().focus().unsetLink().run();
    } else {
      const safe = /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
    }
    setLinkOpen(false);
    setLinkUrl("");
  };

  return (
    <div className={cn("flex min-h-[20.8rem] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background", className)}>
      {editable ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
          <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Heading" active={editor.isActive("heading")} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            active={editor.isActive("link") || linkOpen}
            onClick={() => {
              setLinkUrl(editor.getAttributes("link").href ?? "");
              setLinkOpen((open) => !open);
            }}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Image" onClick={() => imageInputRef.current?.click()} disabled={uploadAsset.isPending}>
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              try {
                const asset = await uploadAsset.mutateAsync({
                  id: articleId,
                  data: { file, altText: file.name.replace(/\.[^.]+$/, "") },
                });
                editor.chain().focus().insertContent({
                  type: "image",
                  attrs: { assetId: asset.id, alt: asset.altText || file.name },
                }).run();
              } catch (error) {
                toast({
                  title: "Could not upload the image",
                  description: error instanceof Error ? error.message : "Try again.",
                  variant: "destructive",
                });
              }
            }}
          />
        </div>
      ) : null}
      {linkOpen ? (
        <form
          className="flex gap-2 border-b border-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <Input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://example.com"
            className="h-8"
          />
          <Button type="submit" size="sm">Apply</Button>
        </form>
      ) : null}
      <EditorContent
        editor={editor}
        className="min-h-0 flex-1 overflow-y-auto [&_.ProseMirror]:min-h-[20.8rem]"
      />
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", active && "bg-muted text-foreground")}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
