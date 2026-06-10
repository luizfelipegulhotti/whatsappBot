// Auxiliar para converter 'AAAA-MM-DD' em objeto Date sem fuso horário quebrado
function obterDataAlvoSemFuso(dataParam: string): Date {
    const [ano, mes, dia] = dataParam.split('-').map(Number);
    return new Date(ano, mes - 1, dia, 0, 0, 0, 0);
}

export default obterDataAlvoSemFuso;