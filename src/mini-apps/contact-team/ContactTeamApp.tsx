import { ContactForm } from "../../App";
import type { Profile } from "../../api";
export default function ContactTeamApp({ profile }: { profile: Profile }) {
  return <ContactForm prefill={profile} />;
}
