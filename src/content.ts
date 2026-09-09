export const company = {
  name: "iRobotX",
  email: "info@irobotx.io",
  location: "Calgary, Alberta",
  headline: "AI-powered software for connected Oil & Gas operations.",
  description:
    "We build custom web-based platforms that bring your wells, drilling, production, people, and service companies into one place—with AI built around the way you work.",
};
export const images = {
  oilfield: {
    src: "oilfield",
    alt: "Cinematic blue oilfield with illuminated connections between drilling and production facilities",
  },
  well: {
    src: "well",
    alt: "Illustrative cutaway of a well descending through geological layers into a horizontal reservoir",
  },
  operations: {
    src: "operations",
    alt: "Oilfield facilities and service operations connected by blue pathways across the landscape",
  },
  ai: {
    src: "ai",
    alt: "Conceptual intelligence core connecting well, production, and subsurface information",
  },
  robotics: {
    src: "robotics",
    alt: "Industrial humanoid robot with articulated components in a blue-lit engineering facility",
  },
  fintech: {
    src: "fintech",
    alt: "Conceptual financial institutions connected by luminous blue data channels",
  },
} as const;
export type ImageId = keyof typeof images;
export const home = {
  eyebrow: "Custom platforms. Oil & Gas intelligence.",
  primary: "Discuss your project",
  secondary: "Explore the possibilities",
  strip: [
    "Wells & reservoirs",
    "Drilling & production",
    "People & service partners",
  ],
  operations: {
    eyebrow: "01 / Your operation, connected",
    title: "One view of your entire operation.",
    text: "Your information lives across teams, tools, and companies. We build a shared operational workspace that brings it together—so the people who need context can find it, understand it, and act on it.",
    points: [
      {
        title: "From the well to the office",
        text: "Bring well information, drilling activity, and production context together, with real-time visibility through your connected data sources.",
      },
      {
        title: "Your people. Your partners.",
        text: "Connect staff and the service companies working with you, with access and workflows built around their roles.",
      },
      {
        title: "Connected to what you already use",
        text: "Bring existing systems, third-party tools, and field information into a web-based application designed for your business.",
      },
    ],
  },
  ai: {
    eyebrow: "02 / Intelligence, on your terms",
    title: "AI built around your business.",
    text: "Choose what you want AI to help you do. We integrate the models and tools that fit your needs, connecting them to your data and workflows to build an application that goes beyond graphs and forms.",
    points: [
      "Ask questions about your operations",
      "Understand well and production data",
      "Generate reports and operational updates",
      "Find information across connected systems",
      "Automate the workflows that matter to you",
    ],
    example:
      "What changed across our operations, and what needs our attention?",
    caption:
      "An example of the questions your custom AI workspace could help answer.",
  },
  process: {
    eyebrow: "03 / Designed for your reality",
    title: "Built around the way you work.",
    text: "A useful platform starts with understanding your company. We work with your teams to turn operational complexity into software that makes sense for them.",
    steps: [
      {
        title: "Understand your operation",
        text: "Map the people, systems, information, and everyday challenges that shape your business.",
      },
      {
        title: "Connect what matters",
        text: "Define the data connections, partner access, and AI tools your platform needs.",
      },
      {
        title: "Build, learn, evolve",
        text: "Develop your application with your teams and refine it as your needs grow.",
      },
    ],
  },
  disciplines: {
    eyebrow: "A broader engineering perspective",
    title: "Deep experience. Connected disciplines.",
    text: "Our work in robotics and financial technology brings another dimension to the systems we build.",
  },
};
export const industries = [
  {
    id: "oil-gas",
    number: "01",
    name: "Oil & Gas",
    title: "An operational picture that brings everyone together.",
    text: "We develop custom software for Oil & Gas companies that want a clearer understanding of their operations. Wells, drilling, production, staff, and service partners can share a connected workspace, with access to information tailored to the people using it.",
    detail:
      "Our approach combines operational understanding, integrated data, and AI tools selected around your needs. From interpreting well information to coordinating workflows and generating updates, we build the capabilities that help your company see what is happening and work with that knowledge.",
    tags: [
      "Custom operational platforms",
      "Connected teams & partners",
      "AI integration",
    ],
    image: "well",
  },
  {
    id: "robotics",
    number: "02",
    name: "Robotics",
    title: "Intelligence in the physical world.",
    text: "We have experience developing complex robotics for industrial use, including humanoid robotics. Our work brings software, intelligent behavior, and physical systems together to address demanding engineering challenges.",
    detail:
      "That experience informs how we approach industrial technology: understanding the interaction between machines, people, and the environments in which they work.",
    tags: ["Industrial robotics", "Humanoid experience", "Intelligent systems"],
    image: "robotics",
  },
  {
    id: "fintech",
    number: "03",
    name: "FinTech",
    title: "Financial technology built to connect.",
    text: "We bring extensive experience developing XRP Ledger solutions for large-scale, real-world financial applications. Our experience also includes central bank digital currencies (CBDCs) and interoperability solutions for the banking sector.",
    detail:
      "We apply that background to software that helps financial systems work together, with integrations and workflows designed around the needs of the organizations using them.",
    tags: ["XRP Ledger", "CBDC experience", "Banking interoperability"],
    image: "fintech",
  },
] as const;
export const about = {
  eyebrow: "About iRobotX",
  title: "Technology that understands the operation.",
  intro:
    "We are a Calgary software, robotics, and technology company focused on building custom, AI-enabled platforms for Oil & Gas.",
  eyebrow2: "Oil & Gas at the core",
  heading: "Connected people. Clearer operations.",
  paragraphs: [
    "An Oil & Gas company is an interconnected system of people, assets, information, and service partners. The software supporting it should reflect that reality.",
    "We work with companies to understand how their operations run, connect the information they rely on, and develop web-based applications that help their teams see the bigger picture. AI is a central part of that work, tailored to the tools and capabilities each customer wants to use.",
  ],
};
export const demoPage = {
  intro:
    "Explore an Oil & Gas workspace with AI Chat, a 3D multilateral well, and employee tools.",
};
// Stable app IDs are shared with the private portal and backend assignments.
export const demos = [
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
export const contact = {
  eyebrow: "Let’s build around your business",
  title: "Your operation. Your possibilities.",
  intro:
    "Tell us about your company, the systems you use, and what you want to make possible. Let’s explore a custom platform, AI integration, or an operational challenge together.",
  heading: "Start with what matters to you.",
  text: "From connected Oil & Gas operations to robotics and financial technology, we’d like to understand what you want to build.",
};
export const cta = {
  eyebrow: "Your operation. Our next conversation.",
  title: "What would you like your technology to do?",
  text: "Tell us about your operations and the possibilities you see. We’ll explore how to build them with you.",
  button: "Discuss your project",
};
export const metadata = {
  "/": {
    title: "AI-powered Oil & Gas software | iRobotX",
    description: company.description,
  },
  "/about": {
    title: "About our technology company | iRobotX",
    description: about.intro,
  },
  "/demo": {
    title: "Employee workspace demo | iRobotX",
    description: demoPage.intro,
  },
  "/contact": {
    title: "Discuss your project | iRobotX",
    description: contact.intro,
  },
};
