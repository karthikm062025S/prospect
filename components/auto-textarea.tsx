"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

// v5: every prose field grows with its content (Enter = new line, never a submit).
// Native `field-sizing: content` does it in Chromium; the effect is the fallback
// for engines without it. No dependency, no wrapper state.
export function AutoTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={props.rows ?? 1}
      {...props}
      className={`auto-grow ${props.className ?? ""}`}
    />
  );
}
