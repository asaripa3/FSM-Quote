"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The wordmark. On any other route this is an ordinary link home, but on the
 * landing page itself Next performs no navigation for a same-route Link — so
 * nothing resets the scroll and clicking it appears to do nothing (you simply
 * stay wherever you were). Scroll to the top explicitly in that case.
 */
export function BrandLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Link
      href="/"
      className={className}
      aria-label="FieldQuote home"
      onClick={(e) => {
        if (pathname !== "/") return;
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      }}
    >
      {children}
    </Link>
  );
}
