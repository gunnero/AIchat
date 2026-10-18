import {
  UsersIcon,
  StackIcon,
  TrayIcon,
  FoldersIcon,
} from "@phosphor-icons/react";
export type AdminTab = "customers" | "projects" | "plans" | "shares";
export const adminTabs = [
  { id: "customers" as const, label: "Kunder", icon: UsersIcon },
  {
    id: "projects" as const,
    label: "Projekter og prompter",
    icon: FoldersIcon,
  },
  { id: "plans" as const, label: "Pakker", icon: StackIcon },
  { id: "shares" as const, label: "Delt med Helle", icon: TrayIcon },
];
