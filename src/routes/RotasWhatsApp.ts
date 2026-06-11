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

const rotasWhatsApp = Router();

/**
 * FUNÇÃO AUXILIAR: Resolve o objeto Date correto baseando-se no dia digitado,
 * blindando o sistema contra viradas de mês e ano.
 */
function calcularDataAlvoSegura(diaDigitado: number): Date {
    // 1. Obtém a data/hora atual no fuso de Brasília formatada ISO
    const dataBrasiliaStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const hojeBrasilia = new Date(dataBrasiliaStr);

    let anoAlvo = hojeBrasilia.getFullYear();
    let mesAlvo = hojeBrasilia.getMonth();
    const diaAtualBrasilia = hojeBrasilia.getDate();

    // 2. Lógica retroativa inteligente baseada no dia real de Brasília
    if (diaDigitado > diaAtualBrasilia) {
        mesAlvo -= 1;
        if (mesAlvo < 0) {
            mesAlvo = 11;
            anoAlvo -= 1;
        }
    }

    // 3. Monta a data alvo localmente com segurança
    const dataAlvoLocal = new Date(anoAlvo, mesAlvo, diaDigitado, 12, 0, 0, 0);

    // 4. 🔥 TRUQUE MESTRE: Ajusta o objeto Date para que o valor em UTC espelhe o horário de Brasília.
    // Isso garante que quando o TypeORM salvar ou buscar no MySQL usando UTC, a data não mude de dia.
    const diferencaFuso = dataAlvoLocal.getTimezoneOffset(); // Diferença em minutos da máquina atual
    if (diferencaFuso !== 180) { // Se a máquina NÃO estiver em fuso -03:00 (Brasília)
        // Força a compensação manual para congelar a data no dia correto
        const deslocamentoMilisegundos = (diferencaFuso - 180) * 60 * 1000;
        return new Date(dataAlvoLocal.getTime() + deslocamentoMilisegundos);
    }

    return dataAlvoLocal;
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
            return res.status(200).json({
                tipoDia: "LIVRE",
                ehSegundaFeira: false,
                limitePlantao: 4,
                dataExibicaoTexto,
                listaId: 0,
                dados: []
            });
        }

        // 🧠 TRAVA DE PERSISTÊNCIA: Verifica se a fila já foi criada anteriormente no banco
        const jaExisteFila = await AppDataSource.getRepository(OrdemJoinha).createQueryBuilder("ordem")
            .where("ordem.listaJoiaId = :listaId", { listaId: listaOrigem.id })
            .getExists();

        // O robô é acionado estritamente na primeira vez que a lista for requisitada
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

        // CORREÇÃO SINCRO: Calcula os limites em cima do dia operacional real de execução (X+2)
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
rotasWhatsApp.get('/whatsapp/rotas-tarde', verificarBot, async (req: Request, res: Response) => {
    try {
        const dataParam = req.query.data as string;
        if (!dataParam) return res.status(400).json({ error: "Parâmetro 'data' obrigatório." });

        const dataJoiaPura = obterDataAlvoSemFuso(dataParam);
        const dataTardeOperacional = new Date(dataJoiaPura);
        dataTardeOperacional.setDate(dataTardeOperacional.getDate() + 1);

        const dataJoiaIsoString = `${dataJoiaPura.getFullYear()}-${String(dataJoiaPura.getMonth() + 1).padStart(2, '0')}-${String(dataJoiaPura.getDate()).padStart(2, '0')}`;
        const dataTardeIsoString = `${dataTardeOperacional.getFullYear()}-${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataTardeOperacional.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataTardeOperacional.getDate()).padStart(2, '0')}/${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}`;

        // 1. CHECAGEM DE CALENDÁRIO OPERACIONAL
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
            .where("DATE(lista.dia) = :dataJoiaIsoString", { dataJoiaIsoString })
            .getOne();

        if (!listaOrigem) return res.status(200).json({ dataExibicaoTexto, dados: [] });

        // 2. BUSCA AS ROTAS FIXAS DA TARDE (Com encadeamento correto de relacionamentos)
        const todasAsRotasTarde = await AppDataSource.getRepository(Rota).createQueryBuilder("rota")
            .leftJoinAndSelect("rota.passageiros", "passageiro")
            .leftJoinAndSelect("passageiro.endereco", "endereco") // Alias encadeado a partir do passageiro
            .leftJoinAndSelect("endereco.bairro", "bairro")
            .leftJoinAndSelect("rota.empresas", "empresas")
            .where("rota.tipo_rota = 'ROTA_TARDE'")
            .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
            .getMany();

        if (todasAsRotasTarde.length === 0) return res.status(200).json({ dataExibicaoTexto, dados: [] });

        const atribuicoesEfetuadas = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
            .leftJoinAndSelect("atrib.motorista", "motorista")
            .leftJoinAndSelect("atrib.rota", "rota")
            .where("atrib.listaJoia = :listaId", { listaId: listaOrigem.id })
            .andWhere("DATE(atrib.dataGeracao) = :dataTardeIsoString", { dataTardeIsoString })
            .getMany();

        let posicaoApoioCalculada = 0;
        let motoristaDoApoio: any = null;

        // 3. PROCESSAMENTO DA RECOMPENSA DO APOIO
        if (tipoDiaAlvo === 'DIA_COMUM') {
            posicaoApoioCalculada = todasAsRotasTarde.length;

            const dataEscalaMae = new Date(listaOrigem.dia);
            dataEscalaMae.setDate(dataEscalaMae.getDate() - 1);
            const dataEscalaMaeIso = `${dataEscalaMae.getFullYear()}-${String(dataEscalaMae.getMonth() + 1).padStart(2, '0')}-${String(dataEscalaMae.getDate()).padStart(2, '0')}`;

            const listaEscalaMae = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("listaMae")
                .where("DATE(listaMae.dia) = :dataEscalaMaeIso", { dataEscalaMaeIso })
                .getOne();

            if (listaEscalaMae) {
                const apoioGravado = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
                    .leftJoinAndSelect("atrib.motorista", "motorista")
                    .where("atrib.listaJoia = :listaId", { listaId: listaEscalaMae.id })
                    .andWhere("DATE(atrib.dataGeracao) = :dataTardeIsoString", { dataTardeIsoString })
                    .andWhere("atrib.tipoAtribuicao = 'APOIO'")
                    .getOne();

                if (apoioGravado) {
                    motoristaDoApoio = apoioGravado.motorista;
                }
            }
        }

        // 4. MAPEAMENTO DO PAYLOAD FINAL
        const payload = todasAsRotasTarde.map((rota, index) => {
            const numeroRotaAtual = rota.ordem ? parseInt(rota.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            const ehApoioReal = (tipoDiaAlvo === 'DIA_COMUM') && (numeroRotaAtual === posicaoApoioCalculada);
            const atribExistente = atribuicoesEfetuadas.find(a => a.rota?.id === rota.id);

            let motoristaFinal = null;
            let tipoFinal = "ROTA";

            if (ehApoioReal) {
                if (motoristaDoApoio) {
                    motoristaFinal = motoristaDoApoio;
                    tipoFinal = "APOIO";
                } else if (atribExistente && (atribExistente.ehApoioManual || atribExistente.tipoAtribuicao === 'APOIO')) {
                    motoristaFinal = atribExistente.motorista || null;
                    tipoFinal = "APOIO";
                } else {
                    motoristaFinal = null;
                    tipoFinal = "APOIO";
                }
            } 
            else if (atribExistente) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || "ROTA";
            }

            let posicaoJoinhaFinal = motoristaFinal ? (ehApoioReal ? posicaoApoioCalculada : index + 1) : null;

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
rotasWhatsApp.get('/whatsapp/escala/tarde/:dia', verificarBot, async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Captura e validação exclusiva do dia do parâmetro :dia
        const diaDigitado = parseInt(String(req.params.dia).replace(/\D/g, ''), 10);
        if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
            return res.status(400).json({ error: "Dia inválido." });
        }

        const dataJoiaPura = calcularDataAlvoSegura(diaDigitado);
        const dataTardeOperacional = new Date(dataJoiaPura);
        dataTardeOperacional.setDate(dataTardeOperacional.getDate() + 1);

        const dataJoiaIsoString = `${dataJoiaPura.getFullYear()}-${String(dataJoiaPura.getMonth() + 1).padStart(2, '0')}-${String(dataJoiaPura.getDate()).padStart(2, '0')}`;
        const dataTardeIsoString = `${dataTardeOperacional.getFullYear()}-${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataTardeOperacional.getDate()).padStart(2, '0')}`;
        const dataExibicaoTexto = `${String(dataTardeOperacional.getDate()).padStart(2, '0')}/${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}`;

        // 2. Checagem do calendário operacional (Dia comum vs Dia livre)
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
            .where("DATE(lista.dia) = :dataJoiaIsoString", { dataJoiaIsoString })
            .getOne();

        // Resposta padrão caso a lista mãe não exista
        if (!listaOrigem) {
            return res.status(200).json({ 
                turno: "TARDE", 
                dia_lista: diaDigitado, 
                dataExibicaoTexto, 
                dados: [] 
            });
        }

        // 🚀 DISPARO ORIGINAL DO WHATSAPP: Integrado sem quebrar nenhuma linha de dados
        try {
            const diaReal = dataJoiaPura.getDate();
            const resultadoWhats = await botInstance.escalaService.obterTextoPeriodoTarde(diaReal);
            if (resultadoWhats && resultadoWhats.texto) {
                await botInstance.enviarMensagemExterna("RELATÓRIO DO TURNO DA TARDE", resultadoWhats.texto);
            }
        } catch (whatsErr: any) {
            console.error("⚠️ Falha ao empurrar texto da tarde para o WhatsApp:", whatsErr.message);
        }

        // 3. Busca de rotas da tarde com os relacionamentos encadeados
        const todasAsRotasTarde = await AppDataSource.getRepository(Rota).createQueryBuilder("rota")
            .leftJoinAndSelect("rota.passageiros", "passageiro")
            .leftJoinAndSelect("passageiro.endereco", "endereco")
            .leftJoinAndSelect("endereco.bairro", "bairro")
            .leftJoinAndSelect("rota.empresas", "empresas")
            .where("rota.tipo_rota = 'ROTA_TARDE'")
            .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
            .getMany();

        if (todasAsRotasTarde.length === 0) {
            return res.status(200).json({ 
                turno: "TARDE", 
                dia_lista: diaDigitado, 
                dataExibicaoTexto, 
                dados: [] 
            });
        }

        // 4. Busca as atribuições salvas para o dia da execução da tarde (X+1)
        const atribuicoesEfetuadas = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
            .leftJoinAndSelect("atrib.motorista", "motorista")
            .leftJoinAndSelect("atrib.rota", "rota")
            .where("atrib.listaJoia = :listaId", { listaId: listaOrigem.id })
            .andWhere("DATE(atrib.dataGeracao) = :dataTardeIsoString", { dataTardeIsoString })
            .getMany();

        let posicaoApoioCalculada = 0;
        let motoristaDoApoio: any = null;

        // 5. Captura do motorista de recompensa do Apoio (Escala Mãe X-1)
        if (tipoDiaAlvo === 'DIA_COMUM') {
            posicaoApoioCalculada = todasAsRotasTarde.length;

            const dataEscalaMae = new Date(listaOrigem.dia);
            dataEscalaMae.setDate(dataEscalaMae.getDate() - 1);
            const dataEscalaMaeIso = `${dataEscalaMae.getFullYear()}-${String(dataEscalaMae.getMonth() + 1).padStart(2, '0')}-${String(dataEscalaMae.getDate()).padStart(2, '0')}`;

            const listaEscalaMae = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("listaMae")
                .where("DATE(listaMae.dia) = :dataEscalaMaeIso", { dataEscalaMaeIso })
                .getOne();

            if (listaEscalaMae) {
                const apoioGravado = await AppDataSource.getRepository(RotaAtribuida).createQueryBuilder("atrib")
                    .leftJoinAndSelect("atrib.motorista", "motorista")
                    .where("atrib.listaJoia = :listaId", { listaId: listaEscalaMae.id })
                    .andWhere("DATE(atrib.dataGeracao) = :dataTardeIsoString", { dataTardeIsoString })
                    .andWhere("atrib.tipoAtribuicao = 'APOIO'")
                    .getOne();

                if (apoioGravado) {
                    motoristaDoApoio = apoioGravado.motorista;
                }
            }
        }

        // 6. Mapeamento de payload intacto
        const payload = todasAsRotasTarde.map((rota, index) => {
            const numeroRotaAtual = rota.ordem ? parseInt(rota.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            const ehApoioReal = (tipoDiaAlvo === 'DIA_COMUM') && (numeroRotaAtual === posicaoApoioCalculada);
            const atribExistente = atribuicoesEfetuadas.find(a => a.rota?.id === rota.id);

            let motoristaFinal = null;
            let tipoFinal = "ROTA";

            if (ehApoioReal) {
                if (motoristaDoApoio) {
                    motoristaFinal = motoristaDoApoio;
                    tipoFinal = "APOIO";
                } else if (atribExistente && (atribExistente.ehApoioManual || atribExistente.tipoAtribuicao === 'APOIO')) {
                    motoristaFinal = atribExistente.motorista || null;
                    tipoFinal = "APOIO";
                } else {
                    motoristaFinal = null;
                    tipoFinal = "APOIO";
                }
            } 
            else if (atribExistente) {
                motoristaFinal = atribExistente.motorista || null;
                tipoFinal = atribExistente.tipoAtribuicao || "ROTA";
            }

            let posicaoJoinhaFinal = motoristaFinal ? (ehApoioReal ? posicaoApoioCalculada : index + 1) : null;

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

        // 7. Retorno final no formato unificado para o aplicativo
        return res.status(200).json({ 
            turno: "TARDE", 
            dia_lista: diaDigitado, 
            dataExibicaoTexto, 
            dados: payload 
        });

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
 * URL: POST /whatsapp/escala/rota-manual
 * 
 * 20. os métodos de limpeza ou tratamento, matando o erro de "replace is not a function".
 */
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
        const diasAvanco = rotaEspelho.tipo_rota === 'ROTA_TARDE' ? 1 : 2;
        
        const dataGeracaoAlvo = new Date(
            dataListaBase.getFullYear(),
            dataListaBase.getMonth(),
            dataListaBase.getDate() + diasAvanco,
            12, 0, 0, 0
        );
        const dataGeracaoIsoPura = `${dataGeracaoAlvo.getFullYear()}-${String(dataGeracaoAlvo.getMonth() + 1).padStart(2, '0')}-${String(dataGeracaoAlvo.getDate()).padStart(2, '0')}`;

        // FLUXO DE REMOÇÃO: Limpa a rota imediatamente caso venha em branco
        if (whatsappId.trim() === "") {
            await AppDataSource.getRepository(RotaAtribuida).manager.query(
                "DELETE FROM `atribuicao_final` WHERE `listaJoiaId` = ? AND `rotaId` = ? AND `dataGeracao` = ?",
                [Number(listaId), Number(rotaId), dataGeracaoIsoPura]
            );
            return res.status(200).json({ message: "Vaga liberada com sucesso e disponível no painel!" });
        }

        const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
        const motorista = await MotoristaService.buscarPorLid([lidLimpo][0]);
        if (!motorista) return res.status(404).json({ error: "Motorista não cadastrado no sistema." });

        if (motorista.podeFazerRota === false) {
            return res.status(400).json({ 
                error: `🚫 Operação Proibida: O motorista ${motorista.nome} está configurado como 'SÓ PLANTÃO' e não pode assumir rotas.` 
            });
        }

        // 🧠 DETECÇÃO E CARIMBO DE INTERVENÇÃO MANUAL:
        let tipoAtribuicaoFinal: "ROTA" | "APOIO" | "PLANTAO" = "ROTA";
        let ehApoioManualFinal = false;

        if (rotaEspelho.tipo_rota === 'ROTA_TARDE') {
            const totalRotasTarde = await AppDataSource.getRepository(Rota).countBy({ tipo_rota: 'ROTA_TARDE' });
            const numeroRotaAtual = rotaEspelho.ordem ? parseInt(rotaEspelho.ordem.replace(/[^0-9]/g, ''), 10) : 0;
            
            if (numeroRotaAtual === totalRotasTarde) {
                tipoAtribuicaoFinal = "APOIO";
                ehApoioManualFinal = true; // Força true para a vaga de Apoio físico da tarde
            }
        } else if (rotaEspelho.tipo_rota === 'ROTA_MADRUGADA') {
            // Qualquer inserção feita na mão na madrugada recebe a flag para se blindar contra o robô
            ehApoioManualFinal = true;
        }

        // Limpa duplicidades prévias da vaga antes de reinserir
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
            ehApoioManual: ehApoioManualFinal // Injeta a flag correspondente
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
rotasWhatsApp.post('/whatsapp/escala/apoio-manual', verificarBot, async (req: Request, res: Response) => {
    const { whatsappId, listaId } = req.body;

    if (!whatsappId || !listaId) {
        return res.status(400).json({ error: "Os parâmetros 'whatsappId' e 'listaId' são obrigatórios." });
    }

    try {
        const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@');
        
        // 1. Localiza a posição e o registro do motorista na fila correspondente
        const registroFila = await AppDataSource.getRepository(OrdemJoinha).findOne({
            where: { listaJoia: { id: Number(listaId) }, motorista: { whatsAppLid: lidLimpo } },
            relations: ["motorista", "listaJoia"]
        });

        if (!registroFila) {
            return res.status(404).json({ error: "Motorista não encontrado na escala deste dia." });
        }

        // 2. Resgata os limites estáveis de corte calculando a madrugada alvo (X+2)
        const dataListaBase = await AppDataSource.getRepository(ListaJoia).findOneBy({ id: Number(listaId) });
        if (!dataListaBase) return res.status(404).json({ error: "Lista base de escalas inválida." });

        const dataMadrugada = new Date(dataListaBase.dia);
        dataMadrugada.setDate(dataMadrugada.getDate() + 2);
        
        const meta = await calcularMetaConfiguracao(dataMadrugada);
        if (!meta) return res.status(500).json({ error: "Falha interna ao processar metadados comerciais." });

        // 🧠 A TRAVA DE CONTROLE DO PÁTIO: Se for menor ou igual ao limite de corte, é Plantão Titular e está bloqueado
        if (registroFila.posicao <= meta.limitePlantao) {
            return res.status(400).json({ 
                error: `🚫 Operação Proibida: O motorista ${registroFila.motorista.nome} ocupa a vaga ${registroFila.posicao}º como PLANTÃO titular e não pode ser movido.` 
            });
        }

        // 3. Efetua a limpeza de qualquer motorista que estivesse alocado previamente como Apoio nesse mesmo dia
        const dataMadrugadaIso = `${dataMadrugada.getFullYear()}-${String(dataMadrugada.getMonth() + 1).padStart(2, '0')}-${String(dataMadrugada.getDate()).padStart(2, '0')}`;
        await AppDataSource.getRepository(RotaAtribuida).manager.query(
            "DELETE FROM `atribuicao_final` WHERE `listaJoiaId` = ? AND `dataGeracao` = ? AND `tipoAtribuicao` = 'APOIO'",
            [Number(listaId), dataMadrugadaIso]
        );

        // 4. Marca de forma estática o novo motorista como Apoio Manual na tabela de ordens
        await AppDataSource.getRepository(OrdemJoinha).manager.query(
            "UPDATE `ordem_joinha` SET `isApoioManual` = 0 WHERE `listaJoiaId` = ?",
            [Number(listaId)]
        );
        
        registroFila.isApoioManual = true;
        await AppDataSource.getRepository(OrdemJoinha).save(registroFila);

        // 5. Força a atualização molecular imediata reatribuindo as tabelas de destino
        await botInstance.escalaService.gerarEscalaCompleta(Number(listaId));

        return res.status(200).json({ message: "Motorista promovido a Apoio com sucesso e congelado no pátio!" });

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