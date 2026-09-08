export const APP_IDS = ["oil-gas", "robotics", "fintech"];
export function text(value, max, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error("invalid-argument");
  return value.trim();
}
export function email(value) {
  const v = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    throw new Error("invalid-argument");
  return v;
}
export function apps(value) {
  if (
    !Array.isArray(value) ||
    value.length > 3 ||
    value.some((v) => !APP_IDS.includes(v))
  )
    throw new Error("invalid-argument");
  return [...new Set(value)];
}
export function assertAccess(profile, admin = false) {
  if (
    !profile ||
    !["active", "invited"].includes(profile.status) ||
    (admin && (profile.role !== "admin" || profile.status !== "active"))
  )
    throw new Error("permission-denied");
}
export function assertLastAdmin(target, nextStatus, activeAdmins) {
  if (
    target.role === "admin" &&
    target.status === "active" &&
    nextStatus !== "active" &&
    activeAdmins <= 1
  )
    throw new Error("failed-precondition");
}
export function publicProfile(uid, p) {
  return {
    uid,
    email: p.email,
    name: p.name || "",
    company: p.company || "",
    role: p.role,
    status: p.status,
    apps: p.apps || [],
    ...(p.invitationDelivery
      ? { invitationDelivery: p.invitationDelivery }
      : {}),
  };
}
export function contactInput(data) {
  const industry = text(data.industry, 40);
  if (
    !["Oil & Gas", "Robotics", "FinTech", "General enquiry"].includes(industry)
  )
    throw new Error("invalid-argument");
  const message = text(data.message, 5000);
  if (message.length < 10) throw new Error("invalid-argument");
  if (!/^[a-f0-9-]{36}$/i.test(data.requestId || ""))
    throw new Error("invalid-argument");
  return {
    name: text(data.name, 100),
    email: email(data.email),
    company: text(data.company || "", 120, false),
    industry,
    message,
  };
}
