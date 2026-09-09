import type { SurveyFile } from "./survey";
export interface BitRun {
  id: string;
  bitNo: string;
  sizeMm: number;
  manufacturer: string;
  bitType: string;
  serialNo: string;
  depthInM: number;
  depthOutM: number | null;
}
export interface HoleSection {
  id: string;
  legId: string;
  startMdM: number;
  endMdM: number;
  diameterMm: number;
  bit: BitRun | null;
}
export interface CasingString {
  id: string;
  category: string;
  outsideDiameterMm: number;
  insideDiameterMm: number;
  topMdM: number;
  bottomMdM: number;
  grade: string;
}
export type OperationalChannelId =
  | "torque"
  | "rotary"
  | "rop"
  | "gas"
  | "standpipePressure"
  | "differentialPressure"
  | "pumpOutput"
  | "hookLoad"
  | "gamma";
export interface OperationalChannel {
  id: OperationalChannelId;
  label: string;
  unit: string;
}
export type OperationalDetail = "detailed" | "balanced" | "compact";
export interface OperationalValueBucket {
  count: number;
  sum: number;
  minimum: number;
  maximum: number;
  latest: number;
}
export interface OperationalDepthBucket {
  bandStartM: number;
  bitDepthM: number;
  holeDepthM: number;
  sampleCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  values: Partial<Record<OperationalChannelId, OperationalValueBucket>>;
}
export interface OperationalImportMetadata {
  sourceRows: number;
  validObservations: number;
  depthBandCount: number;
  depthResolutionM: number;
  csvSizeBytes: number;
}
export interface OperationalStatistic {
  channel: OperationalChannel;
  count: number;
  minimum: number;
  average: number;
  maximum: number;
  latest: number;
}
export interface OperationalSummary {
  radiusM: number;
  sampleCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  ambiguousLeg: boolean;
  statistics: OperationalStatistic[];
}
export interface WellModel extends SurveyFile {
  packageName: string;
  etsFileName: string;
  csvFileName: string;
  bitRuns: BitRun[];
  holeSections: Record<string, HoleSection[]>;
  casings: CasingString[];
  operationalChannels: OperationalChannel[];
  operationalBuckets: OperationalDepthBucket[];
  operationalImport: OperationalImportMetadata;
}
export const holeAtMd = (well: WellModel, legId: string, mdM: number) => {
  const sections = well.holeSections[legId] ?? [];
  return (
    sections.find(
      (section, index) =>
        mdM >= section.startMdM &&
        (mdM < section.endMdM || index === sections.length - 1),
    ) ?? null
  );
};
export const casingsAtMd = (well: WellModel, mdM: number) =>
  well.casings.filter(
    (casing) => mdM >= casing.topMdM && mdM <= casing.bottomMdM,
  );
export function summarizeOperations(
  well: WellModel,
  mdM: number,
  radiusM = 2,
): OperationalSummary | null {
  const nearby = well.operationalBuckets.filter(
    (sample) =>
      sample.bandStartM <= mdM + radiusM &&
      sample.bandStartM + well.operationalImport.depthResolutionM >=
        mdM - radiusM,
  );
  if (!nearby.length) return null;
  const statistics = well.operationalChannels.flatMap((channel) => {
    const values = nearby.flatMap((bucket) =>
      bucket.values[channel.id] ? [bucket.values[channel.id]!] : [],
    );
    if (!values.length) return [];
    const count = values.reduce((sum, value) => sum + value.count, 0);
    return [
      {
        channel,
        count,
        minimum: Math.min(...values.map((value) => value.minimum)),
        average: values.reduce((sum, value) => sum + value.sum, 0) / count,
        maximum: Math.max(...values.map((value) => value.maximum)),
        latest: values.at(-1)!.latest,
      },
    ];
  });
  return {
    radiusM,
    sampleCount: nearby.reduce((sum, bucket) => sum + bucket.sampleCount, 0),
    firstTimestamp: nearby[0].firstTimestamp,
    lastTimestamp: nearby.at(-1)!.lastTimestamp,
    ambiguousLeg:
      well.legs.filter((leg) => mdM >= leg.startMdM && mdM <= leg.endMdM)
        .length > 1,
    statistics,
  };
}
