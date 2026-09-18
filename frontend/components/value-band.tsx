/**
 * Q7 on the landing page, for a buyer who never clicks into the workflow.
 * Uses the same baseline + math as the live meter in the workshop, so the
 * headline number and the in-product number can never disagree.
 */
import Link from "next/link";
import { TRADES } from "@/lib/trades";
import { valueCase, compactMoney, compactNumber, TYPICAL_RUN_SECONDS } from "@/lib/metrics";

export function ValueBand() {
  const pack = TRADES.plumbing;
  const b = pack.config.baseline;
  const v = valueCase(b, TYPICAL_RUN_SECONDS);

  return (
    <section className="value-band" id="value">
      <div className="page-width">
        <div className="value-band-head">
          <div>
            <p className="eyebrow">
              <span /> WHY IT GETS BOUGHT
            </p>
            <h2>
              The repair was never the
              <br />
              expensive part.
            </h2>
          </div>
          <p>
            A {b.technicians}-technician contractor writes about{" "}
            {compactNumber(v.quotesPerYear)} quotes a year. Taking {v.minutesSavedPerQuote} minutes
            out of each one is not a feature — it is a line in the operating budget.
          </p>
        </div>

        <dl className="value-band-stats">
          <div>
            <dt>{v.manualMinutes} min → {v.actualMinutes} min</dt>
            <dd>per quote, including human review of the evidence</dd>
          </div>
          <div className="is-lead">
            <dt>{compactNumber(v.hoursPerYear)} hours</dt>
            <dd>of sourcing time returned to the business each year</dd>
          </div>
          <div>
            <dt>{compactMoney(v.dollarsPerYear)}</dt>
            <dd>
              avoided at ${b.sourcingCostPerHour}/hr loaded sourcing cost
            </dd>
          </div>
        </dl>

        <footer className="value-band-foot">
          <p>
            Modeled from {b.quotesPerTechPerWeek} quotes per technician per week across{" "}
            {b.technicians} technicians, against a {b.manualMinutesPerQuote}-minute manual baseline.
            Every input is editable inside the workflow — run it with your own numbers.
          </p>
          <Link href="/workflow/plumbing" className="primary-button">
            Run it and watch the counter <span>↗</span>
          </Link>
        </footer>
      </div>
    </section>
  );
}
