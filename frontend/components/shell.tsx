import Link from "next/link";
import Image from "next/image";
import { ExaLogo } from "./brand";
import { BrandLink } from "./brand-link";
import { TRADE_LIST } from "@/lib/trades";
export function Nav({ context }: { context?: string }) {
 return <header className="site-header"><div className="page-width nav-inner"><BrandLink className="site-brand"><ExaLogo /><span className="brand-divider" /><strong>FieldQuote<span className="brand-cross">✳</span></strong></BrandLink><nav aria-label="Main navigation"><Link href="/#how">How it works</Link><Link href="/#why">Why FieldQuote</Link></nav>{context ? <div className="face-switcher" aria-label="Choose trade">{TRADE_LIST.map(t => <Link href={`/workflow/${t.id}`} key={t.id} aria-label={`Switch to ${t.name}`} aria-current={context === t.name ? "page" : undefined} title={t.name}><span><Image src={t.mascot} alt="" width={t.mascotW} height={t.mascotH} unoptimized /></span></Link>)}</div> : <Link className="nav-cta" href="/#packs">Start a job <span>↗</span></Link>}</div></header>;
}
export function Footer() { return <footer className="site-footer page-width"><BrandLink className="site-brand"><ExaLogo /><span className="brand-divider" /><strong>FieldQuote</strong></BrandLink><span>From field notes to customer estimates.</span><span className="micro-label">BUILT FOR THE FIELD</span></footer>; }
