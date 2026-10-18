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
  headline: "Technology for the industries of tomorrow.",
  intro:
    "iRobotX can help large organizations adopt advanced technology and management systems, so they can lower costs, reduce errors and grow in new ways.",
  cta: "Start a project",
  secondary: "About iRobotX",
  chapters: [
    {
      id: "robotics",
      name: "Robotics",
      line: "Robotics and AI, powering new industries.",
      copy: "Robotics is set to grow exponentially. We can help your organization adopt it and put it to work.",
    },
    {
      id: "fintech",
      name: "FinTech",
      line: "The future of finance, on the ledger.",
      copy: "Blockchain is reshaping payments and assets. iRobotX has extensive experience with the XRP Ledger and can help you build on it.",
    },
    {
      id: "oil-gas",
      name: "Oil & Gas",
      line: "Productive, connected, in control.",
      copy: "Technology that can help you raise productivity, manage staff and control operations from one place.",
    },
    {
      id: "entertainment",
      name: "Entertainment",
      line: "Shows, organized.",
      copy: "Tools that can help teams organize and run live events more productively.",
    },
  ],
};
type Industry = { id: string; name: string; headline: string; text: string; points?: readonly string[] };
export const about: {
  eyebrow: string;
  headline: string;
  intro: string;
  industries: Industry[];
  approach: { title: string; text: string; steps: { name: string; text: string }[] };
  band: { title: string; text: string };
} = {
  eyebrow: "About iRobotX",
  headline: "Helping organizations adopt the technologies shaping four industries.",
  intro:
    "iRobotX is a technology company based in Calgary. We can help large organizations bring advanced technology and management systems into robotics, FinTech, Oil & Gas and entertainment, to lower costs, reduce errors and grow in new ways.",
  industries: [
    {
      id: "robotics",
      name: "Robotics",
      headline: "Robotics and AI are powering new industries.",
      text: "Robots guided by AI are moving from research labs onto factory floors, into warehouses, job sites and hospitals, and their adoption is set to grow exponentially. We can help your organization find where robotics fits, choose and integrate the right systems, and connect them to the software and people that run your operation.",
      points: ["Find where automation creates value", "Select, integrate and connect robotic systems", "Bring AI into planning, quality and safety"],
    },
    {
      id: "fintech",
      name: "FinTech",
      headline: "The future of finance is being rebuilt on blockchain.",
      text: "Payments, settlement and digital assets are moving to open ledgers that run around the clock. iRobotX has extensive experience with the XRP Ledger, and we can help your organization design, build and integrate financial applications on it and on related blockchain infrastructure.",
      points: ["Applications on the XRP Ledger", "Digital-asset and payment integration", "Automated reconciliation, risk and reporting"],
    },
    {
      id: "oil-gas",
      name: "Oil & Gas",
      headline: "Technology for productive, well-run operations.",
      text: "We can help oil and gas companies bring field, drilling and production data into one connected platform, manage staff and service partners, and use AI to plan and report on the work. The aim is higher productivity, a clear view of operations and tighter control of every site.",
      points: ["Connected well, drilling and production data", "Staff and service-partner management", "Operational control with AI-assisted planning"],
    },
    {
      id: "entertainment",
      name: "Entertainment",
      headline: "Smoother shows, from planning to curtain.",
      text: "We can help organizers plan and run live shows more productively, with tools that keep teams, schedules and venues in step.",
    },
  ],
  approach: {
    title: "How we can work together.",
    text: "Every organization is different, so we start from how yours runs today and shape the technology around your teams, data and existing tools.",
    steps: [
      { name: "Map", text: "We look at how your operation works and where technology can help most." },
      { name: "Build", text: "We design and deliver systems that fit your processes." },
      { name: "Run", text: "We support, monitor and improve them as your needs grow." },
    ],
  },
  band: {
    title: "Ready to explore what’s next?",
    text: "Tell us about your organization and the challenges you want to solve.",
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
  home: "iRobotX helps large organizations adopt advanced technology and management systems in robotics and AI, FinTech and blockchain, Oil & Gas and entertainment.",
  about:
    "iRobotX is a Calgary technology company helping organizations adopt robotics and AI, blockchain finance on the XRP Ledger, connected Oil & Gas operations and entertainment technology.",
  contact:
    "Contact iRobotX to discuss a custom technology or management system for your robotics, FinTech, Oil & Gas or entertainment operation.",
};
export const metadata = {
  "/": {
    title: "iRobotX | Technology for Robotics, FinTech, Oil & Gas and Entertainment",
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
