import { proto } from "@whiskeysockets/baileys";

// Interface para tipar corretamente o nó de reações estendidas do Baileys
interface IWhatsAppReactionUpdate {
  key: proto.IMessageKey;
  text?: string | null;
  senderTimestampMs?: number | string | null;
}

export default IWhatsAppReactionUpdate;