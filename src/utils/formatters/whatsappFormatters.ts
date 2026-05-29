import { ListaJoia } from "../../models/ListaJoia";
import { RotaAtribuida } from "../../models/RotaAtribuida";

export function formatarEscalaParaWhatsApp(atribuicoes: RotaAtribuida[], listaReferencia: ListaJoia): string {
    // Garantir que 'dia' seja um objeto Date
    const dataObj = new Date(listaReferencia.dia);
    
    // 1. Regra de plantonistas baseada no dia da semana
    const eSabado = dataObj.getDay() === 6;
    const limitePlantao = eSabado ? 5 : 4;

    // 2. Separação dos dados (Corrigido para usar tipoAtribuicao da entidade RotaAtribuida)
    // Removemos a referência a a.rota.tipo que não existe mais
    const rotasTarde = atribuicoes.filter(a => 
        a.rota.tipo_rota === 'ROTA_TARDE' && a.tipoAtribuicao !== 'APOIO'
    );
    
    const rotasMadrugada = atribuicoes.filter(a => 
        a.rota.tipo_rota === 'ROTA_MADRUGADA' && a.tipoAtribuicao !== 'APOIO'
    );

    // Busca o motorista de apoio pelo novo campo de status
    const motoristaApoio = atribuicoes.find(a => a.tipoAtribuicao === 'APOIO');

    // --- MONTAGEM DA MENSAGEM ---
    let mensagem = `*📋 ESCALA - ${dataObj.toLocaleDateString('pt-BR')}*\n`;
    mensagem += `*Tipo:* ${listaReferencia.identificador.replace('_', ' ')}\n\n`;

    // LISTA 1: PLANTÃO
    mensagem += `*🚔 PLANTÃO (MADRUGADA + APOIO):*\n`;
    
    // Pegamos os motoristas das primeiras rotas da madrugada
    const plantonistas = [...new Set(rotasMadrugada.slice(0, limitePlantao).map(a => a.motorista.nome))];
    
    plantonistas.forEach((nome, i) => {
        mensagem += `${i + 1}º - ${nome}\n`;
    });

    if (motoristaApoio) {
        mensagem += `APOIO - ${motoristaApoio.motorista.nome}\n`;
    }

    // LISTA 2: ROTAS DA TARDE
    mensagem += `\n*☀️ ROTAS DA TARDE:*\n`;
    if (rotasTarde.length > 0) {
        rotasTarde.forEach(a => {
            mensagem += `• ${a.rota.nome}: ${a.motorista.nome}\n`;
        });
    } else {
        mensagem += `_Sem rotas para tarde_\n`;
    }

    // LISTA 3: ROTAS DA MADRUGADA
    mensagem += `\n*🌙 ROTAS DA MADRUGADA:*\n`;
    if (rotasMadrugada.length > 0) {
        rotasMadrugada.forEach(a => {
            mensagem += `• ${a.rota.nome}: ${a.motorista.nome}\n`;
        });
    } else {
        mensagem += `_Sem rotas para madrugada_\n`;
    }

    return mensagem;
}