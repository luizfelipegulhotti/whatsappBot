import IContagemRotas from "../../interfaces/IContagemRotas";

function calcularPosicaoApoio(rotas: IContagemRotas): number {
  const { qtdTarde, qtdMadrugada } = rotas;
  
  if (qtdTarde > qtdMadrugada) {
    return qtdTarde; // Determinado pela última rota da tarde se ela for maior
  }
  if (qtdMadrugada > qtdTarde) {
    return qtdMadrugada + 1; // Total de rotas da madrugada + 1
  }
  // Se forem iguais
  return (qtdTarde + qtdMadrugada) + 1; // Total de rotas + 1
}

export default calcularPosicaoApoio;