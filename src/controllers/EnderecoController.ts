import { Request, Response } from "express";
import EnderecoService from "../service/EndereçoService";

class EnderecoController {

    static async listarEnderecos(req: Request, res: Response) {
        const enderecos = await EnderecoService.listarEnderecos();
        return res.status(200).json(enderecos);
    };

    static async mostrarUmEndereco(req: Request, res: Response) {
        const {id} = req.params;
        const endereco = await EnderecoService.mostrarUmEndereco(Number(id));
        return res.status(200).json(endereco);
    };

    static async cadastrarEndereco(req: Request, res: Response) {
        const novoEndereco = await EnderecoService.cadastrarEndereco(req.body);
        return res.status(200).json({
            message: 'Endereço cadastrado com sucesso!',
            novoEndereco
        });
    };

    static async editarEndereco(req: Request, res: Response) {
        const {id} = req.params;
        const enderecoEditado = await EnderecoService.editarEndereco(Number(id), req.body);
        return res.status(200).json({
            message: 'Endereco editado com sucesso!',
            enderecoEditado
        });
    };

    static async deletarEndereco(req: Request, res: Response) {
        const{id} = req.params;
        const enderecoExcluido = await EnderecoService.deletarEndereco(Number(id));
        return res.status(200).json({
            message: 'Endereco excluído com sucesso!',
            enderecoExcluido
        });
    };

};

export default EnderecoController;