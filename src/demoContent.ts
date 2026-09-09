export type AppId =
  "profile" | "company" | "employees" | "chat" | "lsd" | "well";
export type Action = "view" | "edit" | "create" | "manage" | "use";
export type Permissions = Record<AppId, Partial<Record<Action, boolean>>>;
export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  department: string;
  phone: string;
  location: string;
  photo: string;
  status: "Active" | "Inactive";
  permissions: Permissions;
}
export interface Company {
  name: string;
  industry: string;
  description: string;
  email: string;
  phone: string;
  location: string;
  website: string;
}
export const apps: {
  id: AppId;
  name: string;
  actions: { id: Action; label: string }[];
}[] = [
  {
    id: "profile",
    name: "Profile",
    actions: [{ id: "edit", label: "Edit own profile" }],
  },
  {
    id: "company",
    name: "Company",
    actions: [{ id: "edit", label: "Edit company details" }],
  },
  {
    id: "employees",
    name: "Employees",
    actions: [
      { id: "create", label: "Add employees" },
      { id: "edit", label: "Edit employee details" },
      { id: "manage", label: "Manage app access" },
    ],
  },
  {
    id: "chat",
    name: "AI Chat",
    actions: [{ id: "use", label: "Send messages" }],
  },
  {
    id: "lsd",
    name: "LSD Finder",
    actions: [{ id: "use", label: "Research wells and read photos" }],
  },
  { id: "well", name: "Well Viewer", actions: [] },
];
export const fullPermissions: Permissions = {
  chat: { view: true, use: true },
  lsd: { view: true, use: true },
  well: { view: true },
  profile: { view: true, edit: true },
  company: { view: true, edit: true },
  employees: { view: true, create: true, edit: true, manage: true },
};
export const defaultPermissions: Permissions = {
  chat: { view: false },
  lsd: { view: false },
  well: { view: false },
  profile: { view: true, edit: true },
  company: { view: true },
  employees: { view: false },
};
export const initialCompany: Company = {
  name: "PulseCrest Energy Inc.",
  industry: "Oil & Gas",
  description:
    "An independent energy company connecting field operations, people, and technology from our Calgary office.",
  email: "hello@pulsecrest.example",
  phone: "+1 (403) 555-0100",
  location: "Downtown Calgary, Alberta",
  website: "pulsecrest.example",
};
export const initialEmployees: Employee[] = [
  {
    id: "john",
    firstName: "John",
    lastName: "Miller",
    email: "john.miller@pulsecrest.example",
    title: "Operations Director",
    department: "Operations",
    phone: "+1 (403) 555-0101",
    location: "Calgary · Head office",
    photo: "/images/people/john-miller.webp",
    status: "Active",
    permissions: fullPermissions,
  },
  {
    id: "sarah",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@pulsecrest.example",
    title: "Production Engineer",
    department: "Engineering",
    phone: "+1 (403) 555-0102",
    location: "Calgary · Head office",
    photo: "",
    status: "Active",
    permissions: { ...defaultPermissions, employees: { view: true } },
  },
  {
    id: "daniel",
    firstName: "Daniel",
    lastName: "Brooks",
    email: "daniel.brooks@pulsecrest.example",
    title: "Field Supervisor",
    department: "Field Operations",
    phone: "+1 (403) 555-0103",
    location: "Calgary · Field office",
    photo: "",
    status: "Active",
    permissions: defaultPermissions,
  },
  {
    id: "emma",
    firstName: "Emma",
    lastName: "Wilson",
    email: "emma.wilson@pulsecrest.example",
    title: "People Coordinator",
    department: "People & Culture",
    phone: "+1 (403) 555-0104",
    location: "Calgary · Head office",
    photo: "",
    status: "Active",
    permissions: {
      ...defaultPermissions,
      employees: { view: true, create: true, edit: true },
    },
  },
];
export const nameOf = (employee: Employee) =>
  `${employee.firstName} ${employee.lastName}`;
export function allowed(
  employee: Employee,
  app: AppId,
  action: Action = "view",
) {
  return (
    employee.status === "Active" &&
    !!employee.permissions[app].view &&
    (action === "view" || !!employee.permissions[app][action])
  );
}
export function withPermission(
  permissions: Permissions,
  app: AppId,
  action: Action,
  checked: boolean,
): Permissions {
  const next = structuredClone(permissions);
  if (action === "view")
    next[app] = checked ? { ...next[app], view: true } : { view: false };
  else if (next[app].view) next[app][action] = checked;
  return next;
}
export const blankEmployee = (): Employee => ({
  id: "",
  firstName: "",
  lastName: "",
  email: "",
  title: "",
  department: "",
  phone: "",
  location: "Calgary · Head office",
  photo: "",
  status: "Active",
  permissions: structuredClone(defaultPermissions),
});
export const mapUrl =
  "https://www.openstreetmap.org/export/embed.html?bbox=-114.079%2C51.041%2C-114.057%2C51.052&layer=mapnik&marker=51.0465%2C-114.068";
export const mapLink =
  "https://www.openstreetmap.org/?mlat=51.0465&mlon=-114.068#map=16/51.0465/-114.068";
