import { Rota } from "../../models/Rota";

// Auxiliar para ordenar rotas de forma puramente matemática/alfanumérica
const ordenarRotasMatematicamente = (rotas: Rota[]): Rota[] => {
    return rotas.sort((rotaAvaliada, proximaRota) => {
        const strA = (rotaAvaliada.ordem || "").replace(/[^0-9]/g, '');
        const strB = (proximaRota.ordem || "").replace(/[^0-9]/g, '');

        const numA = strA ? parseInt(strA, 10) : NaN;
        const numB = strB ? parseInt(strB, 10) : NaN;

        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        if (!isNaN(numA)) return -1;
        if (!isNaN(numB)) return 1;

        return (rotaAvaliada.ordem || "").localeCompare(proximaRota.ordem || "");
    });
};

export default ordenarRotasMatematicamente;