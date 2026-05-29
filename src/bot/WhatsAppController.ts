import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  proto, 
  WASocket, 
  AuthenticationState 
} from '@whiskeysockets/baileys'; 

import { Boom } from '@hapi/boom'; 
import qrcode from 'qrcode-terminal'; 
import { ILike } from "typeorm"; 
import { RegistroService } from "../service/whatsapp/RegistroService"; 
import { EscalaService } from "../service/whatsapp/EscalaService"; 
import { EmojiHelper } from "../utils/helpers/EmojiHelper"; 
import { AppDataSource } from "../data-source"; 
import 'dotenv/config'; 
import cron from "node-cron"; 
import MotoristaService from "../service/MotoristaService"; 
import { Motorista } from "../models/Motorista";
import IWhatsAppReactionUpdate from '../interfaces/IWhatsappInteractionUpdate';

// IMPORTAÇÃO DA SUA INTERFACE SEPARADA: Garante conformidade sem any
import ILogEstruturadoBaileys from "../interfaces/ILogEstruturadoBaileys";

export class WhatsAppController { 
  // Filtra estritamente os IDs permitidos de grupos terminados em @g.us
  private readonly IDs_PERMITIDOS: string[] = [ 
    process.env.JWT_ID_BOTSECRET || '', 
    process.env.JWT_ID_GROUPSECRET || '' 
  ].filter(id => id !== '' && id.endsWith('@g.us')); 

  private cadastroAberto: boolean = false; 
  private grupoId: string = ''; 
  public sock: WASocket | null = null; 

  constructor( 
    public registroService: RegistroService, 
    public escalaService: EscalaService 
  ) { 
    this.grupoId = process.env.JWT_ID_GROUPSECRET || ''; 
  } 

  public async inicializar(): Promise<void> { 
    const { state, saveCreds }: { state: AuthenticationState; saveCreds: () => Promise<void> } = await useMultiFileAuthState('sessao_whatsapp_socket'); 

    let pinoInterno: any;
    try {
      pinoInterno = require('pino');
    } catch {
      try {
        pinoInterno = require('@whiskeysockets/baileys/node_modules/pino');
      } catch (err) {
        throw new Error("Não foi possível carregar a biblioteca de logs Pino do ecossistema.");
      }
    }

    // LOGGER DEFINITIVO: Mapeia as propriedades profundas de rede (recv/sent) do Baileys
    const loggerCustomizado = pinoInterno({
      level: 'debug',
      hooks: {
        logMethod: function (this: any, inputArgs: unknown[], method: (msg: string, ...args: unknown[]) => void): void {
          const controlador = (global as any).whatsappControllerInstance;
          
          if (controlador && inputArgs.length > 0) {
            const primeiroArg = inputArgs[0];
            
            // FILTRO DE METADADOS E MAPAS DE REDE
            if (primeiroArg && typeof primeiroArg === 'object' && !Array.isArray(primeiroArg)) {
              const logData = primeiroArg as Record<string, any>;
              
              // CAPTURA AUTOMÁTICA EM SEGUNDO PLANO: Se a Meta cuspir o mapa PN/LID na sincronização, grava na hora!
              if (logData.pnUser && logData.lidUser) {
                MotoristaService.vincularLidAoTelefone(String(logData.pnUser), String(logData.lidUser)).catch(() => {});
              }

              const remoteJid = logData.remoteJid || 
                                logData.msgAttrs?.from || 
                                logData.key?.remoteJid ||
                                logData.recv?.attrs?.from ||
                                logData.sent?.to ||
                                logData.jid ||
                                logData.fromJid ||
                                logData.lidUser;
              
              if (remoteJid && !controlador.IDs_PERMITIDOS.includes(remoteJid)) {
                return;
              }

              if (!remoteJid) {
                const msgInterna = logData.msg || '';
                if (msgInterna.includes('buffer') || msgInterna.includes('USync') || msgInterna.includes('identity')) {
                  return;
                }
              }
            }
            
            // FILTRO PARA TEXTOS PLANOS
            if (typeof primeiroArg === 'string') {
              if (primeiroArg.includes('SessionEntry') || primeiroArg.includes('Closing session') || primeiroArg.includes('migration')) {
                return;
              }
              
              const ehMensagemDoSistema = primeiroArg.includes('✅') || primeiroArg.includes('📷') || primeiroArg.includes('🔄') || primeiroArg.includes('🚫');
              if (!ehMensagemDoSistema) {
                return; 
              }
            }
          }
          
          method.apply(this, inputArgs as [string, ...unknown[]]);
        }
      }
    });

    (global as any).whatsappControllerInstance = this;

    this.sock = makeWASocket({ 
      auth: state, 
      logger: loggerCustomizado, 
      defaultQueryTimeoutMs: undefined,
      browser: ['Mac OS', 'Chrome', '124.0.0.0'], 
      syncFullHistory: false,
      markOnlineOnConnect: true
    }); 

    this.sock.ev.on('connection.update', (update) => { 
      const { connection, lastDisconnect, qr } = update; 
      if (qr) { 
        console.log('\n📷 [WHATSAPP] Novo QR Code gerado! Escaneie para conectar:'); 
        qrcode.generate(qr, { small: true }); 
      } 
      if (connection === 'open') { 
        console.log('✅ WhatsApp conectado e pronto para uso via Socket Puro!'); 
        this.configurarCronjobs(); 
      } 
      if (connection === 'close') { 
        const erroCode = (lastDisconnect?.error as Boom)?.output?.statusCode; 
        const deveReconectar = erroCode !== 419 && erroCode !== DisconnectReason.loggedOut; 

        if (deveReconectar) { 
          console.log('🔄 Conexão perdida com o WhatsApp. Tentando restabelecer Socket...'); 
          this.inicializar(); 
        } else { 
          console.log('🚫 Conexão encerrada permanentemente.'); 
        } 
      } 
    }); 

    this.sock.ev.on('creds.update', saveCreds); 

    /**
     * CAPTURA 1: Reações Nativas via Clique (👍 direto na mensagem)
     */
    this.sock.ev.on('messages.update', async (updates) => {
      for (const update of updates) {
        if (!update.update || !update.update.reactions) continue;

        const listaReacoes = update.update.reactions;
        if (!listaReacoes || listaReacoes.length === 0) continue;

        for (const reaction of listaReacoes) {
          if (!reaction || !reaction.key) continue;

          const chatDeOrigemId = reaction.key.remoteJid || ''; 
          if (!this.IDs_PERMITIDOS.includes(chatDeOrigemId)) continue; 

          const texto = (reaction.text || '').trim();
          if (!EmojiHelper.isJoinha(texto)) continue; 

          const autorRaw = reaction.key.participant || '';
          const autorLid = autorRaw.replace(/:[0-9]+/, '');
          if (!autorLid) continue;

          const timestampOficialMs = reaction.senderTimestampMs 
            ? Number(reaction.senderTimestampMs) 
            : Date.now();

          try { 
            if (this.isJanelaBanimento(timestampOficialMs)) { 
              const lista = await this.registroService.buscarOuCriarListaDoDia(); 
              await this.registroService.adicionarJoinhaPenalizado(autorLid, lista.id, this.sock, timestampOficialMs); 
              continue; 
            } 

            if (this.isJanelaJoinha(timestampOficialMs)) { 
              const lista = await this.registroService.buscarOuCriarListaDoDia(); 
              
              // CHAMADA CORRIGIDA: Busca utilizando a nova estrutura indexada por LID
              let motorista = await MotoristaService.buscarPorLid(autorLid); 

              if (motorista) { 
                const dataHoje = this.registroService['obterDataHoje'](); 
                const banidoHoje = await AppDataSource.getRepository(require("../models/Banimento").Banimento).findOneBy({ 
                  motorista: { id: motorista.id }, 
                  dia: dataHoje 
                }) as Record<string, unknown> | null; 
                if (banidoHoje) continue; 
              } 
              await this.registroService.adicionarJoinha(autorLid, lista.id, this.sock, timestampOficialMs); 
            } 
          } catch (error: unknown) { 
            console.error(`[ERRO BOT REAÇÃO NATIVA]: ${(error as Error).message}`); 
          }
        }
      }
    });
    // CAPTURA 2: Mensagens de Texto
    this.sock.ev.on('messages.upsert', async (m: { messages: proto.IWebMessageInfo[] }) => { 
      for (const msg of m.messages) {
        if (!msg || !msg.message || !msg.key) continue; 

        const chatDeOrigemId = msg.key.remoteJid || ''; 
        if (!this.IDs_PERMITIDOS.includes(chatDeOrigemId)) continue; 

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim(); 
        const autorRaw = msg.key.participant || msg.key.remoteJid || ''; 
        const autorLid = autorRaw.replace(/:[0-9]+/, ''); 
        if (!autorLid) continue;

        // CAPTURA EM TEMPO REAL VIA TEXTO: Se a mensagem trouxer a propriedade PN do telefone, vincula na hora!
        const foneRealMapeado = msg.key.participant || msg.message?.extendedTextMessage?.contextInfo?.participant;
        if (foneRealMapeado && foneRealMapeado.includes('@s.whatsapp.net')) {
          const fonePuro = foneRealMapeado.split('@')[0].replace(/\D/g, '');
          await MotoristaService.vincularLidAoTelefone(fonePuro, autorLid);
        }

        const timestampOficialMs = msg.messageTimestamp ? (Number(msg.messageTimestamp) * 1000) : Date.now();

        try { 
          if (texto.startsWith('@cadastrar ')) { 
            if (!this.cadastroAberto) { 
              await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔒 O cadastro está fechado."); 
              continue; 
            } 
            const nome = texto.replace('@cadastrar ', '').trim(); 
            await this.registroService.cadastrarMotorista(nome, autorLid, this.sock); 
            await this.enviarMensagemElegante(this.grupoId, "CADASTRO", `✅ *${nome}*, cadastrado com sucesso!`); 
            continue; 
          } 

          if (texto.startsWith('@')) { 
            const processado = await this.processarComandosAdmin(msg, texto, autorLid); 
            if (processado) continue; 
          } 

          if (this.isJanelaBanimento(timestampOficialMs)) { 
            const lista = await this.registroService.buscarOuCriarListaDoDia(); 
            if (EmojiHelper.isJoinha(texto)) { 
              await this.registroService.adicionarJoinhaPenalizado(autorLid, lista.id, this.sock, timestampOficialMs); 
            } else { 
              await this.registroService.registrarBanimentoAntecipado(autorLid, this.sock); 
            } 
            continue;
          } 

          if (this.isJanelaJoinha(timestampOficialMs)) { 
            if (EmojiHelper.isJoinha(texto)) { 
              const lista = await this.registroService.buscarOuCriarListaDoDia(); 
              
              // CHAMADA CORRIGIDA: Busca utilizando a nova estrutura indexada por LID
              let motorista = await MotoristaService.buscarPorLid(autorLid); 

              if (motorista) { 
                const dataHoje = this.registroService['obterDataHoje'](); 
                const banidoHoje = await AppDataSource.getRepository(require("../models/Banimento").Banimento).findOneBy({ 
                  motorista: { id: motorista.id }, 
                  dia: dataHoje 
                }) as Record<string, unknown> | null; 
                if (banidoHoje) continue; 
              } 
              await this.registroService.adicionarJoinha(autorLid, lista.id, this.sock, timestampOficialMs); 
            } 
          } 
        } catch (error: unknown) { 
          console.error(`[ERRO BOT]: ${(error as Error).message}`); 
        } 
      }
    }); 
  }

  private configurarCronjobs(): void { 
    if (!this.grupoId) return; 

    cron.schedule('0 5 * * *', async () => { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id); 
        await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA DO DIA", relatorio); 
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 05:00]: ${(error as Error).message}`); 
      } 
    }); 

    cron.schedule('4 20 * * *', async () => { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        const penalizados = await this.registroService.buscarMotoristasPenalizados(lista.id); 
        if (penalizados && penalizados.length > 0) { 
          let relatorio = ""; 
          penalizados.forEach((m, i) => { relatorio += `${i + 1}. *${m.nome}*\n`; }); 
          const msg = "Os seguintes motoristas queimaram a largada:\n\n" + relatorio; 
          await this.enviarMensagemElegante(this.grupoId, "⚠️ QUEIMARAM A LARGADA", msg); 
        } 
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 20:04]: ${(error as Error).message}`); 
      } 
    }); 
  } 
  private async processarComandosAdmin(msg: proto.IWebMessageInfo, comando: string, autorLid: string): Promise<boolean> { 
    const isAdmin = await this.registroService.verificarSeEhAdmin(autorLid, this.sock); 
    if (!isAdmin) return false; 

    const partes = comando.trim().split(/\s+/); 
    const acao = partes[0];      
    const parametro = partes[1]; 

    if (comando === '@motoristas') { 
      const motoristas = await MotoristaService.listarMotoristas(); 
      if (!motoristas || motoristas.length === 0) { 
        await this.enviarMensagemElegante(this.grupoId, "MOTORISTAS", "📭 Nenhum motorista cadastrado."); 
        return true; 
      } 
      let relatorio = ""; 
      motoristas.forEach((m, i) => { 
        relatorio += `${i + 1}. *${m.nome}*\n🆔 ${m.whatsAppLid || 'Aguardando interação'} ${m.ativo ? "✅" : "🚫"}\n\n`; 
      }); 
      await this.enviarMensagemElegante(this.grupoId, "👥 LISTA DE MOTORISTAS", relatorio); 
      return true; 
    } 

    if (comando === '@abrir_cadastro') { 
      this.cadastroAberto = true; 
      await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔓 *CADASTRO LIBERADO!*"); 
      return true; 
    } 

    if (comando === '@fechar_cadastro') { 
      this.cadastroAberto = false; 
      await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔒 *CADASTRO FECHADO!*"); 
      return true; 
    } 

    if (comando === '@escala') { 
      const lista = await this.registroService.buscarOuCriarListaDoDia(); 
      const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id); 
      await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA ATUAL", relatorio); 
      return true; 
    }

    if (acao === '@tipo_dia') { 
      const tipoInformado = partes[2]; 
      if (!parametro || !tipoInformado) { 
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Use: `@tipo_dia DD/MM/AAAA DIA_LIVRE`."); 
        return true; 
      } 
      try { 
        await this.escalaService.definirTipoDiaManual(parametro, tipoInformado as 'DIA_LIVRE' | 'DIA_COMUM'); 
        await this.enviarMensagemElegante(this.grupoId, "CONFIGURAÇÃO", `✅ Feriado/Dia configurado.`); 
      } catch (error: unknown) { 
        await this.enviarMensagemElegante(this.grupoId, "ERRO", (error as Error).message); 
      } 
      return true; 
    } 

    if (acao === '@limpar_dia') { 
      if (!parametro) return true; 
      await this.escalaService.removerTipoDiaManual(parametro); 
      await this.enviarMensagemElegante(this.grupoId, "CONFIGURAÇÃO", `✅ Marcação removida.`); 
      return true; 
    } 

    if (comando === '@listar_feriados') { 
      const lista = await this.escalaService.listarDiasManuais(); 
      await this.enviarMensagemElegante(this.grupoId, "📅 FERIADOS", lista); 
      return true; 
    } 

    const listaMencoes = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid; 
    const mencionadoJid = listaMencoes && listaMencoes.length > 0 ? listaMencoes[0] : null; 
    const lidMencionado = mencionadoJid ? mencionadoJid.replace(/:[0-9]+/, '') : null; 

    if (comando.startsWith('@add') && !comando.includes(' posição ')) { 
      if (!lidMencionado) return true; 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        await this.registroService.adicionarMotoristaManualmente(lidMencionado, lista.id, this.sock); 
        await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Adicionado por @lid.`); 
      } catch (error: unknown) { 
        try {
          const textoLimpo = comando.replace(/@[a-zA-Z0-9_]+\s+@/g, '').replace(/@add\s+@/i, '').replace(/\s+\d+$/, '').trim();
          const fragmentos = textoLimpo.split(/\s+/);
          if (fragmentos.length >= 1) {
            const motoristaPorNome = await AppDataSource.getRepository(Motorista).findOne({
              where: { nome: ILike(`%${fragmentos[0]}%`), ativo: true } 
            });
            if (motoristaPorNome) {
              const lista = await this.registroService.buscarOuCriarListaDoDia();
              await this.registroService.adicionarMotoristaManualmente(motoristaPorNome.whatsAppLid || '', lista.id, this.sock);
              await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Adicionado por Nome.`);
              return true;
            }
          }
        } catch (innerError) {}
      } 
      return true; 
    } 

    if (comando.startsWith('@inserir')) { 
      const partesCmd = comando.split(' posição '); 
      const posicao = partesCmd && partesCmd.length > 1 ? parseInt(partesCmd[1]) : NaN; 
      if (!lidMencionado || isNaN(posicao)) return true; 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        await this.registroService.inserirEmPosicaoEspecifica(lidMencionado, lista.id, posicao, this.sock); 
        await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Inserido na posição ${posicao}.`); 
      } catch (error: unknown) { } 
      return true; 
    } 

    if (comando.startsWith('@remover')) { 
      if (!lidMencionado) return true; 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        await this.removerMotoristaDaLista(lidMencionado, lista.id, this.sock); 
        await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Removido da lista.`); 
      } catch (error: unknown) { } 
      return true; 
    } 

    if (acao === '@ativar' || acao === '@inativar') { 
      if (!lidMencionado) return true; 
      try {
        // CHAMADA ATUALIZADA: Caça o motorista pelo LID nativo coletado nas menções
        const motorista = await MotoristaService.buscarPorLid(lidMencionado); 
        if (!motorista) return true; 
        const novoStatus = acao === '@ativar'; 
        await MotoristaService.alterarStatusAtivo(motorista.whatsAppLid || '', novoStatus); 
        await this.enviarMensagemElegante(this.grupoId, "STATUS", `👤 Alterado para ${novoStatus ? "Ativo" : "Inativo"}.`); 
      } catch (error: unknown) { } 
      return true; 
    } 

    return false; 
  }

  private async enviarMensagemElegante(to: string | undefined, titulo: string, conteudo: string): Promise<void> { 
    if (!to || !this.sock) return;
    await this.sock.sendMessage(to, { text: `*${titulo}*\n\n${conteudo}` }); 
  } 

  private async removerMotoristaDaLista(lidId: string, listaId: number, client: any): Promise<void> { 
    await this.registroService.removerMotoristaDaLista(lidId, listaId, client); 
  } 

  public setCadastroStatus(status: boolean): void { this.cadastroAberto = status; } 

  public async enviarMensagemExterna(titulo: string, conteudo: string): Promise<void> { 
    if (!this.grupoId || !this.sock) return; 
    await this.enviarMensagemElegante(this.grupoId, titulo, conteudo); 
  } 

  public async dispararEscalaManual(): Promise<string> { 
    const treeLista = await this.registroService.buscarOuCriarListaDoDia(); 
    const relatorio = await this.escalaService.gerarEscalaCompleta(treeLista.id); 
    await this.enviarMensagemExterna("📋 ESCALA (VIA APP)", relatorio); 
    return relatorio; 
  }

  public async resetarFilaDoDia(): Promise<void> { 
    const treeLista = await this.registroService.buscarOuCriarListaDoDia(); 
    await this.registroService.limparLista(treeLista.id); 
    await this.enviarMensagemExterna("🧹 SISTEMA", "Fila limpa."); 
  } 

  private isJanelaBanimento(timestampMs: number): boolean { 
    const dataOficial = new Date(new Date(timestampMs).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    return dataOficial.getHours() === 18 && dataOficial.getMinutes() >= 27 && dataOficial.getMinutes() <= 29; 
  } 

  private isJanelaJoinha(timestampMs: number): boolean { 
    const dataOficial = new Date(new Date(timestampMs).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    return dataOficial.getHours() === 18 && dataOficial.getMinutes() >= 30 && dataOficial.getMinutes() <= 35; 
  } 
}