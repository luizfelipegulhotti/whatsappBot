import { Request, Response } from "express";
import CidadeService from "../service/CidadeService";

class CidadeController {
    
    static async listarCidades(req: Request, res: Response) {
        const cidades = await CidadeService.listarCidades();
        return res.status(200).json(cidades);
    };

    static async mostrarUmaCidade(req: Request, res: Response) {
        const { id } = req.params;
        const cidade = await CidadeService.mostrarUmaCidade(Number(id));
        return res.status(200).json(cidade);
    };

    static async cadastarCidade(req: Request, res: Response) {
        const novaCidade = await CidadeService.cadastrarCidade(req.body);
        return res.status(201).json({
            message: 'Cidade cadastrada com sucesso!',
            novaCidade,
        });
    };

    static async editarCidade(req: Request, res: Response) {
        const { id } = req.params;
        const cidadeEditada = await CidadeService.editarCidade(Number(id), req.body);
        return res.status(200).json({
            message: 'Cidade editada com sucesso'!,
            cidadeEditada,
        });
    };

    static async deletarCidade(req: Request, res: Response) {
        const { id } = req.params;
        const cidadeDeletada = await CidadeService.deletarCidade(Number(id));
        return res.status(200).json({
            message: 'Cidade excluída com sucesso!',
            cidadeDeletada,
        });
    };
};

export default CidadeController;