import { ArrowUpRight } from "lucide-react";
import { about } from "../content";
import { Link } from "../App";
import AccentStage from "./AccentStage";
import "./site.css";

const alts: Record<string, string> = {
  robotics: "Particle rendering of an industrial robot arm welding a part on a work table",
  fintech: "Particle city of rising ledger towers with data streams and a rising trend line",
  "oil-gas": "Particle drilling rig above layered rock strata with oil flowing up the well",
  entertainment: "Particle arena with a lit stage, spotlights, seating tiers and sound-wave rings",
};

export default function AboutPage() {
  return (
    <div className="s-page">
      <section className="s-hero" aria-labelledby="about-title">
        <AccentStage variant="core" className="s-hero-accent" />
        <div className="s-hero-copy">
          <span className="s-eyebrow">{about.eyebrow}</span>
          <h1 id="about-title">{about.headline}</h1>
          <p className="s-lead">{about.intro}</p>
          <div className="s-actions">
            <Link to="/contact" className="s-cta">
              Start a project <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <a href="#robotics" className="s-link">
              Explore the industries
            </a>
          </div>
        </div>
        <ul className="s-promise">
          {about.promise.map((p) => (
            <li key={p.value}>
              <strong>{p.value}</strong>
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {about.industries.map((ind, i) => (
        <section key={ind.id} id={ind.id} className="s-industry" aria-labelledby={`${ind.id}-title`}>
          <figure className="s-visual">
            <picture>
              <source
                type="image/webp"
                srcSet={`/images/industry-${ind.id}-480.webp 480w, /images/industry-${ind.id}-960.webp 960w`}
                sizes="(max-width: 820px) 100vw, 50vw"
              />
              <img
                src={`/images/industry-${ind.id}-960.webp`}
                alt={alts[ind.id]}
                width={960}
                height={600}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </figure>
          <div className="s-text">
            <span className="s-index">0{i + 1}</span>
            <h2 id={`${ind.id}-title`}>{ind.name}</h2>
            <p className="s-line">{ind.headline}</p>
            <p>{ind.text}</p>
            <ul>
              {ind.points.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="s-approach" aria-labelledby="approach-title">
        <h2 id="approach-title">{about.approach.title}</h2>
        <p className="s-lead">{about.approach.text}</p>
        <ol>
          {about.approach.steps.map((st, i) => (
            <li key={st.name}>
              <span className="s-index">0{i + 1}</span>
              <h3>{st.name}</h3>
              <p>{st.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="s-band" aria-labelledby="band-title">
        <h2 id="band-title">Ready to build what’s next?</h2>
        <p>Tell us about your operation. We’ll show you where a single system can save cost, remove errors and open growth.</p>
        <Link to="/contact" className="s-cta">
          Start a project <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
