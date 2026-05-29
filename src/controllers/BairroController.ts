import { Request, Response } from "express";
import BairroService from "../service/BairroService";

class BairroController {

    static async listarBairros(req: Request, res: Response) {
        const bairros = await BairroService.listarBairros();
        return res.status(200).json(bairros)
    };

    static async mostrarUmBairro(req: Request, res: Response) {
        const { id } = req.params;
        const bairro = await BairroService.mostrarUmBairro(Number(id));
        return res.status(200).json(bairro);
    };
    static async cadastrarBairro(req: Request, res: Response) {
        const novoBairro = await BairroService.cadastrarBairro(req.body);
        return res.status(201).json({
            message: 'Bairro cadastrado com sucesso!',
            novoBairro
        });
    };

    static async editarBairro(req: Request, res: Response) {
        const { id } = req.params;
        const bairroEditado = await BairroService.editarBairro(Number(id), req.body);
        return res.status(200).json({
            message: 'Bairro editado com sucesso!',
            bairroEditado
        });
    };

    static async deletarBairro(req: Request, res: Response) {
        const { id } = req.params;
        const bairroDeletado = await BairroService.deletarBairro(Number(id));
        return res.status(200).json({
            message: 'Bairro deletado do sistema com sucesso!'
        }); 
    };

};

export default BairroController;