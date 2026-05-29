import { Request, Response } from "express";
import RotaService from "../service/RotaService";

class RotaController {
    static async listarRotas(req: Request, res: Response) {
        const rotas = await RotaService.listarRotas();
        return res.status(200).json(rotas);
    }

    static async listarPorTurno(req: Request, res: Response) {
        const { tipo } = req.params;
        const rotas = await RotaService.listarPorTurno(tipo as any);
        return res.status(200).json(rotas);
    }

    static async mostrarUmaRota(req: Request, res: Response) {
        const { id } = req.params;
        const rota = await RotaService.mostrarUmaRota(Number(id));
        return res.status(200).json(rota);
    }

    static async cadastrarRota(req: Request, res: Response) {
        const novaRota = await RotaService.cadastrarRota(req.body);
        return res.status(201).json({ message: 'Rota montada com sucesso!', novaRota });
    }

    static async editarRota(req: Request, res: Response) {
        const { id } = req.params;
        const rotaEditada = await RotaService.editarRota(Number(id), req.body);
        return res.status(200).json({ message: 'Rota atualizada com sucesso!', rotaEditada });
    }

    static async deletarRota(req: Request, res: Response) {
        const { id } = req.params;
        await RotaService.deletarRota(Number(id));
        return res.status(200).json({ message: 'Rota excluída com sucesso!' });
    }
}

export default RotaController;