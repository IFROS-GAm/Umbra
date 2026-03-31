export const REACTION_OPTIONS = [
  "\uD83D\uDD25",
  "\uD83D\uDC4D",
  "\u2728",
  "\uD83D\uDE80"
];

export const STATUS_OPTIONS = [
  { value: "online", label: "En linea" },
  { value: "idle", label: "Inactivo" },
  { value: "dnd", label: "No molestar" },
  { value: "invisible", label: "Invisible" },
  { value: "offline", label: "Offline" }
];

export function avatarStyle(hue = 240) {
  return {
    background: `linear-gradient(135deg, hsl(${hue} 78% 55%), hsl(${(hue + 48) % 360} 78% 38%))`
  };
}

function escapeHtml(text = "") {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatMessageHtml(text = "") {
  const codeBlocks = [];
  const inlineCodes = [];
  const everyoneMentions = [];

  let html = escapeHtml(text)
    .replace(/```([\s\S]*?)```/g, (_, content) => {
      const token = `%%CODEBLOCK_${codeBlocks.length}%%`;
      codeBlocks.push(`<pre><code>${content.trim()}</code></pre>`);
      return token;
    })
    .replace(/`([^`]+)`/g, (_, content) => {
      const token = `%%INLINECODE_${inlineCodes.length}%%`;
      inlineCodes.push(`<code>${content}</code>`);
      return token;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>')
    .replace(/(^|\s)@everyone\b/gi, (_, prefix) => {
      const token = `%%EVERYONE_${everyoneMentions.length}%%`;
      everyoneMentions.push(
        `${prefix}<span class="mention mention-everyone">@everyone</span>`
      );
      return token;
    })
    .replace(/(^|\s)@([a-zA-Z0-9_-]+)/g, '$1<span class="mention">@$2</span>')
    .replace(/\n/g, "<br />");

  inlineCodes.forEach((block, index) => {
    html = html.replace(`%%INLINECODE_${index}%%`, block);
  });

  everyoneMentions.forEach((block, index) => {
    html = html.replace(`%%EVERYONE_${index}%%`, block);
  });

  codeBlocks.forEach((block, index) => {
    html = html.replace(`%%CODEBLOCK_${index}%%`, block);
  });

  return html;
}

export function relativeTime(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.round(hours / 24);
  return `${days}d`;
}

function toDateParts(isoDate) {
  const date = new Date(isoDate);
  return {
    day: date.getDate(),
    month: date.getMonth(),
    year: date.getFullYear()
  };
}

export function isSameCalendarDay(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftParts = toDateParts(left);
  const rightParts = toDateParts(right);

  return (
    leftParts.day === rightParts.day &&
    leftParts.month === rightParts.month &&
    leftParts.year === rightParts.year
  );
}

export function shouldShowDateDivider(previousMessage, nextMessage) {
  if (!nextMessage?.created_at) {
    return false;
  }

  if (!previousMessage?.created_at) {
    return true;
  }

  return !isSameCalendarDay(previousMessage.created_at, nextMessage.created_at);
}

export function formatDateDivider(isoDate) {
  if (!isoDate) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(isoDate));
}

export function isGrouped(prev, next) {
  if (!prev || !next) {
    return false;
  }

  return (
    prev.author?.id === next.author?.id &&
    new Date(next.created_at).getTime() - new Date(prev.created_at).getTime() <
      5 * 60 * 1000
  );
}

export function findChannelInSession(session, channelId) {
  if (!session) {
    return null;
  }

  for (const guild of session.guilds) {
    const channel = guild.channels.find((item) => item.id === channelId);
    if (channel) {
      return {
        kind: "guild",
        guild,
        channel
      };
    }
  }

  const dm = session.dms.find((item) => item.id === channelId);
  if (dm) {
    return {
      kind: "dm",
      guild: null,
      channel: dm
    };
  }

  return null;
}

export function resolveSelection(session, previousSelection) {
  if (previousSelection?.channelId) {
    const previous = findChannelInSession(session, previousSelection.channelId);
    if (previous) {
      return {
        channelId: previous.channel.id,
        guildId: previous.guild?.id ?? null,
        kind: previous.kind
      };
    }
  }

  const defaultGuild = session.guilds.find(
    (guild) => guild.id === session.defaults.guild_id
  );
  const defaultChannel =
    defaultGuild?.channels.find((channel) => channel.id === session.defaults.channel_id) ||
    defaultGuild?.channels[0];

  if (defaultGuild && defaultChannel) {
    return {
      channelId: defaultChannel.id,
      guildId: defaultGuild.id,
      kind: "guild"
    };
  }

  if (session.dms[0]) {
    return {
      channelId: session.dms[0].id,
      guildId: null,
      kind: "dm"
    };
  }

  return {
    channelId: null,
    guildId: null,
    kind: "guild"
  };
}
