"use client";

import { useRef, useState } from "react";
import { PDF_MAX_BYTES } from "@/lib/profile-options";

// Rung 1: a styled <label> around the native hidden <input type="file">. The
// label opens the picker on click and on Enter/Space through the sr-only
// input; a drop hands the file to that same input via DataTransfer, so the
// surrounding <form>'s FormData sees it exactly as a clicked pick. Nothing
// here is a second code path for the server to trust.
const MB = 1024 * 1024;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function PdfDropZone({
  id,
  name,
  label,
  help,
  what,
  required = false,
  error,
  className = "",
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  /** Short noun for the empty prompt: "Drop your <what> here". */
  what: string;
  required?: boolean;
  error?: string;
  /** D10: lets the caller stretch this box to match a sibling's height in an equal-height grid. */
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const shownError = error ?? localError;

  // Law 14: explain the limit and refuse the wrong file BEFORE submission,
  // with the same numbers the API enforces.
  function accept(next: File | null) {
    setLocalError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!isPdf(next)) {
      setLocalError(`${next.name} is not a PDF. Only PDF files are accepted.`);
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      return;
    }
    if (next.size > PDF_MAX_BYTES) {
      setLocalError(`${next.name} is ${(next.size / MB).toFixed(1)} MB; the limit is ${PDF_MAX_BYTES / MB} MB.`);
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      return;
    }
    setFile(next);
  }

  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (!dropped || !inputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(dropped);
    inputRef.current.files = transfer.files;
    accept(dropped);
  }

  // D9: mock's affordance is "Replace" (reopen the picker over the current
  // file), not a separate clear step -- a cancelled picker just keeps the
  // file that was already there, and both fields are required so an empty
  // end state was never a real destination anyway.
  function openPicker(event: React.MouseEvent) {
    event.preventDefault();
    inputRef.current?.click();
  }

  return (
    <div className={`flex h-full flex-col gap-2 ${className}`}>
      <span id={`${id}-label`} className="font-sans text-sm font-medium text-text">
        {label}
        {required && (
          <span className="font-normal text-text-dim"> (required)</span>
        )}
      </span>
      <label
        htmlFor={id}
        data-dragging={dragging}
        data-filled={Boolean(file)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-24 flex-1 cursor-pointer items-center gap-3 rounded-card border p-6 transition-colors duration-[120ms] hover:border-sage has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sage has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-raised data-[dragging=true]:border-sage data-[dragging=true]:bg-sage/5 motion-reduce:transition-none ${
          shownError
            ? "flex-col justify-center border-danger border-dashed text-center"
            : file
              ? "flex-row justify-between border-transparent bg-sage/10 text-left"
              : "flex-col justify-center border-hairline border-dashed bg-raised text-center"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept="application/pdf,.pdf"
          aria-required={required}
          aria-labelledby={`${id}-label`}
          aria-describedby={shownError ? `${helpId} ${errorId}` : helpId}
          aria-invalid={Boolean(shownError)}
          onChange={(event) => accept(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {file ? (
          <>
            <span className="flex items-center gap-3 overflow-hidden">
              <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg text-sage">
                ✓
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-sans text-sm font-medium text-text">{file.name}</span>
                <span className="font-sans text-xs text-text-dim">{(file.size / MB).toFixed(1)} MB · read in memory, never stored</span>
              </span>
            </span>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex min-h-11 shrink-0 items-center rounded-pill border border-hairline bg-bg px-4 font-sans text-sm font-medium text-text hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
            >
              Replace
            </button>
          </>
        ) : (
          <>
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-text-dim">
              ↑
            </span>
            <span className="font-sans text-sm font-medium text-text">Drop your {what} here</span>
            <span className="font-sans text-xs text-text-dim">PDF only, up to {PDF_MAX_BYTES / MB} MB</span>
          </>
        )}
      </label>
      <p id={helpId} className="font-sans text-xs text-text-dim">
        {help}
      </p>
      {shownError && (
        <p id={errorId} role="alert" className="font-sans text-sm text-danger">
          {shownError}
        </p>
      )}
    </div>
  );
}
