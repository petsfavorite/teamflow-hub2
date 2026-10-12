import { Badge } from "@/components/ui/badge";
import { PawPrint, Stethoscope, Layers, MinusCircle } from "lucide-react";

const TOPIC_CONFIG = {
  kennel: { label: "Kennel", icon: PawPrint, className: "bg-lime-100 text-lime-700" },
  veterinary: { label: "Veterinary", icon: Stethoscope, className: "bg-sky-100 text-sky-700" },
  both: { label: "Kennel + Vet", icon: Layers, className: "bg-violet-100 text-violet-700" },
  neither: { label: "Neither", icon: MinusCircle, className: "bg-slate-100 text-slate-500" },
};

export default function CallTopicBadge({ topic }) {
  if (!topic) return null;
  const cfg = TOPIC_CONFIG[topic];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.className} gap-1 font-medium`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

export { TOPIC_CONFIG };