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
import cron, { ScheduledTask } from "node-cron"; 
import MotoristaService from "../service/MotoristaService"; 
import { Motorista } from "../models/Motorista";
import formatarDataIsoPura from '../utils/formatters/formatarDataPorDia';
import AdministradorService from '../service/AdministradorService';

export class WhatsAppController { 
  // Filtra estritamente os IDs permitidos de grupos terminados em @g.us
  private readonly IDs_PERMITIDOS: string[] = [ 
    process.env.JWT_ID_BOTSECRET || '', 
    process.env.JWT_ID_GROUPSECRET || '' 
  ].filter(id => id !== '' && id.endsWith('@g.us')); 

  private cadastroAberto: boolean = false; 
  private grupoId: string = ''; 
  public sock: WASocket | null = null; 

  // TRAVA DE HISTÓRICO: Carimbo de tempo exato em segundos do boot do sistema
  private readonly timestampInicial: number = Math.floor(Date.now() / 1000);

  constructor( 
    public registroService: RegistroService, 
    public escalaService: EscalaService 
  ) { 
    this.grupoId = process.env.JWT_ID_GROUPSECRET || ''; 
  }
  public async inicializar(): Promise<void> { 
    // Atribuição global imediata para evitar instâncias indefinidas no bootstrap do Pino
    (global as any).whatsappControllerInstance = this;

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

    // LOGGER INTERCEPTOR: Trava logs e requisições de mapas de rede indesejados
      const loggerCustomizado = pinoInterno({
      level: 'debug',
      hooks: {
        logMethod: function (this: any, inputArgs: unknown[], method: (msg: string, ...args: unknown[]) => void): void {
          const controlador = (global as any).whatsappControllerInstance;
          
          if (controlador && inputArgs.length > 0) {
            const primeiroArg = inputArgs[0];
            
            // 1. EXTRAÇÃO UNIFICADA DE TEXTO PARA VALIDAÇÃO DE SEGURANÇA
            const textoParaChecar = typeof primeiroArg === 'string' 
              ? primeiroArg 
              : JSON.stringify(primeiroArg || '');

            // EXCEÇÃO DA TRAVA: Se for o comando de extração de LID, deixa o log passar para a biblioteca processar
            const ehComandoExtrairLid = textoParaChecar.includes('@extrair_lid');

            // 2. FILTRO GLOBAL DE MENSAGENS AUTORIZADAS DO SISTEMA
            const ehMensagemDoSistema = textoParaChecar.includes('✅') || 
                                        textoParaChecar.includes('📷') || 
                                        textoParaChecar.includes('🔄') || 
                                        textoParaChecar.includes('🚫') || 
                                        textoParaChecar.includes('👍') ||
                                        ehComandoExtrairLid;

            // Ignora barulhos de sessão e migrações internas da biblioteca Baileys
            if (textoParaChecar.includes('SessionEntry') || textoParaChecar.includes('Closing session') || textoParaChecar.includes('migration')) {
              return;
            }

            // 3. ANALISADOR DE METADADOS DE REDE BRUTOS
            if (primeiroArg && typeof primeiroArg === 'object' && !Array.isArray(primeiroArg)) {
              const logData = primeiroArg as Record<string, any>;

              const remoteJid = logData.remoteJid || 
                                logData.msgAttrs?.from || 
                                logData.key?.remoteJid ||
                                logData.recv?.attrs?.from ||
                                logData.sent?.to ||
                                logData.jid ||
                                logData.fromJid ||
                                logData.lidUser;
              
              // TRAVA DE GRUPO MODIFICADA: Se não for permitido, mas for o comando de extração, ignora o bloqueio
              if (remoteJid && !controlador.IDs_PERMITIDOS.includes(remoteJid) && !ehComandoExtrairLid) {
                return;
              }

              // VÍNCULO AUTOMÁTICO SEGURO: Só executa se o grupo passar no filtro acima
              if (logData.pnUser && logData.lidUser) {
                MotoristaService.vincularLidAoTelefone(String(logData.pnUser), String(logData.lidUser)).catch(() => {});
              }

              if (!remoteJid) {
                if (textoParaChecar.includes('buffer') || textoParaChecar.includes('USync') || textoParaChecar.includes('identity')) {
                  return;
                }
              }
            }

            // 4. TRAVA DE IMPRESSÃO VISUAL: Se o log bruto não contiver os gatilhos do robô, não polui o console
            if (!ehMensagemDoSistema) {
              return; 
            }
          }
          
          method.apply(this, inputArgs as [string, ...unknown[]]);
        }
      }
    });

    this.sock = makeWASocket({ 
      auth: state, 
      logger: loggerCustomizado, 
      defaultQueryTimeoutMs: undefined,
      browser: ['Mac OS', 'Chrome', '124.0.0.0'], 
      syncFullHistory: false, // Força o descarte do histórico massivo inicial
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

    this.sock.ev.on('messages.upsert', async (m: { messages: proto.IWebMessageInfo[] }) => { 
      for (const msg of m.messages) {
        if (!msg || !msg.message || !msg.key) continue; 

         // 1. CHECAGEM DE TEMPO TOLERANTE A QUEDAS (Tolerância estrita de 30 minutos)
        const timestampOficialSegundos = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);
        const timestampJanelaLimite = Math.floor(Date.now() / 1000) - 1800;

        // Se a mensagem tiver sido enviada há mais de 30 minutos, ignora por segurança
        if (timestampOficialSegundos < timestampJanelaLimite) {
          continue;
        }

        const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const textoLimpo = texto.replace(/[\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
        const chatDeOrigemId = msg.key.remoteJid || '';

        // Extração unificada das identidades dos emissores (Sua lógica original intocada)
        const autorRaw = msg.key.participant || msg.key.remoteJid || ''; 
        const partesJid = autorRaw.replace(/:[0-9]+/, '').split('@');
        const autorLid = partesJid[0]; 
        if (!autorLid) continue;

        // =========================================================================
        // INTERCEPTADORES GLOBAIS DE EXTRAÇÃO (IGNORAM IDs_PERMITIDOS)
        // =========================================================================
        if (textoLimpo.startsWith('@extrair_lid_usuario')) {
          const ehAdmin = await this.registroService.verificarSeEhAdmin(autorLid, this.sock!);
          if (!ehAdmin) continue; 

          let idDesejadoPuro = '';
          const termoNomeBuscado = textoLimpo.replace(/^@extrair_lid_usuario\s+/i, '').replace(/@/g, '').trim().toLowerCase();

          if (!termoNomeBuscado) {
            await this.sock!.sendMessage(chatDeOrigemId, {
              text: `*SISTEMA*\n\n❌ *Informe o nome do perfil para pesquisar.*\n\n💡 Exemplo: \`@extrair_lid_usuario Nome do Motorista\``
            });
            continue;
          }

          if (chatDeOrigemId.endsWith('@g.us')) {
            try {
              const metadadosDoGrupo = await this.sock!.groupMetadata(chatDeOrigemId);
              if (metadadosDoGrupo && metadadosDoGrupo.participants) {
                const membroLocalizado = metadadosDoGrupo.participants.find(integrante => {
                  const nomeNoPerfil = String((integrante as any).name || (integrante as any).notify || '').toLowerCase();
                  return nomeNoPerfil.includes(termoNomeBuscado) || integrante.id.includes(termoNomeBuscado);
                });

                if (membroLocalizado) {
                  idDesejadoPuro = membroLocalizado.id.replace(/:[0-9]+/, '').split('@')[0];
                }
              }
            } catch (erroMembros) {
              console.error("[ERRO REQUISIÇÃO METADADOS GRUPO]", erroMembros);
            }
          }

          if (!idDesejadoPuro) {
            await this.sock!.sendMessage(chatDeOrigemId, {
              text: `*SISTEMA*\n\n❌ *Não encontrei nenhum integrante com o nome "${termoNomeBuscado}" neste grupo.*`
            });
            continue;
          }

          console.log('\n==================================================');
          console.log(`👤 [LID DE MOTORISTA ENCONTRADO] Chat: ${chatDeOrigemId}`);
          console.log(`📌 LID DO USUÁRIO EXTRAÍDO: ${idDesejadoPuro}`);
          console.log('==================================================\n');

          await this.sock!.sendMessage(chatDeOrigemId, {
            text: `*SISTEMA*\n\n👤 *LID do usuário localizado!*\n\n📌 ID Puro: \`${idDesejadoPuro}\`\n🧩 JID Completo: \`${idDesejadoPuro}@lid\``
          });
          continue; 
        }

        if (textoLimpo === '@extrair_lid') {
          const ehAdmin = await this.registroService.verificarSeEhAdmin(autorLid, this.sock!);
          if (!ehAdmin) continue; 

          console.log('\n==================================================');
          console.log('🔍 [EXTRAÇÃO DE LID DO GRUPO] Sucesso:');
          console.log(`📌 LID/JID DO CHAT: ${chatDeOrigemId}`);
          console.log('==================================================\n');

          await this.sock!.sendMessage(chatDeOrigemId, {
            text: `*SISTEMA*\n\n✅ *LID do Grupo extraído com sucesso!*\n\n📌 ID: \`${chatDeOrigemId}\``
          });
          continue; 
        }

        // =========================================================================
        // REGRAS DE NEGÓCIO DIÁRIAS (RESTRITAS AOS IDs_PERMITIDOS)
        // =========================================================================
        if (!this.IDs_PERMITIDOS.includes(chatDeOrigemId)) continue; 

        // Captura e vinculação do número de telefone em tempo real
                // Captura e vinculação do número de telefone (Híbrido: Suporta Dono e Terceiros)
        let foneRealMapeado = msg.key.participant || msg.message?.extendedTextMessage?.contextInfo?.participant || '';
        
        // CORREÇÃO CRÍTICA PARA VOCÊ (O DONO): Se a mensagem é sua, o WhatsApp esconde o telefone na rede.
        // Nós forçamos o robô a usar o número de telefone da sua própria conexão atual!
        if (msg.key.fromMe && this.sock?.user?.id) {
          foneRealMapeado = this.sock.user.id;
        }

        if (foneRealMapeado && String(foneRealMapeado).includes('@s.whatsapp.net')) {
          const fonePuro = String(foneRealMapeado).split('@')[0].replace(/\D/g, '');
          
          // O robô dispara o atualizador para as duas tabelas. 
          // O serviço de administrador vai achar o seu telefone "554497328923" e gravar o seu LID na hora!
          await MotoristaService.vincularLidAoTelefone(fonePuro, autorLid).catch(() => {});
          await AdministradorService.vincularLidAoTelefone(fonePuro, autorLid).catch(() => {});
        }


        const timestampOficialMs = timestampOficialSegundos * 1000;

        try { 
          // Cadastro Híbrido de Motoristas
          if (textoLimpo.startsWith('@cadastrar ')) { 
            if (!this.cadastroAberto) { 
              await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔒 O cadastro está fechado."); 
              continue; 
            } 
            const nome = textoLimpo.replace('@cadastrar ', '').trim(); 
            await this.registroService.cadastrarMotorista(nome, autorLid, this.sock!); 
            await this.enviarMensagemElegante(this.grupoId, "CADASTRO", `✅ *${nome}*, cadastrado com sucesso!`); 
            continue; 
          } 

          // EXECUÇÃO DO MÉTODO DE COMANDOS ADMIN: Encaminha explicitamente a string limpa e padronizada
          if (textoLimpo.startsWith('@')) { 
            const processado = await this.processarComandosAdmin(msg, textoLimpo, autorLid); 
            if (processado) continue; 
          } 

          // Tratamento da Janela de Bloqueio / Largada Queimada
          if (this.isJanelaBanimento(timestampOficialMs)) { 
            const lista = await this.registroService.buscarOuCriarListaDoDia(); 
            if (EmojiHelper.isJoinha(textoLimpo)) { 
              await this.registroService.adicionarJoinhaPenalizado(autorLid, lista.id, this.sock!, timestampOficialMs); 
            } else { 
              await this.registroService.registrarBanimentoAntecipado(autorLid, this.sock!); 
            } 
            continue;
          } 

          // Tratamento da Janela Regulamentar de Confirmação de Presença
          if (this.isJanelaJoinha(timestampOficialMs)) { 
            if (EmojiHelper.isJoinha(textoLimpo)) { 
              const lista = await this.registroService.buscarOuCriarListaDoDia(); 
              let motorista = await MotoristaService.buscarPorLid(autorLid); 

              if (motorista) { 
                const dataHoje = this.registroService['obterDataHoje'](); 
                const banidoHoje = await AppDataSource.getRepository(require("../models/Banimento").Banimento).findOneBy({ 
                  motorista: { id: motorista.id }, 
                  dia: dataHoje 
                }) as Record<string, unknown> | null; 
                if (banidoHoje) continue; 
              } 
              await this.registroService.adicionarJoinha(autorLid, lista.id, this.sock!, timestampOficialMs); 
            } 
          } 
        } catch (error: unknown) { 
          console.error(`[ERRO CRÍTICO EXECUÇÃO BOT]: ${(error as Error).message}`); 
        } 
      }
    });
  }


// Propriedade da classe para armazenar as tarefas ativas
  private tarefasAtivas: ScheduledTask[] = [];

  private configurarCronjobs(): void { 
    if (!this.grupoId) return; 

     this.destruirCronjobs();

    // 1. Para e limpa agendamentos anteriores
    this.tarefasAtivas.forEach(tarefa => tarefa.stop());
    this.tarefasAtivas = [];

    const cronOptions = {
      timezone: "America/Sao_Paulo"
    };

    // 2. Agenda o job da manhã (05:00)
    const jobManha = cron.schedule('0 5 * * *', async () => { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id); 
        await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA DO DIA", relatorio); 
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 05:00]: ${(error as Error).message}`); 
      } 
    }, cronOptions); 

    // 3. Agenda o job da noite (20:04)
    const jobNoite = cron.schedule('4 20 * * *', async () => { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        const penalizados = await this.registroService.buscarMotoristasPenalizados(lista.id); 
        if (penalizados && penalizados.length > 0) { 
          const relatorio = penalizados.map((m, i) => `${i + 1}. *${m.nome}*`).join('\n');
          const msg = `Os seguintes motoristas queimaram a largada:\n\n${relatorio}`; 
          await this.enviarMensagemElegante(this.grupoId, "⚠️ QUEIMARAM A LARGADA", msg); 
        } 
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 20:04]: ${(error as Error).message}`); 
      } 
    }, cronOptions); 

    // 4. Salva as referências no array da classe
    this.tarefasAtivas.push(jobManha, jobNoite);
  }

    // Executado na desconexão do bot ou encerramento limpo do app
  public destruirCronjobs(): void {
    if (this.tarefasAtivas.length === 0) return;

    console.log(`[CRON] Parando ${this.tarefasAtivas.length} tarefas agendadas...`);
    this.tarefasAtivas.forEach(tarefa => tarefa.stop());
    this.tarefasAtivas = [];
  }
 

private async processarComandosAdmin(msg: proto.IWebMessageInfo, comando: string, autorLid: string): Promise<boolean> { 
    // 1. Validação de Segurança de Administrador
    const isAdmin = await this.registroService.verificarSeEhAdmin(autorLid, this.sock!); 
    if (!isAdmin) return false; 

    // Sanitiza e quebra o comando em argumentos limpos
    const partes = comando.trim().split(/\s+/); 
    const acao = partes[0];      
    const parametro = partes[1]; 

    // COMANDO ADMINISTRATIVO: @motoristas
    if (acao === '@motoristas') { 
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

    // COMANDO ADMINISTRATIVO: @abrir_cadastro
    if (acao === '@abrir_cadastro') { 
      this.cadastroAberto = true; 
      await this.enviarMensagemElegante(
        this.grupoId, 
        "CADASTRO LIBERADO", 
        "🔓 *CADASTRO LIBERADO!*\n\n Digite:\n*@cadastrar Seu Nome Aqui*"
      ); 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @fechar_cadastro
    if (acao === '@fechar_cadastro') { 
      this.cadastroAberto = false; 
      await this.enviarMensagemElegante(
        this.grupoId, 
        "CADASTRO FECHADO", 
        "🔒 *CADASTRO FECHADO!*\n\n🚫 Aguarde a liberação pelo adm para se cadastrar novamente."
      );
      return true;
    } 

    // COMANDO ADMINISTRATIVO: @tipo_dia [DD/MM/AAAA] [TIPO]
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

    // COMANDO ADMINISTRATIVO: @limpar_dia [DD/MM/AAAA]
    if (acao === '@limpar_dia') { 
      if (!parametro) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Informe a data: `@limpar_dia DD/MM/AAAA`.");
        return true; 
      }
      await this.escalaService.removerTipoDiaManual(parametro); 
      await this.enviarMensagemElegante(this.grupoId, "CONFIGURAÇÃO", `✅ Marcação removida.`); 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @listar_feriados
    if (acao === '@listar_feriados') { 
      const lista = await this.escalaService.listarDiasManuais(); 
      await this.enviarMensagemElegante(this.grupoId, "📅 FERIADOS", lista); 
      return true; 
    }
    // Captura de Menções / Contexto do WhatsApp (Baileys)
    const listaMencoes = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid; 
    const mencionadoJid = listaMencoes && listaMencoes.length > 0 ? listaMencoes[0] : null; 
    const lidMencionado = mencionadoJid ? mencionadoJid.replace(/:[0-9]+/, '').split('@')[0] : null; 

    // COMANDO ADMINISTRATIVO: @add @Mencao OU @add NomeDoMotorista
    if (acao === '@add') { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 

        if (lidMencionado) { 
          await this.registroService.adicionarMotoristaManualmente(lidMencionado, lista.id, this.sock!); 
          await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Adicionado por menção.`); 
          return true; 
        } 

        const textoSemAcao = comando.replace(/@add\s+/i, '').trim();
        if (!textoSemAcao) {
          await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ Marque um usuário ou digite o nome: \`@add Nome\``);
          return true;
        }

        const motoristaPorNome = await AppDataSource.getRepository(Motorista).findOne({
          where: { nome: ILike(`%${textoSemAcao}%`), ativo: true } 
        });

        if (motoristaPorNome) {
          await this.registroService.adicionarMotoristaManualmente(motoristaPorNome.whatsAppLid || '', lista.id, this.sock!);
          await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Adicionado motorista: *${motoristaPorNome.nome}*.`);
        } else {
          await this.enviarMensagemElegante(this.grupoId, "AVISO", `❌ Motorista não encontrado por nome ou menção.`);
        }
      } catch (error: unknown) {
        console.error(`[ERRO @add]:`, error);
        await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ Falha ao adicionar: ${(error as Error).message}`);
      } 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @inserir @Contato posição X [dia]
    if (acao === '@inserir') { 
      const partesCmd = comando.split(' posição '); 
      if (!lidMencionado || partesCmd.length <= 1) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Mencione o motorista. Uso: `@inserir @Contato posição X [dia]`");
        return true;
      }

      const restoTexto = partesCmd[1].trim(); 
      const numerosMatch = restoTexto.match(/^(\d+)(?:\s+(\d+))?$/);

      if (!numerosMatch) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Formato numérico inválido. Use: `@inserir @Contato posição X [dia]`");
        return true;
      }

      const posicao = parseInt(numerosMatch[1], 10);
      const diaDigitado = numerosMatch[2] ? parseInt(numerosMatch[2], 10) : undefined;

      try { 
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        await this.registroService.inserirEmPosicaoEspecifica(lidMencionado, dataAlvo, posicao); 
        
        const dataFormatada = `${dataAlvo.getDate().toString().padStart(2, '0')}/${(dataAlvo.getMonth() + 1).toString().padStart(2, '0')}`;
        await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Inserido na posição ${posicao} da lista do dia ${dataFormatada}.`); 
      } catch (error: unknown) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ ${(error as Error).message}`);
      } 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @remover @Contato [dia]
    if (acao === '@remover') { 
      if (!lidMencionado) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Identificação ausente. Por favor, marque o motorista.");
        return true;
      }

      try { 
        const matchDia = comando.match(/\s+(\d+)$/);
        const diaDigitado = matchDia ? parseInt(matchDia[1], 10) : undefined;
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);

        await this.registroService.removerMotoristaDaLista(lidMencionado, dataAlvo); 

        const dataFormatada = `${dataAlvo.getDate().toString().padStart(2, '0')}/${(dataAlvo.getMonth() + 1).toString().padStart(2, '0')}`;
        await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ Removido com sucesso da lista do dia ${dataFormatada}.`); 
      } catch (error: unknown) { 
        await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ ${(error as Error).message}`);
      } 
      return true; 
    }

    // COMANDO ADMINISTRATIVO: @ativar ou @inativar
    if (acao === '@ativar' || acao === '@inativar') { 
      if (!lidMencionado) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Identificação ausente. Marque o motorista.");
        return true; 
      }
      try {
        const motorista = await MotoristaService.buscarPorLid(lidMencionado); 
        if (!motorista) {
          await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Motorista não encontrado no banco de dados.");
          return true; 
        }
        const novoStatus = acao === '@ativar'; 
        await MotoristaService.alterarStatusAtivo(motorista.whatsAppLid || '', novoStatus); 
        await this.enviarMensagemElegante(this.grupoId, "STATUS", `👤 O motorista *${motorista.nome}* foi alterado para: ${novoStatus ? "✅ Ativo" : "🚫 Inativo"}.`); 
      } catch (error: unknown) { 
        console.error(`[ERRO ${acao}]:`, error);
        await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ Falha ao alterar status: ${(error as Error).message}`);
      } 
      return true; 
    }
    // Limpeza de caracteres invisíveis Unicode (ex: ZWSP) que quebram o parser
    const textoLimpo = comando.replace(/[\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();

    // COMANDO ADMINISTRATIVO: @extrair_lid
    if (textoLimpo.includes('@extrair_lid')) {
      const lidDoGrupo = msg.key?.remoteJid || 'Não detectado';
      
      console.log('\n==================================================');
      console.log('🔍 [EXTRAÇÃO DE LID] ID do chat detectado com sucesso:');
      console.log(`📌 LID/JID: ${lidDoGrupo}`);
      console.log('==================================================\n');

      await this.enviarMensagemElegante(
        lidDoGrupo, 
        "SISTEMA", 
        `✅ *LID extraído com sucesso no console do servidor!*\n\n📌 ID: \`${lidDoGrupo}\``
      );
      return true;
    }

    // COMANDO ADMINISTRATIVO: @refazer [dia_da_geracao]
    if (acao === '@refazer') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Use: `@refazer [dia]` (Exemplo: `@refazer 10`).");
        return true;
      }

      await this.enviarMensagemElegante(this.grupoId, "SISTEMA", `🔄 Localizando a lista gerada no dia ${diaDigitado.toString().padStart(2, '0')} para reprocessar...`);

      try {
        // 🔥 FIX FUSO: Constrói a data de busca e gera o intervalo rígido no fuso de Brasília
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        
        const inicioDia = new Date(dataAlvo);
        inicioDia.setHours(0, 0, 0, 0);
        const fimDia = new Date(dataAlvo);
        fimDia.setHours(23, 59, 59, 999);

        // Busca utilizando BETWEEN nativo (Elimina o problema de fuso do CONVERT_TZ/DAY)
        const listaJoiaEncontrada = await AppDataSource.getRepository('ListaJoia')
          .createQueryBuilder("lista")
          .where("lista.dia BETWEEN :inicioDia AND :fimDia", { inicioDia, fimDia })
          .orderBy("lista.dia", "DESC") 
          .getOne();

        if (!listaJoiaEncontrada) {
          await this.enviarMensagemElegante(this.grupoId, "ERRO", `🚫 Não localizei nenhuma lista registrada no dia *${diaDigitado.toString().padStart(2, '0')}*.`);
          return true;
        }

        const relatorioFormatado = await this.escalaService.gerarEscalaCompleta((listaJoiaEncontrada as any).id);
        await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA ATUALIZADA", relatorioFormatado);

      } catch (error: any) {
        console.error("Falha ao reprocessar comando admin @refazer:", error);
        await this.enviarMensagemElegante(this.grupoId, "FALHA CRÍTICA", `❌ Erro interno ao reprocessar: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala_tarde [dia_operacional]
    if (acao === '@escala_tarde') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ *Escolha o dia da lista.*\n\nUse: `@escala_tarde [dia]` (Exemplo: `@escala_tarde 4`).");
        return true;
      }

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        const diaReal = dataAlvo.getDate();

        const { texto, mencoes } = await this.escalaService.obterTextoPeriodoTarde(diaReal);
        await this.sock!.sendMessage(this.grupoId, { text: texto, mentions: mencoes });
      } catch (error: any) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO EXPORTAÇÃO", `❌ Erro ao extrair turno da tarde: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala_madrugada [dia_operacional]
    if (acao === '@escala_madrugada') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ *Escolha o dia da lista.*\n\nUse: `@escala_madrugada [dia]` (Exemplo: `@escala_madrugada 4`).");
        return true;
      }

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        const diaReal = dataAlvo.getDate();

        const { texto, mencoes } = await this.escalaService.obterTextoPeriodoMadrugada(diaReal);
        await this.sock!.sendMessage(this.grupoId, { text: texto, mentions: mencoes });
      } catch (error: any) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO EXPORTAÇÃO", `❌ Erro ao extrair turno da madrugada: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala_completa [dia_operacional]
    if (acao === '@escala_completa') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ *Escolha o dia da lista.*\n\nUse: `@escala_completa [dia]` (Exemplo: `@escala_completa 4`).");
        return true;
      }

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        const diaReal = dataAlvo.getDate();

        const resultadoTarde = await this.escalaService.obterTextoPeriodoTarde(diaReal);
        const resultadoMadrugada = await this.escalaService.obterTextoPeriodoMadrugada(diaReal);
        
        const textoUnificado = `${resultadoTarde.texto}\n\n=============================\n\n${resultadoMadrugada.texto}`;
        const mencoesUnificadas = [...resultadoTarde.mencoes, ...resultadoMadrugada.mencoes];

        await this.sock!.sendMessage(this.grupoId, { text: textoUnificado, mentions: mencoesUnificadas });
      } catch (error: any) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO EXPORTAÇÃO", `❌ Erro ao extrair texto completo: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala [dia_da_geracao]
    if (acao === '@escala') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Use: `@escala [dia]` (Exemplo: `@escala 10`).");
        return true; 
      }

      await this.enviarMensagemElegante(this.grupoId, "SISTEMA", `🔄 Buscando a lista gerada no dia *${diaDigitado.toString().padStart(2, '0')}*...`);
      try {
        // 🔥 FIX FUSO DEFINITIVO: Converte o dia informado em uma data segura baseada no fuso de São Paulo
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        
        const inicioDia = new Date(dataAlvo);
        inicioDia.setHours(0, 0, 0, 0);
        const fimDia = new Date(dataAlvo);
        fimDia.setHours(23, 59, 59, 999);

        // Executa a busca utilizando ranges puros. Se digitou 10, busca entre 10/xx 00:00 e 10/xx 23:59.
        const listaJoiaEncontrada = await AppDataSource.getRepository('ListaJoia')
          .createQueryBuilder("lista")
          .where("lista.dia BETWEEN :inicioDia AND :fimDia", { inicioDia, fimDia })
          .orderBy("lista.dia", "DESC")
          .getOne();

        if (!listaJoiaEncontrada) {
          await this.enviarMensagemElegante(this.grupoId, "ERRO", `🚫 Não localizei nenhuma lista registrada no dia *${diaDigitado.toString().padStart(2, '0')}*.`);
          return true; 
        }

        const relatorioFormatado = await this.escalaService.gerarEscalaCompleta((listaJoiaEncontrada as any).id);
        await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA ATUALIZADA", relatorioFormatado);

      } catch (error: any) {
        console.error("Falha ao reprocessar comando admin @escala:", error);
        await this.enviarMensagemElegante(this.grupoId, "FALHA CRÍTICA", `❌ Erro interno ao reprocessar: ${error.message}`);
      }
      return true; 
    }

    return false; // Permite que a mensagem caia no fluxo de comandos de usuários comuns
  }



  private async enviarMensagemElegante(to: string | undefined, titulo: string, conteudo: string): Promise<void> { 
    if (!to || !this.sock) return;
    await this.sock.sendMessage(to, { text: `*${titulo}*\n\n${conteudo}` }); 
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
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", hour12: false
    });
    const partes = formatador.formatToParts(new Date(timestampMs));
    const hora = Number(partes.find(p => p.type === "hour")?.value || 0);
    const minuto = Number(partes.find(p => p.type === "minute")?.value || 0);
    return hora === 19 && minuto >= 57 && minuto <= 59; 
  } 

  private isJanelaJoinha(timestampMs: number): boolean { 
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", hour12: false
    });
    const partes = formatador.formatToParts(new Date(timestampMs));
    const hora = Number(partes.find(p => p.type === "hour")?.value || 0);
    const minuto = Number(partes.find(p => p.type === "minute")?.value || 0);
    return hora === 20 && minuto >= 0 && minuto <= 10; 
  }
  
  private calcularDataAlvoSegura(diaDigitado?: number): Date {
    const hoje = new Date();
    
    if (diaDigitado === undefined || isNaN(diaDigitado)) {
      hoje.setHours(0, 0, 0, 0);
      return hoje;
    }

    let anoAlvo = hoje.getFullYear();
    let mesAlvo = hoje.getMonth();

    // Se o dia digitado for maior que o dia atual, retrocede 1 mês automaticamente
    if (diaDigitado > hoje.getDate()) {
      mesAlvo -= 1;
      if (mesAlvo < 0) {
        mesAlvo = 11; // Volta para Dezembro
        anoAlvo -= 1; // Volta o Ano
      }
    }

    return new Date(anoAlvo, mesAlvo, diaDigitado, 0, 0, 0, 0);
  }
}