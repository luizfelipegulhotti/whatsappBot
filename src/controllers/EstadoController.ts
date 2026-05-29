import { Request, Response } from "express";
import EstadoService from "../service/EstadoService";

class EstadoController {

    static async listarEstados(req: Request, res: Response) {
        const estados = await EstadoService.listarEstados();
        return res.status(200).json(estados);
    };

    static async mostrarUmEstado(req: Request, res: Response) {
        const { id } = req.params;
        const estado = await EstadoService.mostrarUmEstado(Number(id));
        return res.status(200).json(estado);
    };

    static async cadastrarEstado(req: Request, res: Response) {
        const novoEstado = await EstadoService.cadastrarEstado(req.body);
        return res.status(201).json({
            message: 'Estado cadastrardo com sucesso!',
            novoEstado
        });
    };

    static async editarEstado(req: Request, res: Response) {
        const { id } = req.params;
        const estadoEditado = await EstadoService.editarEstado(Number(id), req.body);
        return res.status(200).json({
            message: 'Estado atualizado com sucesso!',
            estadoEditado,
        });
    };

    static async deletarEstado(req: Request, res: Response) {
        const { id } = req.params;
        const estadoDeletado = await EstadoService.deletarEstado(Number(id));
        return res.status(200).json({
            message: 'Estado deletado com sucesso!',
            estadoDeletado
        });
    };
};

export default EstadoController;