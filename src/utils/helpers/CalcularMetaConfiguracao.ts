import { AppDataSource } from "../../data-source";
import { DiasTipo } from "../../models/DiasTipo";
import { Rota } from "../../models/Rota";
import ordenarRotasMatematicamente from "./OrdenarRotasMatematicamente";

 //Auxiliar para calcular metadados do tipo de dia e limites de corte conforme a regra de negócio
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

    const [rotasTardeBrutas, rotasMadrugadaBrutas] = await Promise.all([
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_TARDE' } }),
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_MADRUGADA' } })
    ]);

    const rotasTarde = ordenarRotasMatematicamente(rotasTardeBrutas);
    const rotasMadrugada = ordenarRotasMatematicamente(rotasMadrugadaBrutas);

    const totalTarde = rotasTarde.length;
    const totalMadrugada = rotasMadrugada.length;

    let tipoDiaEfetivoDoCiclo = tipoDia;
    if (dataAlvo.getDay() === 5) {
        tipoDiaEfetivoDoCiclo = 'DIA_LIVRE';
    }

    let posicaoDoApoio = totalTarde; 
    if (totalMadrugada >= totalTarde) {
        posicaoDoApoio = totalMadrugada + 1;
    }

    const qtdMaxRotasValidas = Math.max(totalTarde, totalMadrugada);

    return {
        tipoDia: tipoDiaEfetivoDoCiclo,
        ehSegundaFeira,
        limitePlantao,
        rotasTarde,
        rotasMadrugada,
        qtdMaxRotasValidas,
        posicaoDoApoio
    };
};

export default calcularMetaConfiguracao;