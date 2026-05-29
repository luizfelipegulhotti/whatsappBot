interface ILogEstruturadoBaileys {
  remoteJid?: string;
  msgAttrs?: {
    from?: string;
    [key: string]: unknown;
  };
  key?: {
    remoteJid?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export default ILogEstruturadoBaileys;