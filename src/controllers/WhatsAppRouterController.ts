import { Request, Response } from "express";
import { WhatsAppController } from "../bot/WhatsAppController";

export class WhatsAppRouteController {
  constructor(private bot: WhatsAppController) {}

  // Controlar abertura de cadastro pelo App
  public alternarCadastro = async (req: Request, res: Response) => {
    const { aberto } = req.body;
    // Precisamos tornar o cadastroAberto público ou criar um método nela
    this.bot.setCadastroStatus(aberto); 
    return res.json({ message: `Cadastro ${aberto ? 'aberto' : 'fechado'} com sucesso!` });
  };

  // Enviar comunicado direto para o grupo pelo Celular
  public enviarComunicado = async (req: Request, res: Response) => {
    const { mensagem } = req.body;
    await this.bot.enviarMensagemExterna("📢 AVISO VIA APP", mensagem);
    return res.json({ message: "Comunicado enviado!" });
  };
}
