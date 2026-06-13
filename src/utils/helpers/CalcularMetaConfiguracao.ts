import { AppDataSource } from "../../data-source";
import { DiasTipo } from "../../models/DiasTipo";
import { Rota } from "../../models/Rota";
import ordenarRotasMatematicamente from "./OrdenarRotasMatematicamente";

const calcularMetaConfiguracao = async (dataAlvo: Date) => {
    const diasTipoRepositorio = AppDataSource.getRepository(DiasTipo);
    const rotaRepositorio = AppDataSource.getRepository(Rota);

    // 🔥 FIX DE BUSCA: Extrai o texto puro AAAA-MM-DD para o TypeORM não enviar "15:00:00.000Z"
    const ano = dataAlvo.getFullYear();
    const mes = String(dataAlvo.getMonth() + 1).padStart(2, '0');
    const dia = String(dataAlvo.getDate()).padStart(2, '0');
    const dataIsoStringStr = `${ano}-${mes}-${dia}`;

    // Busca comparando a string limpa gerada pelo Node.js
    const registroManual = await diasTipoRepositorio.createQueryBuilder("dias")
        .where("DATE(dias.data) = :dataIsoStringStr", { dataIsoStringStr })
        .getOne();
    
    let tipoDia: 'DIA_COMUM' | 'DIA_LIVRE' = (dataAlvo.getDay() === 0 || dataAlvo.getDay() === 6) ? 'DIA_LIVRE' : 'DIA_COMUM';
    if (registroManual) {
        tipoDia = registroManual.tipo as any;
    }

    const ehSegundaFeira = dataAlvo.getDay() === 1 && tipoDia === 'DIA_COMUM';
    const limitePlantao = ehSegundaFeira ? 5 : 4;

    const [rotasTardeBrutas, rotasMadrugadaBrutas] = await Promise.all([
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_TARDE' } }),
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_MADRUGADA' } })
    ]);

    const rotasTarde = ordenarRotasMatematicamente(rotasTardeBrutas);
    const rotasMadrugada = ordenarRotasMatematicamente(rotasMadrugadaBrutas);

    const totalTarde = rotasTarde.length;
    const totalMadrugada = rotasMadrugada.length;

    let posicaoDoApoio = totalTarde; 
    if (totalMadrugada >= totalTarde) {
        posicaoDoApoio = totalMadrugada + 1;
    }

    const qtdMaxRotasValidas = Math.max(totalTarde, totalMadrugada);

    return {
        tipoDia: tipoDia, 
        ehSegundaFeira,
        limitePlantao,
        rotasTarde,
        rotasMadrugada,
        qtdMaxRotasValidas,
        posicaoDoApoio
    };
};

export default calcularMetaConfiguracao;