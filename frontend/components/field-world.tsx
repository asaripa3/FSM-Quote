"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { TRADE_LIST, type TradeId } from "@/lib/trades";

/**
 * The scroll walkthrough is a camera over one piece of pixel art.
 *
 * The art is the content — it already labels every step of the workflow, and
 * already paints a button under each technician — so this component only moves
 * the camera, turns those painted buttons into real links, and narrates
 * underneath. Focus targets are fractions of the IMAGE, never hand-tuned
 * translate percentages, and the camera is clamped so the frame can never run
 * off the edge of the artwork at any viewport size.
 */

const IMG_W = 1536;
const IMG_H = 1024;
const IMG_ASPECT = IMG_W / IMG_H;

/** Where each chapter looks, in fractions of the source image. */
type Focus = { x: number; y: number; z: number };

/*
 * Camera stops were measured off the artwork itself, not eyeballed:
 *   technician caps  x = 0.225 / 0.417 / 0.610
 *   bay label boxes  x = 0.112 / 0.288 / 0.479 / 0.695 / 0.891, y = 0.624-0.723
 *   ground line      y = 0.577
 *   underground band y = 0.624 (label tops) -> 0.943 (foot of the bottom grass)
 * BAY_Y is the centre of that band. Raise it to reveal more of the floor and
 * clip the label tops; lower it to do the reverse.
 * Step 01 carries its own zoom (1.15) so it frames the SURFACE band only and
 * stops just short of the bay labels at 0.624 — at z=1 a tall frame spills past
 * the ground line and shows the underground labels sliced in half.
 * BAY_Z is fixed rather than fitted to the frame so that consecutive stops stay
 * visually distinct — at a lower zoom the clamp collapses steps 01/02 and 05/06
 * onto the same position and scrolling looks broken.
 */
const BAY_Y = 0.782;
const BAY_Z = 1.9;

const CHAPTERS: { short: string; title: string; text: string; focus: Focus }[] = [
  {
    short: "Choose your trade",
    title: "Every job starts with a technician.",
    text: "Record what you found on site. FieldQuote helps find the parts and build the estimate, so you’re not replaying recordings after your shift. Choose a technician to start.",
    focus: { x: 0.5, y: 0.305, z: 1.15 },
  },
  {
    short: "Inspect",
    title: "The diagnosis happens on site.",
    text: "Do the inspection as you normally would. Identify the equipment, what went wrong, and what needs fixing.",
    focus: { x: 0.112, y: BAY_Y, z: BAY_Z },
  },
  {
    short: "Record",
    title: "You talk. It takes the note.",
    text: "Equipment, symptoms and labour captured while the technician speaks. No part number required — the next step does not need one.",
    focus: { x: 0.288, y: BAY_Y, z: BAY_Z },
  },
  {
    short: "Find parts",
    title: "Exa turns field language into parts.",
    text: "Exa searches supplier and manufacturer pages for the parts mentioned in your note. Open the sources and check the fit.",
    focus: { x: 0.479, y: BAY_Y, z: BAY_Z },
  },
  {
    short: "Select & verify",
    title: "Evidence first, then a price.",
    text: "Compare the options, check the price on the supplier page, and choose the parts you want to quote. You make the final call.",
    focus: { x: 0.695, y: BAY_Y, z: BAY_Z },
  },
  {
    short: "Build quote",
    title: "Parts, markup, labour. Done.",
    text: "Set your labor hours, hourly rate, and parts markup. Review the estimate, then download a PDF to share with your customer.",
    focus: { x: 0.891, y: BAY_Y, z: BAY_Z },
  },
];

const STEPS = CHAPTERS.length;

/** Technician positions in image fractions, so the hit areas track the art. */
const HOTSPOT_W = 0.115;
const HOTSPOTS: Record<TradeId, number> = { plumbing: 0.225, hvac: 0.417, electrical: 0.61 };
const HOTSPOT_TOP = 0.19;
const HOTSPOT_HEIGHT = 0.34;

const clampFocus = (v: number, visible: number) => {
  const half = visible / 2;
  if (half >= 0.5) return 0.5; // frame is wider than the art on this axis
  return Math.min(Math.max(v, half), 1 - half);
};

/**
 * Turns a focus target into a transform, in px, against the measured frame.
 * `z` is raised if needed so the artwork always covers the frame — this is what
 * stops the scene showing empty space beside or below the image.
 */
function cameraTransform(focus: Focus, box: { w: number; h: number }) {
  if (!box.w || !box.h) return undefined;

  const naturalH = box.w / IMG_ASPECT; // rendered height at scale 1 (width:100%)
  const z = Math.max(focus.z, Math.max(1, box.h / naturalH));

  const cx = clampFocus(focus.x, 1 / z);
  const cy = clampFocus(focus.y, box.h / (naturalH * z));

  const left = box.w / 2 - z * cx * box.w;
  const top = box.h / 2 - z * cy * naturalH;

  return `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px) scale(${z.toFixed(3)})`;
}

export function FieldWorld() {
  const [stage, setStage] = useState(0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const trackRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const chapter = CHAPTERS[stage];

  /*
   * Scroll position → stage.
   *
   * Driven by a rAF loop that only runs while the track is on screen, rather
   * than by the `scroll` event: scroll events are not delivered reliably in
   * every embedded/emulated browser, and a walkthrough that silently freezes
   * is worse than one animation frame of work. `setStage` bails when the value
   * is unchanged, so a visible track costs one rect read per frame and no
   * re-renders between stages.
   */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    let raf = 0;
    let running = false;

    const tick = () => {
      const rect = el.getBoundingClientRect();
      const nav = window.innerWidth <= 760 ? 66 : 82;
      const distance = rect.height - window.innerHeight + nav;
      const progress = distance <= 0 ? 0 : Math.min(1, Math.max(0, (nav - rect.top) / distance));
      const next = Math.min(STEPS - 1, Math.floor(progress * STEPS));
      setStage((current) => (current === next ? current : next));
      if (running) raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(tick);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: "150px" },
    );
    io.observe(el);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  /* frame size → camera maths */
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const transform = cameraTransform(chapter.focus, box);

  return (
    <section
      className="world-track"
      ref={trackRef}
      id="how"
      aria-label="Interactive field-service walkthrough"
    >
      <div className="world-sticky">
        <div className={`world-scene stage-${stage}`} ref={sceneRef}>
          {/* one camera element: the art and its hit areas move together */}
          <div
            className="world-camera"
            style={{ transform, transition: transform ? undefined : "none" }}
          >
            <Image
              src="/assets/fieldquote-world.png"
              alt="A pixel-art field-service town: plumbing, HVAC and electrical technicians on the surface, and below them the five bays of the job — inspect, record, find parts, select and verify, build quote"
              width={IMG_W}
              height={IMG_H}
              priority
              unoptimized
              className="world-art"
            />

            {/* the artwork already paints a button under each technician */}
            {stage === 0 ? (
              <div className="world-hotspots">
                {TRADE_LIST.map((t) => (
                  <Link
                    key={t.id}
                    href={`/workflow/${t.id}`}
                    className="world-hotspot"
                    aria-label={`Start a ${t.name} job`}
                    style={{
                      left: `${(HOTSPOTS[t.id] - HOTSPOT_W / 2) * 100}%`,
                      width: `${HOTSPOT_W * 100}%`,
                      top: `${HOTSPOT_TOP * 100}%`,
                      height: `${HOTSPOT_HEIGHT * 100}%`,
                    }}
                  >
                    <span>{t.name.toUpperCase()} ↗</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

        </div>
        <div className="scene-narration" aria-live="polite"><div className="page-width"><div><span className="micro-label">{chapter.short.toUpperCase()}</span>{stage === 0 ? <h1>Less paperwork. More time off.</h1> : <h2>{chapter.title}</h2>}</div><p>{chapter.text}</p><span className="scroll-prompt">Scroll to follow the job ↓</span></div></div>
      </div>
    </section>
  );
}
