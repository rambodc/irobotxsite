// Public copy for the website. Edit text here; layout lives in src/home3d and src/site.
export const company = {
  name: "iRobotX",
  legalName: "iRobotX",
  email: "info@irobotx.io",
  location: "Calgary, Alberta",
  country: "Canada",
  url: "https://irobotx.io",
};
// Stable app IDs are shared with the private portal and backend assignments.
export const portalApps = [
  {
    id: "oil-gas",
    name: "Field intelligence",
    category: "Oil & Gas",
    text: "A future workspace for connected wells, operations, teams, and AI-enabled insights.",
  },
  {
    id: "robotics",
    name: "Robotics workspace",
    category: "Robotics",
    text: "Future demonstrations exploring industrial robotics and intelligent physical systems.",
  },
  {
    id: "fintech",
    name: "Financial systems",
    category: "FinTech",
    text: "Future demonstrations of connected financial applications and interoperability.",
  },
] as const;
export const experience = {
  eyebrow: "iRobotX · One system, every industry",
  headline: "We build the systems that run tomorrow’s industries.",
  intro:
    "iRobotX brings advanced technology and management systems to the world’s largest operators, so they spend less, make fewer errors, and grow in directions they couldn’t before.",
  cta: "Start a project",
  secondary: "About iRobotX",
  outcomes: ["Lower operating cost", "Fewer errors", "New growth"],
  chapters: [
    {
      id: "robotics",
      name: "Robotics",
      line: "Automation that works the line, shift after shift.",
      copy: "Industrial robots and automation cells coordinated by one control system, taking on precise, repetitive and high-risk work to cut labour costs and defects.",
    },
    {
      id: "fintech",
      name: "FinTech",
      line: "Every transaction, reconciled in real time.",
      copy: "Ledger, payment and risk systems that close the books faster, remove manual errors and open new revenue lines.",
    },
    {
      id: "oil-gas",
      name: "Oil & Gas",
      line: "From the rig floor to the reservoir, one view.",
      copy: "Drilling, production and field crews on one platform, cutting non-productive time and costly mistakes.",
    },
    {
      id: "entertainment",
      name: "Entertainment",
      line: "Live experiences, run at stadium scale.",
      copy: "Ticketing, crowd and show-control systems that keep every event on cue and turn each audience into new growth.",
    },
  ],
};
export const about = {
  eyebrow: "About iRobotX",
  headline: "We build the future across four industries.",
  intro:
    "iRobotX is a technology company that brings advanced technology and management systems to large corporations. We design, build and run the platforms that streamline how big operations work, so our clients cut costs and errors and grow in new ways.",
  promise: [
    { value: "Lower cost", text: "Automate the repetitive and remove duplicated systems so every dollar does more." },
    { value: "Fewer errors", text: "One source of truth and machine-checked workflows replace manual handoffs." },
    { value: "New growth", text: "Data and automation open products, services and markets that were out of reach." },
  ],
  industries: [
    {
      id: "robotics",
      name: "Robotics",
      headline: "Industrial robots and automation, orchestrated.",
      text: "We integrate robotic arms, automation cells and the software that coordinates them, from vision-guided picking to welding and inspection. One control layer schedules the work, tracks quality and reports to the business, so production runs faster with fewer defects and less risk to people.",
      points: ["Robot cell integration and control software", "Quality tracking and predictive maintenance", "Safety-first automation of high-risk tasks"],
    },
    {
      id: "fintech",
      name: "FinTech",
      headline: "Financial systems that reconcile themselves.",
      text: "We build ledgers, payment flows, digital-asset and risk platforms that keep every transaction accounted for in real time. Automated reconciliation and controls close the books faster, remove manual errors and give finance teams room to launch new products.",
      points: ["Real-time ledgers and reconciliation", "Payments and digital-asset infrastructure", "Risk, compliance and reporting automation"],
    },
    {
      id: "oil-gas",
      name: "Oil & Gas",
      headline: "From the rig floor to the reservoir, one platform.",
      text: "We connect wells, drilling, production, field crews and service partners in one operating platform with AI built around the way each company works. Teams see the same live picture, act sooner and avoid the costly mistakes that come from disconnected spreadsheets and systems.",
      points: ["Connected well, drilling and production data", "Field workforce and service-partner coordination", "AI assistance for planning and reporting"],
    },
    {
      id: "entertainment",
      name: "Entertainment",
      headline: "Live experiences, run at stadium scale.",
      text: "We build ticketing, crowd-flow and show-control systems for venues and live productions. One system keeps entry, staff, stage technology and audience data in sync, so every event runs on cue and each audience becomes a source of new growth.",
      points: ["Ticketing and access control", "Crowd, staff and venue operations", "Show control and audience insight"],
    },
  ],
  approach: {
    title: "One system, every industry.",
    text: "The same iRobotX core powers each platform we build: secure data foundations, automation and AI that fit your management processes rather than replacing them.",
    steps: [
      { name: "Map", text: "We study how your operation really runs and where cost and errors hide." },
      { name: "Build", text: "We design and deliver the system around your teams, data and existing tools." },
      { name: "Run", text: "We operate, monitor and improve it with you as the business grows." },
    ],
  },
};
export const contact = {
  eyebrow: "Contact iRobotX",
  headline: "Tell us what you want to build.",
  intro:
    "Share the operation, the challenge or the idea. Our team replies within one business day to explore how a custom system could cut your costs and errors and open new growth.",
  details: [
    { label: "Email", value: "info@irobotx.io", href: "mailto:info@irobotx.io" },
    { label: "Based in", value: "Calgary, Alberta, Canada" },
    { label: "Industries", value: "Robotics · FinTech · Oil & Gas · Entertainment" },
  ],
};
const description = {
  home: "iRobotX builds advanced technology and management systems for large enterprises in robotics, FinTech, Oil & Gas and entertainment, cutting costs and errors and unlocking new growth.",
  about:
    "iRobotX is a Calgary technology company building advanced technology and management systems for large corporations in robotics, FinTech, Oil & Gas and entertainment.",
  contact:
    "Contact iRobotX to discuss a custom technology or management system for your robotics, FinTech, Oil & Gas or entertainment operation.",
};
export const metadata = {
  "/": {
    title: "iRobotX | Systems for Robotics, FinTech, Oil & Gas and Entertainment",
    description: description.home,
  },
  "/about": {
    title: "About iRobotX | Technology for Robotics, FinTech, Oil & Gas and Entertainment",
    description: description.about,
  },
  "/contact": {
    title: "Contact iRobotX | Start a Project",
    description: description.contact,
  },
};
