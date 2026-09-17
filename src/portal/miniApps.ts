import {
  ChartCandlestick,
  UserRound,
  UsersRound,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import type { Profile } from "../api";
export type MiniAppId = "account" | "contact-team" | "user-access" | "trading";
export interface MiniApp {
  id: MiniAppId;
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  access: "member" | "admin" | "owner";
}
export const MINI_APPS: MiniApp[] = [
  {
    id: "trading",
    label: "XRP Trading",
    description: "Test real XRPL transactions with a dedicated Testnet wallet.",
    path: "/portal/trading",
    icon: ChartCandlestick,
    access: "owner",
  },
  {
    id: "account",
    label: "Account",
    description: "Your profile, company details, and account security.",
    path: "/portal/account",
    icon: UserRound,
    access: "member",
  },
  {
    id: "contact-team",
    label: "Contact Team",
    description: "Start a conversation with the iRobotX team.",
    path: "/portal/contact",
    icon: MessagesSquare,
    access: "member",
  },
  {
    id: "user-access",
    label: "User Access",
    description: "Invite your team and manage workspace access.",
    path: "/portal/admin",
    icon: UsersRound,
    access: "admin",
  },
];
export function canOpenApp(profile: Profile, id: MiniAppId) {
  if (!["active", "invited"].includes(profile.status)) return false;
  const app = MINI_APPS.find((a) => a.id === id);
  if (!app) return false;
  if (app.access === "owner")
    return (
      profile.status === "active" && profile.miniApps?.includes(id) === true
    );
  if (app.access === "admin")
    return profile.status === "active" && profile.role === "admin";
  return true;
}
export const visibleMiniApps = (profile: Profile) =>
  MINI_APPS.filter((app) => canOpenApp(profile, app.id));
