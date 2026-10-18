import { contact } from "../content";
import { ContactForm, Link } from "../App";
import AccentStage from "./AccentStage";
import "./site.css";

export default function ContactPage() {
  return (
    <div className="s-page c-page">
      <section className="c-hero" aria-labelledby="contact-title">
        <AccentStage variant="beacon" className="c-accent" />
        <div className="c-grid">
          <div className="c-intro">
            <span className="s-eyebrow">{contact.eyebrow}</span>
            <h1 id="contact-title">{contact.headline}</h1>
            <p className="s-lead">{contact.intro}</p>
            <dl className="c-details">
              {contact.details.map((d) => (
                <div key={d.label}>
                  <dt>{d.label}</dt>
                  <dd>{d.href ? <a href={d.href}>{d.value}</a> : d.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ContactForm variant="site" />
        </div>
      </section>
      <p className="c-signin">
        Existing client? <Link to="/signin">Client sign-in</Link>
      </p>
    </div>
  );
}
