import React from "react";
import {
  Bell,
  Copy,
  Camera,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Eye,
  Flag,
  Forward,
  Gamepad2,
  Gift,
  GraduationCap,
  Hash,
  Headphones,
  Inbox,
  LayoutGrid,
  Languages,
  Maximize2,
  MessageSquare,
  MessagesSquare,
  Mic,
  MicOff,
  Moon,
  Pencil,
  Plus,
  Reply,
  RefreshCw,
  Save,
  ScreenShare,
  Search,
  SendHorizontal,
  Server,
  Settings,
  Smile,
  Sparkles,
  Sticker,
  Pin,
  Phone,
  Play,
  Pause,
  Target,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Volume2,
  VolumeX,
  X,
  Link2,
} from "lucide-react";

const ICON_COMPONENTS = {
  add: Plus,
  appGrid: LayoutGrid,
  bell: Bell,
  arrowRight: ChevronRight,
  camera: Camera,
  channel: Hash,
  check: Check,
  chevronLeft: ChevronLeft,
  chevronDown: ChevronDown,
  close: X,
  community: Users,
  copy: Copy,
  deafen: VolumeX,
  edit: Pencil,
  eye: Eye,
  emoji: Smile,
  expand: Maximize2,
  flag: Flag,
  forward: Forward,
  friends: UsersRound,
  games: Gamepad2,
  gift: Gift,
  headphones: Headphones,
  help: CircleHelp,
  inbox: Inbox,
  globe: Languages,
  link: Link2,
  mail: MessageSquare,
  mic: Mic,
  micOff: MicOff,
  mission: Target,
  more: Ellipsis,
  moon: Moon,
  pin: Pin,
  phone: Phone,
  play: Play,
  pause: Pause,
  refresh: RefreshCw,
  replyArrow: Reply,
  profile: UserRound,
  save: Save,
  screenShare: ScreenShare,
  search: Search,
  send: SendHorizontal,
  server: Server,
  settings: Settings,
  sparkles: Sparkles,
  sticker: Sticker,
  study: GraduationCap,
  threads: MessagesSquare,
  trash: Trash2,
  upload: Upload,
  userAdd: UserPlus,
  volume: Volume2,
};

export function Icon({ className = "", name, size = 18, strokeWidth = 1.9, title }) {
  const IconComponent = ICON_COMPONENTS[name];

  if (!IconComponent) {
    return null;
  }

  return (
    <IconComponent
      absoluteStrokeWidth
      aria-hidden={title ? undefined : true}
      className={`umbra-icon ${className}`.trim()}
      role={title ? "img" : "presentation"}
      shapeRendering="geometricPrecision"
      size={size}
      strokeWidth={strokeWidth}
      vectorEffect="non-scaling-stroke"
    >
      {title ? <title>{title}</title> : null}
    </IconComponent>
  );
}
