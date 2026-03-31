import { formatDateDivider, isGrouped, shouldShowDateDivider } from "../../utils.js";

export function buildMessageStageRows(messages = []) {
  const rows = [];

  messages.forEach((message, index) => {
    const previousMessage = messages[index - 1];
    const showDateDivider = shouldShowDateDivider(previousMessage, message);

    if (showDateDivider) {
      rows.push({
        createdAt: message.created_at,
        key: `date-${message.id}`,
        label: formatDateDivider(message.created_at),
        type: "date"
      });
    }

    rows.push({
      grouped: !showDateDivider && isGrouped(previousMessage, message),
      key: `message-${message.id}`,
      message,
      type: "message"
    });
  });

  return rows;
}
