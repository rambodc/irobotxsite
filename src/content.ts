export const company = {
  name: "iRobotX",
  email: "info@irobotx.io",
  location: "Calgary, Alberta",
  headline: "Intelligence built for the field.",
  description:
    "We develop software, automation, and intelligent systems for Oil & Gas. Connecting complex operations with technology that moves them forward.",
};
export const industries = [
  {
    id: "oil-gas",
    number: "01",
    name: "Oil & Gas",
    title: "From field complexity to operational clarity.",
    text: "Bringing software, connected data, and automation to the challenges of industrial operations.",
    tags: ["Industrial software", "Operational intelligence", "Automation"],
    icon: "oil",
  },
  {
    id: "robotics",
    number: "02",
    name: "Robotics",
    title: "Intelligence beyond the screen.",
    text: "Exploring perception, control, and the connection between digital intelligence and physical systems.",
    tags: ["Intelligent systems", "Perception", "Control"],
    icon: "robot",
  },
  {
    id: "fintech",
    number: "03",
    name: "FinTech",
    title: "Engineering a more connected financial world.",
    text: "Developing digital platforms and software foundations for evolving financial workflows.",
    tags: ["Digital platforms", "Connected workflows", "Software"],
    icon: "finance",
  },
] as const;
export const demos = [
  {
    id: "oil-gas",
    name: "Field intelligence",
    category: "Oil & Gas",
    text: "A conceptual workspace for connecting industrial assets and operational information.",
  },
  {
    id: "robotics",
    name: "Robotics workspace",
    category: "Robotics",
    text: "A future home for experiments in perception, automation, and intelligent machines.",
  },
  {
    id: "fintech",
    name: "Financial systems",
    category: "FinTech",
    text: "A future workspace for exploring connected financial technology.",
  },
] as const;
