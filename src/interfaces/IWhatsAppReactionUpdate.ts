export interface IWhatsAppReactionUpdate {
  key: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
    participant?: string;
  };
  text?: string;
  senderTimestampMs?: string | number;
}

export default IWhatsAppReactionUpdate;