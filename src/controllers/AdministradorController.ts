import { Request, Response } from "express";
import AdministradorService from "../service/AdministradorService";

class AdministradorController {

    static async listarAdministradores(req: Request, res: Response) {
        const administradores = await AdministradorService.listarAdministradores();
        return res.status(200).json(administradores);
    };

    static async mostrarUmAdministrador(req: Request, res: Response) {
        const { id } = req.params;
        const administrador = await AdministradorService.mostrarUmAdministrador(Number(id));
        return res.status(200).json(administrador);
    };

    static async cadastrarAdministrador(req: Request, res: Response) {
        const novoAdministrador = await AdministradorService.cadastrarAdministrador(req.body);
        return res.status(201).json({
            message: 'Administrador cadastrado com sucesso!',
            novoAdministrador
        });
    };

    static async editarAdministrador(req: Request, res: Response) {
        const {id} = req.params;
        const administradorEditado = await AdministradorService.editarAdministrador(Number(id), req.body);
        return res.status(200).json({
            message: 'Administrador atualizado com sucesso!',
            administradorEditado
        });
    };

    static async deletarAdministrador(req: Request, res: Response) {
        const {id} = req.params;
        await AdministradorService.deletarAdministrador(Number(id));
        return res.status(200).json({
            message: 'Administrador excluído com sucesso!'
        });
    };
};

export default AdministradorController;