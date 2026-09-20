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
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  /** Short noun for the empty prompt: "Drop your <what> here". */
  what: string;
  required?: boolean;
  error?: string;
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

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    accept(null);
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="font-label text-[11px] uppercase tracking-label text-text-dim">
        {label}
        {required && (
          <span className="normal-case tracking-normal"> (required)</span>
        )}
      </span>
      <label
        htmlFor={id}
        data-dragging={dragging}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed bg-bg p-6 text-center transition-colors duration-[120ms] hover:border-sage has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sage has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-raised data-[dragging=true]:border-sage data-[dragging=true]:bg-sage/5 motion-reduce:transition-none ${
          shownError ? "border-danger" : "border-text-dim"
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
            <span className="font-sans text-sm font-medium text-text break-all">{file.name}</span>
            <span className="font-sans text-xs tabular-nums text-text-dim">{(file.size / MB).toFixed(1)} MB, PDF</span>
          </>
        ) : (
          <>
            <span className="font-sans text-sm text-text">Drop your {what} here, or click to choose a file</span>
            <span className="font-sans text-xs text-text-dim">PDF only, up to {PDF_MAX_BYTES / MB} MB</span>
          </>
        )}
      </label>
      {file && (
        <button
          type="button"
          onClick={remove}
          className="inline-flex min-h-11 items-center self-start rounded-pill border border-text-dim px-4 font-sans text-sm text-text hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-raised"
        >
          Remove {file.name}
        </button>
      )}
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
