import { Router, Request, Response } from "express";
import { botInstance } from "../index";
import { AppDataSource } from "../data-source";
import { OrdemJoinha } from "../models/OrdemJoinha";
import { Rota } from "../models/Rota";
import { DiasTipo } from "../models/DiasTipo";
import MotoristaService from "../service/MotoristaService";

const rotasWhatsapp = Router();

/**
 * Middleware para garantir que o bot está inicializado antes de qualquer comando
 */
const verificarBot = (req: Request, res: Response, next: any) => {
    if (!botInstance) {
        return res.status(503).json({ error: "O serviço de WhatsApp está offline ou inicializando." });
    }
    next();
};

/**
 * Auxiliar para converter 'AAAA-MM-DD' em objeto Date sem fuso horário quebrado
 */
const obterDataAlvoSemFuso = (dataParam: string): Date => {
    const [ano, mes, dia] = dataParam.split('-').map(Number);
    return new Date(ano, mes - 1, dia, 0, 0, 0, 0);
};

/**
 * Auxiliar para calcular metadados do tipo de dia e limites de corte conforme a regra de negócio
 */
const calcularMetaConfiguracao = async (dataAlvo: Date) => {
    const diasTipoRepositorio = AppDataSource.getRepository(DiasTipo);
    const rotaRepositorio = AppDataSource.getRepository(Rota);

    const registroManual = await diasTipoRepositorio.findOneBy({ data: dataAlvo });
    
    let tipoDia: 'DIA_COMUM' | 'DIA_LIVRE' = (dataAlvo.getDay() === 0 || dataAlvo.getDay() === 6) ? 'DIA_LIVRE' : 'DIA_COMUM';
    if (registroManual) {
        tipoDia = registroManual.tipo as any;
    }

    const ehSegundaFeira = dataAlvo.getDay() === 1 && tipoDia === 'DIA_COMUM';
    const limitePlantao = ehSegundaFeira ? 5 : 4;

    const [rotasTarde, rotasMadrugada] = await Promise.all([
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_TARDE' }, order: { ordem: "ASC" } }),
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_MADRUGADA' }, order: { ordem: "ASC" } })
    ]);

    // REGRA DE NEGÓCIO: Desconta a última rota da tarde (Apoio) do cálculo de tamanho das listas úteis
    const rotasValidasTardeQtd = rotasTarde.length > 0 ? rotasTarde.length - 1 : 0;
    const rotasValidasMadrugadaQtd = rotasMadrugada.length;
    const qtdMaxRotasValidas = Math.max(rotasValidasTardeQtd, rotasValidasMadrugadaQtd);
    const posicaoDoApoio = qtdMaxRotasValidas + 1;

    return {
        tipoDia,
        ehSegundaFeira,
        limitePlantao,
        rotasTarde,
        rotasMadrugada,
        qtdMaxRotasValidas,
        posicaoDoApoio
    };
};

/**
 * 1. STATUS DO CADASTRO (Ligar/Desligar @cadastrar)
 */
rotasWhatsapp.post('/whatsapp/status-cadastro', verificarBot, async (req: Request, res: Response) => {
    const { aberto } = req.body;
    try {
        botInstance.setCadastroStatus(aberto);
        const titulo = "SISTEMA DE CADASTRO";
        const aviso = aberto 
            ? "🔓 *CADASTRO LIBERADO!* \nMotoristas novos podem enviar: `@cadastrar Seu Nome`" 
            : "🔒 *CADASTRO FECHADO!* \nNovos registros estão suspensos.";
            
        await botInstance.enviarMensagemExterna(titulo, aviso);
        return res.status(200).json({ message: "Status alterado e grupo avisado!" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao comunicar com o WhatsApp." });
    }
});

/**
 * 2. GERAR ESCALA (Disparo Manual)
 */
rotasWhatsapp.post('/whatsapp/gerar-escala', verificarBot, async (req: Request, res: Response) => {
    try {
        const relatorio = await botInstance.dispararEscalaManual();
        // Feedback extra de auditoria
        await botInstance.enviarMensagemExterna("🤖 BOT INFO", "✅ Escala gerada e enviada via *Painel Mobile*.");
        return res.status(200).json({ message: "Escala disparada!", relatorio });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 3. LIMPAR FILA (Zerar Joinhas do dia)
 */
rotasWhatsapp.post('/whatsapp/limpar-fila', verificarBot, async (req: Request, res: Response) => {
    try {
        await botInstance.resetarFilaDoDia();
        return res.status(200).json({ message: "Fila zerada com sucesso!" });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 4. ENVIAR LISTA DE MOTORISTAS (Equivalente ao @motoristas)
 */
rotasWhatsapp.post('/whatsapp/enviar-lista-motoristas', verificarBot, async (req: Request, res: Response) => {
    try {
        const motoristas = await MotoristaService.listarMotoristas();
        let listaTexto = motoristas.length === 0 ? "Nenhum motorista cadastrado." : "";
        motoristas.forEach((m, i) => {
            listaTexto += `${i + 1}. ${m.nome} [${m.ativo ? "✅" : "🚫"}]\n`;
        });
        await botInstance.enviarMensagemExterna("👥 LISTA DE MOTORISTAS", listaTexto);
        return res.status(200).json({ message: "Lista enviada para o grupo!" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao gerar lista." });
    }
});

/**
 * 5. CONFIGURAR DIA (Feriados / Dias Livres)
 */
rotasWhatsapp.post('/whatsapp/configurar-dia', verificarBot, async (req: Request, res: Response) => {
    let { data, tipo } = req.body;
    if (!data || !tipo) return res.status(400).json({ error: "Data e tipo são obrigatórios." });

    try {
        if (data === 'hoje') {
            const d = new Date();
            data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        }
        await botInstance.escalaService.definirTipoDiaManual(data, tipo);
        const statusTexto = tipo === 'DIA_LIVRE' ? 'LIVRE' : 'COMUM';
        
        const mensagem = `📅 *CONFIGURAÇÃO DO DIA*\n\n` + 
                         `Data: ${data}\n` + 
                         `Tipo Dia: ${statusTexto}\n\n` + 
                         `_Alteração via *Link App*_`;
                         
        await botInstance.enviarMensagemExterna("SISTEMA", mensagem);
        return res.status(200).json({ message: "Calendário atualizado!" });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 6. COMUNICADO LIVRE
 */
rotasWhatsapp.post('/whatsapp/comunicado', verificarBot, async (req: Request, res: Response) => {
    const { mensagem } = req.body;
    if (!mensagem) return res.status(400).json({ error: "Mensagem vazia." });
    try {
        await botInstance.enviarMensagemExterna("📢 AVISO VIA APP", mensagem);
        return res.status(200).json({ message: "Mensagem enviada!" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao enviar." });
    }
});

/**
 * 7. ENDPOINT DEDICADO: LISTA DETALHADA DA ESCALA (PLANTÃO, ROTAS, APOIO E BACKUP)
 * URL: GET /whatsapp/escala?data=AAAA-MM-DD
 */
rotasWhatsapp.get('/whatsapp/escala', verificarBot, async (req: Request, res: Response) => {
    const dataParam = req.query.data as string;
    if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

    try {
        const [ano, mes, dia] = dataParam.split('-').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia, 0, 0, 0, 0);

        // Se o celular buscou pelo dia 20, a lista de joinhas de origem é do dia 19 (dataAlvo - 1 dia)
        const dataOrigemJoinha = new Date(dataAlvo);
        dataOrigemJoinha.setDate(dataOrigemJoinha.getDate() - 1);
        dataOrigemJoinha.setHours(0, 0, 0, 0);

        const inicioDiaOrigem = new Date(dataOrigemJoinha.getFullYear(), dataOrigemJoinha.getMonth(), dataOrigemJoinha.getDate(), 0, 0, 0, 0);
        const fimDiaOrigem = new Date(dataOrigemJoinha.getFullYear(), dataOrigemJoinha.getMonth(), dataOrigemJoinha.getDate(), 23, 59, 59, 999);

        const listaJoiaRepositorio = AppDataSource.getRepository(require("../models/ListaJoia").ListaJoia);
        let listaOrigem = await listaJoiaRepositorio.createQueryBuilder("lista")
            .where("lista.dia BETWEEN :inicio AND :fim", { inicio: inicioDiaOrigem, fim: fimDiaOrigem })
            .getOne();

        if (!listaOrigem) {
            listaOrigem = await botInstance.registroService.buscarOuCriarListaDoDia('CAPTURA_DIARIA', inicioDiaOrigem);
        }

        const filaJoinhas = await AppDataSource.getRepository(OrdemJoinha).find({
            where: { listaJoia: { id: listaOrigem.id } },
            relations: ["motorista"],
            order: { isPenalizado: "ASC", horaDoJoinha: "ASC" }
        });

        // Metadados calculados com base na data da escala (Joinha + 1)
        const meta = await calcularMetaConfiguracao(dataAlvo);

        const payload = filaJoinhas.map((reg, index) => {
            const posicao = index + 1;
            let categoria: "PLANTAO" | "ROTA" | "APOIO" | "BACKUP" | "LIVRE" = "BACKUP";

            if (meta.tipoDia === 'DIA_COMUM') {
                if (posicao <= meta.limitePlantao) categoria = "PLANTAO";
                else if (posicao > meta.limitePlantao && posicao <= meta.qtdMaxRotasValidas) categoria = "ROTA";
                else if (posicao === meta.posicaoDoApoio) categoria = "APOIO";
                else categoria = "BACKUP";
            } else {
                if (posicao <= 9) categoria = "PLANTAO";
                else categoria = "LIVRE";
            }

            return {
                posicao,
                categoria,
                motorista: { nome: reg.motorista?.nome || "Motorista Sem Nome" },
                isPenalizado: reg.isPenalizado
            };
        });

        // REGRA DE NOMEAÇÃO DO CABEÇALHO: Exibe a data de referência da Escala (Joinha + 1)
        const diaTexto = String(dataAlvo.getDate()).padStart(2, '0');
        const mesTexto = String(dataAlvo.getMonth() + 1).padStart(2, '0');

        return res.status(200).json({
            tipoDia: meta.tipoDia,
            ehSegundaFeira: meta.ehSegundaFeira,
            limitePlantao: meta.limitePlantao,
            dataExibicaoTexto: `${diaTexto}/${mesTexto}`, // Passa para o celular "20/05" se o joia foi dia 19
            dados: payload
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 8. ENDPOINT DEDICADO: ATRIBUIÇÃO COMPLETA DAS ROTAS DA TARDE
 * URL: GET /whatsapp/rotas-tarde?data=AAAA-MM-DD
 */
rotasWhatsapp.get('/whatsapp/rotas-tarde', verificarBot, async (req: Request, res: Response) => {
    const dataParam = req.query.data as string;
    if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

    try {
        const [ano, mes, dia] = dataParam.split('-').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia, 0, 0, 0, 0);

        const dataOrigemJoinha = new Date(dataAlvo);
        dataOrigemJoinha.setDate(dataOrigemJoinha.getDate() - 1);
        dataOrigemJoinha.setHours(0, 0, 0, 0);

        const listaOrigem = await botInstance.registroService.buscarOuCriarListaDoDia('CAPTURA_DIARIA', dataOrigemJoinha);
        
        const [filaJoinhas, rotasTardeRaw] = await Promise.all([
            AppDataSource.getRepository(OrdemJoinha).find({ where: { listaJoia: { id: listaOrigem.id } }, relations: ["motorista"], order: { isPenalizado: "ASC", horaDoJoinha: "ASC" } }),
            AppDataSource.getRepository(Rota).find({ where: { tipo_rota: 'ROTA_TARDE' }, relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro"], order: { ordem: "ASC" } })
        ]);

        const meta = await calcularMetaConfiguracao(dataAlvo);

        const payload = rotasTardeRaw.map((rota, index) => {
            const ehUltimaRota = index === rotasTardeRaw.length - 1;
            let motoristaEscalado = null;

            // Se for a última rota cadastrada da tarde (Pertence obrigatoriamente ao Apoio no DIA_COMUM)
            if (ehUltimaRota && meta.tipoDia === 'DIA_COMUM') {
                const registroApoio = filaJoinhas[meta.posicaoDoApoio - 1];
                if (registroApoio) {
                    motoristaEscalado = { nome: registroApoio.motorista?.nome, posicaoJoinha: meta.posicaoDoApoio };
                }
            } else {
                // Rotas comuns da tarde puxam sequencialmente conforme o índice da fila
                const registroComum = filaJoinhas[index];
                if (registroComum) {
                    motoristaEscalado = { nome: registroComum.motorista?.nome, posicaoJoinha: index + 1 };
                }
            }

            return {
                id: rota.id,
                nomeRota: rota.nome,
                tipo: ehUltimaRota && meta.tipoDia === 'DIA_COMUM' ? "APOIO" : "COMUM",
                motorista: motoristaEscalado,
                passageiros: rota.passageiros || []
            };
        });

        const diaTexto = String(dataAlvo.getDate()).padStart(2, '0');
        const mesTexto = String(dataAlvo.getMonth() + 1).padStart(2, '0');

        return res.status(200).json({
            dataExibicaoTexto: `${diaTexto}/${mesTexto}`,
            dados: payload
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 9. ENDPOINT DEDICADO: ATRIBUIÇÃO COMPLETA DAS ROTAS DA MADRUGADA
 * URL: GET /whatsapp/rotas-madrugada?data=AAAA-MM-DD
 */
rotasWhatsapp.get('/whatsapp/rotas-madrugada', verificarBot, async (req: Request, res: Response) => {
    const dataParam = req.query.data as string;
    if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

    try {
        const [ano, mes, dia] = dataParam.split('-').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia, 0, 0, 0, 0);

        const dataOrigemJoinha = new Date(dataAlvo);
        dataOrigemJoinha.setDate(dataOrigemJoinha.getDate() - 1);
        dataOrigemJoinha.setHours(0, 0, 0, 0);

        const inicioDiaOrigem = new Date(dataOrigemJoinha.getFullYear(), dataOrigemJoinha.getMonth(), dataOrigemJoinha.getDate(), 0, 0, 0, 0);
        const fimDiaOrigem = new Date(dataOrigemJoinha.getFullYear(), dataOrigemJoinha.getMonth(), dataOrigemJoinha.getDate(), 23, 59, 59, 999);

        const listaJoiaRepositorio = AppDataSource.getRepository(require("../models/ListaJoia").ListaJoia);
        let listaOrigem = await listaJoiaRepositorio.createQueryBuilder("lista")
            .where("lista.dia BETWEEN :inicio AND :fim", { inicio: inicioDiaOrigem, fim: fimDiaOrigem })
            .getOne();

        if (!listaOrigem) {
            listaOrigem = await botInstance.registroService.buscarOuCriarListaDoDia('CAPTURA_DIARIA', inicioDiaOrigem);
        }
        
        const [filaJoinhas, rotasMadrugadaRaw] = await Promise.all([
            AppDataSource.getRepository(OrdemJoinha).find({ where: { listaJoia: { id: listaOrigem.id } }, relations: ["motorista"], order: { isPenalizado: "ASC", horaDoJoinha: "ASC" } }),
            AppDataSource.getRepository(Rota).find({ where: { tipo_rota: 'ROTA_MADRUGADA' }, relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro"], order: { ordem: "ASC" } })
        ]);

        const payload = rotasMadrugadaRaw.map((rota, index) => {
            const registroComum = filaJoinhas[index];
            let motoristaEscalado = null;

            if (registroComum) {
                motoristaEscalado = { nome: registroComum.motorista?.nome, posicaoJoinha: index + 1 };
            }

            return {
                id: rota.id,
                nomeRota: rota.nome,
                motorista: motoristaEscalado,
                passageiros: rota.passageiros || []
            };
        });

        const dataMadrugadaExibicao = new Date(dataOrigemJoinha);
        dataMadrugadaExibicao.setDate(dataMadrugadaExibicao.getDate() + 2);
        
        const diaTexto = String(dataMadrugadaExibicao.getDate()).padStart(2, '0');
        const mesTexto = String(dataMadrugadaExibicao.getMonth() + 1).padStart(2, '0');

        // 🔥 O ERRO ESTAVA AQUI: Agora retorna o objeto envelopado com 'dados' igualzinho ao da tarde
        return res.status(200).json({
            dataExibicaoTexto: `${diaTexto}/${mesTexto}`,
            dados: payload
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

export default rotasWhatsapp;