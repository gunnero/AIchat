import { UsersIcon, StackIcon, TrayIcon } from "@phosphor-icons/react";
export type AdminTab = "customers" | "plans" | "shares";
export const adminTabs = [
  { id: "customers" as const, label: "Kunder", icon: UsersIcon },
  { id: "plans" as const, label: "Pakker", icon: StackIcon },
  { id: "shares" as const, label: "Delt med Helle", icon: TrayIcon },
];
