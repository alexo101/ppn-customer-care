import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  hasRequiredWelcomeTokens,
  parseWelcomeTemplate,
  type WelcomeToken,
} from "@/lib/welcome-message";

const TOKEN_CHIP_CLASS =
  "inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 mx-0.5 text-xs font-medium text-foreground align-baseline select-none";

function createTokenNode(token: WelcomeToken): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.token = token;
  span.className = TOKEN_CHIP_CLASS;
  span.textContent = token;
  span.draggable = false;
  return span;
}

function createSegmentNodes(value: string): Node[] {
  const nodes: Node[] = [];
  for (const segment of parseWelcomeTemplate(value)) {
    if (segment.type === "token") {
      nodes.push(createTokenNode(segment.value));
      continue;
    }
    const parts = segment.value.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) nodes.push(document.createElement("br"));
      if (part) nodes.push(document.createTextNode(part));
    });
  }
  return nodes;
}

function isTokenElement(node: Node | null): node is HTMLElement {
  return Boolean(
    node &&
      node.nodeType === Node.ELEMENT_NODE &&
      (node as HTMLElement).dataset.token,
  );
}

export function serializeWelcomeEditor(root: HTMLElement): string {
  let output = "";

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.dataset.token) {
      output += element.dataset.token;
      return;
    }
    if (element.tagName === "BR") {
      output += "\n";
      return;
    }
    if (
      (element.tagName === "DIV" || element.tagName === "P") &&
      output &&
      !output.endsWith("\n")
    ) {
      output += "\n";
    }
    for (const child of Array.from(element.childNodes)) walk(child);
  };

  for (const child of Array.from(root.childNodes)) walk(child);
  return output;
}

function nodeBeforeCaret(range: Range, root: HTMLElement): Node | null {
  const { startContainer, startOffset } = range;
  if (startContainer === root) {
    return root.childNodes[startOffset - 1] ?? null;
  }
  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (startOffset > 0) return null;
    return startContainer.previousSibling;
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    return startContainer.childNodes[startOffset - 1] ?? startContainer.previousSibling;
  }
  return null;
}

function nodeAfterCaret(range: Range, root: HTMLElement): Node | null {
  const { startContainer, startOffset } = range;
  if (startContainer === root) {
    return root.childNodes[startOffset] ?? null;
  }
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const length = startContainer.textContent?.length ?? 0;
    if (startOffset < length) return null;
    return startContainer.nextSibling;
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    return startContainer.childNodes[startOffset] ?? startContainer.nextSibling;
  }
  return null;
}

function rangeContainsToken(range: Range): boolean {
  return Boolean(range.cloneContents().querySelector("[data-token]"));
}

function wouldRemoveToken(event: InputEvent, root: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  if (!range.collapsed) return rangeContainsToken(range);
  if (event.inputType === "deleteContentBackward") {
    return isTokenElement(nodeBeforeCaret(range, root));
  }
  if (
    event.inputType === "deleteContentForward" ||
    event.inputType === "deleteByCut"
  ) {
    return isTokenElement(nodeAfterCaret(range, root));
  }
  return false;
}

function paintEditor(root: HTMLElement, value: string) {
  root.replaceChildren(...createSegmentNodes(value));
}

export function TemplatedMessageField({
  id,
  value,
  onChange,
  disabled = false,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastGoodRef = useRef(value);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (serializeWelcomeEditor(root) === value) return;
    lastGoodRef.current = value;
    paintEditor(root, value);
  }, [value]);

  const commitOrRevert = () => {
    const root = rootRef.current;
    if (!root) return;
    const next = serializeWelcomeEditor(root);
    if (!hasRequiredWelcomeTokens(next) || next.length > maxLength) {
      paintEditor(root, lastGoodRef.current);
      return;
    }
    lastGoodRef.current = next;
    if (next !== value) onChange(next);
  };

  return (
    <div
      id={id}
      ref={rootRef}
      role="textbox"
      aria-multiline="true"
      aria-disabled={disabled}
      contentEditable={!disabled}
      suppressContentEditableWarning
      className={cn(
        "min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm md:text-sm whitespace-pre-wrap break-words outline-none focus-visible:ring-1 focus-visible:ring-ring",
        disabled && "cursor-not-allowed opacity-50",
      )}
      onBeforeInput={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        const native = event.nativeEvent as InputEvent;
        if (wouldRemoveToken(native, event.currentTarget)) {
          event.preventDefault();
        }
      }}
      onInput={commitOrRevert}
      onPaste={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && rangeContainsToken(selection.getRangeAt(0))) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      onDrop={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          document.execCommand("insertLineBreak");
        }
      }}
      onBlur={commitOrRevert}
    />
  );
}
