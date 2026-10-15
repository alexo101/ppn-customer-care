import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SidebarToggle({
  collapsed,
  onToggle,
  label,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  const action = collapsed ? "Expand" : "Collapse";
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8 shrink-0", className)}
      onClick={onToggle}
      title={`${action} ${label}`}
      aria-label={`${action} ${label}`}
      aria-expanded={!collapsed}
    >
      <Icon className="w-4 h-4" />
    </Button>
  );
}
