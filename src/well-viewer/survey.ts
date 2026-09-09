export type SurveyUnit = "metric" | "imperial";
const legColors = [
  "#42dff5",
  "#ffd166",
  "#ef476f",
  "#8cff98",
  "#b99cff",
  "#ff9f68",
];
export const legColor = (index: number) => legColors[index % legColors.length];

export interface SurveyStation {
  mdM: number;
  inclinationDeg: number;
  azimuthDeg: number;
  tvdM: number;
  northM: number;
  eastM: number;
  status: string;
}

export interface SurveyLeg {
  id: string;
  parentId: string | null;
  name: string;
  stations: SurveyStation[];
  startMdM: number;
  endMdM: number;
}

export interface SurveyFile {
  name: string;
  dossierId: string | null;
  sourceUnit: SurveyUnit;
  importedFileName: string;
  legs: SurveyLeg[];
  warnings: string[];
}

const metresPerFoot = 0.3048;
export function clampLegMd(leg: SurveyLeg, mdM: number) {
  if (!Number.isFinite(mdM)) return leg.startMdM;
  return Math.min(leg.endMdM, Math.max(leg.startMdM, mdM));
}

export function pointAtLegMd(leg: SurveyLeg, mdM: number) {
  const stations = leg.stations,
    depth = clampLegMd(leg, mdM);
  if (!stations.length) return { x: 0, y: 0, z: 0 };
  if (stations.length === 1 || depth <= stations[0].mdM)
    return stationPoint(stations[0]);
  const last = stations.at(-1)!;
  if (depth >= last.mdM) return stationPoint(last);
  let low = 0,
    high = stations.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (stations[middle].mdM <= depth) low = middle;
    else high = middle;
  }
  const before = stations[low],
    after = stations[high],
    span = after.mdM - before.mdM;
  const amount = span > 0 ? (depth - before.mdM) / span : 0;
  const a = stationPoint(before),
    b = stationPoint(after);
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    z: a.z + (b.z - a.z) * amount,
  };
}

export function tangentAtLegMd(leg: SurveyLeg, mdM: number) {
  const span = Math.max(leg.endMdM - leg.startMdM, 0),
    sample = Math.max(span / 1000, 0.25);
  const before = pointAtLegMd(leg, mdM - sample),
    after = pointAtLegMd(leg, mdM + sample);
  const x = after.x - before.x,
    y = after.y - before.y,
    z = after.z - before.z,
    length = Math.hypot(x, y, z);
  return length > 1e-9
    ? { x: x / length, y: y / length, z: z / length }
    : { x: 0, y: -1, z: 0 };
}

export const stationPoint = (station: SurveyStation) => ({
  x: station.eastM,
  y: -station.tvdM,
  z: station.northM,
});
export const metresToSurveyDisplay = (metres: number, imperial: boolean) =>
  imperial ? metres / metresPerFoot : metres;
export const surveyDisplayToMetres = (value: number, imperial: boolean) =>
  imperial ? value * metresPerFoot : value;
