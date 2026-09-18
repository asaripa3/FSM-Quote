"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ExaLogo } from "./brand";
import { BrandLink } from "./brand-link";
import { TRADE_LIST } from "@/lib/trades";

/**
 * While the header sits over the scroll walkthrough it takes the sky colour out of the
 * artwork, so the bar reads as part of the scene. Once the walkthrough has scrolled past
 * it, the header returns to glass over whatever section is underneath.
 *
 * The observation band is the height of the header itself rather than the whole viewport,
 * so the change happens exactly when the artwork stops passing behind the bar.
 */
function useOverSky() {
 const ref = useRef<HTMLElement>(null);
 const [overSky, setOverSky] = useState(usePathname() === "/");
 useEffect(() => {
  const track = document.querySelector(".world-track"), header = ref.current;
  if (!track || !header) { setOverSky(false); return; }
  let io: IntersectionObserver | undefined;
  const attach = () => {
   io?.disconnect();
   io = new IntersectionObserver(([entry]) => setOverSky(entry.isIntersecting), { rootMargin: `0px 0px -${Math.max(0, window.innerHeight - header.offsetHeight)}px 0px` });
   io.observe(track);
  };
  attach();
  window.addEventListener("resize", attach);
  return () => { io?.disconnect(); window.removeEventListener("resize", attach); };
 }, []);
 return { ref, overSky };
}

export function Nav({ context }: { context?: string }) {
 const { ref, overSky } = useOverSky();
 return <header ref={ref} className={`site-header${overSky ? " over-sky" : ""}`}><div className="page-width nav-inner"><BrandLink className="site-brand"><ExaLogo /><span className="brand-divider" /><strong>FieldQuote<span className="brand-cross">✳</span></strong></BrandLink><nav aria-label="Main navigation"><Link href="/#how">How it works</Link><Link href="/#why">Why FieldQuote</Link></nav>{context ? <div className="face-switcher" aria-label="Choose trade">{TRADE_LIST.map(t => <Link href={`/workflow/${t.id}`} key={t.id} aria-label={`Switch to ${t.name}`} aria-current={context === t.name ? "page" : undefined} title={t.name}><span><Image src={t.mascot} alt="" width={t.mascotW} height={t.mascotH} unoptimized /></span></Link>)}</div> : <Link className="nav-cta" href="/#packs">Start a job <span>↗</span></Link>}</div></header>;
}
export function Footer() { return <footer className="site-footer page-width"><BrandLink className="site-brand"><ExaLogo /><span className="brand-divider" /><strong>FieldQuote</strong></BrandLink><span>From field notes to customer estimates.</span><span className="micro-label">BUILT FOR THE FIELD</span></footer>; }
