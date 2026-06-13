import { Router, Request, Response, NextFunction } from "express";
import { botInstance } from "../index";
import { AppDataSource } from "../data-source";
import { OrdemJoinha } from "../models/OrdemJoinha";
import { Rota } from "../models/Rota";
import { DiasTipo } from "../models/DiasTipo";
import { ListaJoia } from "../models/ListaJoia";
import { RotaAtribuida } from "../models/RotaAtribuida";
import MotoristaService from "../service/MotoristaService";
import verificarBot from "../middlewares/VerificarBot";
import obterDataAlvoSemFuso from "../utils/helpers/ObterDataAlvo";
import calcularMetaConfiguracao from "../utils/helpers/CalcularMetaConfiguracao";
import formatarDataIsoPura from "../utils/formatters/formatarDataPorDia";
import { Motorista } from "../models/Motorista";
import { ILike } from "typeorm";
import { ListaRota } from "../models/ListaRota";
import { EscalaService } from "../service/whatsapp/EscalaService";

const rotasWhatsApp = Router();

/**
 * FUNÇÃO AUXILIAR: Resolve o objeto Date correto baseando-se no dia digitado,
 * blindando o sistema contra viradas de mês e ano.
 */
function calcularDataAlvoSegura(diaDigitado: number): Date {
    const hoje = new Date();
    let anoAlvo = hoje.getFullYear();
    let mesAlvo = hoje.getMonth();

    if (diaDigitado > hoje.getDate()) {
        mesAlvo -= 1;
        if (mesAlvo < 0) {
            mesAlvo = 11;
            anoAlvo -= 1;
        }
    }
    return new Date(anoAlvo, mesAlvo, diaDigitado, 12, 0, 0, 0);
}

/**
 * 1. STATUS DO CADASTRO (Ligar/Desligar @cadastrar)
 */
rotasWhatsApp.post('/whatsapp/status-cadastro', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { aberto } = req.body;
    await botInstance.setCadastroStatus(aberto);
    
    const titulo = "SISTEMA DE CADASTRO";
    const aviso = aberto 
        ? "🔓 *CADASTRO LIBERADO!* \nMotoristas novos podem enviar: `@cadastrar Seu Nome`" 
        : "🔒 *CADASTRO FECHADO!* \nNovos registros estão suspensos.";
        
    await botInstance.enviarMensagemExterna(titulo, aviso);
    return res.status(200).json({ message: "Status alterado e grupo avisado!" });
});
/**
 * 2. GERAR ESCALA (Disparo Parametrizado via App baseado na Data de Execução)
 * URL: POST /whatsapp/gerar-escala
 */
rotasWhatsApp.post('/whatsapp/gerar-escala', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { dataExecucao } = req.body; // Recebe no formato "DD/MM/AAAA"
    
    let dataExecucaoObjeto: Date;
    if (dataExecucao) {
        const [dia, mes, ano] = dataExecucao.split('/').map(Number);
        dataExecucaoObjeto = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    } else {
        // Fallback: se não enviar, assume a execução como amanhã
        dataExecucaoObjeto = new Date();
        dataExecucaoObjeto.setDate(dataExecucaoObjeto.getDate() + 1);
    }

    // 🚀 REGRA DE OURO DO APP: Subtrai 1 dia da Execução para encontrar o Dia da Geração (Joinhas)
    const dataGeracaoObjeto = new Date(dataExecucaoObjeto);
    dataGeracaoObjeto.setDate(dataGeracaoObjeto.getDate() - 1);
    
    const dataIsoPura = `${dataGeracaoObjeto.getFullYear()}-${String(dataGeracaoObjeto.getMonth() + 1).padStart(2, '0')}-${String(dataGeracaoObjeto.getDate()).padStart(2, '0')}`;

    const listaJoia = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
        .where("DATE(lista.dia) = :dataIsoPura", { dataIsoPura })
        .getOne();

    if (!listaJoia) {
        const diaTexto = String(dataGeracaoObjeto.getDate()).padStart(2, '0');
        const mesTexto = String(dataGeracaoObjeto.getMonth() + 1).padStart(2, '0');
        return res.status(404).json({ error: `Nenhuma lista mãe de joinhas localizada para o dia de geração correspondente (${diaTexto}/${mesTexto}).` });
    }

    // Executa a escala perfeita cruzando as posições e salvando na tabela de atribuições
    const relatorio = await botInstance.escalaService.gerarEscalaCompleta(listaJoia.id);
    
    // Dispara a mensagem oficial idêntica ao fluxo do robô do WhatsApp
    const diaExec = String(dataExecucaoObjeto.getDate()).padStart(2, '0');
    const mesExec = String(dataExecucaoObjeto.getMonth() + 1).padStart(2, '0');
    await botInstance.enviarMensagemExterna(`📋 ESCALA DO DIA \n EXECUÇÃO ${diaExec}/${mesExec}`, "✅ Escala via *Painel Mobile*.");
    
    return res.status(200).json({ message: "Escala processada com sucesso!", relatorio });
});


/**
 * 3. LIMPAR FILA (Zerar Joinhas do dia)
 */
rotasWhatsApp.post('/whatsapp/limpar-fila', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    await botInstance.resetarFilaDoDia();
    return res.status(200).json({ message: "Fila zerada com sucesso!" });
});

/**
 * 4. ENVIAR LISTA DE MOTORISTAS (Equivalente ao @motoristas)
 */
rotasWhatsApp.post('/whatsapp/enviar-lista-motoristas', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const motoristas = await MotoristaService.listarMotoristas();
    let listaTexto = motoristas.length === 0 ? "Nenhum motorista cadastrado." : "";
    motoristas.forEach((m, i) => {
        listaTexto += `${i + 1}. ${m.nome} [${m.ativo ? "✅" : "🚫"}]\n`;
    });

    await botInstance.enviarMensagemExterna("👥 LISTA DE MOTORISTAS", listaTexto);
    return res.status(200).json({ message: "Lista enviada para o grupo!" });
});

/**
 * 5. CONFIGURAR DIA (Feriados / Dias Livres)
 */
rotasWhatsApp.post('/whatsapp/configurar-dia', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    let { data, tipo } = req.body;
    if (!data || !tipo) return res.status(400).json({ error: "Data e tipo são obrigatórios." });

    if (data === 'hoje') {
        const d = new Date();
        data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }

    await botInstance.escalaService.definirTipoDiaManual(data, tipo);
    
    const statusTexto = tipo === 'DIA_LIVRE' ? 'LIVRE' : 'COMUM';
    const message = `📅 *CONFIGURAÇÃO DO DIA*\n\nData: ${data}\nTipo Dia: ${statusTexto}\n\n_Alteração via *Link App*_`;
                     
    await botInstance.enviarMensagemExterna("SISTEMA", message);
    return res.status(200).json({ message: "Calendário atualizado!" });
});

/**
 * 6. COMUNICADO LIVRE
 */
rotasWhatsApp.post('/whatsapp/comunicado', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { mensagem } = req.body;
    if (!mensagem) return res.status(400).json({ error: "Mensagem vazia." });

    await botInstance.enviarMensagemExterna("📢 AVISO VIA APP", mensagem);
    return res.status(200).json({ message: "Mensagem enviada!" });
});
/**
 * 7. ENDPOINT DEDICADO: LISTA DETALHADA DA ESCALA (PLANTÃO, ROTAS, APOIO E BACKUP)
 * URL: GET /whatsapp/escala?data=AAAA-MM-DD
 * 
 * GARANTIA: Alinha dinamicamente os cortes de categoria visuais do App (X) 
 * com o dia operacional real calculado pela Madrugada de Execução (X+2).
 */
rotasWhatsApp.get('/whatsapp/escala', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dataParam = req.query.data as string; // Recebe "2026-06-11" (Hoje)
        if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

        // 1. Extração puramente textual da URL do navegador (Sem interferência do fuso do banco)
        const partesData = dataParam.trim().split('-');
        const anoDigitado = parseInt(partesData[0], 10);
        const mesDigitado = parseInt(partesData[1], 10) - 1; // 0 = Janeiro,
        const diaDigitado = parseInt(partesData[2], 10);

        // 2. PARÂMETRO = DIA 11. Recuamos textualmente 1 dia para achar o Dia X (Geração = Dia 10)
        // Criamos o objeto travado no meio-dia para anular qualquer alteração de servidores UTC
        const dataOrigemJoinha = new Date(anoDigitado, mesDigitado, diaDigitado - 1, 12, 0, 0, 0); // Dia 10

        // Intervalos rígidos para o MySQL buscar a ListaJoia gerada no dia 10
        const inicioDiaJoia = new Date(dataOrigemJoinha);
        inicioDiaJoia.setHours(0, 0, 0, 0);
        const fimDiaJoia = new Date(dataOrigemJoinha);
        fimDiaJoia.setHours(23, 59, 59, 999);

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("lista.dia BETWEEN :inicioDiaJoia AND :fimDiaJoia", { inicioDiaJoia, fimDiaJoia })
            .getOne();

        if (!listaOrigem) {
            return res.status(200).json({
                tipoDia: "DIA_COMUM",
                ehSegundaFeira: false,
                limitePlantao: 4,
                dataExibicaoTexto: `${String(diaDigitado).padStart(2, '0')}/${String(mesDigitado + 1).padStart(2, '0')}`,
                listaId: 0,
                dados: []
            });
        }

        // 3. MATEMÁTICA TEMPORAL TEXTUAL IMUTÁVEL (Ignora falhas de objetos vindos do banco)
        // Garantimos que a Tarde seja Dia 11 e a Madrugada seja Dia 12, preservando o mês correto
        const dataTardeAlvo = new Date(anoDigitado, mesDigitado, diaDigitado, 12, 0, 0, 0);      // Dia 11
        const dataMadrugadaAlvo = new Date(anoDigitado, mesDigitado, diaDigitado + 1, 12, 0, 0, 0); // Dia 12

        // Texto de exibição mantém a data atual de execução ("11/06")
        const dataExibicaoTexto = `${String(dataTardeAlvo.getDate()).padStart(2, '0')}/${String(dataTardeAlvo.getMonth() + 1).padStart(2, '0')}`;

        const jaExisteFila = await AppDataSource.getRepository(OrdemJoinha).createQueryBuilder("ordem")
            .where("ordem.listaJoiaId = :listaId", { listaId: listaOrigem.id })
            .getExists();

        if (!jaExisteFila) {
            await botInstance.escalaService.gerarEscalaCompleta(listaOrigem.id);
        }

        const filaJoinhas = await AppDataSource.getRepository(OrdemJoinha).find({
            where: { listaJoia: { id: listaOrigem.id } },
            relations: ["motorista"],
            order: { 
                isPenalizado: "ASC",
                posicaoEfetiva: "ASC",
                horaDoJoinha: "ASC"
            }
        });

        // 📋 Chamada das metas enviando os objetos textuais blindados (Consulta dia 11 e dia 12)
        const metaTarde = await calcularMetaConfiguracao(dataTardeAlvo);
        const metaMadrugada = await calcularMetaConfiguracao(dataMadrugadaAlvo);

        if (!metaTarde || !metaMadrugada) {
            return res.status(500).json({ error: "Falha ao calcular as configurações de meta para os turnos." });
        }

        // Só há apoio se ambos os turnos forem comuns
        const temApoioValido = metaTarde.tipoDia === 'DIA_COMUM' && metaMadrugada.tipoDia === 'DIA_COMUM';

        const payload = filaJoinhas.map((reg, index) => {
            const posicao = index + 1;
            let category: "PLANTAO" | "ROTA" | "APOIO" | "BACKUP" | "LIVRE" = "BACKUP";

            // A distribuição de vagas passa a ler o status correto da meta da madrugada
            if (metaMadrugada.tipoDia === 'DIA_COMUM') {
                if (posicao <= metaMadrugada.limitePlantao) {
                    category = "PLANTAO";
                } 
                else if (temApoioValido && posicao === metaTarde.posicaoDoApoio) {
                    category = "APOIO";
                } 
                // Aloca os motoristas das posições 5, 6, 7 e 8 como ROTA
                else if (posicao > metaMadrugada.limitePlantao && posicao <= metaMadrugada.qtdMaxRotasValidas) {
                    category = "ROTA"; 
                }
            } else {
                if (posicao <= metaMadrugada.limitePlantao) category = "PLANTAO";
                else category = "LIVRE";
            }

            return {
                id: reg.id,
                posicao,
                categoria: category,
                isApoioManual: reg.isApoioManual || false,
                motorista: { 
                    nome: reg.motorista?.nome || "Motorista Sem Nome",
                    podeFazerRota: reg.motorista?.podeFazerRota
                },
                whatsAppLid: reg.motorista?.whatsAppLid || ''
            };
        });

        return res.status(200).json({
            tipoDia: metaMadrugada.tipoDia, // Retornará DIA_COMUM baseado na sexta-feira estável
            ehSegundaFeira: dataTardeAlvo.getDay() === 1 && metaTarde.tipoDia === 'DIA_COMUM',
            limitePlantao: metaMadrugada.limitePlantao, 
            dataExibicaoTexto, 
            listaId: listaOrigem.id, 
            dados: payload
        });
    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});
/** 
 * GARANTIA: Aplica as três premissas dinâmicas baseadas no tipo de dia de execução.
 * Mantém lacunas abertas se houver falta de adesão no dia atual (X), mas popula 
 * obrigatoriamente a última rota da tarde se houver Apoio gerado no sábado (X-1).
 */

/**
 * 8. ENDPOINT: LISTAR ROTAS DA TARDE OPERACIONAIS COM REGRAS RESTRITAS DE APOIO
 * URL: GET /whatsapp/rotas-tarde?data=AAAA-MM-DD
 */
rotasWhatsApp.get('/whatsapp/rotas-tarde', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dataParam = req.query.data as string; // Recebe o Dia X (Ex: "2026-06-11")
        if (!dataParam) {
            return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });
        }

        const partesData = dataParam.trim().split('-');
        const anoDigitado = parseInt(partesData[0], 10);
        const mesDigitado = parseInt(partesData[1], 10) - 1;
        const diaDigitado = parseInt(partesData[2], 10);

        // Lista de origem do Joinha (Dia X)
        const dataOrigemJoinha = new Date(anoDigitado, mesDigitado, diaDigitado, 12, 0, 0, 0);
        const inicioDiaJoia = new Date(dataOrigemJoinha);
        inicioDiaJoia.setHours(0, 0, 0, 0);
        const fimDiaJoia = new Date(dataOrigemJoinha);
        fimDiaJoia.setHours(23, 59, 59, 999);

        // Data de Execução Operacional: Dia X + 1
        const dataTardeOperacional = new Date(anoDigitado, mesDigitado, diaDigitado + 1, 12, 0, 0, 0);
        const dataTardeIsoString = `${dataTardeOperacional.getFullYear()}-${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataTardeOperacional.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataTardeOperacional.getDate()).padStart(2, '0')}/${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}`;

        const registroManual = await AppDataSource.getRepository(DiasTipo).createQueryBuilder("diasTipo")
            .where("DATE(diasTipo.data) = :dataTardeIsoString", { dataTardeIsoString })
            .getOne();

        let tipoDiaAlvo: 'DIA_COMUM' | 'DIA_LIVRE' = 'DIA_COMUM';
        if (registroManual) {
            tipoDiaAlvo = registroManual.tipo;
        } else {
            const diaSemana = dataTardeOperacional.getDay();
            if (diaSemana === 0 || diaSemana === 6) tipoDiaAlvo = 'DIA_LIVRE';
        }

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("lista.dia BETWEEN :inicioDiaJoia AND :fimDiaJoia", { inicioDiaJoia, fimDiaJoia })
            .getOne();

        if (!listaOrigem) {
            return res.status(200).json({ dataExibicaoTexto, dados: [] });
        }

        const todasAsRotasTarde = await AppDataSource.getRepository(Rota).createQueryBuilder("rota")
            .leftJoinAndSelect("rota.passageiros", "passageiro")
            .leftJoinAndSelect("passageiro.endereco", "endereco") 
            .leftJoinAndSelect("endereco.bairro", "bairro")
            .leftJoinAndSelect("rota.empresas", "empresas")
            .where("rota.tipo_rota = 'ROTA_TARDE'")
            .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
            .getMany();

        if (todasAsRotasTarde.length === 0) {
            return res.status(200).json({ dataExibicaoTexto, dados: [] });
        }

        // ALINHAMENTO DE DATA COMPLETO: Busca as atribuições salvas exatamente na dataGeracao = dataTardeIsoString (+1 Dia)
        const atribuicoesEfetuadas = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
            .leftJoinAndSelect("atrib.motorista", "motorista")
            .leftJoinAndSelect("atrib.rota", "rota")
            .where("atrib.listaJoia = :listaId", { listaId: listaOrigem.id })
            .andWhere("DATE(atrib.dataGeracao) = :dataTardeIsoString", { dataTardeIsoString })
            .getMany();

        let posicaoApoioCalculada = 0;
        let motoristaDoApoio: any = null;

        if (tipoDiaAlvo === 'DIA_COMUM') {
            posicaoApoioCalculada = todasAsRotasTarde.length;
            try {
                // Passa o diaDigitado (Dia X) para o serviço processar
                motoristaDoApoio = await EscalaService.obterMotoristaApoioEscalaMae(anoDigitado, mesDigitado, diaDigitado);
            } catch (serviceErr) {
                console.error("⚠️ Falha ao recuperar apoio do serviço:", serviceErr);
                motoristaDoApoio = null;
            }
        }

        // 4. MAPEAMENTO DO PAYLOAD FINAL WITH PRIORIDADE TOTAL À TELA (IGUAL À MADRUGADA)
        const payload = todasAsRotasTarde.map((rota, index) => {
            const numeroRotaAtual = rota.ordem ? parseInt(rota.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            const ehApoioReal = (tipoDiaAlvo === 'DIA_COMUM') && (numeroRotaAtual === posicaoApoioCalculada);
            const atribExistente = atribuicoesEfetuadas.find(a => a.rota?.id === rota.id);

            let motoristaFinal = null;
            let tipoFinal = ehApoioReal ? "APOIO" : "ROTA";

            // Se o admin removeu ou alterou a rota na tela, o registro do banco manda (mesmo vindo nulo)
            if (atribExistente) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || tipoFinal;
            } 
            // Se a vaga nunca foi mexida em tela, aplica o motorista automático vindo do serviço calibrado
            else if (ehApoioReal) {
                if (motoristaDoApoio) {
                    motoristaFinal = motoristaDoApoio;
                }
            }

            const posicaoJoinhaFinal = motoristaFinal ? (ehApoioReal ? posicaoApoioCalculada : index + 1) : null;

            return {
                id: atribExistente?.id || null,
                id_rota: rota.id,
                nomeRota: rota.nome || "",
                ordem: rota.ordem || "",
                horario: rota.horario || '18h00',
                tipo: tipoFinal, 
                motorista: motoristaFinal ? { id: motoristaFinal.id, nome: motoristaFinal.nome, posicaoJoinha: posicaoJoinhaFinal } : null,
                empresas: (rota.empresas || []).map(e => ({ id: e.id, nome: e.nome, icone: e.icone || null })),
                passageiros: (rota.passageiros || []).sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0)).map(p => ({
                    id_passageiro: p.id, 
                    nome: p.nome, 
                    telefoneWhatsApp: p.telefoneWhatsApp, 
                    ordem_na_rota: p.ordem_na_rota,
                    bairro: p.endereco?.bairro?.nome || null, 
                    logradouro: p.endereco?.nome || "Não cadastrado", 
                    numero: p.endereco?.numero || null
                }))
            };
        });

        return res.status(200).json({ dataExibicaoTexto, dados: payload });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});



/**
 * 9. ENDPOINT DEDICADO: ATRIBUIÇÃO COMPLETA DAS ROTAS DA MADRUGADA (FRONT-END APP)
 * URL: GET /whatsapp/rotas-madrugada?data=AAAA-MM-DD
 * 
 * GARANTIA: Mapeia as rotas da madrugada de forma achatada diretamente na raiz,
 * respeitando as posições vazias (null) caso faltem motoristas na fila do pátio.
 */
rotasWhatsApp.get('/whatsapp/rotas-madrugada', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dataParam = req.query.data as string;
        if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

        const dataJoiaPura = obterDataAlvoSemFuso(dataParam);
        const dataMadrugadaOperacional = new Date(dataJoiaPura);
        dataMadrugadaOperacional.setDate(dataMadrugadaOperacional.getDate() + 2);

        const dataJoiaIsoString = `${dataJoiaPura.getFullYear()}-${String(dataJoiaPura.getMonth() + 1).padStart(2, '0')}-${String(dataJoiaPura.getDate()).padStart(2, '0')}`;
        const dataMadrugadaIsoString = `${dataMadrugadaOperacional.getFullYear()}-${String(dataMadrugadaOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataMadrugadaOperacional.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataMadrugadaOperacional.getDate()).padStart(2, '0')}/${String(dataMadrugadaOperacional.getMonth() + 1).padStart(2, '0')}`;

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("DATE(lista.dia) = :dataJoiaIsoString", { dataJoiaIsoString })
            .getOne();

        if (!listaOrigem) {
            return res.status(200).json({ dataExibicaoTexto, dados: [] });
        }

        // 🚀 JUNÇÃO CORRETA: Encadeia os relacionamentos a partir do alias 'passageiro' para evitar erros no TypeORM
        const todasAsRotasMadrugada = await AppDataSource.getRepository(Rota).createQueryBuilder("rota")
            .leftJoinAndSelect("rota.passageiros", "passageiro")
            .leftJoinAndSelect("passageiro.endereco", "endereco")
            .leftJoinAndSelect("endereco.bairro", "bairro")
            .leftJoinAndSelect("rota.empresas", "empresas")
            .where("rota.tipo_rota = 'ROTA_MADRUGADA'")
            .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
            .getMany();

        if (todasAsRotasMadrugada.length === 0) {
            return res.status(200).json({ dataExibicaoTexto, dados: [] });
        }

        const atribuicoesGravadas = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
            .leftJoinAndSelect("atrib.motorista", "motorista")
            .leftJoinAndSelect("atrib.rota", "rota")
            .where("atrib.listaJoia = :listaId", { listaId: listaOrigem.id })
            .andWhere("DATE(atrib.dataGeracao) = :dataMadrugadaIsoString", { dataMadrugadaIsoString })
            .getMany();

        const payload = todasAsRotasMadrugada.map((rota, index) => {
            const atribExistente = atribuicoesGravadas.find(a => a.rota?.id === rota.id);

            let motoristaFinal = null;
            let tipoFinal = "ROTA";

            // 🧠 TRAVA DE INTERVENÇÃO MANUAL DA MADRUGADA:
            // Se houver registro manual do admin, preserva as alterações mesmo que a lista de joias mude
            if (atribExistente && (atribExistente.ehApoioManual || (atribExistente as any).ehApoioManual)) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || "ROTA";
            }
            // FLUXO REGULAR AUTOMÁTICO: Caso não tenha trava manual, exibe a escala gerada pelo robô
            else if (atribExistente) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || "ROTA";
            }

            let posicaoJoinhaFinal = motoristaFinal ? index + 1 : null;

            return {
                id: atribExistente?.id || null,
                id_rota: rota.id,
                nomeRota: rota.nome || "",
                ordem: rota.ordem || "",
                horario: rota.horario || '04h00',
                tipo: tipoFinal, 
                motorista: motoristaFinal ? { 
                    id: motoristaFinal.id, 
                    nome: motoristaFinal.nome, 
                    posicaoJoinha: posicaoJoinhaFinal 
                } : null,
                empresas: (rota.empresas || []).map(e => ({ id: e.id, nome: e.nome, icone: e.icone || null })),
                passageiros: (rota.passageiros || []).sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0)).map(p => ({
                    id_passageiro: p.id, 
                    nome: p.nome, 
                    telefoneWhatsApp: p.telefoneWhatsApp, 
                    ordem_na_rota: p.ordem_na_rota,
                    bairro: p.endereco?.bairro?.nome || null, 
                    logradouro: p.endereco?.nome || "Não cadastrado", 
                    numero: p.endereco?.numero || null
                }))
            };
        });

        return res.status(200).json({ dataExibicaoTexto, dados: payload });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});
/**
 * 10. Redistribui a escala segundo o padrão original do dia
 */
rotasWhatsApp.post('/whatsapp/escala/redistribuir', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Captura e valida a data enviada pela query string
        const dataParam = req.query.data as string;
        if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

        const dataAlvo = obterDataAlvoSemFuso(dataParam);
        const dataOrigemJoinha = new Date(dataAlvo);
        dataOrigemJoinha.setDate(dataOrigemJoinha.getDate() - 1);

        const dataOrigemJoiaIsoString = `${dataOrigemJoinha.getFullYear()}-${String(dataOrigemJoinha.getMonth() + 1).padStart(2, '0')}-${String(dataOrigemJoinha.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataAlvo.getDate()).padStart(2, '0')}/${String(dataAlvo.getMonth() + 1).padStart(2, '0')}`;

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("DATE(lista.dia) = :dataOrigemJoiaIsoString", { dataOrigemJoiaIsoString })
            .getOne();

        if (!listaOrigem) {
            return res.status(404).json({ error: "Nenhuma lista de Joias encontrada para a data informada." });
        }

        // 🚀 SE O ROBÔ FALHAR AQUI, O CATCH PEGA E O MIDDLEWARE GLOBAL TRATA TRANSPARENTEMENTE
        await botInstance.escalaService.gerarEscalaCompleta(listaOrigem.id);

        // 2. Busca a nova fila gerada para devolver ao painel atualizado
        const filaJoinhas = await AppDataSource.getRepository(OrdemJoinha).find({
            where: { listaJoia: { id: listaOrigem.id } },
            relations: ["motorista"],
            order: { 
                isPenalizado: "ASC",
                posicaoEfetiva: "ASC",
                horaDoJoinha: "ASC"
            }
        });

        const dataMadrugadaAlvo = new Date(listaOrigem.dia);
        dataMadrugadaAlvo.setDate(dataMadrugadaAlvo.getDate() + 2);

        const meta = await calcularMetaConfiguracao(dataMadrugadaAlvo);
        if (!meta) return res.status(500).json({ error: "Falha ao calcular configurações da meta." });

        const payload = filaJoinhas.map((reg, index) => {
            const posicao = index + 1;
            let category: "PLANTAO" | "ROTA" | "APOIO" | "BACKUP" | "LIVRE" = "BACKUP";

            if (meta.tipoDia === 'DIA_COMUM') {
                if (posicao <= meta.limitePlantao) category = "PLANTAO";
                else if (posicao === meta.posicaoDoApoio) category = "APOIO";
                else if (posicao > meta.limitePlantao && posicao <= meta.qtdMaxRotasValidas) category = "ROTA";
            } else {
                if (posicao <= 9) category = "PLANTAO";
                else category = "LIVRE";
            }

            return {
                id: reg.id,
                posicao,
                categoria: category,
                isApoioManual: reg.isApoioManual || false,
                motorista: { 
                    nome: reg.motorista?.nome || "Motorista Sem Nome",
                    podeFazerRota: reg.motorista?.podeFazerRota
                },
                whatsAppLid: reg.motorista?.whatsAppLid || ''
            };
        });

        return res.status(200).json({
            message: "Escala resetada e redistribuída com sucesso!",
            tipoDia: meta.tipoDia,
            ehSegundaFeira: dataMadrugadaAlvo.getDay() === 1 && meta.tipoDia === 'DIA_COMUM',
            limitePlantao: meta.limitePlantao,
            dataExibicaoTexto,
            listaId: listaOrigem.id, 
            dados: payload
        });

    } catch (err) {
        next(err); // 🚀 Entrega o erro com segurança para o seu middleware global do Express responder em JSON
    }
});
/**
 * 10. ENDPOINT DEDICADO: TEXTO FORMATADO DA ESCALA DA TARDE (ADMIN WHATSAPP COMANDOS)
 */
rotasWhatsApp.get('/whatsapp/rotas-tarde', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dataParam = req.query.data as string; // Recebe a data base. Ex: "2026-06-10"
        if (!dataParam) {
            return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });
        }

        // 1. EXTRAÇÃO TEMPORAL
        const partesData = dataParam.trim().split('-');
        const anoDigitado = parseInt(partesData[0], 10);
        const mesDigitado = parseInt(partesData[1], 10) - 1;
        const diaDigitado = parseInt(partesData[2], 10);

        // Lista de origem do Joinha (Dia Base - 1)
        const dataOrigemJoinha = new Date(anoDigitado, mesDigitado, diaDigitado - 1, 12, 0, 0, 0);
        const inicioDiaJoia = new Date(dataOrigemJoinha);
        inicioDiaJoia.setHours(0, 0, 0, 0);
        const fimDiaJoia = new Date(dataOrigemJoinha);
        fimDiaJoia.setHours(23, 59, 59, 999);

        // Padrão Normal da Tarde Operacional (+1 Dia do início)
        const dataTardeOperacional = new Date(anoDigitado, mesDigitado, diaDigitado, 12, 0, 0, 0);
        const dataTardeIsoString = `${dataTardeOperacional.getFullYear()}-${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataTardeOperacional.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataTardeOperacional.getDate()).padStart(2, '0')}/${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}`;

        // Padrão Estendido da Tarde (+2 Dias para o Apoio físico)
        const dataApoioOperacional = new Date(anoDigitado, mesDigitado, diaDigitado + 1, 12, 0, 0, 0);
        const dataApoioIsoString = `${dataApoioOperacional.getFullYear()}-${String(dataApoioOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataApoioOperacional.getDate()).padStart(2, '0')}`;

        const anoParam = dataTardeOperacional.getFullYear();
        const mesParam = dataTardeOperacional.getMonth();
        const diaParam = dataTardeOperacional.getDate();

        // Checagem do Calendário Operacional
        const registroManual = await AppDataSource.getRepository(DiasTipo).createQueryBuilder("diasTipo")
            .where("DATE(diasTipo.data) = :dataTardeIsoString", { dataTardeIsoString })
            .getOne();

        let tipoDiaAlvo: 'DIA_COMUM' | 'DIA_LIVRE' = 'DIA_COMUM';
        if (registroManual) {
            tipoDiaAlvo = registroManual.tipo;
        } else {
            const diaSemana = dataTardeOperacional.getDay();
            if (diaSemana === 0 || diaSemana === 6) tipoDiaAlvo = 'DIA_LIVRE';
        }

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("lista.dia BETWEEN :inicioDiaJoia AND :fimDiaJoia", { inicioDiaJoia, fimDiaJoia })
            .getOne();

        if (!listaOrigem) {
            return res.status(200).json({ dataExibicaoTexto, dados: [] });
        }

        // 2. BUSCA AS ROTAS FIXAS DA TARDE
        const todasAsRotasTarde = await AppDataSource.getRepository(Rota).createQueryBuilder("rota")
            .leftJoinAndSelect("rota.passageiros", "passageiro")
            .leftJoinAndSelect("passageiro.endereco", "endereco") 
            .leftJoinAndSelect("endereco.bairro", "bairro")
            .leftJoinAndSelect("rota.empresas", "empresas")
            .where("rota.tipo_rota = 'ROTA_TARDE'")
            .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
            .getMany();

        if (todasAsRotasTarde.length === 0) {
            return res.status(200).json({ dataExibicaoTexto, dados: [] });
        }

        // 3. CAPTURA TODAS AS ATRIBUIÇÕES DO PERÍODO DO DUPLO PADRÃO (Traz tanto +1 quanto +2)
        const atribuicoesEfetuadas = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
            .leftJoinAndSelect("atrib.motorista", "motorista")
            .leftJoinAndSelect("atrib.rota", "rota")
            .where("atrib.listaJoia = :listaId", { listaId: listaOrigem.id })
            .andWhere(
                "(DATE(atrib.dataGeracao) = :dataTardeIsoString OR DATE(atrib.dataGeracao) = :dataApoioIsoString)", 
                { dataTardeIsoString, dataApoioIsoString }
            )
            .getMany();

        let posicaoApoioCalculada = 0;
        let motoristaDoApoio: any = null;

        if (tipoDiaAlvo === 'DIA_COMUM') {
            posicaoApoioCalculada = todasAsRotasTarde.length;
            try {
                motoristaDoApoio = await EscalaService.obterMotoristaApoioEscalaMae(anoParam, mesParam, diaParam);
            } catch (serviceErr) {
                console.error("⚠️ Falha ao recuperar apoio do serviço:", serviceErr);
                motoristaDoApoio = null;
            }
        }

        // 4. MAPEAMENTO APLICANDO O DUPLO PADRÃO DE REMOÇÃO DE FORMA CIRÚRGICA
        const payload = todasAsRotasTarde.map((rota, index) => {
            const numeroRotaAtual = rota.ordem ? parseInt(rota.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            const ehApoioReal = (tipoDiaAlvo === 'DIA_COMUM') && (numeroRotaAtual === posicaoApoioCalculada);

            // APLICAÇÃO DO DUPLO PADRÃO DE DATA NA BUSCA:
            // A última rota (apoio) busca na data estendida (+2 dias), o restante busca na data comum (+1 dia)
            const dataFiltroAlvo = ehApoioReal ? dataApoioIsoString : dataTardeIsoString;
            
            // Localiza a atribuição guardada respeitando rigorosamente a janela daquela rota específica
            const atribExistente = atribuicoesEfetuadas.find(a => 
                a.rota?.id === rota.id && 
                a.dataGeracao && 
                new Date(a.dataGeracao).toISOString().split('T')[0] === dataFiltroAlvo
            );

            let motoristaFinal = null;
            let tipoFinal = ehApoioReal ? "APOIO" : "ROTA";

            // Se você salvou qualquer alteração ou remoção na janela correta daquela rota, ela prevalece
            if (atribExistente) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || tipoFinal;
            } 
            // Se a rota nunca recebeu modificação manual na tela, aplica o fluxo automático do apoio
            else if (ehApoioReal) {
                if (motoristaDoApoio) {
                    motoristaFinal = motoristaDoApoio;
                }
            }

            const posicaoJoinhaFinal = motoristaFinal ? (ehApoioReal ? posicaoApoioCalculada : index + 1) : null;

            return {
                id: atribExistente?.id || null,
                id_rota: rota.id,
                nomeRota: rota.nome || "",
                ordem: rota.ordem || "",
                horario: rota.horario || '18h00',
                tipo: tipoFinal, 
                motorista: motoristaFinal ? { id: motoristaFinal.id, nome: motoristaFinal.nome, posicaoJoinha: posicaoJoinhaFinal } : null,
                empresas: (rota.empresas || []).map(e => ({ id: e.id, nome: e.nome, icone: e.icone || null })),
                passageiros: (rota.passageiros || []).sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0)).map(p => ({
                    id_passageiro: p.id, 
                    nome: p.nome, 
                    telefoneWhatsApp: p.telefoneWhatsApp, 
                    ordem_na_rota: p.ordem_na_rota,
                    bairro: p.endereco?.bairro?.nome || null, 
                    logradouro: p.endereco?.nome || "Não cadastrado", 
                    numero: p.endereco?.numero || null
                }))
            };
        });

        return res.status(200).json({ dataExibicaoTexto, dados: payload });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});
/**
 * 11. ENDPOINT DEDICADO: TEXTO FORMATADO DA ESCALA DA TARDE (ADMIN WHATSAPP COMANDOS)
 */
rotasWhatsApp.get('/whatsapp/escala/madrugada/:dia', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Captura e validação do parâmetro :dia por número limpo
        const diaDigitado = parseInt(String(req.params.dia).replace(/\D/g, ''), 10);
        if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
            return res.status(400).json({ error: "Dia inválido." });
        }

        const dataJoiaPura = calcularDataAlvoSegura(diaDigitado);
        const dataMadrugadaOperacional = new Date(dataJoiaPura);
        dataMadrugadaOperacional.setDate(dataMadrugadaOperacional.getDate() + 2); // Regra X+2 da Madrugada

        const dataJoiaIsoString = `${dataJoiaPura.getFullYear()}-${String(dataJoiaPura.getMonth() + 1).padStart(2, '0')}-${String(dataJoiaPura.getDate()).padStart(2, '0')}`;
        const dataMadrugadaIsoString = `${dataMadrugadaOperacional.getFullYear()}-${String(dataMadrugadaOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataMadrugadaOperacional.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataMadrugadaOperacional.getDate()).padStart(2, '0')}/${String(dataMadrugadaOperacional.getMonth() + 1).padStart(2, '0')}`;

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("DATE(lista.dia) = :dataJoiaIsoString", { dataJoiaIsoString })
            .getOne();

        // Resposta padrão caso a lista mãe não exista no banco
        if (!listaOrigem) {
            return res.status(200).json({ 
                turno: "MADRUGADA", 
                dia_lista: diaDigitado, 
                dataExibicaoTexto, 
                dados: [] 
            });
        }

        // 🚀 DISPARO ORIGINAL DO WHATSAPP: Integrado sem quebrar nenhuma linha de dados
        try {
            const diaReal = dataJoiaPura.getDate();
            const resultadoWhats = await botInstance.escalaService.obterTextoPeriodoMadrugada(diaReal);
            if (resultadoWhats && resultadoWhats.texto) {
                await botInstance.enviarMensagemExterna("RELATÓRIO DO TURNO DA MADRUGADA", resultadoWhats.texto);
            }
        } catch (whatsErr: any) {
            console.error("⚠️ Falha ao empurrar texto da madrugada para o WhatsApp:", whatsErr.message);
        }

        // 2. Junção dos relacionamentos encadeados das rotas de madrugada
        const todasAsRotasMadrugada = await AppDataSource.getRepository(Rota).createQueryBuilder("rota")
            .leftJoinAndSelect("rota.passageiros", "passageiro")
            .leftJoinAndSelect("passageiro.endereco", "endereco")
            .leftJoinAndSelect("endereco.bairro", "bairro")
            .leftJoinAndSelect("rota.empresas", "empresas")
            .where("rota.tipo_rota = 'ROTA_MADRUGADA'")
            .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
            .getMany();

        if (todasAsRotasMadrugada.length === 0) {
            return res.status(200).json({ 
                turno: "MADRUGADA", 
                dia_lista: diaDigitado, 
                dataExibicaoTexto, 
                dados: [] 
            });
        }

        // 3. Busca das atribuições geradas para a data alvo da madrugada
        const atribuicoesGravadas = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
            .leftJoinAndSelect("atrib.motorista", "motorista")
            .leftJoinAndSelect("atrib.rota", "rota")
            .where("atrib.listaJoia = :listaId", { listaId: listaOrigem.id })
            .andWhere("DATE(atrib.dataGeracao) = :dataMadrugadaIsoString", { dataMadrugadaIsoString })
            .getMany();

        // 4. Construção estruturada do Payload final
        const payload = todasAsRotasMadrugada.map((rota, index) => {
            const atribExistente = atribuicoesGravadas.find(a => a.rota?.id === rota.id);

            let motoristaFinal = null;
            let tipoFinal = "ROTA";

            if (atribExistente && (atribExistente.ehApoioManual || (atribExistente as any).ehApoioManual)) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || "ROTA";
            }
            else if (atribExistente) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || "ROTA";
            }

            let posicaoJoinhaFinal = motoristaFinal ? index + 1 : null;

            return {
                id: atribExistente?.id || null,
                id_rota: rota.id,
                nomeRota: rota.nome || "",
                ordem: rota.ordem || "",
                horario: rota.horario || '04h00',
                tipo: tipoFinal, 
                motorista: motoristaFinal ? { 
                    id: motoristaFinal.id, 
                    nome: motoristaFinal.nome, 
                    posicaoJoinha: posicaoJoinhaFinal 
                } : null,
                empresas: (rota.empresas || []).map(e => ({ id: e.id, nome: e.nome, icone: e.icone || null })),
                passageiros: (rota.passageiros || []).sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0)).map(p => ({
                    id_passageiro: p.id, 
                    nome: p.nome, 
                    telefoneWhatsApp: p.telefoneWhatsApp, 
                    ordem_na_rota: p.ordem_na_rota,
                    bairro: p.endereco?.bairro?.nome || null, 
                    logradouro: p.endereco?.nome || "Não cadastrado", 
                    numero: p.endereco?.numero || null
                }))
            };
        });

        // 5. Retorno JSON unificado com identificação de turno
        return res.status(200).json({ 
            turno: "MADRUGADA", 
            dia_lista: diaDigitado, 
            dataExibicaoTexto, 
            dados: payload 
        });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});
/**
 * 12. ENDPOINT DEDICADO: LISTA DETALHADA DA ESCALA PARAMETRIZADA POR DIA
 */
rotasWhatsApp.get('/whatsapp/escala/:dia', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const diaDigitado = parseInt(String(req.params.dia).replace(/\D/g, ''), 10);
        if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) return res.status(400).json({ error: "Dia inválido." });

        const dataListaJoia = calcularDataAlvoSegura(diaDigitado);
        const dataIsoPura = formatarDataIsoPura(dataListaJoia);

        const listaOrigem = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("lista")
            .where("DATE(lista.dia) = :dataIsoPura", { dataIsoPura }).getOne();

        if (!listaOrigem) {
            return res.status(200).json({
                tipoDia: "LIVRE", ehSegundaFeira: false, limitePlantao: 4,
                dataExibicaoTexto: `${String(dataListaJoia.getDate()).padStart(2, '0')}/${String(dataListaJoia.getMonth() + 1).padStart(2, '0')}`,
                listaId: 0,
                dados: []
            });
        }

        // 🔍 CORREÇÃO: Substituído o .getExists() por um .getOne() limpo para checar se a fila já existe
        const registroFilaExistente = await AppDataSource.getRepository(OrdemJoinha).createQueryBuilder("ordem")
            .where("ordem.listaJoiaId = :listaId", { listaId: listaOrigem.id })
            .select("ordem.id") // Otimização: Traz apenas a coluna ID do banco
            .getOne();

        const jaExisteFila = !!registroFilaExistente;

        // O robô é acionado estritamente na primeira vez que a lista for requisitada
        if (!jaExisteFila) {
            // Executa o método original do seu backend que calcula e salva as atribuições
            await botInstance.escalaService.gerarEscalaCompleta(listaOrigem.id);
        }

        const filaJoinhas = await AppDataSource.getRepository(OrdemJoinha).find({
            where: { listaJoia: { id: listaOrigem.id } },
            relations: ["motorista"],
            order: { 
                isPenalizado: "ASC",
                posicaoEfetiva: "ASC",
                horaDoJoinha: "ASC"
            }
        });

        const dataMadrugadaAlvo = new Date(listaOrigem.dia);
        dataMadrugadaAlvo.setDate(dataMadrugadaAlvo.getDate() + 2);

        const meta = await calcularMetaConfiguracao(dataMadrugadaAlvo);
        if (!meta) return res.status(500).json({ error: "Falha ao calcular configurações da meta." });

        const payload = filaJoinhas.map((reg, index) => {
            const posicao = index + 1;
            let category: "PLANTAO" | "ROTA" | "APOIO" | "BACKUP" | "LIVRE" = "BACKUP";

            if (meta.tipoDia === 'DIA_COMUM') {
                if (posicao <= meta.limitePlantao) category = "PLANTAO";
                else if (posicao === meta.posicaoDoApoio) category = "APOIO";
                else if (posicao > meta.limitePlantao && posicao <= meta.qtdMaxRotasValidas) category = "ROTA";
            } else {
                if (posicao <= 9) category = "PLANTAO";
                else category = "LIVRE";
            }

            return {
                id: reg.id,
                posicao,
                categoria: category,
                isApoioManual: reg.isApoioManual || false,
                motorista: { 
                    nome: reg.motorista?.nome || "Motorista Sem Nome",
                    podeFazerRota: reg.motorista?.podeFazerRota
                },
                whatsAppLid: reg.motorista?.whatsAppLid || ''
            };
        });

        return res.status(200).json({
            tipoDia: meta.tipoDia,
            ehSegundaFeira: dataMadrugadaAlvo.getDay() === 1 && meta.tipoDia === 'DIA_COMUM',
            limitePlantao: meta.limitePlantao,
            dataExibicaoTexto: `${String(dataListaJoia.getDate()).padStart(2, '0')}/${String(dataListaJoia.getMonth() + 1).padStart(2, '0')}`,
            listaId: listaOrigem.id, 
            dados: payload
        });
    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});

/**
 * 13. ENDPOINT DEDICADO: FILTRAR MOTORISTAS ATIVOS POR NOME PARCIAL (AUTOCOMPLETAR)
 */
rotasWhatsApp.get('/whatsapp/motoristas/buscar-por-nome', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const nomeParcial = req.query.nome as string;

    if (!nomeParcial || !nomeParcial.trim()) {
        return res.status(200).json([]);
    }

    const motoristasEncontrados = await AppDataSource.getRepository(Motorista).find({
        where: {
            nome: ILike(`%${nomeParcial.trim()}%`),
            ativo: true
        },
        select: ["whatsAppLid", "nome"],
        take: 5 
    });

    return res.status(200).json(motoristasEncontrados);
});

/**
 * 14. ENDPOINT: REMOVER MOTORISTA DA FILA (BOTÃO LIXEIRA)
 */
rotasWhatsApp.post('/whatsapp/escala/remover', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { whatsappId, listaId } = req.body;
    const lista = await AppDataSource.getRepository(ListaJoia).findOneBy({ id: Number(listaId) });
    if (!lista) return res.status(404).json({ error: "Lista não encontrada." });

    await botInstance.registroService.removerMotoristaDaLista(whatsappId, lista.dia);
    return res.status(200).json({ message: "Motorista removido da escala com sucesso!" });
});

/**
 * 15. ENDPOINT: MOVER MOTORISTA NA FILA (BOTÕES SETA ▲ E ▼ DO APP)
 */
rotasWhatsApp.post('/whatsapp/escala/mover', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { whatsappId, listaId, novaPosicaoAlvo } = req.body;
    const lista = await AppDataSource.getRepository(ListaJoia).findOneBy({ id: Number(listaId) });
    if (!lista) return res.status(404).json({ error: "Lista não encontrada." });

    await botInstance.registroService.inserirEmPosicaoEspecifica(whatsappId, lista.dia, Number(novaPosicaoAlvo));
    return res.status(200).json({ message: "Posição da fila reordenada com sucesso!" });
});

/**
 * 16. ENDPOINT: INSERIR MOTORISTA NA FILA (BOTÃO + DO AUTOCOMPLETAR)
 */
rotasWhatsApp.post('/whatsapp/escala/inserir', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { whatsappId, listaId, posicaoAlvo } = req.body;
    const lista = await AppDataSource.getRepository(ListaJoia).findOneBy({ id: Number(listaId) });
    if (!lista) return res.status(404).json({ error: "Lista não encontrada." });

    await botInstance.registroService.inserirEmPosicaoEspecifica(whatsappId, lista.dia, Number(posicaoAlvo));
    return res.status(200).json({ message: "Motorista inserido com sucesso na escala!" });
});


/**
 * 17. ENDPOINT ADMINISTRATIVO: REFAZER ATRIBUIÇÃO DE ROTAS (VIA APP OU WHATSAPP COMANDOS)
 * URL: POST /whatsapp/escala/refazer
 */
rotasWhatsApp.post('/whatsapp/escala/refazer', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { dia, enviarWhats } = req.body; 
    const diaDigitado = parseInt(String(dia), 10);

    if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        return res.status(400).json({ error: "O dia informado deve estar entre 1 e 31." });
    }

    const hoje = new Date();
    let anoAlvo = hoje.getFullYear();
    let mesAlvo = hoje.getMonth();

    // 🚀 ALINHAMENTO DO APP: Se o administrador digitou o dia de execução (amanhã), 
    // subtraímos 1 dia na memória para localizar os joinhas da escala mãe (hoje)
    let diaGeracao = diaDigitado;
    if (diaDigitado === hoje.getDate() + 1) {
        diaGeracao = hoje.getDate();
    } else if (diaDigitado > hoje.getDate()) {
        mesAlvo -= 1;
        if (mesAlvo < 0) {
            mesAlvo = 11;
            anoAlvo -= 1;
        }
    }

    const dataListaIsoPura = `${anoAlvo}-${String(mesAlvo + 1).padStart(2, '0')}-${String(diaGeracao).padStart(2, '0')}`;

    const listaJoiaEncontrada = await AppDataSource.getRepository(ListaJoia)
        .createQueryBuilder("lista")
        .where("DATE(lista.dia) = :dataListaIsoPura", { dataListaIsoPura })
        .getOne();

    if (!listaJoiaEncontrada) {
        return res.status(404).json({ error: `Não foi localizada nenhuma lista de joinhas correspondente ao dia de geração (${diaGeracao}/${mesAlvo + 1}).` });
    }

    // Executa o recálculo da escala completa indexado à ID correta do banco
    const relatorioFormatado = await botInstance.escalaService.gerarEscalaCompleta(listaJoiaEncontrada.id);
    
    // Se a flag enviarWhats for verdadeira (clique do botão Escala), joga no grupo oficial
    if (enviarWhats === true) {
        await botInstance.enviarMensagemExterna(
            `📋 ESCALA DO DIA\n  EXECUÇÃO DIA ${diaDigitado}`, 
            relatorioFormatado
        );
    }

    return res.status(200).json({ message: "Escala atualizada com sucesso!", relatorio: relatorioFormatado });
});

/**
 * 18. ENDPOINT ADMINISTRATIVO: FIXAR MOTORISTA NA ESCALA DO APOIO (CONGELAMENTO DE PÁTIO)
 * URL: POST /whatsapp/escala/apoio-manual
 */
rotasWhatsApp.post('/whatsapp/escala/apoio-manual', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { whatsappId, listaId } = req.body;

    if (!whatsappId || !listaId) {
        return res.status(400).json({ error: "Os parâmetros 'whatsappId' e 'listaId' são obrigatórios." });
    }

    // Aciona a alocação fixa ativando a flag 'isApoioManual' para blindar o motorista contra atualizações automáticas
    await botInstance.escalaService.forcarMotoristaNaEscalaApoioManual(
        whatsappId, 
        Number(listaId)
    );

    return res.status(200).json({ message: "Motorista congelado com sucesso na escala de Apoio!" });
});

/**
 * 19. ENDPOINT ADMINISTRATIVO: VINCULAR MOTORISTA DIRETAMENTE NA ROTA DO APOIO (TURNO DA TARDE)
 * URL: POST /whatsapp/escala/rota-apoio-manual
 */
rotasWhatsApp.post('/whatsapp/escala/rota-apoio-manual', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    const { whatsappId, listaId, rotaId } = req.body;

    if (!whatsappId || !listaId || !rotaId) {
        return res.status(400).json({ error: "Os parâmetros 'whatsappId', 'listaId' e 'rotaId' são obrigatórios." });
    }

    // Aciona a vinculação forçada do motorista habilitado na rota física do apoio da tarde
    await botInstance.escalaService.forcarMotoristaNaRotaApoioManual(
        whatsappId,
        Number(listaId),
        Number(rotaId)
    );

    return res.status(200).json({ message: "Motorista vinculado na rota do Apoio com sucesso!" });
});

/**
 * 20. ENDPOINT: VINCULAR MOTORISTA DIRETAMENTE NA ROTA (MANUAL DE RUA - TARDE OU MADRUGADA)
 * URL: POST /whatsapp/escala/rota-manual
 */
rotasWhatsApp.post('/whatsapp/escala/rota-manual', verificarBot, async (req: Request, res: Response) => {
    let { whatsappId, listaId, rotaId } = req.body;

    if (listaId === undefined || rotaId === undefined) {
        return res.status(400).json({ error: "Os parâmetros 'listaId' e 'rotaId' são obrigatórios." });
    }

    try {
        if (Array.isArray(whatsappId)) {
            whatsappId = whatsappId.length > 0 ? String(whatsappId[0]) : "";
        } else if (whatsappId) {
            whatsappId = String(whatsappId);
        } else {
            whatsappId = "";
        }

        const listaJoia = await AppDataSource.getRepository(ListaJoia).findOneBy({ id: Number(listaId) });
        if (!listaJoia) return res.status(404).json({ error: "Lista de joinhas não encontrada." });

        const rotaEspelho = await AppDataSource.getRepository(Rota).findOneBy({ id: Number(rotaId) });
        if (!rotaEspelho) return res.status(404).json({ error: "Rota operacional não cadastrada." });

        const dataListaBase = new Date(listaJoia.dia);
        
        // 📋 DUPLO PADRÃO TEMPORAL DE ALINHAMENTO:
        let diasAvanco = 1; // Padrão normal: rotas da tarde comuns avançam 1 dia

        if (rotaEspelho.tipo_rota === 'ROTA_MADRUGADA') {
            diasAvanco = 2; // Madrugada avança 2 dias
        } 
        else if (rotaEspelho.tipo_rota === 'ROTA_TARDE') {
            const totalRotasTarde = await AppDataSource.getRepository(Rota).countBy({ tipo_rota: 'ROTA_TARDE' });
            const numeroRotaAtual = rotaEspelho.ordem ? parseInt(rotaEspelho.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            
            // SE FOR A ÚLTIMA ROTA DA TARDE (APOIO): Avança mais um dia (+2 dias no total)
            // para bater milimetricamente com a janela de leitura que você estipulou
            if (numeroRotaAtual === totalRotasTarde) {
                diasAvanco = 2;
            }
        }
        
        const dataGeracaoAlvo = new Date(
            dataListaBase.getFullYear(),
            dataListaBase.getMonth(),
            dataListaBase.getDate() + diasAvanco,
            12, 0, 0, 0
        );
        const dataGeracaoIsoPura = `${dataGeracaoAlvo.getFullYear()}-${String(dataGeracaoAlvo.getMonth() + 1).padStart(2, '0')}-${String(dataGeracaoAlvo.getDate()).padStart(2, '0')}`;

        // FLUXO DE REMOÇÃO: Agora deleta mirando a data exata sincronizada (+1 ou +2 dias)
        if (whatsappId.trim() === "") {
            await AppDataSource.getRepository(RotaAtribuida).manager.query(
                "DELETE FROM `atribuicao_final` WHERE `listaJoiaId` = ? AND `rotaId` = ? AND `dataGeracao` = ?",
                [Number(listaId), Number(rotaId), dataGeracaoIsoPura]
            );
            return res.status(200).json({ message: "Vaga liberada com sucesso e disponível no painel!" });
        }

        const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
        const motorista = await MotoristaService.buscarPorLid(lidLimpo);
        if (!motorista) return res.status(404).json({ error: "Motorista não cadastrado no sistema." });

        if (motorista.podeFazerRota === false) {
            return res.status(400).json({ 
                error: `🚫 Operação Proibida: O motorista ${motorista.nome} está configurado como 'SÓ PLANTÃO' e não pode assumir rotas.` 
            });
        }

        let tipoAtribuicaoFinal: "ROTA" | "APOIO" | "PLANTAO" = "ROTA";
        let ehApoioManualFinal = false;

        if (rotaEspelho.tipo_rota === 'ROTA_TARDE') {
            const totalRotasTarde = await AppDataSource.getRepository(Rota).countBy({ tipo_rota: 'ROTA_TARDE' });
            const numeroRotaAtual = rotaEspelho.ordem ? parseInt(rotaEspelho.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            
            if (numeroRotaAtual === totalRotasTarde) {
                tipoAtribuicaoFinal = "APOIO";
                ehApoioManualFinal = true; 
            }
        } else if (rotaEspelho.tipo_rota === 'ROTA_MADRUGADA') {
            ehApoioManualFinal = true;
        }

        // Limpa duplicidades antes de salvar a nova alocação manual
        await AppDataSource.getRepository(RotaAtribuida).manager.query(
            "DELETE FROM `atribuicao_final` WHERE `listaJoiaId` = ? AND `rotaId` = ? AND `dataGeracao` = ?",
            [Number(listaId), Number(rotaId), dataGeracaoIsoPura]
        );

        const listaRotaOperacional = await AppDataSource.getRepository(ListaRota).findOneBy({ 
            dataReferencia: dataGeracaoIsoPura as any, 
            tipo_lista: rotaEspelho.tipo_rota 
        });

        const novaAtribuicao = AppDataSource.getRepository(RotaAtribuida).create({
            listaJoia,
            motorista,
            rota: rotaEspelho,
            listaRota: (listaRotaOperacional || undefined) as any,
            dataGeracao: dataGeracaoIsoPura as any, 
            tipoAtribuicao: tipoAtribuicaoFinal,
            ehApoioManual: ehApoioManualFinal 
        });

        await AppDataSource.getRepository(RotaAtribuida).save(novaAtribuicao);
        return res.status(200).json({ message: "Motorista alocado manualmente na rota com sucesso!" });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});
/**
 * URL: POST /whatsapp/escala/apoio-manual
 * 21.
 * TRAVA OPERACIONAL SUPREMA: Localiza a lista de joinhas e a posição real do motorista na data.
 * Se a posição humana dele estiver dentro do corte de plantonistas titulares, barra e aborta a gravação.
 */
rotasWhatsApp.post('/whatsapp/escala/rota-manual', verificarBot, async (req: Request, res: Response) => {
    let { whatsappId, listaId, rotaId } = req.body;

    if (listaId === undefined || rotaId === undefined) {
        return res.status(400).json({ error: "Os parâmetros 'listaId' e 'rotaId' são obrigatórios." });
    }

    try {
        if (Array.isArray(whatsappId)) {
            whatsappId = whatsappId.length > 0 ? String(whatsappId) : "";
        } else if (whatsappId) {
            whatsappId = String(whatsappId);
        } else {
            whatsappId = "";
        }

        const listaJoia = await AppDataSource.getRepository(ListaJoia).findOneBy({ id: Number(listaId) });
        if (!listaJoia) return res.status(404).json({ error: "Lista de joinhas não encontrada." });

        const rotaEspelho = await AppDataSource.getRepository(Rota).findOneBy({ id: Number(rotaId) });
        if (!rotaEspelho) return res.status(404).json({ error: "Rota operacional não cadastrada." });

        const dataListaBase = new Date(listaJoia.dia);
        const diasAvanco = rotaEspelho.tipo_rota === 'ROTA_TARDE' ? 1 : 2;
        
        const dataGeracaoAlvo = new Date(
            dataListaBase.getFullYear(),
            dataListaBase.getMonth(),
            dataListaBase.getDate() + diasAvanco,
            12, 0, 0, 0
        );
        const dataGeracaoIsoPura = `${dataGeracaoAlvo.getFullYear()}-${String(dataGeracaoAlvo.getMonth() + 1).padStart(2, '0')}-${String(dataGeracaoAlvo.getDate()).padStart(2, '0')}`;

        const repoAtrib = AppDataSource.getRepository(RotaAtribuida);

        // 🔍 Busca se já existe uma atribuição gravada para esta vaga específica
        let atribuicaoExistente = await repoAtrib.findOne({
            where: {
                listaJoia: { id: Number(listaId) },
                rota: { id: Number(rotaId) },
                dataGeracao: dataGeracaoIsoPura as any
            },
            relations: ["motorista"]
        });

        // 📋 1. FLUXO DE REMOÇÃO (UPDATE PARA NULL)
        if (whatsappId.trim() === "") {
            if (atribuicaoExistente) {
                // UPDATE: Limpa o motorista mantendo a mesma linha física e liga a trava manual
                atribuicaoExistente.motorista = null as any; 
                atribuicaoExistente.ehApoioManual = true;
                await repoAtrib.save(atribuicaoExistente);
            } else {
                // INSERT: Se a vaga operava em memória (id: null), cria a linha física com motorista NULL para trancar o robô
                const listaRotaOperacional = await AppDataSource.getRepository(ListaRota).findOneBy({ 
                    dataReferencia: dataGeracaoIsoPura as any, 
                    tipo_lista: rotaEspelho.tipo_rota 
                });

                const novaTrava = repoAtrib.create({
                    listaJoia,
                    rota: rotaEspelho,
                    listaRota: (listaRotaOperacional || undefined) as any,
                    dataGeracao: dataGeracaoIsoPura as any,
                    tipoAtribuicao: rotaEspelho.tipo_rota === 'ROTA_TARDE' ? 'APOIO' : 'ROTA',
                    ehApoioManual: true
                });
                novaTrava.motorista = null as any; // Ignora a trava estrita do TypeScript para gravar NULL no MySQL

                await repoAtrib.save(novaTrava);
            }
            return res.status(200).json({ message: "Vaga liberada com sucesso e persistida no painel!" });
        }

        // 📋 2. FLUXO DE ATRIBUIÇÃO/TROCA DE MOTORISTA (UPSERT)
        const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@');
        const motorista = await MotoristaService.buscarPorLid(lidLimpo);
        if (!motorista) return res.status(404).json({ error: "Motorista não cadastrado no sistema." });

        if (motorista.podeFazerRota === false) {
            return res.status(400).json({ 
                error: `🚫 Operação Proibida: O motorista ${motorista.nome} está configurado como 'SÓ PLANTÃO' e não pode assumir rotas.` 
            });
        }

        // Determina as categorias de intervenção manual
        let tipoAtribuicaoFinal: "ROTA" | "APOIO" | "PLANTAO" = "ROTA";
        let ehApoioManualFinal = false;

        if (rotaEspelho.tipo_rota === 'ROTA_TARDE') {
            const totalRotasTarde = await AppDataSource.getRepository(Rota).countBy({ tipo_rota: 'ROTA_TARDE' });
            const numeroRotaAtual = rotaEspelho.ordem ? parseInt(rotaEspelho.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            
            if (numeroRotaAtual === totalRotasTarde) {
                tipoAtribuicaoFinal = "APOIO";
                ehApoioManualFinal = true; 
            }
        } else if (rotaEspelho.tipo_rota === 'ROTA_MADRUGADA') {
            ehApoioManualFinal = true;
        }

        if (atribuicaoExistente) {
            // UPDATE: Modifica o motorista e as flags do registro existente sem consumir novos IDs
            atribuicaoExistente.motorista = motorista;
            atribuicaoExistente.tipoAtribuicao = tipoAtribuicaoFinal;
            atribuicaoExistente.ehApoioManual = ehApoioManualFinal;
            await repoAtrib.save(atribuicaoExistente);
        } else {
            // INSERT: Cria um novo registro estável caso a vaga ainda estivesse vazia
            const listaRotaOperacional = await AppDataSource.getRepository(ListaRota).findOneBy({ 
                dataReferencia: dataGeracaoIsoPura as any, 
                tipo_lista: rotaEspelho.tipo_rota 
            });

            const novaAtribuicao = repoAtrib.create({
                listaJoia,
                motorista,
                rota: rotaEspelho,
                listaRota: (listaRotaOperacional || undefined) as any,
                dataGeracao: dataGeracaoIsoPura as any, 
                tipoAtribuicao: tipoAtribuicaoFinal,
                ehApoioManual: ehApoioManualFinal 
            });

            await repoAtrib.save(novaAtribuicao);
        }

        return res.status(200).json({ message: "Motorista alocado manualmente na rota com sucesso!" });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna no servidor Express: ${err.message}` });
    }
});
/**
 * URL: POST /whatsapp/escala/apoio-desfixar
 * 22.
 * GARANTIA: Desliga a flag de congelamento manual do motorista e força o reprocessamento 
 * molecular da escala do dia para redistribuir as categorias na ordem correta da fila.
 */
rotasWhatsApp.post('/whatsapp/escala/apoio-desfixar', verificarBot, async (req: Request, res: Response) => {
    const { whatsappId, listaId } = req.body;

    if (!whatsappId || !listaId) {
        return res.status(400).json({ error: "Os parâmetros 'whatsappId' e 'listaId' são obrigatórios." });
    }

    try {
        const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@');

        // 1. Localiza o motorista na fila de joinhas do dia correspondente
        const registroFila = await AppDataSource.getRepository(OrdemJoinha).findOne({
            where: { listaJoia: { id: Number(listaId) }, motorista: { whatsAppLid: lidLimpo } },
            relations: ["motorista"]
        });

        if (!registroFila) {
            return res.status(404).json({ error: "Motorista não encontrado na escala deste dia." });
        }

        // 2. Desliga a flag de apoio manual
        registroFila.isApoioManual = false;
        await AppDataSource.getRepository(OrdemJoinha).save(registroFila);

        // 3. Força a atualização imediata recalculando a fila e disparando o robô
        await botInstance.escalaService.gerarEscalaCompleta(Number(listaId));

        return res.status(200).json({ message: "Motorista desfixado do apoio com sucesso e reintegrado à fila!" });

    } catch (err: any) {
        return res.status(500).json({ error: `Falha interna ao desfixar do apoio: ${err.message}` });
    }
});


export default rotasWhatsApp;