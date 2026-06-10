import { OrdemJoinha } from "../../models/OrdemJoinha";

function filtrarERecalcularEscala(
  // INTERSEÇÃO: Aceita a entidade OrdemJoinha estendida com o campo dinâmico de categoria
  motoristasOriginais: (OrdemJoinha & { categoria?: string })[],
  limitePlantao: number,
  tipoDia: string,
  posicaoPermitidaApoio: number
): (OrdemJoinha & { categoria?: string })[] {
  if (tipoDia === 'DIA_LIVRE') {
    return [...motoristasOriginais];
  }

  let listaFiltrada = [...motoristasOriginais];
  let houveRemocao = true;

  while (houveRemocao) {
    houveRemocao = false;
    let countPlantoesPreenchidos = 0;
    let temApoioPreenchido = false;

    // Controlador de posição real/visual na escala (1, 2, 3...)
    let posicaoAtualFila = 1;

    for (let i = 0; i < listaFiltrada.length; i++) {
      const reg = listaFiltrada[i];
      const { motorista } = reg;

      // 1. Vagas do Plantão (Sempre liberadas para qualquer motorista)
      if (countPlantoesPreenchidos < limitePlantao) {
        countPlantoesPreenchidos++;
        posicaoAtualFila++;
        continue; 
      }

      // 2. Se o motorista NÃO pode fazer rota:
      if (!motorista.podeFazerRota) {
        // Verifica se a posição atual dele na fila bate com a regra do Apoio das listas
        if (posicaoAtualFila === posicaoPermitidaApoio && !temApoioPreenchido) {
          temApoioPreenchido = true;
          
          // O TypeScript agora aceita a atribuição porque estendemos a assinatura do método!
          reg.categoria = 'APOIO'; 
          
          posicaoAtualFila++;
          continue; 
        } 
        
        listaFiltrada.splice(i, 1); 
        houveRemocao = true;
        break; 
      }

      posicaoAtualFila++;
    }
  }

  return listaFiltrada;
}

export default filtrarERecalcularEscala;