import Link from "next/link";
import Image from "next/image";
import { Nav, Footer } from "@/components/shell";
import { FieldWorld } from "@/components/field-world";
import { TRADE_LIST } from "@/lib/trades";
export default function Home() {
  return <><Nav /><main className="landing"><FieldWorld />
    <section className="simple-story page-width" id="why"><p className="eyebrow">LEAVE THE JOB. KEEP YOUR EVENING.</p><h2>Your shift ends.<br /><span>The quoting shouldn’t begin.</span></h2><p>You’ve already explained the job in a recording. You shouldn’t have to replay it at home, hunt for parts, and build an estimate from scratch.</p>
    <div className="simple-steps"><article><span>01 / RECORD</span><h3>Say what needs fixing.</h3><p>Dictate on site, upload your recording, or type a note. Review the transcript before you continue.</p><div className="step-example">“Replace the capacitor.<br />About an hour of labor.”</div></article><article><span>02 / REVIEW</span><h3>Pick the parts.</h3><p>Exa finds supplier pages. Check the part and price, choose your source, and set the quantity.</p><div className="step-example">The part. The price.<br />The link to check it.</div></article><article><span>03 / QUOTE</span><h3>Put your price on it.</h3><p>Your hourly rate and markup do the math. Download a clear PDF estimate to send to the customer.</p><div className="step-example">Parts + your markup + labor.<br />Ready to share.</div></article></div></section>
    <section className="simple-start" id="packs"><div className="page-width"><div><p className="eyebrow">YOUR NEXT JOB</p><h2>What are we fixing?</h2><p>Choose your trade. Bring your own note.</p></div><div className="start-trades">{TRADE_LIST.map(t => <Link href={`/workflow/${t.id}`} key={t.id}><Image src={t.mascot} alt="" width={t.mascotW} height={t.mascotH} unoptimized /><strong>{t.name}</strong><span>Start a job ↗</span></Link>)}</div></div></section>
  </main><Footer /></>;
}
