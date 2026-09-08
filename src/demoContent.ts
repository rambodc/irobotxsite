export type DemoAppId =
  | "ai"
  | "wells"
  | "drilling"
  | "production"
  | "invoices"
  | "accounting"
  | "expenses"
  | "tracking"
  | "access";
export type DemoRole = "Manager" | "Staff" | "Contractor";
export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: DemoRole;
  apps: DemoAppId[];
  invited?: boolean;
}
export const demoApps: {
  id: DemoAppId;
  name: string;
  category: string;
  hint: string;
  color: string;
}[] = [
  {
    id: "ai",
    name: "AI Assistant",
    category: "Intelligence",
    color: "violet",
    hint: "Ask more of your operational data. Your own platform could use the AI tools you choose to retrieve information, explain changes, and help your team act. Choose a question to explore a prewritten example.",
  },
  {
    id: "wells",
    name: "Wells",
    category: "Operations",
    color: "blue",
    hint: "Give every well a shared source of context. Select a sample well to bring its status, field activity, and subsurface information together.",
  },
  {
    id: "drilling",
    name: "Drilling",
    category: "Operations",
    color: "cyan",
    hint: "Connect the daily report to the people doing the work. Explore a sample drilling timeline and see how a tailored application could organize progress and handovers.",
  },
  {
    id: "production",
    name: "Production",
    category: "Operations",
    color: "teal",
    hint: "See production in context. Switch wells and periods to explore sample records. A custom platform could bring connected source data into one consistent view.",
  },
  {
    id: "invoices",
    name: "Invoices",
    category: "Finance",
    color: "indigo",
    hint: "Bring service-company invoices closer to operations. Filter these sample invoices and open a record to see the supplier, related well, and work behind the cost.",
  },
  {
    id: "accounting",
    name: "Accounting",
    category: "Finance",
    color: "blue",
    hint: "Connect operational activity with its financial picture. Explore a sample period summary. Your application could integrate your accounting systems and reporting rules.",
  },
  {
    id: "expenses",
    name: "Expenses",
    category: "Finance",
    color: "amber",
    hint: "Make review and accountability part of the same workspace. Open a sample expense; the manager can simulate approving it, while other assigned users can inspect its status.",
  },
  {
    id: "tracking",
    name: "Tracking",
    category: "Coordination",
    color: "cyan",
    hint: "Know who is doing what, and where the work stands. Filter sample field jobs to connect each well with its assigned staff or service partner.",
  },
  {
    id: "access",
    name: "User Access",
    category: "Management",
    color: "violet",
    hint: "You decide who sees which apps. Create a fictional invitation or change a person’s apps, then view their workspace. In a real platform, permissions would be enforced securely on the server.",
  },
];
export const initialUsers: DemoUser[] = [
  {
    id: "manager",
    name: "Alex Morgan",
    email: "alex@northstar.example",
    role: "Manager",
    apps: demoApps.map((a) => a.id),
  },
  {
    id: "staff",
    name: "Jordan Lee",
    email: "jordan@northstar.example",
    role: "Staff",
    apps: ["ai", "wells", "drilling", "production", "expenses", "tracking"],
  },
  {
    id: "contractor",
    name: "Casey Rivers",
    email: "casey@fieldworks.example",
    role: "Contractor",
    apps: ["wells", "tracking"],
  },
];
export const demoCopy = {
  company: "Northstar Energy",
  intro: "Your entire organization. One connected workspace.",
  entryHint:
    "Imagine this is your company’s front door. Your people sign in once, then see the tools you have chosen for them. These details are fictional—just select Sign into demo to explore.",
  launcherHint:
    "One workspace. The right tools for every person. Open an app to explore, or switch the sample perspective to see how access changes. Start with User Access to create your own fictional team member.",
  disclosure:
    "An interactive example of what we could build for you. All companies, people, records, and responses here are fictional. No live systems are connected.",
};
export const sampleWells = [
  {
    id: "cedar",
    name: "Cedar 04-12",
    area: "West lease",
    status: "Producing",
    depth: "2,140 m",
    owner: "Jordan Lee",
    summary:
      "Stable sample production. A routine sensor inspection is scheduled.",
    volumes: [112, 116, 114, 118, 121, 119, 120],
    drilling: [
      "Site preparation complete",
      "Surface casing installed",
      "Lateral completed",
      "Handed over to production",
    ],
    report:
      "Completion records handed over to operations. Routine field inspection is the next activity.",
  },
  {
    id: "aspen",
    name: "Aspen 08-21",
    area: "North lease",
    status: "Drilling",
    depth: "1,860 m",
    owner: "Jordan Lee",
    summary:
      "Drilling in progress. The next sample milestone is casing preparation.",
    volumes: [0, 0, 0, 0, 0, 0, 0],
    drilling: [
      "Site preparation complete",
      "Surface casing installed",
      "Drilling current section",
      "Casing preparation planned",
    ],
    report:
      "Current section at 1,860 m in this fictional report. Crew handover complete; casing preparation remains planned.",
  },
  {
    id: "birch",
    name: "Birch 11-06",
    area: "East lease",
    status: "Producing",
    depth: "2,320 m",
    owner: "Casey Rivers",
    summary: "Producing with a service visit in progress for pump inspection.",
    volumes: [84, 86, 83, 79, 82, 85, 87],
    drilling: [
      "Site preparation complete",
      "Surface casing installed",
      "Completion finished",
      "Handed over to production",
    ],
    report:
      "Drilling phase complete. Service partner is carrying out a scheduled pump inspection.",
  },
];
export const sampleInvoices = [
  {
    id: "INV-1042",
    supplier: "Fieldworks Services",
    well: "Birch 11-06",
    amount: 8400,
    status: "Awaiting review",
    detail: "Pump inspection and field service labour.",
  },
  {
    id: "INV-1041",
    supplier: "Blue Ridge Drilling",
    well: "Aspen 08-21",
    amount: 24500,
    status: "Approved",
    detail: "Drilling crew and equipment for the current section.",
  },
  {
    id: "INV-1040",
    supplier: "Fieldworks Services",
    well: "Cedar 04-12",
    amount: 3200,
    status: "Paid",
    detail: "Routine instrumentation service from the prior period.",
  },
];
export const sampleExpenses = [
  {
    id: "EXP-021",
    person: "Jordan Lee",
    category: "Field travel",
    amount: 286,
    well: "Cedar 04-12",
    detail: "Mileage and accommodation for the field inspection.",
    status: "Pending",
  },
  {
    id: "EXP-022",
    person: "Casey Rivers",
    category: "Supplies",
    amount: 148,
    well: "Birch 11-06",
    detail: "Consumables for the scheduled pump inspection.",
    status: "Pending",
  },
];
export const sampleJobs = [
  {
    id: "JOB-031",
    title: "Sensor inspection",
    well: "Cedar 04-12",
    assignee: "Jordan Lee · Staff",
    status: "Scheduled",
    detail: "Check field sensor readings and attach an inspection summary.",
  },
  {
    id: "JOB-032",
    title: "Pump inspection",
    well: "Birch 11-06",
    assignee: "Casey Rivers · Fieldworks Services",
    status: "In progress",
    detail: "Inspect the pump assembly and document the service findings.",
  },
  {
    id: "JOB-030",
    title: "Crew handover",
    well: "Aspen 08-21",
    assignee: "Jordan Lee · Staff",
    status: "Complete",
    detail:
      "Daily drilling handover recorded; casing preparation is the next planned milestone.",
  },
];
export const samplePeriods = [
  { name: "June · sample", income: 182000, costs: [64000, 28000, 16000] },
  { name: "May · sample", income: 174000, costs: [61000, 26000, 15000] },
];
export const sampleQuestions = [
  {
    question: "What needs our attention across the wells?",
    answer:
      "Aspen 08-21 is drilling, with casing preparation still planned. At Birch 11-06, Fieldworks Services has a pump inspection in progress. Cedar 04-12 has a scheduled sensor inspection. These are the next activities to review with your team.",
    sources: "Sample well records · JOB-030, JOB-031, JOB-032",
  },
  {
    question: "Which service costs are awaiting review?",
    answer:
      "Invoice INV-1042 from Fieldworks Services is awaiting review: CAD 8,400 for the Birch 11-06 pump inspection and field service labour. Review the invoice details alongside the related field job before making a decision.",
    sources: "Sample invoice INV-1042 · Field job JOB-032",
  },
  {
    question: "Summarize production for the last seven days.",
    answer:
      "Cedar 04-12 totals 820 m³ and Birch 11-06 totals 586 m³ in the seven-day sample. Aspen 08-21 records no production because it is drilling. The combined sample total is 1,406 m³. These figures illustrate information retrieval, not a live AI analysis.",
    sources: "Sample production records · Days 01–07",
  },
];
export const fragmentApps: Record<string, DemoAppId> = {
  "#well-visibility": "wells",
  "#connected-operations": "tracking",
  "#ai-workspace": "ai",
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
