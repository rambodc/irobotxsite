import QbChemApp from "./QbChemApp";
import { qbChemClient } from "./client";

export default function QbChem() {
  return <QbChemApp client={qbChemClient} />;
}
