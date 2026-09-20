"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { CaretDownIcon } from "@/components/icons";

export type PillDropdownOption = {
  key: string;
  label: string;
  count: number;
};

type PanelPosition = {
  left: number;
  top: number;
};

function subscribeClientReady() {
  return () => {};
}

function getClientReady() {
  return true;
}

function getServerClientReady() {
  return false;
}

export function PillDropdown({
  label,
  value,
  options,
  onSelect,
  defaultOpen = false,
}: {
  label: string;
  value: string;
  options: PillDropdownOption[];
  onSelect: (key: string) => void;
  defaultOpen?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [open, setOpen] = useState(defaultOpen);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.key === value),
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const reducedMotion = useReducedMotion();
  const id = useId();
  const listboxId = `${id}-listbox`;
  const selected = options[selectedIndex] ?? null;
  const clientReady = useSyncExternalStore(
    subscribeClientReady,
    getClientReady,
    getServerClientReady,
  );

  const positionPanel = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const gap = 6;
    const viewportPadding = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight;
    const panelWidth = panel.offsetWidth;
    const spaceBelow = window.innerHeight - triggerRect.bottom - gap;
    const opensAbove = spaceBelow < panelHeight;
    const left = Math.min(
      Math.max(viewportPadding, triggerRect.left),
      Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding),
    );
    const top = opensAbove
      ? Math.max(viewportPadding, triggerRect.top - panelHeight - gap)
      : triggerRect.bottom + gap;

    setPanelPosition((previous) =>
      previous?.left === left && previous.top === top ? previous : { left, top },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open || !clientReady) return;
    positionPanel();
    window.addEventListener("scroll", positionPanel, true);
    window.addEventListener("resize", positionPanel);
    return () => {
      window.removeEventListener("scroll", positionPanel, true);
      window.removeEventListener("resize", positionPanel);
    };
  }, [clientReady, open, options.length, positionPanel]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function focusOption(index: number) {
    setActiveIndex(index);
    requestAnimationFrame(() => optionRefs.current[index]?.focus());
  }

  function openAt(index: number) {
    setOpen(true);
    focusOption(index);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function move(delta: number) {
    if (options.length === 0) return;
    const next = (activeIndex + delta + options.length) % options.length;
    focusOption(next);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onSelect(option.key);
    close(true);
  }

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => {
          if (open) close(false);
          else openAt(selectedIndex);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAt(event.key === "ArrowDown" ? selectedIndex : Math.max(0, options.length - 1));
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close(true);
          }
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-text-dim bg-raised px-4 font-label text-[11px] uppercase tracking-[0.08em] text-text hover:border-sage focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <span className="text-text-dim">{label}</span>
        <span>{selected?.label ?? "All"}</span>
        <span className={open ? "rotate-180 motion-reduce:transform-none" : ""}>
          <CaretDownIcon />
        </span>
      </button>

      {clientReady
        ? createPortal(
          <AnimatePresence>
            {open ? (
          <motion.div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label={`${label} filter`}
            initial={reducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
            }
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusOption(0);
              } else if (event.key === "End") {
                event.preventDefault();
                focusOption(Math.max(0, options.length - 1));
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                choose(activeIndex);
              } else if (event.key === "Escape") {
                event.preventDefault();
                close(true);
              } else if (event.key === "Tab") {
                setOpen(false);
              }
            }}
            className="fixed z-50 min-w-56 overflow-hidden rounded-panel border border-hairline bg-raised p-1.5 text-text shadow-lg"
            style={{
              left: panelPosition?.left ?? 0,
              top: panelPosition?.top ?? 0,
              visibility: panelPosition ? "visible" : "hidden",
            }}
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-[13px] text-text-dim">No options</p>
            ) : (
              options.map((option, index) => {
                const isSelected = option.key === value;
                return (
                  <div
                    key={option.key}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                    className={`relative flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-pill px-4 font-label text-[11px] uppercase tracking-[0.08em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                      isSelected ? "text-bg" : "text-text hover:bg-bg"
                    }`}
                  >
                    {isSelected ? (
                      <motion.span
                        layoutId={`${id}-active-option`}
                        aria-hidden
                        className="absolute inset-0 rounded-pill bg-text"
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { duration: 0.15, ease: [0.77, 0, 0.175, 1] }
                        }
                      />
                    ) : null}
                    <span className="relative z-10">{option.label}</span>
                    <span className="relative z-10 tabular-nums">{option.count}</span>
                  </div>
                );
              })
            )}
          </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
        : null}
    </div>
  );
}
