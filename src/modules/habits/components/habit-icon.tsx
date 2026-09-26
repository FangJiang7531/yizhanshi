"use client";

import {
  Flame, Dumbbell, BookOpen, Droplets, Moon, Sun, HeartPulse, Footprints,
  Apple, Bike, PenLine, Music, Brush, Bed, Coffee, Brain, Laptop,
  PiggyBank, Sprout, Target, Timer, Users, Languages, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { HABIT_ICONS, type HabitIcon } from "../schemas";

const ICON_MAP: Record<HabitIcon, LucideIcon> = {
  flame: Flame,
  dumbbell: Dumbbell,
  "book-open": BookOpen,
  droplets: Droplets,
  moon: Moon,
  sun: Sun,
  "heart-pulse": HeartPulse,
  footprints: Footprints,
  apple: Apple,
  bike: Bike,
  "pen-line": PenLine,
  music: Music,
  brush: Brush,
  bed: Bed,
  coffee: Coffee,
  brain: Brain,
  laptop: Laptop,
  "piggy-bank": PiggyBank,
  sprout: Sprout,
  target: Target,
  timer: Timer,
  users: Users,
  languages: Languages,
  "check-circle": CheckCircle2,
};

export function isHabitIcon(v: string): v is HabitIcon {
  return (HABIT_ICONS as readonly string[]).includes(v);
}

/** 图标渲染在习惯色的浅色底圆角方块内（PRD §5.2.2） */
export function HabitIconView({
  icon,
  color,
  size = 20,
  bgSize = 40,
}: {
  icon: string;
  color: string;
  size?: number;
  bgSize?: number;
}) {
  const Icon = ICON_MAP[isHabitIcon(icon) ? icon : "flame"];
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[var(--radius)]"
      style={{
        width: bgSize,
        height: bgSize,
        backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
      }}
      aria-hidden
    >
      <Icon size={size} />
    </span>
  );
}
