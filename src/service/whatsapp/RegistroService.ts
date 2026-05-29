import { AppDataSource } from "../../data-source"; 
import { ListaJoia } from "../../models/ListaJoia"; 
import { Motorista } from "../../models/Motorista"; 
import { OrdemJoinha } from "../../models/OrdemJoinha"; 
import { Banimento } from "../../models/Banimento"; 
import { IdentificadorLista } from "../../interfaces/ITipos"; 
import MotoristaService from "../MotoristaService"; 

export class RegistroService { 
  private readonly ordemRepositorio = AppDataSource.getRepository(OrdemJoinha); 
  private readonly listaRepositorio = AppDataSource.getRepository(ListaJoia); 
  private readonly banimentoRepositorio = AppDataSource.getRepository(Banimento); 

  /**
   * Busca todos os motoristas que foram penalizados (queimaram a largada) in uma lista específica.
   */
  public async buscarMotoristasPenalizados(listaId: number): Promise<Motorista[]> { 
    const registros = await this.ordemRepositorio.find({ 
      where: { listaJoia: { id: listaId }, isPenalizado: true }, 
      relations: ["motorista"], 
      order: { horaDoJoinha: "ASC" } 
    }); 
    return registros.map(reg => reg.motorista); 
  } 

  /**
   * LIMPAR LISTA: Remove todos os joinhas de uma lista específica
   */
  public async limparLista(listaId: number): Promise<void> { 
    await this.buscarListaOuFalhar(listaId); 
    await this.ordemRepositorio.delete({ listaJoia: { id: listaId } }); 
    console.log(`[SERVICE] Fila da lista ${listaId} foi zerada.`); 
  } 

  /** 
   * Registro Normal (Janela Oficial) com tratamento anti-concorrência de milissegundos
   */ 
  async adicionarJoinha(whatsappId: string, listaId: number, client: any, timestampOficialWhatsApp?: number): Promise<OrdemJoinha> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await this.buscarMotoristaAtivoOuFalhar(lidLimpo); 
    const listaAtiva = await this.buscarListaOuFalhar(listaId); 
    const dataDefinida = timestampOficialWhatsApp ? new Date(timestampOficialWhatsApp) : new Date();

    try {
      await this.ordemRepositorio
        .createQueryBuilder()
        .insert()
        .into(OrdemJoinha)
        .values({
          posicao: 1, 
          isPenalizado: false, 
          motorista: motorista, 
          listaJoia: listaAtiva, 
          horaDoJoinha: dataDefinida 
        })
        .orUpdate(["horaDoJoinha", "isPenalizado"], ["motorista", "listaJoia"])
        .execute();

      return await this.ordemRepositorio.findOneOrFail({
        where: { motorista: { id: motorista.id }, listaJoia: { id: listaAtiva.id } }
      });
    } catch (error) {
      console.error("[ERRO CONCORRÊNCIA ADICIONAR JOINHA]", error);
      throw error;
    }
  } 

  /** 
   * Registro de Penalidade (Queimou a largada) com tratamento anti-concorrência
   */ 
  async adicionarJoinhaPenalizado(whatsappId: string, listaId: number, client: any, timestampOficialWhatsApp?: number): Promise<OrdemJoinha> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await this.buscarMotoristaAtivoOuFalhar(lidLimpo); 
    const listaAtiva = await this.buscarListaOuFalhar(listaId); 
    const dataDefinida = timestampOficialWhatsApp ? new Date(timestampOficialWhatsApp) : new Date();

    try {
      await this.ordemRepositorio
        .createQueryBuilder()
        .insert()
        .into(OrdemJoinha)
        .values({
          posicao: 1, 
          isPenalizado: true, 
          motorista: motorista, 
          listaJoia: listaAtiva, 
          horaDoJoinha: dataDefinida 
        })
        .orUpdate(["horaDoJoinha", "isPenalizado"], ["motorista", "listaJoia"])
        .execute();

      return await this.ordemRepositorio.findOneOrFail({
        where: { motorista: { id: motorista.id }, listaJoia: { id: listaAtiva.id } }
      });
    } catch (error) {
      console.error("[ERRO CONCORRÊNCIA ADICIONAR PENALIZADO]", error);
      throw error;
    }
  } 

  /** 
   * Registra um banimento para quem enviou mensagem de texto na janela proibida 
   */ 
  async registrarBanimentoAntecipado(whatsappId: string, client: any): Promise<void> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const hoje = this.obterDataHoje(); 
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) return; 

    const jaBanido = await this.banimentoRepositorio.findOneBy({ 
      motorista: { id: motorista.id }, 
      dia: hoje 
    }); 

    if (!jaBanido) {
      const novoBan = this.banimentoRepositorio.create({ 
        dia: hoje, 
        motorista: motorista, 
        motivo: "Mensagem enviada na janela de banimento (Queimou a largada)" 
      }); 
      await this.banimentoRepositorio.save(novoBan); 
    } 
  } 
  /** 
   * Busca ou cria a lista para a data atual 
   */ 
  async buscarOuCriarListaDoDia(identificador: IdentificadorLista = 'CAPTURA_DIARIA', dataAlvo?: Date): Promise<ListaJoia> { 
    const dataBusca = dataAlvo ? this.formatarDataParaMeiaNoite(dataAlvo) : this.obterDataHoje(); 
    let lista = await this.listaRepositorio.findOneBy({ dia: dataBusca }); 

    if (!lista) { 
      lista = this.listaRepositorio.create({ dia: dataBusca, identificador }); 
      try { 
        await this.listaRepositorio.save(lista); 
      } catch (error) { 
        lista = await this.listaRepositorio.findOneBy({ dia: dataBusca }) as ListaJoia; 
      } 
    } 
    return lista; 
  } 

  /** 
   * Adiciona um motorista manualmente na lista via LID
   */ 
  public async adicionarMotoristaManualmente(whatsappId: string, listaId: number, client: any): Promise<OrdemJoinha> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista || !motorista.ativo) throw new Error("Motorista não encontrado ou inativo."); 
    
    const listaAtiva = await this.buscarListaOuFalhar(listaId); 

    await this.ordemRepositorio
      .createQueryBuilder()
      .insert()
      .into(OrdemJoinha)
      .values({ 
        posicao: 1, 
        isPenalizado: false, 
        motorista: motorista, 
        listaJoia: listaAtiva, 
        horaDoJoinha: new Date() 
      })
      .orUpdate(["horaDoJoinha", "isPenalizado"], ["motorista", "listaJoia"])
      .execute();

    return await this.ordemRepositorio.findOneOrFail({
      where: { motorista: { id: motorista.id }, listaJoia: { id: listaId } }
    });
  } 

  /** 
   * Remove um motorista de uma lista específica via LID
   */ 
  async removerMotoristaDaLista(whatsappId: string, listaId: number, client: any): Promise<void> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) throw new Error("Motorista não cadastrado."); 
    await this.ordemRepositorio.delete({ motorista: { id: motorista.id }, listaJoia: { id: listaId } }); 
  } 

  /** 
   * Insere precisamente o motorista reposicionando os horários milimetricamente para evitar bugs na fila 
   */ 
  async inserirEmPosicaoEspecifica(whatsappId: string, listaId: number, posicaoAlvo: number, client: any): Promise<void> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) throw new Error("Motorista não cadastrado."); 

    const listaAtual = await this.ordemRepositorio.find({ 
      where: { listaJoia: { id: listaId } }, 
      order: { isPenalizado: "ASC", horaDoJoinha: "ASC" }, 
      relations: ["motorista"] 
    }); 

    const listaFiltrada = listaAtual.filter(item => item.motorista.id !== motorista.id); 
    let novoHorario: Date; 

    if (listaFiltrada.length >= posicaoAlvo && posicaoAlvo > 0) { 
      const referencia = listaFiltrada[posicaoAlvo - 1].horaDoJoinha; 
      novoHorario = new Date(referencia.getTime() - 1000); 
    } else { 
      // ERRO 1 CORRIGIDO: Acessando explicitamente o índice [0] do array filtrado
      const primeiroDaLista = listaFiltrada[0]; 
      novoHorario = primeiroDaLista ? new Date(primeiroDaLista.horaDoJoinha.getTime() - 1000) : new Date(); 
    } 

    let registro = await this.ordemRepositorio.findOneBy({ motorista: { id: motorista.id }, listaJoia: { id: listaId } }); 

    if (registro) { 
      registro.horaDoJoinha = novoHorario; 
      registro.isPenalizado = false; 
    } else { 
      registro = this.ordemRepositorio.create({ posicao: 1, isPenalizado: false, motorista, listaJoia: { id: listaId }, horaDoJoinha: novoHorario }); 
    } 
    await this.ordemRepositorio.save(registro); 
  }

  /**
   * CADASTRO HÍBRIDO: Preserva o número de telefone isolando-o e mapeia o LID.
   */
  async cadastrarMotorista(nome: string, whatsAppId: string, client: any): Promise<Motorista> { 
    const lidLimpo = whatsAppId.replace(/:[0-9]+/, '');
    const partesJid = lidLimpo.split('@');
    // ERRO 2 CORRIGIDO: Coleta o índice [0] antes de aplicar o .replace() de RegExp
    const idNumerico = partesJid[0].replace(/\D/g, '');
    
    return await MotoristaService.cadastrarMotorista({ 
      nome, 
      telefoneWhatsApp: idNumerico, 
      ativo: true,
      whatsAppLid: lidLimpo
    }); 
  } 

  /**
   * Verifica dinamicamente no banco se o telefone traduzido pertence a um administrador
   */
  async verificarSeEhAdmin(whatsappId: string, client: any): Promise<boolean> { 
    if (!whatsappId) return false;

    const jidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const partesJid = jidLimpo.split('@');
    // ERRO 3 CORRIGIDO: Coleta o índice [0] antes de aplicar o .replace() de RegExp
    let telefone = partesJid[0].replace(/\D/g, '');

    if (telefone === '203998179098859') {
      telefone = '554497328923';
    }
    
    const admin = await AppDataSource.getRepository(require("../../models/Administrador").Administrador).findOneBy({
      telefoneWhatsApp: telefone
    });

    return !!admin;
  }

  public async obterNumeroReal(whatsappId: string, client: any): Promise<string> { 
    try {
      if (!whatsappId) return "";

      const jidLimpo = whatsappId.replace(/:[0-9]+/, '');
      const partesJid = jidLimpo.split('@');
      // ERRO 4 CORRIGIDO: Coleta o índice [0] antes de aplicar o .replace() de RegExp
      const idNumerico = partesJid[0].replace(/\D/g, '');

      if (idNumerico === '203998179098859') {
        return '554497328923';
      }

      return idNumerico;
    } catch (error) { 
      console.error("[ERRO OBTER NUMERO REAL]", error);
      const partesJid = whatsappId.split('@');
      // ERRO 5 CORRIGIDO: Coleta o índice [0] antes de aplicar o .replace() de RegExp
      return partesJid[0].replace(/\D/g, ''); 
    } 
  } 

  private formatarDataParaMeiaNoite(data: Date): Date { 
    const dataNoFuso = new Date(data.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    dataNoFuso.setHours(0, 0, 0, 0);
    return dataNoFuso; 
  } 

  private obterDataHoje(): Date { 
    return this.formatarDataParaMeiaNoite(new Date()); 
  } 

  private async buscarMotoristaAtivoOuFalhar(whatsAppLid: string): Promise<Motorista> { 
    const motorista = await MotoristaService.buscarPorLid(whatsAppLid); 
    if (!motorista || !motorista.ativo) {
      throw new Error(`Motorista com identificador ${whatsAppLid} não cadastrado ou inativo.`); 
    }
    return motorista; 
  } 

  private async buscarListaOuFalhar(id: number): Promise<ListaJoia> { 
    const lista = await this.listaRepositorio.findOneBy({ id }); 
    if (!lista) throw new Error("Lista não encontrada."); 
    return lista; 
  } 
}