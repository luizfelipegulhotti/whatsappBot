import { Request, Response } from "express";
import PassageiroService from "../service/PassageiroService";

class PassageiroController {

    static async listarPassageiros(req: Request, res: Response) {
        const passageiros = await PassageiroService.listarPassageiros();
        return res.status(200).json(passageiros);
    };

    static async mostrarUmPassageiro(req: Request, res: Response) {
        const {id} = req.params;
        const passageiro = await PassageiroService.mostrarUmPassageiro(Number(id));
        return res.status(200).json(passageiro);
    };

    static async listarDisponiveis(req: Request, res: Response) {
        const { empresaId } = req.params;
        const passageiros = await PassageiroService.listarDisponiveisPorEmpresa(Number(empresaId));
        return res.status(200).json(passageiros);
    };

    static async cadastrarPassageiro(req: Request, res: Response) {
        const novoPassageiro = await PassageiroService.cadastrarPassageiro(req.body);
        return res.status(201).json({
            message: 'Passageiro cadastrado com sucesso!',
            novoPassageiro
        });
    };

    static async editarPassageiro(req: Request, res: Response) {
        const {id} = req.params;
        const passageiroEditado = await PassageiroService.editarPassageiro(Number(id), req.body);
        return res.status(200).json({
            message: 'Passageiro editado com sucesso!',
            passageiroEditado
        });
    };

    static async deletarPassageiro(req: Request, res: Response) {
        const {id} = req.params;
        const passageiroExcluído = await PassageiroService.deletarPassageiro(Number(id));
        return res.status(200).json({
            message: 'Passageiro excluído com sucesso',
            passageiroExcluído
        });
    };

};

export default PassageiroController;