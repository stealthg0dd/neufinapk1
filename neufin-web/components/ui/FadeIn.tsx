"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Props = { children: ReactNode; className?: string };

/** Subtle reveal on first scroll into view; respects prefers-reduced-motion. */
export function FadeIn({ children, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShow(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none motion-reduce:opacity-100 ${
        show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
