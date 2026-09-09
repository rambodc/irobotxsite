import type { SurveyLeg, SurveyStation } from "./survey";
import type { WellModel, OperationalDepthBucket } from "./well-package";
// Fixed fictional metric geometry. Each lateral begins at an actual main-bore station.
export function sampleWell(): WellModel {
  const stations: SurveyStation[] = [];
  const add = (
    mdM: number,
    tvdM: number,
    northM: number,
    eastM: number,
    inclinationDeg: number,
    azimuthDeg = 0,
  ) =>
    stations.push({
      mdM,
      tvdM,
      northM,
      eastM,
      inclinationDeg,
      azimuthDeg,
      status: "Illustrative",
    });
  for (let md = 0; md <= 1400; md += 25) add(md, md, 0, 0, 0);
  const radius = 300,
    curveEnd = 1400 + (radius * Math.PI) / 2;
  for (let i = 1; i <= 24; i++) {
    const angle = ((i / 24) * Math.PI) / 2;
    add(
      1400 + radius * angle,
      1400 + radius * Math.sin(angle),
      radius * (1 - Math.cos(angle)),
      0,
      (angle * 180) / Math.PI,
    );
  }
  for (let distance = 25; distance <= 800; distance += 25)
    add(curveEnd + distance, 1700, 300 + distance, 0, 90);
  const legs: SurveyLeg[] = [
    {
      id: "main",
      name: "Main bore",
      parentId: null,
      stations,
      startMdM: 0,
      endMdM: stations.at(-1)!.mdM,
    },
  ];
  [-65, 55, -35].forEach((angle, index) => {
    const start = stations.find(
      (s) => Math.abs(s.mdM - (curveEnd + index * 200)) < 0.01,
    )!;
    const branch: SurveyStation[] = [{ ...start }];
    for (let distance = 25; distance <= 1000 + index * 150; distance += 25) {
      const previous = branch.at(-1)!,
        azimuth = angle * Math.min(1, distance / 300),
        mid =
          (((azimuth + angle * Math.min(1, (distance - 25) / 300)) / 2) *
            Math.PI) /
          180;
      branch.push({
        ...previous,
        mdM: start.mdM + distance,
        northM: previous.northM + 25 * Math.cos(mid),
        eastM: previous.eastM + 25 * Math.sin(mid),
        azimuthDeg: (azimuth + 360) % 360,
      });
    }
    legs.push({
      id: `lateral-${index + 1}`,
      name: `Lateral ${index + 1}`,
      parentId: "main",
      stations: branch,
      startMdM: start.mdM,
      endMdM: branch.at(-1)!.mdM,
    });
  });
  const operationalBuckets: OperationalDepthBucket[] = [];
  for (let md = 0; md <= Math.max(...legs.map((l) => l.endMdM)); md += 10) {
    const rop = 18 + 5 * Math.sin(md / 170),
      torque = 9 + 3 * Math.cos(md / 220);
    const value = (n: number) => ({
      count: 4,
      sum: n * 4,
      minimum: n * 0.9,
      maximum: n * 1.1,
      latest: n,
    });
    operationalBuckets.push({
      bandStartM: md,
      bitDepthM: md,
      holeDepthM: md,
      sampleCount: 4,
      firstTimestamp: "Sample day",
      lastTimestamp: "Sample day",
      values: { rop: value(rop), torque: value(torque) },
    });
  }
  return {
    name: "PulseCrest · Horizon 01",
    dossierId: null,
    sourceUnit: "metric",
    importedFileName: "",
    packageName: "",
    etsFileName: "",
    csvFileName: "",
    warnings: [],
    legs,
    bitRuns: [],
    holeSections: Object.fromEntries(
      legs.map((leg) => [
        leg.id,
        leg.id === "main"
          ? [
              {
                id: "surface",
                legId: leg.id,
                startMdM: 0,
                endMdM: 500,
                diameterMm: 444.5,
                bit: null,
              },
              {
                id: "intermediate",
                legId: leg.id,
                startMdM: 500,
                endMdM: 1500,
                diameterMm: 311.2,
                bit: null,
              },
              {
                id: "main-open",
                legId: leg.id,
                startMdM: 1500,
                endMdM: leg.endMdM,
                diameterMm: 216,
                bit: null,
              },
            ]
          : [
              {
                id: `${leg.id}-open`,
                legId: leg.id,
                startMdM: leg.startMdM,
                endMdM: leg.endMdM,
                diameterMm: 159,
                bit: null,
              },
            ],
      ]),
    ),
    casings: [
      {
        id: "surface-casing",
        category: "Surface",
        outsideDiameterMm: 339,
        insideDiameterMm: 315,
        topMdM: 0,
        bottomMdM: 450,
        grade: "Sample",
      },
      {
        id: "intermediate-casing",
        category: "Intermediate",
        outsideDiameterMm: 244,
        insideDiameterMm: 220,
        topMdM: 0,
        bottomMdM: 1450,
        grade: "Sample",
      },
    ],
    operationalChannels: [
      { id: "rop", label: "Rate of penetration", unit: "m/h" },
      { id: "torque", label: "Top drive torque", unit: "kN·m" },
    ],
    operationalBuckets,
    operationalImport: {
      sourceRows: operationalBuckets.length * 4,
      validObservations: operationalBuckets.length * 4,
      depthBandCount: operationalBuckets.length,
      depthResolutionM: 10,
      csvSizeBytes: 0,
    },
  };
}
