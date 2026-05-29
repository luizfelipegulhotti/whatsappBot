import { Request, Response } from "express";
import PaisService from "../service/PaisService";

class PaisController {

    // Controller para listar países
    static async listarPaises(req: Request, res: Response) {
        const paises = await PaisService.listarPaises();
        return res.status(200).json(paises);
    };

    // Controller para mostrar um país (por ID):
    static async mostrarUmPais(req: Request, res: Response) {
        const { id } = req.params;
        const pais = await PaisService.mostrarUmPais(Number(id));
        return res.status(200).json(pais);
    };

    // Controller para cadastrar país:
    static async cadastarPais(req: Request, res: Response) {
        const paisNovo = await PaisService.cadastrarPais(req.body);
        return res.status(201).json({
            message: 'País cadastrado com sucesso!',
            paisNovo,
            });
    };

    // Controler para atualizar país:
    static async editarPais(req: Request, res: Response) {
        const { id } = req.params;
        const paisAtualizado = await PaisService.editarPais(Number(id), req.body);
        return res.status(200).json({
            message: 'País atualizado com sucesso',
            paisAtualizado,
        });
    };

    // Controller para excluir país:
    static async deletarPais(req: Request, res: Response) {
        const { id } = req.params;
        const paisDeletado = await PaisService.deletarPais(Number(id));
        return res.status(200).json({
            message: 'País excluído com sucesso!',
            paisDeletado
        });
    };
};

export default PaisController;