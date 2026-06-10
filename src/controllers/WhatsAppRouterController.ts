import { Request, Response, NextFunction } from "express";
import { WhatsAppController } from "../bot/WhatsAppController";
import { AppDataSource } from "../data-source";
import { ListaJoia } from "../models/ListaJoia";
import { RotaAtribuida } from "../models/RotaAtribuida";
import calcularMetaConfiguracao from "../utils/helpers/CalcularMetaConfiguracao";

export class WhatsAppRouteController {
  // O Express perde o escopo do 'this' em métodos normais, por isso usamos arrow functions (=>)
  constructor(private bot: WhatsAppController) {}

  // =========================================================================
  // 1. SEUS MÉTODOS ORIGINAIS EXISTENTES
  // =========================================================================
  public alternarCadastro = async (req: Request, res: Response) => {
    const { aberto } = req.body;
    this.bot.setCadastroStatus(aberto); 
    return res.json({ message: `Cadastro ${aberto ? 'aberto' : 'fechado'} com sucesso!` });
  };

  public enviarComunicado = async (req: Request, res: Response) => {
    const { mensagem } = req.body;
    await this.bot.enviarMensagemExterna("📢 AVISO VIA APP", mensagem);
    return res.json({ message: "Comunicado enviado!" });
  };
  
  /**
   * GET /whatsapp/rotas-tarde?data=4
   * 10. EXIBIÇÃO DA ESCALA ATRIBUÍDA DA TARDE (DIA X + 1)
   */
  public getRotasTarde = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const dataParam = req.query.data;
    if (!dataParam) {
      return res.status(400).json({ error: "O parâmetro 'data' é obrigatório." });
    }

    const diaTextoPura = String(dataParam);
    const diaDigitado = parseInt(diaTextoPura.replace(/\D/g, ''), 10);

    if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
      return res.status(400).json({ error: "O parâmetro 'data' deve conter um dia válido." });
    }

    const dataAtual = new Date();
    const dataListaJoia = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), diaDigitado, 12, 0, 0, 0);
    const dataIsoPura = `${dataListaJoia.getFullYear()}-${String(dataListaJoia.getMonth() + 1).padStart(2, '0')}-${String(dataListaJoia.getDate()).padStart(2, '0')}`;

    const listaJoia = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
        .where("DATE(lista.dia) = :dataIsoPura", { dataIsoPura })
        .getOne()
        .catch(next);

    if (!listaJoia) return res.status(200).json({ turno: "TARDE", dia_dos_joias: dataIsoPura, dados: [] });

    // Regra de Ouro: Tarde executa em Dia X + 1
    const dataTardeOperacional = new Date(listaJoia.dia);
    dataTardeOperacional.setDate(dataTardeOperacional.getDate() + 1);
    const dataTardeIso = `${dataTardeOperacional.getFullYear()}-${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataTardeOperacional.getDate()).padStart(2, '0')}`;

    // RESTAURADO: Relações exatas do TypeORM baseadas na estrutura da Rota
    const atribuicoes = await AppDataSource.getRepository(RotaAtribuida).find({
        where: { listaJoia: { id: listaJoia.id }, dataGeracao: dataTardeIso as any },
        relations: ["motorista", "rota", "rota.passageiros", "rota.passageiros.endereco", "rota.empresas"],
        order: { id: "ASC" }
    }).catch(next);

    if (!atribuicoes) return;

    const payloadRotas = atribuicoes.map(atrib => ({
        id_atribuicao: atrib.id,
        tipo_atribuicao: atrib.tipoAtribuicao,
        motorista: atrib.motorista ? {
            id: atrib.motorista.id,
            nome: atrib.motorista.nome,
            whatsAppLid: atrib.motorista.whatsAppLid || null
        } : null,
        rota: {
            id: atrib.rota?.id || 0,
            nome: atrib.rota?.nome || "", 
            ordem: atrib.rota?.ordem || "", 
            horario: atrib.rota?.horario || "",
            empresas: (atrib.rota?.empresas || []).map(e => ({ id: e.id, nome: e.nome, icone: e.icone || null }))
        },
        passageiros: (atrib.rota?.passageiros || [])
            .sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0))
            .map(p => ({
                id_passageiro: p.id,
                nome: p.nome,
                telefoneWhatsApp: p.telefoneWhatsApp,
                ordem_na_rota: p.ordem_na_rota,
                logradouro: p.endereco?.nome || "Não cadastrado",
                numero: p.endereco?.numero || ""
            }))
    }));

    return res.status(200).json({
        turno: "TARDE",
        dia_dos_joias: dataIsoPura,
        dia_execucao_tarde: dataTardeIso,
        dados: payloadRotas
    });
  };

  /**
   * GET /whatsapp/rotas-madrugada?data=4
   * 11. EXIBIÇÃO DA ESCALA ATRIBUÍDA DA MADRUGADA (DIA X + 2)
   */
  public getRotasMadrugada = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    const dataParam = req.query.data;
    if (!dataParam) {
      return res.status(400).json({ error: "O parâmetro 'data' é obrigatório." });
    }

    const diaTextoPura = String(dataParam);
    const diaDigitado = parseInt(diaTextoPura.replace(/\D/g, ''), 10);

    if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
      return res.status(400).json({ error: "O parâmetro 'data' deve conter um dia válido." });
    }

    const dataAtual = new Date();
    const dataListaJoia = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), diaDigitado, 12, 0, 0, 0);
    const dataIsoPura = `${dataListaJoia.getFullYear()}-${String(dataListaJoia.getMonth() + 1).padStart(2, '0')}-${String(dataListaJoia.getDate()).padStart(2, '0')}`;

    const listaJoia = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
        .where("DATE(lista.dia) = :dataIsoPura", { dataIsoPura })
        .getOne();

    // Calcula as metas do calendário dinamicamente mesmo se a lista mãe de joinhas não foi aberta
    const dataMadrugadaOperacional = new Date(listaJoia ? listaJoia.dia : dataListaJoia);
    if (!listaJoia) {
      dataMadrugadaOperacional.setDate(dataMadrugadaOperacional.getDate() + 2);
    } else {
      dataMadrugadaOperacional.setDate(dataMadrugadaOperacional.getDate() + 2);
    }

    const metaCalculada = await calcularMetaConfiguracao(dataMadrugadaOperacional);
    if (!metaCalculada) return res.status(500).json({ error: "Falha ao calcular configurações da meta." });

    const dataMadrugadaIso = `${dataMadrugadaOperacional.getFullYear()}-${String(dataMadrugadaOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataMadrugadaOperacional.getDate()).padStart(2, '0')}`;
    const dataExibicaoTexto = `${String(dataMadrugadaOperacional.getDate()).padStart(2, '0')}/${String(dataMadrugadaOperacional.getMonth() + 1).padStart(2, '0')}`;

    if (!listaJoia) {
      return res.status(200).json({
          turno: "MADRUGADA_APOIO",
          dia_dos_joias: dataIsoPura,
          dia_execucao_madrugada: dataMadrugadaIso,
          tipoDia: metaCalculada.tipoDia,
          // 🔥 REGRA ATUALIZADA: Define dinamicamente o limite do plantão para as madrugadas de segunda
          limitePlantao: (dataMadrugadaOperacional.getDay() === 1 && metaCalculada.tipoDia === 'DIA_COMUM') ? 5 : metaCalculada.limitePlantao,
          dados: []
      });
    }

    const atribuicoes = await AppDataSource.getRepository(RotaAtribuida).find({
        where: { listaJoia: { id: listaJoia.id }, dataGeracao: dataMadrugadaIso as any },
        relations: ["motorista", "rota", "rota.passageiros", "rota.passageiros.endereco", "rota.empresas"],
        order: { id: "ASC" }
    });

    const payloadRotas = atribuicoes.map(atrib => ({
        id_atribuicao: atrib.id,
        tipo_atribuicao: atrib.tipoAtribuicao,
        motorista: atrib.motorista ? {
            id: atrib.motorista.id,
            nome: atrib.motorista.nome,
            whatsAppLid: atrib.motorista.whatsAppLid || null
        } : null,
        rota: {
            id: atrib.rota?.id || 0,
            nome: atrib.rota?.nome || "", 
            ordem: atrib.rota?.ordem || "", 
            horario: atrib.rota?.horario || "",
            empresas: (atrib.rota?.empresas || []).map(e => ({ id: e.id, nome: e.nome, icone: e.icone || null }))
        },
        passageiros: (atrib.rota?.passageiros || [])
            .sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0))
            .map(p => ({
                id_passageiro: p.id,
                nome: p.nome,
                telefoneWhatsApp: p.telefoneWhatsApp,
                ordem_na_rota: p.ordem_na_rota,
                logradouro: p.endereco?.nome || "Não cadastrado",
                numero: p.endereco?.numero || ""
            }))
    }));

    return res.status(200).json({
        turno: "MADRUGADA_APOIO",
        dia_dos_joias: dataIsoPura,
        dia_execucao_madrugada: dataMadrugadaIso,
        tipoDia: metaCalculada.tipoDia,
        // 🔥 REGRA ATUALIZADA: Sincroniza o limite no retorno estrito do payload estruturado
        limitePlantao: (dataMadrugadaOperacional.getDay() === 1 && metaCalculada.tipoDia === 'DIA_COMUM') ? 5 : metaCalculada.limitePlantao,
        dados: payloadRotas
    });
  };

  /**
   * POST /whatsapp/escala/disparar-manual
   */
  public dispararEscalaManual = async (req: Request, res: Response): Promise<any> => {
    const relatorio = await this.bot.dispararEscalaManual();
    return res.status(200).json({ message: "Escala manual processada e enviada com sucesso!", relatorio });
  };

  /**
   * POST /whatsapp/escala/resetar-fila
   */
  public resetarFilaDoDia = async (req: Request, res: Response): Promise<any> => {
    await this.bot.resetarFilaDoDia();
    return res.status(200).json({ message: "A fila de joinhas do dia foi completamente zerada." });
  };
}