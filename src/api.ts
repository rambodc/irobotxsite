import { httpsCallable } from "firebase/functions";
import { functions } from "./firebaseClient";
export type AppId = "oil-gas" | "robotics" | "fintech";
export interface Profile {
  uid: string;
  email: string;
  name: string;
  company: string;
  role: "admin" | "member";
  status: "invited" | "active" | "disabled";
  apps: AppId[];
  invitationDelivery?: "sent" | "failed" | "pending";
}
export interface ContactInput {
  name: string;
  email: string;
  company: string;
  industry: string;
  message: string;
  website: string;
  requestId: string;
}
export type Delivery = { delivery: "sent" | "failed" | "pending"; id?: string };
const call = async <I, O>(name: string, input: I) =>
  (await httpsCallable<I, O>(functions, name)(input)).data;
export const api = {
  profile: () => call<Record<string, never>, Profile>("getProfile", {}),
  updateProfile: (data: { name: string; company: string }) =>
    call<typeof data, Profile>("updateProfile", data),
  listUsers: () => call<Record<string, never>, Profile[]>("listUsers", {}),
  invite: (data: { email: string; name: string; apps: AppId[] }) =>
    call<typeof data, Delivery>("inviteUser", data),
  resend: (uid: string) =>
    call<{ uid: string }, Delivery>("resendInvitation", { uid }),
  updateUser: (data: {
    uid: string;
    status: "active" | "disabled";
    apps: AppId[];
  }) => call<typeof data, Profile>("updateUser", data),
  contact: (data: ContactInput) =>
    call<ContactInput, Delivery>("submitContact", data),
  reset: (email: string) =>
    call<{ email: string }, { ok: boolean }>("requestPasswordReset", { email }),
};
export function errorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  if (/invalid-credential|wrong-password|user-not-found/.test(code))
    return "The email or password is incorrect.";
  if (/expired-action-code|invalid-action-code/.test(code))
    return "This link has expired or has already been used. Request a new link.";
  if (/permission-denied|user-disabled/.test(code))
    return "Your account does not have access. Please contact the iRobotX team.";
  if (/resource-exhausted|too-many-requests/.test(code))
    return "Too many attempts. Please wait a few minutes and try again.";
  if (/unauthenticated/.test(code)) return "Please sign in again to continue.";
  if (/already-exists/.test(code))
    return "This user already has an account. Manage them in the user list.";
  if (/invalid-argument|weak-password/.test(code))
    return "Please check your details. Passwords must contain at least 12 characters.";
  if (/failed-precondition/.test(code))
    return "This action is unavailable for the account’s current state. The last active administrator must remain enabled.";
  return "We could not complete that request. Please try again.";
}
