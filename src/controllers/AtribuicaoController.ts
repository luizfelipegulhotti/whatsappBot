import { Request, Response } from "express";
import AtribuicaoService from "../service/AtribuicaoService";

class AtribuicaoController {
    // Gera a escala automaticamente cruzando Gabarito (Turno) x Joinhas do dia
    static async gerarEscalaAutomatica(req: Request, res: Response) {
        const { turno } = req.body; // 'ROTA_TARDE' ou 'ROTA_MADRUGADA'
        const escala = await AtribuicaoService.gerarEscalaDiaria(turno);
        return res.status(201).json({ 
            message: `Escala de ${turno} gerada com sucesso!`, 
            escala 
        });
    };

    // Lista as atribuições que foram geradas para o dia atual por turno
    static async listarEscalaDoDia(req: Request, res: Response) {
        const { turno } = req.params;
        const atribuicoes = await AtribuicaoService.listarAtribuicoesDoDia(turno as any);
        return res.status(200).json(atribuicoes);
    }

    // Remove uma atribuição individual (ex: motorista precisou sair da escala)
    static async deletarAtribuicao(req: Request, res: Response) {    
        const { id } = req.params;
        await AtribuicaoService.deletarAtribuicao(Number(id));
        return res.status(200).json({ message: "Atribuição removida com sucesso!" });
    }
}

export default AtribuicaoController;